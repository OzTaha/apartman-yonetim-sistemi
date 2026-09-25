import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  type StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  formatKurusTl,
  periodLabel,
  periodOfDate,
  periodRange,
  transactionTypeLabels,
  type ClosingsDto,
  type FinanceSummaryDto,
  type MonthClosingDto,
  type TransactionDto,
} from '@apartman/shared';
import type { Response } from 'express';
import type { Content } from 'pdfmake/interfaces';
import { dateOnly, toDateString } from '../../common/dates';
import { FinanceReportQueryDto, MonthCloseDto } from '../../common/finance.dto';
import { formatDateTr, PDF, sendFile, XLSX } from '../../common/http';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { currentPeriod } from '../dues/site-settings';
import { DocumentsService } from '../dues/documents.service';
import { accountBalances, lockedThrough, monthlyTotals } from './finance.ledger';
import { TransactionsService } from './transactions';

export function lastDayOf(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

function dayBefore(date: string): string {
  const d = dateOnly(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return toDateString(d);
}

interface ClosingSummary {
  incomeKurus: number;
  expenseKurus: number;
  balances: { accountId: string; name: string; balanceKurus: number }[];
}

@Injectable()
export class FinanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
    private readonly transactions: TransactionsService,
  ) {}

  async summary(from: string, to: string): Promise<FinanceSummaryDto> {
    const siteId = this.tenant.siteId;
    const where: Prisma.TransactionWhereInput = {
      cancelledAt: null,
      type: { not: 'TRANSFER' },
      date: { gte: dateOnly(from), lte: dateOnly(to) },
    };
    const [grouped, categories, accounts, opening, closing, months] = await Promise.all([
      this.tenant.db.transaction.groupBy({
        by: ['categoryId', 'type'],
        where,
        _sum: { amountKurus: true },
      }),
      this.tenant.db.financeCategory.findMany({ select: { id: true, name: true, kind: true } }),
      this.tenant.db.cashAccount.findMany({
        orderBy: [{ createdAt: 'asc' }, { kind: 'asc' }, { name: 'asc' }],
      }),
      accountBalances(this.prisma, siteId, dayBefore(from)),
      accountBalances(this.prisma, siteId, to),
      monthlyTotals(this.prisma, siteId, from, to),
    ]);
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const byCategory = grouped
      .filter((g) => g.categoryId)
      .map((g) => {
        const category = categoryById.get(g.categoryId!)!;
        return {
          categoryId: g.categoryId!,
          name: category.name,
          kind: category.kind,
          amountKurus: g._sum.amountKurus ?? 0,
        };
      })
      .sort((a, b) => a.kind.localeCompare(b.kind) || b.amountKurus - a.amountKurus);
    const incomeKurus = byCategory
      .filter((c) => c.kind === 'INCOME')
      .reduce((sum, c) => sum + c.amountKurus, 0);
    const expenseKurus = byCategory
      .filter((c) => c.kind === 'EXPENSE')
      .reduce((sum, c) => sum + c.amountKurus, 0);

    return {
      from,
      to,
      incomeKurus,
      expenseKurus,
      netKurus: incomeKurus - expenseKurus,
      byCategory,
      byMonth: periodRange(periodOfDate(from), periodOfDate(to)).map(
        (period) => months.get(period) ?? { period, incomeKurus: 0, expenseKurus: 0 },
      ),
      accounts: accounts
        .map((a) => ({
          accountId: a.id,
          name: a.name,
          openingKurus: opening.get(a.id) ?? 0,
          closingKurus: closing.get(a.id) ?? 0,
        }))
        .filter((a, i) => accounts[i]!.isActive || a.openingKurus !== 0 || a.closingKurus !== 0),
    };
  }

  async report(from: string, to: string, format: 'pdf' | 'xlsx') {
    const [summary, rows, site] = await Promise.all([
      this.summary(from, to),
      this.transactions.list({ from, to }),
      this.prisma.site.findUniqueOrThrow({
        where: { id: this.tenant.siteId },
        select: { name: true },
      }),
    ]);
    const title = 'Gelir-Gider Raporu';
    const subtitle = `${site.name} · ${formatDateTr(from)} – ${formatDateTr(to)}`;
    const name = `gelir-gider-${from}-${to}.${format}`;
    const detail = (t: TransactionDto) =>
      t.type === 'TRANSFER'
        ? `${t.accountName} → ${t.toAccountName}`
        : [t.categoryName, t.vendorName ?? t.employeeName, t.workTitle].filter(Boolean).join(' · ');
    const describe = (t: TransactionDto) =>
      t.paymentId
        ? `Makbuz ${t.receiptNo ?? ''} · ${t.unitBlockName}-${t.unitNumber}`
        : (t.description ?? '');
    const signed = (t: TransactionDto) =>
      t.type === 'INCOME' ? t.amountKurus : t.type === 'EXPENSE' ? -t.amountKurus : 0;
    const totals: [string, string][] = [
      ['Toplam gelir', formatKurusTl(summary.incomeKurus)],
      ['Toplam gider', formatKurusTl(summary.expenseKurus)],
      ['Fark', formatKurusTl(summary.netKurus)],
    ];

    if (format === 'xlsx') {
      const file = await this.documents.reportXlsx({
        title,
        subtitle,
        rows: [...rows].reverse(),
        columns: [
          { header: 'Tarih', value: (t) => formatDateTr(t.date) },
          { header: 'Tür', value: (t) => transactionTypeLabels[t.type] },
          { header: 'Hesap', value: (t) => t.accountName },
          { header: 'Kategori / firma', value: detail },
          { header: 'Açıklama', value: describe },
          { header: 'Belge no', value: (t) => t.documentNo },
          { header: 'Tutar', value: signed, money: true },
        ],
        summary: [
          ...totals,
          ...summary.accounts.map(
            (a) => [`${a.name} kapanış`, formatKurusTl(a.closingKurus)] as [string, string],
          ),
        ],
      });
      return { file, name, type: XLSX };
    }

    const right = { alignment: 'right' as const };
    const content: Content[] = [
      { text: title, style: 'title' },
      { text: subtitle, style: 'subtitle' },
      {
        columns: [
          {
            width: '*',
            table: {
              widths: ['*', 'auto'],
              body: [
                [{ text: 'Özet', style: 'th', colSpan: 2 }, {}],
                ...totals.map(([l, v]) => [l, { text: v, bold: true, ...right }]),
              ],
            },
            layout: 'lightHorizontalLines',
          },
          { width: 16, text: '' },
          {
            width: '*',
            table: {
              widths: ['*', 'auto', 'auto'],
              body: [
                [
                  { text: 'Hesap', style: 'th' },
                  { text: 'Açılış', style: 'th', ...right },
                  { text: 'Kapanış', style: 'th', ...right },
                ],
                ...summary.accounts.map((a) => [
                  a.name,
                  { text: formatKurusTl(a.openingKurus), ...right },
                  { text: formatKurusTl(a.closingKurus), bold: true, ...right },
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
          },
        ],
      },
      { text: 'Kategorilere göre', bold: true, fontSize: 11, margin: [0, 16, 0, 6] },
      {
        table: {
          widths: ['auto', '*', 'auto'],
          body: [
            [
              { text: 'Tür', style: 'th' },
              { text: 'Kategori', style: 'th' },
              { text: 'Tutar', style: 'th', ...right },
            ],
            ...summary.byCategory.map((c) => [
              transactionTypeLabels[c.kind],
              c.name,
              { text: formatKurusTl(c.amountKurus), ...right },
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      },
      { text: 'Hareketler', bold: true, fontSize: 11, margin: [0, 16, 0, 6] },
      {
        table: {
          headerRows: 1,
          widths: [52, 44, 70, '*', '*', 70],
          body: [
            ['Tarih', 'Tür', 'Hesap', 'Kategori / firma', 'Açıklama', 'Tutar'].map((h, i) => ({
              text: h,
              style: 'th',
              ...(i === 5 ? right : {}),
            })),
            ...[...rows]
              .reverse()
              .map((t) => [
                formatDateTr(t.date),
                transactionTypeLabels[t.type],
                t.accountName,
                detail(t),
                describe(t),
                { text: formatKurusTl(signed(t) || t.amountKurus), ...right },
              ]),
          ],
        },
        layout: 'lightHorizontalLines',
      },
    ];
    return { file: await this.documents.render(content), name, type: PDF };
  }

  async closings(): Promise<ClosingsDto> {
    const rows = await this.tenant.db.monthClosing.findMany({ orderBy: { period: 'desc' } });
    const userIds = [...new Set(rows.map((r) => r.closedById).filter((id): id is string => !!id))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    return {
      lockedThrough: rows[0]?.period ?? null,
      closings: rows.map((r) => this.toClosingDto(r, nameOf.get(r.closedById ?? '') ?? null)),
    };
  }

  async close(period: string): Promise<MonthClosingDto> {
    const siteId = this.tenant.siteId;
    if (period >= currentPeriod()) {
      throw new BadRequestException('Yalnızca bitmiş aylar kapatılabilir');
    }
    const locked = await lockedThrough(this.prisma, siteId);
    if (locked && period <= locked) {
      throw new BadRequestException(`${periodLabel(locked)} ve öncesi zaten kapatılmış`);
    }
    const summary = await this.summary(`${period}-01`, lastDayOf(period));
    const data: ClosingSummary = {
      incomeKurus: summary.incomeKurus,
      expenseKurus: summary.expenseKurus,
      balances: summary.accounts.map((a) => ({
        accountId: a.accountId,
        name: a.name,
        balanceKurus: a.closingKurus,
      })),
    };
    const closing = await this.tenant.db.monthClosing.create({
      data: {
        siteId,
        period,
        summary: data as unknown as Prisma.InputJsonValue,
        closedById: this.tenant.userId ?? null,
      },
    });
    await this.audit.record({
      action: 'CLOSE',
      entityType: 'MonthClosing',
      entityId: closing.id,
      after: { period, ...data },
    });
    return this.toClosingDto(closing, null);
  }

  async reopenLatest(): Promise<void> {
    const latest = await this.tenant.db.monthClosing.findFirst({ orderBy: { period: 'desc' } });
    if (!latest) throw new NotFoundException('Kapatılmış ay yok');
    await this.tenant.db.monthClosing.delete({ where: { id: latest.id } });
    await this.audit.record({
      action: 'REOPEN',
      entityType: 'MonthClosing',
      entityId: latest.id,
      before: { period: latest.period, summary: latest.summary },
    });
  }

  private toClosingDto(
    r: { id: string; period: string; closedAt: Date; summary: Prisma.JsonValue },
    closedByName: string | null,
  ): MonthClosingDto {
    const summary = r.summary as unknown as ClosingSummary;
    return {
      id: r.id,
      period: r.period,
      closedAt: r.closedAt.toISOString(),
      closedByName,
      incomeKurus: summary.incomeKurus,
      expenseKurus: summary.expenseKurus,
      balances: summary.balances,
    };
  }
}

@ApiTags('Gelir-gider')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('finance')
export class FinanceReportsController {
  constructor(private readonly reports: FinanceReportsService) {}

  @Get('summary')
  summary(@Query() query: FinanceReportQueryDto): Promise<FinanceSummaryDto> {
    return this.reports.summary(query.from, query.to);
  }

  @Get('report.:format')
  async report(
    @Param('format') format: string,
    @Query() query: FinanceReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (format !== 'pdf' && format !== 'xlsx') throw new NotFoundException();
    const { file, name, type } = await this.reports.report(query.from, query.to, format);
    return sendFile(res, name, type, file);
  }

  @Get('closings')
  closings(): Promise<ClosingsDto> {
    return this.reports.closings();
  }

  @Post('closings')
  close(@Body() body: MonthCloseDto): Promise<MonthClosingDto> {
    return this.reports.close(body.period);
  }

  @Delete('closings/latest')
  @HttpCode(204)
  reopen(): Promise<void> {
    return this.reports.reopenLatest();
  }
}

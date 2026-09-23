import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  buildStatement,
  chargeState,
  formatKurusTl,
  paymentMethodLabels,
  periodRange,
  unitLabel,
  type DebtReportRowDto,
  type MatrixCellDto,
  type MatrixDto,
  type StatementDto,
  type UnitAccountDto,
} from '@apartman/shared';
import type { Response } from 'express';
import { activeOn, dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import { MatrixQueryDto, PaymentReportQueryDto, StatementQueryDto } from '../../common/dues.dto';
import { SiteRoles, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { compareUnits } from '../residents/occupancy.mapper';
import { UnitAccessGuard } from '../units/units';
import { DocumentsService } from './documents.service';
import {
  chargeInclude,
  chargeLabel,
  paymentInclude,
  toChargeDto,
  toPaymentDto,
} from './ledger.mapper';
import { PaymentsService } from './payments';

const formatDateTr = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};

function attachment(res: Response, filename: string, type: string, data: Buffer): StreamableFile {
  const ascii = filename
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/"/g, '');
  res.setHeader('Content-Type', type);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  return new StreamableFile(data);
}

const PDF = 'application/pdf';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable()
export class AccountService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly documents: DocumentsService,
    private readonly payments: PaymentsService,
  ) {}

  private async unitOrThrow(unitId: string) {
    const unit = await this.tenant.db.unit.findUnique({
      where: { id: unitId },
      include: {
        block: { select: { name: true } },
        site: { select: { name: true, kind: true } },
        occupancies: {
          where: { ...activeOn(), isResponsibleForDues: true },
          select: { firstName: true, lastName: true },
        },
      },
    });
    if (!unit) throw new NotFoundException('Daire bulunamadı');
    return unit;
  }

  async account(unitId: string): Promise<UnitAccountDto> {
    const unit = await this.unitOrThrow(unitId);
    const hideCancelled = this.tenant.isResident;
    const today = todayInIstanbul();
    const [charges, payments] = await Promise.all([
      this.tenant.db.charge.findMany({
        where: { unitId, ...(hideCancelled ? { cancelledAt: null } : {}) },
        include: chargeInclude,
        orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.tenant.db.payment.findMany({
        where: { unitId, ...(hideCancelled ? { cancelledAt: null } : {}) },
        include: paymentInclude,
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);
    const chargeDtos = charges.map((c) => toChargeDto(c, today));
    const active = chargeDtos.filter((c) => !c.cancelledAt);
    return {
      unitId,
      blockName: unit.block.name,
      unitNumber: unit.number,
      debtKurus: active.reduce((sum, c) => sum + c.remainingKurus, 0),
      overdueKurus: active.filter((c) => c.overdue).reduce((sum, c) => sum + c.remainingKurus, 0),
      charges: chargeDtos,
      payments: payments.map(toPaymentDto),
    };
  }

  async statement(unitId: string, fromInput?: string, toInput?: string): Promise<StatementDto> {
    const unit = await this.unitOrThrow(unitId);
    const to = toInput ?? todayInIstanbul();
    const from = fromInput ?? `${to.slice(0, 4)}-01-01`;
    if (from > to) throw new BadRequestException('Başlangıç tarihi bitiş tarihinden sonra olamaz');

    const [charges, payments] = await Promise.all([
      this.tenant.db.charge.findMany({
        where: { unitId, cancelledAt: null, issueDate: { lte: dateOnly(to) } },
        include: { chargeType: { select: { name: true } } },
      }),
      this.tenant.db.payment.findMany({
        where: { unitId, cancelledAt: null, paidAt: { lte: dateOnly(to) } },
      }),
    ]);
    const statement = buildStatement(
      [
        ...charges.map((c) => ({
          date: toDateString(c.issueDate),
          kind: 'CHARGE' as const,
          description: chargeLabel(c),
          amountKurus: c.amountKurus,
          sortKey: c.createdAt.toISOString(),
        })),
        ...payments.map((p) => ({
          date: toDateString(p.paidAt),
          kind: 'PAYMENT' as const,
          description: `Ödeme (${paymentMethodLabels[p.method]})${p.reference ? ` · ${p.reference}` : ''}`,
          amountKurus: p.amountKurus,
          sortKey: p.createdAt.toISOString(),
        })),
      ],
      from,
      to,
    );
    return {
      unitId,
      blockName: unit.block.name,
      unitNumber: unit.number,
      siteName: unit.site.name,
      ...statement,
    };
  }

  async statementPdf(
    unitId: string,
    from?: string,
    to?: string,
  ): Promise<{ file: Buffer; name: string }> {
    const s = await this.statement(unitId, from, to);
    const unit = await this.unitOrThrow(unitId);
    const responsible =
      unit.occupancies.map((o) => `${o.firstName} ${o.lastName}`).join(', ') || '—';
    const right = { alignment: 'right' as const };

    const body = [
      [
        { text: 'Tarih', style: 'th' },
        { text: 'Açıklama', style: 'th' },
        { text: 'Borç', style: 'th', ...right },
        { text: 'Ödeme', style: 'th', ...right },
        { text: 'Bakiye', style: 'th', ...right },
      ],
      [
        { text: formatDateTr(s.from) },
        { text: 'Devreden bakiye', italics: true },
        { text: '' },
        { text: '' },
        { text: formatKurusTl(s.openingKurus), ...right },
      ],
      ...s.rows.map((r) => [
        { text: formatDateTr(r.date) },
        { text: r.description },
        { text: r.debitKurus ? formatKurusTl(r.debitKurus) : '', ...right },
        { text: r.creditKurus ? formatKurusTl(r.creditKurus) : '', ...right },
        { text: formatKurusTl(r.balanceKurus), ...right },
      ]),
      [
        { text: '' },
        { text: 'Toplam', bold: true },
        { text: formatKurusTl(s.totalDebitKurus), bold: true, ...right },
        { text: formatKurusTl(s.totalCreditKurus), bold: true, ...right },
        { text: '' },
      ],
    ];

    const closing =
      s.closingKurus > 0
        ? `Güncel borç: ${formatKurusTl(s.closingKurus)}`
        : s.closingKurus < 0
          ? `Alacak: ${formatKurusTl(-s.closingKurus)}`
          : 'Borç bulunmamaktadır.';

    const file = await this.documents.render([
      { text: 'Hesap Ekstresi', style: 'title' },
      {
        style: 'subtitle',
        text: [
          { text: `${s.siteName}\n`, bold: true },
          `${unitLabel(unit.site.kind, s.blockName, s.unitNumber)}\n`,
          `Aidattan sorumlu: ${responsible}\n`,
          `Dönem: ${formatDateTr(s.from)} – ${formatDateTr(s.to)}`,
        ],
      },
      {
        table: { headerRows: 1, widths: [60, '*', 70, 70, 75], body },
        layout: 'lightHorizontalLines',
      },
      { text: closing, bold: true, fontSize: 11, alignment: 'right', margin: [0, 12, 0, 0] },
    ]);
    const short = unitLabel(unit.site.kind, s.blockName, s.unitNumber, 'short');
    return { file, name: `ekstre-${short}-${s.from}-${s.to}.pdf` };
  }

  async matrix(year: number, blockId?: string): Promise<MatrixDto> {
    const periods = periodRange(`${year}-01`, `${year}-12`);
    const today = todayInIstanbul();
    const [units, charges] = await Promise.all([
      this.tenant.db.unit.findMany({
        where: blockId ? { blockId } : {},
        include: { block: { select: { name: true } } },
      }),
      this.tenant.db.charge.findMany({
        where: { cancelledAt: null, ...(blockId ? { unit: { blockId } } : {}) },
        select: {
          unitId: true,
          period: true,
          amountKurus: true,
          dueDate: true,
          allocations: { select: { amountKurus: true } },
        },
      }),
    ]);

    type Acc = { amount: number; paid: number; dueDate: string };
    const cells = new Map<string, Acc>();
    const debt = new Map<string, { debt: number; overdue: number }>();
    for (const c of charges) {
      const paid = c.allocations.reduce((sum, a) => sum + a.amountKurus, 0);
      const due = toDateString(c.dueDate);
      const state = chargeState(c.amountKurus, paid, due, today);
      const d = debt.get(c.unitId) ?? { debt: 0, overdue: 0 };
      d.debt += state.remainingKurus;
      if (state.overdue) d.overdue += state.remainingKurus;
      debt.set(c.unitId, d);

      if (c.period?.startsWith(`${year}-`)) {
        const key = `${c.unitId}:${c.period}`;
        const acc = cells.get(key) ?? { amount: 0, paid: 0, dueDate: due };
        acc.amount += c.amountKurus;
        acc.paid += paid;
        if (due < acc.dueDate) acc.dueDate = due;
        cells.set(key, acc);
      }
    }

    const rows = units
      .map((u) => ({
        unitId: u.id,
        blockName: u.block.name,
        unitNumber: u.number,
        number: u.number,
        cells: periods.map((p): MatrixCellDto | null => {
          const acc = cells.get(`${u.id}:${p}`);
          if (!acc) return null;
          const state = chargeState(acc.amount, acc.paid, acc.dueDate, today);
          return {
            amountKurus: acc.amount,
            paidKurus: acc.paid,
            status: state.status,
            overdue: state.overdue,
          };
        }),
        debtKurus: debt.get(u.id)?.debt ?? 0,
        overdueKurus: debt.get(u.id)?.overdue ?? 0,
        archived: Boolean(u.archivedAt),
      }))
      .filter((row) => !row.archived || row.debtKurus > 0 || row.cells.some(Boolean))
      .sort(compareUnits)
      .map(({ number: _number, archived: _archived, ...row }) => row);

    return { year, periods, rows };
  }

  async debtReport(): Promise<DebtReportRowDto[]> {
    const today = todayInIstanbul();
    const [units, charges, lastPayments] = await Promise.all([
      this.tenant.db.unit.findMany({
        include: {
          block: { select: { name: true } },
          occupancies: {
            where: { ...activeOn(today), isResponsibleForDues: true },
            select: { firstName: true, lastName: true },
          },
        },
      }),
      this.tenant.db.charge.findMany({
        where: { cancelledAt: null },
        select: {
          unitId: true,
          period: true,
          amountKurus: true,
          dueDate: true,
          allocations: { select: { amountKurus: true } },
        },
      }),
      this.tenant.db.payment.groupBy({
        by: ['unitId'],
        where: { cancelledAt: null },
        _max: { paidAt: true },
      }),
    ]);

    const byUnit = new Map<string, { debt: number; overdue: number; oldest: string | null }>();
    for (const c of charges) {
      const paid = c.allocations.reduce((sum, a) => sum + a.amountKurus, 0);
      const state = chargeState(c.amountKurus, paid, toDateString(c.dueDate), today);
      if (state.remainingKurus === 0) continue;
      const row = byUnit.get(c.unitId) ?? { debt: 0, overdue: 0, oldest: null };
      row.debt += state.remainingKurus;
      if (state.overdue) row.overdue += state.remainingKurus;
      if (c.period && (!row.oldest || c.period < row.oldest)) row.oldest = c.period;
      byUnit.set(c.unitId, row);
    }
    const last = new Map(lastPayments.map((p) => [p.unitId, p._max.paidAt]));

    return units
      .map((u) => ({
        unitId: u.id,
        blockName: u.block.name,
        unitNumber: u.number,
        number: u.number,
        responsible: u.occupancies.map((o) => `${o.firstName} ${o.lastName}`).join(', '),
        debtKurus: byUnit.get(u.id)?.debt ?? 0,
        overdueKurus: byUnit.get(u.id)?.overdue ?? 0,
        oldestUnpaidPeriod: byUnit.get(u.id)?.oldest ?? null,
        lastPaymentDate: last.get(u.id) ? toDateString(last.get(u.id)!) : null,
      }))
      .sort(compareUnits)
      .map(({ number: _number, ...row }) => row);
  }

  async debtReportFile(format: 'pdf' | 'xlsx') {
    const rows = (await this.debtReport()).filter((r) => r.debtKurus > 0);
    const site = await this.tenant.db.unit.findFirst({
      select: { site: { select: { name: true } } },
    });
    const kind = await this.tenant.siteKind();
    const total = rows.reduce((sum, r) => sum + r.debtKurus, 0);
    const overdue = rows.reduce((sum, r) => sum + r.overdueKurus, 0);
    const report = {
      title: 'Borç Durum Raporu',
      subtitle: `${site?.site.name ?? ''} · ${formatDateTr(todayInIstanbul())} itibarıyla · ${rows.length} borçlu daire`,
      rows,
      columns: [
        {
          header: 'Daire',
          value: (r: DebtReportRowDto) => unitLabel(kind, r.blockName, r.unitNumber, 'short'),
        },
        {
          header: 'Aidattan sorumlu',
          value: (r: DebtReportRowDto) => r.responsible || null,
          width: '*' as const,
        },
        { header: 'Toplam borç', value: (r: DebtReportRowDto) => r.debtKurus, money: true },
        { header: 'Gecikmiş', value: (r: DebtReportRowDto) => r.overdueKurus, money: true },
        { header: 'En eski borç', value: (r: DebtReportRowDto) => r.oldestUnpaidPeriod },
        {
          header: 'Son ödeme',
          value: (r: DebtReportRowDto) =>
            r.lastPaymentDate ? formatDateTr(r.lastPaymentDate) : null,
        },
      ],
      summary: [
        ['Toplam borç', formatKurusTl(total)],
        ['Gecikmiş borç', formatKurusTl(overdue)],
      ] as [string, string][],
    };
    const file =
      format === 'pdf'
        ? await this.documents.reportPdf(report)
        : await this.documents.reportXlsx(report);
    return { file, name: `borc-raporu-${todayInIstanbul()}.${format}` };
  }

  async paymentReportFile(from: string, to: string, format: 'pdf' | 'xlsx') {
    if (from > to) throw new BadRequestException('Başlangıç tarihi bitiş tarihinden sonra olamaz');
    const payments = (await this.payments.list({ from, to })).filter((p) => !p.cancelledAt);
    const site = await this.tenant.db.unit.findFirst({
      select: { site: { select: { name: true } } },
    });
    const kind = await this.tenant.siteKind();
    type Row = (typeof payments)[number];
    const byMethod = new Map<string, number>();
    for (const p of payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amountKurus);
    const total = payments.reduce((sum, p) => sum + p.amountKurus, 0);

    const report = {
      title: 'Tahsilat Raporu',
      subtitle: `${site?.site.name ?? ''} · ${formatDateTr(from)} – ${formatDateTr(to)} · ${payments.length} ödeme`,
      rows: payments,
      columns: [
        { header: 'Tarih', value: (p: Row) => formatDateTr(p.paidAt) },
        {
          header: 'Daire',
          value: (p: Row) => unitLabel(kind, p.blockName, p.unitNumber, 'short'),
        },
        { header: 'Yöntem', value: (p: Row) => paymentMethodLabels[p.method] },
        {
          header: 'Açıklama',
          value: (p: Row) => p.allocations.map((a) => a.label).join(', '),
          width: '*' as const,
        },
        { header: 'Referans', value: (p: Row) => p.reference },
        { header: 'Tutar', value: (p: Row) => p.amountKurus, money: true },
      ],
      summary: [
        ...[...byMethod.entries()].map(
          ([method, sum]) =>
            [paymentMethodLabels[method as Row['method']], formatKurusTl(sum)] as [string, string],
        ),
        ['Toplam tahsilat', formatKurusTl(total)] as [string, string],
      ],
    };
    const file =
      format === 'pdf'
        ? await this.documents.reportPdf(report)
        : await this.documents.reportXlsx(report);
    return { file, name: `tahsilat-raporu-${from}-${to}.${format}` };
  }
}

@ApiTags('Aidat ve borçlar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller()
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @SiteRoles('SITE_MANAGER', 'RESIDENT')
  @UseGuards(UnitAccessGuard)
  @Get('units/:id/account')
  unitAccount(@Param('id', ParseUUIDPipe) id: string): Promise<UnitAccountDto> {
    return this.account.account(id);
  }

  @SiteRoles('SITE_MANAGER', 'RESIDENT')
  @UseGuards(UnitAccessGuard)
  @Get('units/:id/statement')
  statement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
  ): Promise<StatementDto> {
    return this.account.statement(id, query.from, query.to);
  }

  @SiteRoles('SITE_MANAGER', 'RESIDENT')
  @UseGuards(UnitAccessGuard)
  @Get('units/:id/statement.pdf')
  async statementPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, name } = await this.account.statementPdf(id, query.from, query.to);
    return attachment(res, name, PDF, file);
  }

  @Get('dues/matrix')
  matrix(@Query() query: MatrixQueryDto): Promise<MatrixDto> {
    return this.account.matrix(query.year, query.blockId);
  }

  @Get('reports/debts')
  debts(): Promise<DebtReportRowDto[]> {
    return this.account.debtReport();
  }

  @Get('reports/debts.:format')
  async debtsFile(
    @Param('format') format: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (format !== 'pdf' && format !== 'xlsx') throw new NotFoundException();
    const { file, name } = await this.account.debtReportFile(format);
    return attachment(res, name, format === 'pdf' ? PDF : XLSX, file);
  }

  @Get('reports/payments.:format')
  async paymentsFile(
    @Param('format') format: string,
    @Query() query: PaymentReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (format !== 'pdf' && format !== 'xlsx') throw new NotFoundException();
    const { file, name } = await this.account.paymentReportFile(query.from, query.to, format);
    return attachment(res, name, format === 'pdf' ? PDF : XLSX, file);
  }
}

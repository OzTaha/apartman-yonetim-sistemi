import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
  type StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  addMonths,
  budgetAdvanceAmount,
  budgetCreateSchema,
  budgetEndPeriod,
  budgetUpdateSchema,
  computeUnitAmounts,
  DistributionError,
  elapsedBudgetMonths,
  formatKurusTl,
  periodLabel,
  unitLabel,
  type BudgetComparisonDto,
  type BudgetComparisonRowDto,
  type BudgetDetailDto,
  type BudgetDto,
  type DistributionMethod,
} from '@apartman/shared';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import type { Content } from 'pdfmake/interfaces';
import { dateOnly, todayInIstanbul } from '../../common/dates';
import { formatDateTr, PDF, sendFile } from '../../common/http';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditorReadable, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../dues/documents.service';
import { DuesModule } from '../dues/dues.module';
import { DuesService } from '../dues/dues';
import { assertMethodAllowed, currentPeriod, loadSiteSettings } from '../dues/site-settings';

class BudgetCreateDto extends createZodDto(budgetCreateSchema) {}
class BudgetUpdateDto extends createZodDto(budgetUpdateSchema) {}

const budgetInclude = {
  lines: { include: { category: { select: { name: true } } } },
  duesPlan: { select: { method: true, amountKurus: true, validFrom: true } },
} satisfies Prisma.BudgetInclude;

type BudgetRow = Prisma.BudgetGetPayload<{ include: typeof budgetInclude }>;

const methodBasis: Record<DistributionMethod, string> = {
  EQUAL: '',
  AREA: 'm²',
  LAND_SHARE: 'arsa payı',
};

function totalOf(b: BudgetRow): number {
  return b.lines.reduce((sum, l) => sum + l.amountKurus, 0);
}

function toDto(b: BudgetRow, unitCount: number): BudgetDto {
  const now = currentPeriod();
  const endPeriod = budgetEndPeriod(b.startPeriod);
  const totalKurus = totalOf(b);
  const advanceKurus = budgetAdvanceAmount(totalKurus, b.method, unitCount);
  return {
    id: b.id,
    startPeriod: b.startPeriod,
    endPeriod,
    method: b.method,
    totalKurus,
    advanceKurus,
    lineCount: b.lines.length,
    isCurrent: b.startPeriod <= now && now <= endPeriod,
    applied: Boolean(
      b.duesPlan &&
      advanceKurus > 0 &&
      b.duesPlan.method === b.method &&
      b.duesPlan.amountKurus === advanceKurus,
    ),
    appliedAt: b.appliedAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
  };
}

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly dues: DuesService,
    private readonly documents: DocumentsService,
  ) {}

  async list(): Promise<BudgetDto[]> {
    const [budgets, units] = await Promise.all([
      this.tenant.db.budget.findMany({
        include: budgetInclude,
        orderBy: { startPeriod: 'desc' },
      }),
      this.dues.distributableUnits(),
    ]);
    return budgets.map((b) => toDto(b, units.length));
  }

  async get(id: string): Promise<BudgetDetailDto> {
    const [budget, units] = await Promise.all([this.find(id), this.dues.distributableUnits()]);
    const dto = toDto(budget, units.length);
    let amounts: number[] = units.map(() => 0);
    let distributionError: string | null = null;
    if (dto.advanceKurus > 0) {
      try {
        amounts = computeUnitAmounts(
          { method: budget.method, amountKurus: dto.advanceKurus },
          units,
        );
      } catch (error) {
        if (!(error instanceof DistributionError)) throw error;
        distributionError = error.message;
      }
    }
    const now = currentPeriod();
    return {
      ...dto,
      lines: budget.lines
        .map((l) => ({
          categoryId: l.categoryId,
          categoryName: l.category.name,
          amountKurus: l.amountKurus,
          note: l.note,
        }))
        .sort((a, b) => b.amountKurus - a.amountKurus),
      units: units.map((u, i) => ({
        unitId: u.id,
        blockName: u.blockName,
        unitNumber: u.number,
        areaM2: u.areaM2,
        landShare: u.landShare,
        monthlyKurus: amounts[i] ?? 0,
      })),
      distributionError,
      appliedPlan: budget.duesPlan,
      applyFrom: budget.startPeriod > now ? budget.startPeriod : now,
      comparison: await this.comparison(budget),
    };
  }

  async create(input: BudgetCreateDto): Promise<BudgetDetailDto> {
    await this.assertMethod(input.method);
    await this.assertNoOverlap(input.startPeriod);
    const source = input.copyFromId ? await this.find(input.copyFromId) : null;
    const siteId = this.tenant.siteId;
    const budget = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.budget.create({
        data: {
          siteId,
          startPeriod: input.startPeriod,
          method: input.method,
          createdById: this.tenant.userId ?? null,
        },
      });
      await tx.budgetLine.createMany({
        data: (source?.lines ?? []).map((l) => ({
          siteId,
          budgetId: created.id,
          categoryId: l.categoryId,
          amountKurus: l.amountKurus,
          note: l.note,
        })),
      });
      return created;
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Budget',
      entityId: budget.id,
      after: { ...input, copiedLines: source?.lines.length ?? 0 },
    });
    return this.get(budget.id);
  }

  async update(id: string, input: BudgetUpdateDto): Promise<BudgetDetailDto> {
    const before = await this.find(id);
    await this.assertMethod(input.method);
    const ids = input.lines.map((l) => l.categoryId);
    const categories = await this.tenant.db.financeCategory.count({
      where: { id: { in: ids }, kind: 'EXPENSE' },
    });
    if (categories !== ids.length) {
      throw new BadRequestException('Bütçe kalemleri gider kategorilerinden seçilmelidir');
    }
    const siteId = this.tenant.siteId;
    await this.tenant.db.$transaction(async (tx) => {
      await tx.budgetLine.deleteMany({ where: { siteId, budgetId: id } });
      await tx.budget.update({ where: { id }, data: { method: input.method } });
      await tx.budgetLine.createMany({
        data: input.lines.map((l) => ({
          siteId,
          budgetId: id,
          categoryId: l.categoryId,
          amountKurus: l.amountKurus,
          note: l.note ?? null,
        })),
      });
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Budget',
      entityId: id,
      before: {
        method: before.method,
        lines: before.lines.map((l) => ({ categoryId: l.categoryId, amountKurus: l.amountKurus })),
      },
      after: input,
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const budget = await this.find(id);
    await this.tenant.db.budget.delete({ where: { id } });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Budget',
      entityId: id,
      before: { startPeriod: budget.startPeriod, totalKurus: totalOf(budget) },
    });
  }

  async apply(id: string): Promise<BudgetDetailDto> {
    const detail = await this.get(id);
    if (detail.totalKurus === 0) {
      throw new BadRequestException('Aidat planı için önce bütçeye gider kalemi ekleyin');
    }
    if (detail.distributionError) throw new BadRequestException(detail.distributionError);
    if (detail.applied) {
      throw new ConflictException('Bu bütçenin avans aidatı zaten aidat planına uygulandı');
    }
    const plan = await this.dues.createPlan({
      method: detail.method,
      amountKurus: detail.advanceKurus,
      validFrom: detail.applyFrom,
    });
    await this.tenant.db.budget.update({
      where: { id },
      data: { duesPlanId: plan.id, appliedAt: new Date() },
    });
    await this.audit.record({
      action: 'APPLY',
      entityType: 'Budget',
      entityId: id,
      after: { duesPlanId: plan.id, amountKurus: plan.amountKurus, validFrom: plan.validFrom },
    });
    return this.get(id);
  }

  async pdf(id: string): Promise<{ file: Buffer; name: string }> {
    const [detail, site, manager] = await Promise.all([
      this.get(id),
      this.prisma.site.findUniqueOrThrow({
        where: { id: this.tenant.siteId },
        select: { name: true, kind: true, address: true, city: true },
      }),
      this.prisma.siteMembership.findFirst({
        where: { siteId: this.tenant.siteId, role: 'SITE_MANAGER', user: { isActive: true } },
        orderBy: { createdAt: 'asc' },
        select: { user: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    const today = todayInIstanbul();
    const right = { alignment: 'right' as const };
    const proportional = detail.method !== 'EQUAL';
    const basis = methodBasis[detail.method];
    const place = [site.address, site.city].filter(Boolean).join(', ');
    const monthlyTotal = detail.units.reduce((sum, u) => sum + u.monthlyKurus, 0);
    const explanation =
      detail.advanceKurus === 0
        ? 'Bütçeye henüz gider kalemi eklenmemiştir.'
        : proportional
          ? `Toplam yıllık giderin on ikide biri olan aylık ${formatKurusTl(detail.advanceKurus)} avans, bağımsız bölümlere ${basis} oranında dağıtılmıştır. Tutarlar tam liraya yukarı yuvarlanmıştır.`
          : `Toplam yıllık gider 12 aya ve ${detail.units.length} bağımsız bölüme eşit olarak bölünmüş; bağımsız bölüm başına aylık avans aidat ${formatKurusTl(detail.advanceKurus)} olarak hesaplanmıştır. Tutar tam liraya yukarı yuvarlanmıştır.`;

    const content: Content[] = [
      {
        columns: [
          {
            width: '*',
            text: [
              { text: `${site.name}\n`, bold: true, fontSize: 12 },
              { text: place, color: '#555555' },
            ],
          },
          { width: 'auto', text: `Tarih: ${formatDateTr(today)}`, ...right },
        ],
      },
      { text: 'İŞLETME PROJESİ', style: 'title', alignment: 'center', margin: [0, 24, 0, 2] },
      {
        text: `${periodLabel(detail.startPeriod)} – ${periodLabel(detail.endPeriod)}`,
        style: 'subtitle',
        alignment: 'center',
      },
      { text: 'Tahmini giderler', bold: true, fontSize: 11, margin: [0, 8, 0, 6] },
      {
        table: {
          headerRows: 1,
          widths: ['*', '*', 80, 70],
          body: [
            [
              { text: 'Gider kalemi', style: 'th' },
              { text: 'Açıklama', style: 'th' },
              { text: 'Yıllık', style: 'th', ...right },
              { text: 'Aylık', style: 'th', ...right },
            ],
            ...detail.lines.map((l) => [
              l.categoryName,
              l.note ?? '',
              { text: formatKurusTl(l.amountKurus), ...right },
              { text: formatKurusTl(Math.round(l.amountKurus / 12)), ...right },
            ]),
            [
              { text: 'Toplam', bold: true, colSpan: 2 },
              {},
              { text: formatKurusTl(detail.totalKurus), bold: true, ...right },
              { text: formatKurusTl(Math.round(detail.totalKurus / 12)), bold: true, ...right },
            ],
          ],
        },
        layout: 'lightHorizontalLines',
      },
      { text: explanation, margin: [0, 12, 0, 0], lineHeight: 1.3 },
      {
        text: 'Bağımsız bölümlerin aylık avans aidatı',
        bold: true,
        fontSize: 11,
        margin: [0, 16, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          widths: proportional ? ['*', 60, 90, 90] : ['*', 90, 90],
          body: [
            [
              { text: 'Bağımsız bölüm', style: 'th' },
              ...(proportional
                ? [{ text: basis === 'm²' ? 'm²' : 'Arsa payı', style: 'th', ...right }]
                : []),
              { text: 'Aylık', style: 'th', ...right },
              { text: 'Yıllık', style: 'th', ...right },
            ],
            ...detail.units.map((u) => [
              unitLabel(site.kind, u.blockName, u.unitNumber),
              ...(proportional
                ? [
                    {
                      text: String((detail.method === 'AREA' ? u.areaM2 : u.landShare) ?? '—'),
                      ...right,
                    },
                  ]
                : []),
              { text: formatKurusTl(u.monthlyKurus), ...right },
              { text: formatKurusTl(u.monthlyKurus * 12), ...right },
            ]),
            [
              { text: 'Toplam', bold: true, ...(proportional ? { colSpan: 2 } : {}) },
              ...(proportional ? [{}] : []),
              { text: formatKurusTl(monthlyTotal), bold: true, ...right },
              { text: formatKurusTl(monthlyTotal * 12), bold: true, ...right },
            ],
          ],
        },
        layout: 'lightHorizontalLines',
      },
      {
        margin: [0, 36, 0, 0],
        columns: [
          { width: '*', text: '' },
          {
            width: 200,
            alignment: 'center',
            text: [
              ...(manager
                ? [{ text: `${manager.user.firstName} ${manager.user.lastName}\n`, bold: true }]
                : []),
              'Yönetici\n\n\n',
              { text: 'İmza', color: '#777777' },
            ],
          },
        ],
      },
    ];
    const file = await this.documents.render(content);
    return { file, name: `isletme-projesi-${detail.startPeriod}.pdf` };
  }

  private async comparison(budget: BudgetRow): Promise<BudgetComparisonDto> {
    const siteId = this.tenant.siteId;
    const end = budgetEndPeriod(budget.startPeriod);
    const date = {
      gte: dateOnly(`${budget.startPeriod}-01`),
      lt: dateOnly(`${addMonths(end, 1)}-01`),
    };
    const dues: Prisma.ChargeWhereInput = {
      siteId,
      duesPlanId: { not: null },
      cancelledAt: null,
      period: { gte: budget.startPeriod, lte: end },
    };
    const [expenses, accrued, collected] = await Promise.all([
      this.tenant.db.transaction.groupBy({
        by: ['categoryId'],
        where: { siteId, type: 'EXPENSE', cancelledAt: null, date },
        _sum: { amountKurus: true },
      }),
      this.tenant.db.charge.aggregate({ where: dues, _sum: { amountKurus: true } }),
      this.tenant.db.paymentAllocation.aggregate({
        where: { siteId, charge: dues },
        _sum: { amountKurus: true },
      }),
    ]);
    const actualBy = new Map(expenses.map((e) => [e.categoryId, e._sum.amountKurus ?? 0]));
    const planned = new Set(budget.lines.map((l) => l.categoryId));
    const extraIds = expenses
      .map((e) => e.categoryId)
      .filter((id): id is string => id !== null && !planned.has(id));
    const extraNames = new Map(
      (
        await this.tenant.db.financeCategory.findMany({
          where: { id: { in: extraIds } },
          select: { id: true, name: true },
        })
      ).map((c) => [c.id, c.name]),
    );

    const rows: BudgetComparisonRowDto[] = [
      ...budget.lines
        .map((l) => ({
          categoryId: l.categoryId,
          categoryName: l.category.name,
          plannedKurus: l.amountKurus,
          actualKurus: actualBy.get(l.categoryId) ?? 0,
        }))
        .sort((a, b) => b.plannedKurus - a.plannedKurus),
      ...expenses
        .filter((e) => e.categoryId === null || !planned.has(e.categoryId))
        .map((e) => ({
          categoryId: e.categoryId,
          categoryName: e.categoryId ? (extraNames.get(e.categoryId) ?? '—') : 'Kategorisiz',
          plannedKurus: 0,
          actualKurus: e._sum.amountKurus ?? 0,
        }))
        .sort((a, b) => b.actualKurus - a.actualKurus),
    ];
    return {
      elapsedMonths: elapsedBudgetMonths(budget.startPeriod, currentPeriod()),
      plannedKurus: totalOf(budget),
      actualKurus: rows.reduce((sum, r) => sum + r.actualKurus, 0),
      duesAccruedKurus: accrued._sum.amountKurus ?? 0,
      duesCollectedKurus: collected._sum.amountKurus ?? 0,
      rows,
    };
  }

  private async find(id: string): Promise<BudgetRow> {
    const budget = await this.tenant.db.budget.findUnique({
      where: { id },
      include: budgetInclude,
    });
    if (!budget) throw new NotFoundException('Bütçe bulunamadı');
    return budget;
  }

  private async assertMethod(method: DistributionMethod) {
    assertMethodAllowed(await loadSiteSettings(this.prisma, this.tenant.siteId), method);
  }

  private async assertNoOverlap(startPeriod: string) {
    const other = await this.tenant.db.budget.findFirst({
      where: {
        startPeriod: { gt: addMonths(startPeriod, -12), lt: addMonths(startPeriod, 12) },
      },
    });
    if (other) {
      throw new ConflictException(
        `Bu dönem, ${periodLabel(other.startPeriod)} – ${periodLabel(budgetEndPeriod(other.startPeriod))} bütçesiyle çakışıyor`,
      );
    }
  }
}

@ApiTags('İşletme projesi')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@AuditorReadable()
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list(): Promise<BudgetDto[]> {
    return this.budgets.list();
  }

  @Post()
  create(@Body() body: BudgetCreateDto): Promise<BudgetDetailDto> {
    return this.budgets.create(body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<BudgetDetailDto> {
    return this.budgets.get(id);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, name } = await this.budgets.pdf(id);
    return sendFile(res, name, PDF, file);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: BudgetUpdateDto,
  ): Promise<BudgetDetailDto> {
    return this.budgets.update(id, body);
  }

  @Post(':id/apply')
  @HttpCode(200)
  apply(@Param('id', ParseUUIDPipe) id: string): Promise<BudgetDetailDto> {
    return this.budgets.apply(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.budgets.remove(id);
  }
}

@Module({
  imports: [DuesModule],
  controllers: [BudgetsController],
  providers: [BudgetsService],
})
export class BudgetsModule {}

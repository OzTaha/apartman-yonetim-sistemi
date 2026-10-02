import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  computeUnitAmounts,
  DistributionError,
  dueDateFor,
  periodLabel,
  duesPlanSchema,
  type AccrualResultDto,
  type DuesPlanCreateResultDto,
  type DuesPlanDto,
  type DuesPlanImpactDto,
  type DuesSettingsDto,
  unitLabel,
} from '@apartman/shared';
import { ClsService } from 'nestjs-cls';
import { dateOnly } from '../../common/dates';
import {
  AccrueDto,
  DuesPlanDto as DuesPlanBody,
  DuesSettingsDto as DuesSettingsBody,
} from '../../common/dues.dto';
import type { Env } from '../../config/env';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  type AppClsStore,
  AuditorReadable,
  SiteRoles,
  SiteScoped,
  TenantContext,
} from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { compareUnits } from '../residents/occupancy.mapper';
import { ChargeTypesService } from './charge-types';
import {
  activeDuesMethods,
  assertMethodAllowed,
  currentPeriod,
  DEFAULT_DUE_DAY,
  loadSiteSettings,
  requiredUnitFields,
} from './site-settings';

@Injectable()
export class DuesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DuesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly chargeTypes: ChargeTypesService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async dueDay(siteId: string): Promise<number> {
    return (await loadSiteSettings(this.prisma, siteId)).duesDueDay ?? DEFAULT_DUE_DAY;
  }

  async getSettings(): Promise<DuesSettingsDto> {
    const siteId = this.tenant.siteId;
    const [settings, methods, kind, units] = await Promise.all([
      loadSiteSettings(this.prisma, siteId),
      activeDuesMethods(this.prisma, siteId),
      this.tenant.siteKind(),
      this.distributableUnits(),
    ]);
    const fields = requiredUnitFields(methods.all);
    return {
      dueDay: settings.duesDueDay ?? DEFAULT_DUE_DAY,
      proportionalDues: settings.proportionalDues ?? false,
      currentMethod: methods.current,
      missingDataUnits: units
        .filter((u) => fields.some((f) => u[f] == null))
        .map((u) => unitLabel(kind, u.blockName, u.number, 'short')),
    };
  }

  async updateSettings(input: DuesSettingsBody): Promise<DuesSettingsDto> {
    const siteId = this.tenant.siteId;
    const before = await loadSiteSettings(this.prisma, siteId);
    await this.prisma.site.update({
      where: { id: siteId },
      data: { settings: { ...before, duesDueDay: input.dueDay } as Prisma.InputJsonValue },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'DuesSettings',
      entityId: siteId,
      before: { dueDay: before.duesDueDay ?? DEFAULT_DUE_DAY },
      after: input,
    });
    return this.getSettings();
  }

  async listPlans(): Promise<DuesPlanDto[]> {
    const plans = await this.tenant.db.duesPlan.findMany({
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    });
    const now = currentPeriod();
    const currentId = plans.find((p) => p.validFrom <= now)?.id;
    return plans.map((p) => ({
      id: p.id,
      method: p.method,
      amountKurus: p.amountKurus,
      validFrom: p.validFrom,
      createdAt: p.createdAt.toISOString(),
      isCurrent: p.id === currentId,
    }));
  }

  private async affectedPeriods(validFrom: string): Promise<string[]> {
    const now = currentPeriod();
    if (validFrom > now) return [];
    const later = await this.tenant.db.duesPlan.findFirst({
      where: { validFrom: { gt: validFrom, lte: now } },
      orderBy: { validFrom: 'asc' },
      select: { validFrom: true },
    });
    const rows = await this.tenant.db.charge.findMany({
      where: {
        accrualKey: { not: null },
        cancelledAt: null,
        period: { gte: validFrom, lte: now, ...(later ? { lt: later.validFrom } : {}) },
      },
      distinct: ['period'],
      select: { period: true },
      orderBy: { period: 'asc' },
    });
    return rows.map((r) => r.period!);
  }

  private accruedCharges(periods: string[]) {
    return this.tenant.db.charge.findMany({
      where: { accrualKey: { not: null }, cancelledAt: null, period: { in: periods } },
      select: {
        id: true,
        unitId: true,
        amountKurus: true,
        _count: { select: { allocations: true } },
      },
    });
  }

  async planImpact(validFrom: string): Promise<DuesPlanImpactDto> {
    const periods = await this.affectedPeriods(validFrom);
    const charges = periods.length > 0 ? await this.accruedCharges(periods) : [];
    const paidCount = charges.filter((c) => c._count.allocations > 0).length;
    return { periods, unpaidCount: charges.length - paidCount, paidCount };
  }

  async createPlan(input: DuesPlanBody): Promise<DuesPlanCreateResultDto> {
    assertMethodAllowed(await loadSiteSettings(this.prisma, this.tenant.siteId), input.method);
    const units = await this.distributableUnits();
    const amounts = units.length > 0 ? this.amountsOrThrow(input, units) : [];
    const periods = input.updateUnpaid ? await this.affectedPeriods(input.validFrom) : [];

    const { plan, updatedCount } = await this.tenant.db.$transaction(async (tx) => {
      const plan = await tx.duesPlan.create({
        data: {
          siteId: this.tenant.siteId,
          method: input.method,
          amountKurus: input.amountKurus,
          validFrom: input.validFrom,
          createdById: this.tenant.userId ?? null,
        },
      });
      if (periods.length === 0) return { plan, updatedCount: 0 };
      await tx.$queryRaw`
        SELECT id FROM units WHERE "siteId" = ${this.tenant.siteId}::uuid FOR UPDATE`;
      const byUnit = new Map(units.map((u, i) => [u.id, amounts[i]!]));
      const charges = await tx.charge.findMany({
        where: { accrualKey: { not: null }, cancelledAt: null, period: { in: periods } },
        select: {
          id: true,
          unitId: true,
          amountKurus: true,
          _count: { select: { allocations: true } },
        },
      });
      let updatedCount = 0;
      for (const c of charges) {
        const amount = byUnit.get(c.unitId);
        if (c._count.allocations > 0 || amount === undefined) continue;
        if (amount === 0) {
          await tx.charge.update({
            where: { id: c.id },
            data: {
              cancelledAt: new Date(),
              cancelReason: 'Aidat tanımı değişti',
              cancelledById: this.tenant.userId ?? null,
              duesPlanId: plan.id,
            },
          });
        } else {
          await tx.charge.update({
            where: { id: c.id },
            data: { amountKurus: amount, duesPlanId: plan.id },
          });
        }
        updatedCount++;
      }
      return { plan, updatedCount };
    });

    await this.audit.record({
      action: 'CREATE',
      entityType: 'DuesPlan',
      entityId: plan.id,
      after: { ...input, updatedCount },
    });
    return {
      id: plan.id,
      method: plan.method,
      amountKurus: plan.amountKurus,
      validFrom: plan.validFrom,
      createdAt: plan.createdAt.toISOString(),
      isCurrent: plan.validFrom <= currentPeriod(),
      updatedCount,
    };
  }

  async deletePlan(id: string): Promise<void> {
    const plan = await this.tenant.db.duesPlan.findFirst({ where: { id } });
    if (!plan) throw new NotFoundException('Aidat tanımı bulunamadı');
    await this.tenant.db.duesPlan.delete({ where: { id } });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'DuesPlan',
      entityId: id,
      before: { method: plan.method, amountKurus: plan.amountKurus, validFrom: plan.validFrom },
    });
  }

  async accrue(period: string): Promise<AccrualResultDto> {
    if (period > currentPeriod()) {
      throw new BadRequestException('Gelecek aylar için aidat oluşturulamaz');
    }
    const siteId = this.tenant.siteId;
    const plan = await this.tenant.db.duesPlan.findFirst({
      where: { validFrom: { lte: period } },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    });
    if (!plan) {
      throw new BadRequestException(`${periodLabel(period)} için geçerli bir aidat planı yok`);
    }

    const units = await this.distributableUnits();
    if (units.length === 0) return { period, created: 0, alreadyExisted: 0, totalKurus: 0 };
    const amounts = this.amountsOrThrow(plan, units);

    const [chargeTypeId, dueDay] = await Promise.all([
      this.chargeTypes.duesTypeId(siteId),
      this.dueDay(siteId),
    ]);
    const keys = units.map((u) => `${u.id}:${period}`);
    const existing = new Set(
      (
        await this.tenant.db.charge.findMany({
          where: { accrualKey: { in: keys } },
          select: { accrualKey: true },
        })
      ).map((c) => c.accrualKey),
    );

    const data = units
      .map((u, i) => ({
        siteId,
        unitId: u.id,
        chargeTypeId,
        duesPlanId: plan.id,
        period,
        amountKurus: amounts[i]!,
        issueDate: dateOnly(`${period}-01`),
        dueDate: dateOnly(dueDateFor(period, dueDay)),
        accrualKey: keys[i]!,
        createdById: this.tenant.userId ?? null,
      }))
      .filter((row) => row.amountKurus > 0 && !existing.has(row.accrualKey));

    const { count } = await this.tenant.db.charge.createMany({ data, skipDuplicates: true });
    const result: AccrualResultDto = {
      period,
      created: count,
      alreadyExisted: existing.size,
      totalKurus: data.reduce((sum, row) => sum + row.amountKurus, 0),
    };
    if (count > 0) {
      await this.audit.record({
        action: 'ACCRUE',
        entityType: 'DuesPlan',
        entityId: plan.id,
        after: result,
      });
    }
    return result;
  }

  @Cron('0 5 0 1 * *', { name: 'monthly-dues', timeZone: 'Europe/Istanbul' })
  async monthlyAccrual(): Promise<void> {
    await this.accrueAllSites(currentPeriod());
  }

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    void this.accrueAllSites(currentPeriod()).catch((error: unknown) =>
      this.logger.error(`Açılış tahakkuku başarısız: ${(error as Error).message}`),
    );
  }

  async accrueAllSites(period: string): Promise<void> {
    const sites = await this.prisma.site.findMany({
      where: { deletedAt: null, duesPlans: { some: { validFrom: { lte: period } } } },
      select: { id: true, name: true },
    });
    for (const site of sites) {
      await this.cls.run(async () => {
        this.cls.set('siteId', site.id);
        try {
          const result = await this.accrue(period);
          if (result.created > 0) {
            this.logger.log(
              `${site.name}: ${periodLabel(period)} için ${result.created} aidat borcu yazıldı`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `${site.name}: ${periodLabel(period)} aidatı yazılamadı: ${(error as Error).message}`,
          );
        }
      });
    }
  }

  async distributableUnits() {
    const units = await this.tenant.db.unit.findMany({
      where: { archivedAt: null },
      include: { block: { select: { name: true } } },
    });
    return units
      .map((u) => ({
        id: u.id,
        label: `${u.block.name}-${u.number}`,
        areaM2: u.areaM2,
        landShare: u.landShare,
        blockName: u.block.name,
        number: u.number,
      }))
      .sort(compareUnits);
  }

  private amountsOrThrow(
    plan: { method: DuesPlanBody['method']; amountKurus: number },
    units: Awaited<ReturnType<DuesService['distributableUnits']>>,
  ): number[] {
    try {
      return computeUnitAmounts(plan, units);
    } catch (error) {
      if (error instanceof DistributionError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}

@ApiTags('Aidat ve borçlar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@AuditorReadable()
@Controller('dues')
export class DuesController {
  constructor(private readonly dues: DuesService) {}

  @SiteRoles('SITE_MANAGER', 'BLOCK_MANAGER')
  @Get('settings')
  settings(): Promise<DuesSettingsDto> {
    return this.dues.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() body: DuesSettingsBody): Promise<DuesSettingsDto> {
    return this.dues.updateSettings(body);
  }

  @Get('plans')
  plans(): Promise<DuesPlanDto[]> {
    return this.dues.listPlans();
  }

  @Get('plans/impact')
  planImpact(@Query('validFrom') validFrom: string): Promise<DuesPlanImpactDto> {
    const parsed = duesPlanSchema.shape.validFrom.safeParse(validFrom);
    if (!parsed.success) throw new BadRequestException('Geçerli bir ay seçin');
    return this.dues.planImpact(parsed.data);
  }

  @Post('plans')
  createPlan(@Body() body: DuesPlanBody): Promise<DuesPlanCreateResultDto> {
    return this.dues.createPlan(body);
  }

  @Delete('plans/:id')
  @HttpCode(204)
  deletePlan(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.dues.deletePlan(id);
  }

  @Post('accrue')
  @HttpCode(200)
  accrue(@Body() body: AccrueDto): Promise<AccrualResultDto> {
    return this.dues.accrue(body.period);
  }
}

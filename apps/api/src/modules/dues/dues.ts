import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  Patch,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  computeUnitAmounts,
  DistributionError,
  dueDateFor,
  periodLabel,
  periodOfDate,
  type AccrualResultDto,
  type DuesPlanDto,
  type DuesSettingsDto,
} from '@apartman/shared';
import { ClsService } from 'nestjs-cls';
import { dateOnly, todayInIstanbul } from '../../common/dates';
import {
  AccrueDto,
  DuesPlanDto as DuesPlanBody,
  DuesSettingsDto as DuesSettingsBody,
} from '../../common/dues.dto';
import type { Env } from '../../config/env';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { type AppClsStore, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { compareUnits } from '../residents/occupancy.mapper';
import { ChargeTypesService } from './charge-types';

export const DEFAULT_DUE_DAY = 10;

export function currentPeriod(): string {
  return periodOfDate(todayInIstanbul());
}

interface SiteSettings {
  duesDueDay?: number;
}

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
    const site = await this.prisma.site.findUniqueOrThrow({
      where: { id: siteId },
      select: { settings: true },
    });
    return (site.settings as SiteSettings | null)?.duesDueDay ?? DEFAULT_DUE_DAY;
  }

  async getSettings(): Promise<DuesSettingsDto> {
    return { dueDay: await this.dueDay(this.tenant.siteId) };
  }

  async updateSettings(input: DuesSettingsBody): Promise<DuesSettingsDto> {
    const siteId = this.tenant.siteId;
    const site = await this.prisma.site.findUniqueOrThrow({
      where: { id: siteId },
      select: { settings: true },
    });
    const before = (site.settings ?? {}) as SiteSettings & Record<string, unknown>;
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
    return { dueDay: input.dueDay };
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

  async createPlan(input: DuesPlanBody): Promise<DuesPlanDto> {
    const units = await this.distributableUnits();
    if (units.length > 0) this.amountsOrThrow(input, units);

    const plan = await this.tenant.db.duesPlan.create({
      data: {
        siteId: this.tenant.siteId,
        method: input.method,
        amountKurus: input.amountKurus,
        validFrom: input.validFrom,
        createdById: this.tenant.userId ?? null,
      },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'DuesPlan',
      entityId: plan.id,
      after: input,
    });
    return {
      id: plan.id,
      method: plan.method,
      amountKurus: plan.amountKurus,
      validFrom: plan.validFrom,
      createdAt: plan.createdAt.toISOString(),
      isCurrent: plan.validFrom <= currentPeriod(),
    };
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
      where: { duesPlans: { some: { validFrom: { lte: period } } } },
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

  private async distributableUnits() {
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
@Controller('dues')
export class DuesController {
  constructor(private readonly dues: DuesService) {}

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

  @Post('plans')
  createPlan(@Body() body: DuesPlanBody): Promise<DuesPlanDto> {
    return this.dues.createPlan(body);
  }

  @Post('accrue')
  @HttpCode(200)
  accrue(@Body() body: AccrueDto): Promise<AccrualResultDto> {
    return this.dues.accrue(body.period);
  }
}

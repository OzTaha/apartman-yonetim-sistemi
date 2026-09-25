import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  DistributionError,
  splitTotal,
  type ChargeCreateResultDto,
  type ChargeDto,
} from '@apartman/shared';
import { dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import {
  CancelDto,
  ChargeCreateDto,
  ChargeListQueryDto,
  ChargeUpdateDto,
} from '../../common/dues.dto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { compareUnits } from '../residents/occupancy.mapper';
import { chargeInclude, toChargeDto } from './ledger.mapper';
import { assertMethodAllowed, loadSiteSettings } from './site-settings';

@Injectable()
export class ChargesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(query: ChargeListQueryDto): Promise<ChargeDto[]> {
    const where: Prisma.ChargeWhereInput = {
      cancelledAt: null,
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.blockId ? { unit: { blockId: query.blockId } } : {}),
      ...(query.chargeTypeId ? { chargeTypeId: query.chargeTypeId } : {}),
      ...(query.period ? { period: query.period } : {}),
    };
    const today = todayInIstanbul();
    const charges = (await this.tenant.db.charge.findMany({ where, include: chargeInclude })).map(
      (c) => toChargeDto(c, today),
    );
    const filtered = charges.filter((c) => {
      switch (query.status) {
        case 'open':
          return c.remainingKurus > 0;
        case 'overdue':
          return c.overdue;
        case 'paid':
          return c.status === 'PAID';
        default:
          return true;
      }
    });
    return filtered.sort(
      (a, b) =>
        b.dueDate.localeCompare(a.dueDate) ||
        compareUnits(
          { blockName: a.blockName, number: a.unitNumber },
          { blockName: b.blockName, number: b.unitNumber },
        ),
    );
  }

  async create(input: ChargeCreateDto): Promise<ChargeCreateResultDto> {
    const type = await this.tenant.db.chargeType.findUnique({ where: { id: input.chargeTypeId } });
    if (!type || !type.isActive) throw new NotFoundException('Borç türü bulunamadı');
    if (input.amountMode === 'DISTRIBUTE') {
      assertMethodAllowed(await loadSiteSettings(this.prisma, this.tenant.siteId), input.method);
    }

    const units = (
      await this.tenant.db.unit.findMany({
        where: {
          archivedAt: null,
          ...(input.scope === 'SELECTED' ? { id: { in: input.unitIds } } : {}),
        },
        include: { block: { select: { name: true } } },
      })
    )
      .map((u) => ({
        id: u.id,
        label: `${u.block.name}-${u.number}`,
        areaM2: u.areaM2,
        landShare: u.landShare,
        blockName: u.block.name,
        number: u.number,
      }))
      .sort(compareUnits);
    if (units.length === 0) throw new BadRequestException('Borç yazılacak daire yok');
    if (input.scope === 'SELECTED' && units.length !== new Set(input.unitIds).size) {
      throw new NotFoundException('Seçilen dairelerden bazıları bulunamadı');
    }

    let amounts: number[];
    try {
      amounts =
        input.amountMode === 'PER_UNIT'
          ? units.map(() => input.amountKurus)
          : splitTotal(input.method, input.amountKurus, units);
    } catch (error) {
      if (error instanceof DistributionError) throw new BadRequestException(error.message);
      throw error;
    }

    const data = units
      .map((u, i) => ({
        siteId: this.tenant.siteId,
        unitId: u.id,
        chargeTypeId: type.id,
        period: input.period ?? null,
        description: input.description ?? null,
        amountKurus: amounts[i]!,
        issueDate: dateOnly(input.issueDate),
        dueDate: dateOnly(input.dueDate),
        createdById: this.tenant.userId ?? null,
      }))
      .filter((row) => row.amountKurus > 0);

    const { count } = await this.tenant.db.charge.createMany({ data });
    const result = {
      created: count,
      totalKurus: data.reduce((sum, row) => sum + row.amountKurus, 0),
    };
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Charge',
      entityId: type.id,
      after: { ...input, ...result },
    });
    return result;
  }

  async update(id: string, input: ChargeUpdateDto): Promise<ChargeDto> {
    const charge = await this.tenant.db.charge.findUnique({
      where: { id },
      include: chargeInclude,
    });
    if (!charge) throw new NotFoundException('Borç bulunamadı');
    if (charge.cancelledAt) throw new ConflictException('İptal edilmiş borç düzenlenemez');

    const paid = charge.allocations.reduce((sum, a) => sum + a.amountKurus, 0);
    if (input.amountKurus !== undefined && input.amountKurus < paid) {
      throw new BadRequestException('Tutar, bu borca yapılmış ödemeden az olamaz');
    }
    if (input.dueDate && input.dueDate < toDateString(charge.issueDate)) {
      throw new BadRequestException('Son ödeme tarihi borç tarihinden önce olamaz');
    }

    const updated = await this.tenant.db.charge.update({
      where: { id },
      data: {
        amountKurus: input.amountKurus,
        dueDate: input.dueDate ? dateOnly(input.dueDate) : undefined,
        ...('description' in input ? { description: input.description ?? null } : {}),
      },
      include: chargeInclude,
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Charge',
      entityId: id,
      before: {
        amountKurus: charge.amountKurus,
        dueDate: toDateString(charge.dueDate),
        description: charge.description,
      },
      after: input,
    });
    return toChargeDto(updated, todayInIstanbul());
  }

  async cancel(id: string, reason: string): Promise<ChargeDto> {
    const charge = await this.tenant.db.charge.findUnique({
      where: { id },
      include: chargeInclude,
    });
    if (!charge) throw new NotFoundException('Borç bulunamadı');
    if (charge.cancelledAt) throw new ConflictException('Bu borç zaten iptal edilmiş');
    if (charge.allocations.length > 0) {
      throw new ConflictException('Bu borca ödeme yapılmış. Önce ilgili ödemeyi iptal edin.');
    }
    const updated = await this.tenant.db.charge.update({
      where: { id },
      data: {
        cancelledAt: new Date(),
        cancelReason: reason,
        cancelledById: this.tenant.userId ?? null,
      },
      include: chargeInclude,
    });
    await this.audit.record({
      action: 'CANCEL',
      entityType: 'Charge',
      entityId: id,
      before: { amountKurus: charge.amountKurus, period: charge.period },
      after: { reason },
    });
    return toChargeDto(updated, todayInIstanbul());
  }
}

@ApiTags('Aidat ve borçlar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('charges')
export class ChargesController {
  constructor(private readonly charges: ChargesService) {}

  @Get()
  list(@Query() query: ChargeListQueryDto): Promise<ChargeDto[]> {
    return this.charges.list(query);
  }

  @Post()
  create(@Body() body: ChargeCreateDto): Promise<ChargeCreateResultDto> {
    return this.charges.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChargeUpdateDto,
  ): Promise<ChargeDto> {
    return this.charges.update(id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: CancelDto): Promise<ChargeDto> {
    return this.charges.cancel(id, body.reason);
  }
}

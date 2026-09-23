import {
  BadRequestException,
  Body,
  type CanActivate,
  ConflictException,
  Controller,
  Delete,
  type ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  planBulkUnits,
  type BulkUnitsResultDto,
  type UnitDetailDto,
  type UnitDto,
  type UnitRemovalDto,
} from '@apartman/shared';
import type { Request } from 'express';
import { activeOn } from '../../common/dates';
import { BulkUnitsDto, UnitCreateDto, UnitListQueryDto, UnitUpdateDto } from '../../common/dto';
import type { Prisma } from '../../generated/prisma/client';
import { SiteRoles, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { compareUnits, occupancyInclude, toOccupancyDto } from '../residents/occupancy.mapper';

@Injectable()
export class UnitAccessGuard implements CanActivate {
  constructor(private readonly tenant: TenantContext) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.tenant.isResident) return true;
    const unitId = String(context.switchToHttp().getRequest<Request>().params['id']);
    const count = await this.tenant.db.occupancy.count({
      where: { unitId, userId: this.tenant.userId, ...activeOn() },
    });
    if (count === 0) throw new NotFoundException('Daire bulunamadı');
    return true;
  }
}

function unitListInclude() {
  return {
    block: { select: { name: true } },
    occupancies: {
      where: activeOn(),
      select: { id: true, firstName: true, lastName: true, type: true, phone: true },
      orderBy: { type: 'asc' },
    },
  } satisfies Prisma.UnitInclude;
}

type UnitWithOccupants = Prisma.UnitGetPayload<{ include: ReturnType<typeof unitListInclude> }>;

function toUnitDto(u: UnitWithOccupants): UnitDto {
  return {
    id: u.id,
    blockId: u.blockId,
    blockName: u.block.name,
    number: u.number,
    floor: u.floor,
    areaM2: u.areaM2,
    landShare: u.landShare,
    archivedAt: u.archivedAt?.toISOString() ?? null,
    occupants: u.occupancies,
  };
}

@Injectable()
export class UnitsService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(query: UnitListQueryDto): Promise<UnitDto[]> {
    const search = query.search?.trim();
    const where: Prisma.UnitWhereInput = {
      ...(query.archived === 'include'
        ? {}
        : query.archived === 'only'
          ? { archivedAt: { not: null } }
          : { archivedAt: null }),
      ...(query.blockId ? { blockId: query.blockId } : {}),
      ...(search
        ? {
            OR: [
              { number: { startsWith: search, mode: 'insensitive' } },
              {
                occupancies: {
                  some: {
                    ...activeOn(),
                    AND: [
                      {
                        OR: [
                          { firstName: { contains: search, mode: 'insensitive' } },
                          { lastName: { contains: search, mode: 'insensitive' } },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const units = await this.tenant.db.unit.findMany({ where, include: unitListInclude() });
    return units.map(toUnitDto).sort(compareUnits);
  }

  async get(id: string): Promise<UnitDetailDto> {
    const unit = await this.tenant.db.unit.findUnique({
      where: { id },
      include: {
        block: { select: { name: true } },
        occupancies: {
          where: this.tenant.isResident ? { userId: this.tenant.userId } : {},
          include: occupancyInclude,
          orderBy: [{ endDate: { sort: 'desc', nulls: 'first' } }, { startDate: 'desc' }],
        },
      },
    });
    if (!unit) throw new NotFoundException('Daire bulunamadı');
    return {
      id: unit.id,
      blockId: unit.blockId,
      blockName: unit.block.name,
      number: unit.number,
      floor: unit.floor,
      areaM2: unit.areaM2,
      landShare: unit.landShare,
      archivedAt: unit.archivedAt?.toISOString() ?? null,
      occupancies: unit.occupancies.map(toOccupancyDto),
    };
  }

  async create(input: UnitCreateDto): Promise<UnitDto> {
    const blockId = await this.resolveBlockId(input.blockId);
    const unit = await this.tenant.db.unit.create({
      data: {
        siteId: this.tenant.siteId,
        blockId,
        number: input.number,
        floor: input.floor ?? null,
        areaM2: input.areaM2 ?? null,
        landShare: input.landShare ?? null,
      },
      include: unitListInclude(),
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Unit',
      entityId: unit.id,
      after: input,
    });
    return toUnitDto(unit);
  }

  async bulkCreate(input: BulkUnitsDto): Promise<BulkUnitsResultDto> {
    const blockId = await this.resolveBlockId(input.blockId);
    const planned = planBulkUnits({
      startNumber: input.startNumber,
      endNumber: input.endNumber,
      unitsPerFloor: input.unitsPerFloor ?? undefined,
      startFloor: input.startFloor,
    });

    const existing = await this.tenant.db.unit.findMany({
      where: { blockId, number: { in: planned.map((p) => p.number) } },
      select: { number: true },
    });
    const existingNumbers = new Set(existing.map((u) => u.number));
    const toCreate = planned.filter((p) => !existingNumbers.has(p.number));

    const { count } = await this.tenant.db.unit.createMany({
      data: toCreate.map((p) => ({
        siteId: this.tenant.siteId,
        blockId,
        number: p.number,
        floor: p.floor,
      })),
      skipDuplicates: true,
    });
    await this.audit.record({
      action: 'BULK_CREATE',
      entityType: 'Unit',
      entityId: blockId,
      after: { ...input, created: count },
    });
    return { created: count, skipped: [...existingNumbers] };
  }

  async update(id: string, input: UnitUpdateDto): Promise<UnitDto> {
    const before = await this.tenant.db.unit.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Daire bulunamadı');
    if (input.blockId) await this.assertBlock(input.blockId);

    const unit = await this.tenant.db.unit.update({
      where: { id },
      data: {
        blockId: input.blockId,
        number: input.number,
        floor: input.floor,
        areaM2: input.areaM2,
        landShare: input.landShare,
      },
      include: unitListInclude(),
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Unit',
      entityId: id,
      before,
      after: input,
    });
    return toUnitDto(unit);
  }

  async removalInfo(id: string): Promise<UnitRemovalDto> {
    const unit = await this.tenant.db.unit.findUnique({
      where: { id },
      include: {
        _count: { select: { occupancies: true, payments: true } },
        charges: { where: { cancelledAt: null }, select: { amountKurus: true } },
      },
    });
    if (!unit) throw new NotFoundException('Daire bulunamadı');
    const activeResidentCount = await this.tenant.db.occupancy.count({
      where: { unitId: id, ...activeOn() },
    });
    const canDelete = unit._count.payments === 0 && unit._count.occupancies === 0;
    return {
      canDelete,
      canArchive: !canDelete && !unit.archivedAt && activeResidentCount === 0,
      chargeCount: unit.charges.length,
      openKurus: unit.charges.reduce((sum, c) => sum + c.amountKurus, 0),
      paymentCount: unit._count.payments,
      occupancyCount: unit._count.occupancies,
      activeResidentCount,
    };
  }

  async remove(id: string): Promise<void> {
    const info = await this.removalInfo(id);
    if (!info.canDelete) {
      throw new ConflictException(
        'Bu dairenin ödeme veya sakin geçmişi olduğu için silinemez. Bunun yerine arşivleyebilirsiniz.',
      );
    }
    const unit = await this.tenant.db.unit.findUniqueOrThrow({ where: { id } });
    await this.tenant.db.$transaction(async (tx) => {
      await tx.charge.deleteMany({ where: { siteId: this.tenant.siteId, unitId: id } });
      await tx.unit.delete({ where: { id } });
    });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Unit',
      entityId: id,
      before: { ...unit, deletedCharges: info.chargeCount, deletedOpenKurus: info.openKurus },
    });
  }

  async archive(id: string): Promise<UnitDto> {
    const info = await this.removalInfo(id);
    if (info.activeResidentCount > 0) {
      throw new BadRequestException(
        'Dairede oturan sakinler var. Önce sakinleri taşındı olarak işaretleyin.',
      );
    }
    const unit = await this.tenant.db.unit.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: unitListInclude(),
    });
    await this.audit.record({ action: 'ARCHIVE', entityType: 'Unit', entityId: id });
    return toUnitDto(unit);
  }

  async unarchive(id: string): Promise<UnitDto> {
    const unit = await this.tenant.db.unit.update({
      where: { id },
      data: { archivedAt: null },
      include: unitListInclude(),
    });
    await this.audit.record({ action: 'UNARCHIVE', entityType: 'Unit', entityId: id });
    return toUnitDto(unit);
  }

  private async resolveBlockId(blockId: string | undefined): Promise<string> {
    if (blockId) {
      await this.assertBlock(blockId);
      return blockId;
    }
    if ((await this.tenant.siteKind()) === 'APARTMENT') {
      const block = await this.tenant.db.block.findFirst({
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (block) return block.id;
    }
    throw new BadRequestException('Blok seçin');
  }

  private async assertBlock(blockId: string) {
    const block = await this.tenant.db.block.findUnique({
      where: { id: blockId },
      select: { id: true },
    });
    if (!block) throw new NotFoundException('Blok bulunamadı');
  }
}

@ApiTags('Daireler')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  list(@Query() query: UnitListQueryDto): Promise<UnitDto[]> {
    return this.units.list(query);
  }

  @Post()
  create(@Body() body: UnitCreateDto): Promise<UnitDto> {
    return this.units.create(body);
  }

  @Post('bulk')
  bulkCreate(@Body() body: BulkUnitsDto): Promise<BulkUnitsResultDto> {
    return this.units.bulkCreate(body);
  }

  @SiteRoles('SITE_MANAGER', 'RESIDENT')
  @UseGuards(UnitAccessGuard)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<UnitDetailDto> {
    return this.units.get(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UnitUpdateDto): Promise<UnitDto> {
    return this.units.update(id, body);
  }

  @Get(':id/removal')
  removalInfo(@Param('id', ParseUUIDPipe) id: string): Promise<UnitRemovalDto> {
    return this.units.removalInfo(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.units.remove(id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<UnitDto> {
    return this.units.archive(id);
  }

  @Post(':id/unarchive')
  @HttpCode(200)
  unarchive(@Param('id', ParseUUIDPipe) id: string): Promise<UnitDto> {
    return this.units.unarchive(id);
  }
}

@Module({
  controllers: [UnitsController],
  providers: [UnitsService, UnitAccessGuard],
})
export class UnitsModule {}

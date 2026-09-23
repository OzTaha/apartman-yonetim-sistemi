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
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { BlockDto as BlockResponse } from '@apartman/shared';
import { BlockDto } from '../../common/dto';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class BlocksService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<BlockResponse[]> {
    const blocks = await this.tenant.db.block.findMany({
      include: {
        units: { select: { _count: { select: { payments: true, occupancies: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    return blocks.map((b) => ({
      id: b.id,
      name: b.name,
      unitCount: b.units.length,
      deletable: b.units.every((u) => u._count.payments === 0 && u._count.occupancies === 0),
    }));
  }

  async create(input: BlockDto): Promise<BlockResponse> {
    if ((await this.tenant.siteKind()) === 'APARTMENT') {
      throw new BadRequestException(
        'Apartmana blok eklenemez. Birden fazla bina varsa türü "Site" olarak değiştirin.',
      );
    }
    const block = await this.tenant.db.block.create({
      data: { name: input.name, siteId: this.tenant.siteId },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Block',
      entityId: block.id,
      after: input,
    });
    return { id: block.id, name: block.name, unitCount: 0, deletable: true };
  }

  async update(id: string, input: BlockDto): Promise<BlockResponse> {
    const before = await this.tenant.db.block.findUniqueOrThrow({ where: { id } });
    const block = await this.tenant.db.block.update({
      where: { id },
      data: { name: input.name },
      include: {
        units: { select: { _count: { select: { payments: true, occupancies: true } } } },
      },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Block',
      entityId: id,
      before: { name: before.name },
      after: input,
    });
    return {
      id: block.id,
      name: block.name,
      unitCount: block.units.length,
      deletable: block.units.every((u) => u._count.payments === 0 && u._count.occupancies === 0),
    };
  }

  async remove(id: string): Promise<void> {
    if ((await this.tenant.siteKind()) === 'APARTMENT') {
      throw new BadRequestException('Apartmanın binası silinemez.');
    }
    const block = await this.tenant.db.block.findUniqueOrThrow({
      where: { id },
      include: {
        units: { select: { id: true, _count: { select: { payments: true, occupancies: true } } } },
      },
    });
    const withHistory = block.units.filter(
      (u) => u._count.payments > 0 || u._count.occupancies > 0,
    ).length;
    if (withHistory > 0) {
      throw new ConflictException(
        `Bu blokta ödeme veya sakin geçmişi olan ${withHistory} daire var. Bu daireler silinemez; tek tek arşivleyebilirsiniz.`,
      );
    }
    const unitIds = block.units.map((u) => u.id);
    await this.tenant.db.$transaction(async (tx) => {
      await tx.charge.deleteMany({
        where: { siteId: this.tenant.siteId, unitId: { in: unitIds } },
      });
      await tx.unit.deleteMany({ where: { siteId: this.tenant.siteId, blockId: id } });
      await tx.block.delete({ where: { id } });
    });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Block',
      entityId: id,
      before: { name: block.name, deletedUnits: unitIds.length },
    });
  }
}

@ApiTags('Bloklar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  list(): Promise<BlockResponse[]> {
    return this.blocks.list();
  }

  @Post()
  create(@Body() body: BlockDto): Promise<BlockResponse> {
    return this.blocks.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: BlockDto): Promise<BlockResponse> {
    return this.blocks.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.blocks.remove(id);
  }
}

@Module({
  controllers: [BlocksController],
  providers: [BlocksService],
})
export class BlocksModule {}

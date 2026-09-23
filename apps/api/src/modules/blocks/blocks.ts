import {
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
      include: { _count: { select: { units: true } } },
      orderBy: { name: 'asc' },
    });
    return blocks.map((b) => ({ id: b.id, name: b.name, unitCount: b._count.units }));
  }

  async create(input: BlockDto): Promise<BlockResponse> {
    const block = await this.tenant.db.block.create({
      data: { name: input.name, siteId: this.tenant.siteId },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Block',
      entityId: block.id,
      after: input,
    });
    return { id: block.id, name: block.name, unitCount: 0 };
  }

  async update(id: string, input: BlockDto): Promise<BlockResponse> {
    const before = await this.tenant.db.block.findUniqueOrThrow({ where: { id } });
    const block = await this.tenant.db.block.update({
      where: { id },
      data: { name: input.name },
      include: { _count: { select: { units: true } } },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Block',
      entityId: id,
      before: { name: before.name },
      after: input,
    });
    return { id: block.id, name: block.name, unitCount: block._count.units };
  }

  async remove(id: string): Promise<void> {
    const block = await this.tenant.db.block.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { units: true } } },
    });
    if (block._count.units > 0) {
      throw new ConflictException('İçinde daire bulunan blok silinemez');
    }
    await this.tenant.db.block.delete({ where: { id } });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Block',
      entityId: id,
      before: { name: block.name },
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

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ChargeTypeDto } from '@apartman/shared';
import { ChargeTypeDto as ChargeTypeBody, ChargeTypeUpdateDto } from '../../common/dues.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_CHARGE_TYPES, DUES_CODE } from './ledger.mapper';

@Injectable()
export class ChargeTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async ensureDefaults(siteId: string): Promise<void> {
    await this.prisma.chargeType.createMany({
      data: DEFAULT_CHARGE_TYPES.map((t) => ({ ...t, siteId })),
      skipDuplicates: true,
    });
  }

  async duesTypeId(siteId: string): Promise<string> {
    await this.ensureDefaults(siteId);
    const type = await this.prisma.chargeType.findUniqueOrThrow({
      where: { siteId_code: { siteId, code: DUES_CODE } },
      select: { id: true },
    });
    return type.id;
  }

  async list(): Promise<ChargeTypeDto[]> {
    await this.ensureDefaults(this.tenant.siteId);
    const types = await this.tenant.db.chargeType.findMany({ orderBy: [{ createdAt: 'asc' }] });
    return types.map((t) => ({ id: t.id, code: t.code, name: t.name, isActive: t.isActive }));
  }

  async create(input: ChargeTypeBody): Promise<ChargeTypeDto> {
    const type = await this.tenant.db.chargeType.create({
      data: { siteId: this.tenant.siteId, name: input.name },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'ChargeType',
      entityId: type.id,
      after: input,
    });
    return { id: type.id, code: type.code, name: type.name, isActive: type.isActive };
  }

  async update(id: string, input: ChargeTypeUpdateDto): Promise<ChargeTypeDto> {
    const before = await this.tenant.db.chargeType.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Borç türü bulunamadı');
    if (before.code === DUES_CODE && input.isActive === false) {
      throw new BadRequestException('Aidat türü pasif yapılamaz');
    }
    const type = await this.tenant.db.chargeType.update({
      where: { id },
      data: { name: input.name, isActive: input.isActive },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'ChargeType',
      entityId: id,
      before,
      after: input,
    });
    return { id: type.id, code: type.code, name: type.name, isActive: type.isActive };
  }
}

@ApiTags('Aidat ve borçlar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('charge-types')
export class ChargeTypesController {
  constructor(private readonly types: ChargeTypesService) {}

  @Get()
  list(): Promise<ChargeTypeDto[]> {
    return this.types.list();
  }

  @Post()
  create(@Body() body: ChargeTypeBody): Promise<ChargeTypeDto> {
    return this.types.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChargeTypeUpdateDto,
  ): Promise<ChargeTypeDto> {
    return this.types.update(id, body);
  }
}

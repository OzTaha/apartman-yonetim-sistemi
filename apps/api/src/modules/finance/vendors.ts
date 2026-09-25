import {
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
import type { VendorDto } from '@apartman/shared';
import { VendorCreateDto, VendorUpdateDto } from '../../common/finance.dto';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class VendorsService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<VendorDto[]> {
    const [vendors, paid] = await Promise.all([
      this.tenant.db.vendor.findMany({
        include: { _count: { select: { works: true } } },
        orderBy: { name: 'asc' },
      }),
      this.tenant.db.transaction.groupBy({
        by: ['vendorId'],
        where: { type: 'EXPENSE', cancelledAt: null, vendorId: { not: null } },
        _sum: { amountKurus: true },
      }),
    ]);
    const paidBy = new Map(paid.map((p) => [p.vendorId, p._sum.amountKurus ?? 0]));
    return vendors
      .map((v) => ({
        id: v.id,
        name: v.name,
        phone: v.phone,
        taxNumber: v.taxNumber,
        notes: v.notes,
        isActive: v.isActive,
        paidKurus: paidBy.get(v.id) ?? 0,
        workCount: v._count.works,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  async create(input: VendorCreateDto): Promise<VendorDto> {
    const vendor = await this.tenant.db.vendor.create({
      data: {
        siteId: this.tenant.siteId,
        name: input.name,
        phone: input.phone ?? null,
        taxNumber: input.taxNumber ?? null,
        notes: input.notes ?? null,
      },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Vendor',
      entityId: vendor.id,
      after: input,
    });
    return this.one(vendor.id);
  }

  async update(id: string, input: VendorUpdateDto): Promise<VendorDto> {
    const before = await this.tenant.db.vendor.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Firma bulunamadı');
    await this.tenant.db.vendor.update({
      where: { id },
      data: {
        name: input.name,
        phone: input.phone ?? null,
        taxNumber: input.taxNumber ?? null,
        notes: input.notes ?? null,
        isActive: input.isActive,
      },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Vendor',
      entityId: id,
      before,
      after: input,
    });
    return this.one(id);
  }

  private async one(id: string): Promise<VendorDto> {
    const vendor = (await this.list()).find((v) => v.id === id);
    if (!vendor) throw new NotFoundException('Firma bulunamadı');
    return vendor;
  }
}

@ApiTags('Gelir-gider')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  list(): Promise<VendorDto[]> {
    return this.vendors.list();
  }

  @Post()
  create(@Body() body: VendorCreateDto): Promise<VendorDto> {
    return this.vendors.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VendorUpdateDto,
  ): Promise<VendorDto> {
    return this.vendors.update(id, body);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { WorkDetailDto, WorkDto } from '@apartman/shared';
import { WorkCreateDto, WorkUpdateDto } from '../../common/finance.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { lockedThrough } from './finance.ledger';
import {
  attachmentSelect,
  optionalDate,
  toAttachmentDto,
  toTransactionDto,
  toWorkDto,
  transactionInclude,
  workInclude,
} from './finance.mapper';
import { FileStorage } from './storage';

@Injectable()
export class WorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly storage: FileStorage,
  ) {}

  async list(onlyVisible = false): Promise<WorkDto[]> {
    const [works, paid] = await Promise.all([
      this.tenant.db.work.findMany({
        where: onlyVisible ? { visibleToResidents: true } : {},
        include: workInclude,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.paidByWork(),
    ]);
    return works.map((w) => toWorkDto(w, paid.get(w.id) ?? 0));
  }

  async get(id: string): Promise<WorkDetailDto> {
    const [work, payments, attachments, locked] = await Promise.all([
      this.tenant.db.work.findUnique({ where: { id }, include: workInclude }),
      this.tenant.db.transaction.findMany({
        where: { workId: id, cancelledAt: null },
        include: transactionInclude,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      this.tenant.db.attachment.findMany({
        where: { workId: id },
        select: attachmentSelect,
        orderBy: { createdAt: 'asc' },
      }),
      lockedThrough(this.prisma, this.tenant.siteId),
    ]);
    if (!work) throw new NotFoundException('İş bulunamadı');
    const paid = payments
      .filter((p) => p.type === 'EXPENSE')
      .reduce((sum, p) => sum + p.amountKurus, 0);
    return {
      ...toWorkDto(work, paid),
      payments: payments.map((p) => toTransactionDto(p, locked)),
      attachments: attachments.map(toAttachmentDto),
    };
  }

  async create(input: WorkCreateDto): Promise<WorkDetailDto> {
    if (input.vendorId) await this.assertVendor(input.vendorId);
    const work = await this.tenant.db.work.create({
      data: {
        siteId: this.tenant.siteId,
        title: input.title,
        description: input.description ?? null,
        vendorId: input.vendorId ?? null,
        startDate: optionalDate(input.startDate),
        endDate: optionalDate(input.endDate),
        agreedKurus: input.agreedKurus ?? null,
        status: input.status,
        visibleToResidents: input.visibleToResidents,
        createdById: this.tenant.userId ?? null,
      },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Work',
      entityId: work.id,
      after: input,
    });
    return this.get(work.id);
  }

  async update(id: string, input: WorkUpdateDto): Promise<WorkDetailDto> {
    const before = await this.tenant.db.work.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('İş bulunamadı');
    if (input.vendorId) await this.assertVendor(input.vendorId);
    await this.tenant.db.work.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description ?? null,
        vendorId: input.vendorId ?? null,
        startDate: optionalDate(input.startDate),
        endDate: optionalDate(input.endDate),
        agreedKurus: input.agreedKurus ?? null,
        status: input.status,
        visibleToResidents: input.visibleToResidents,
      },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Work',
      entityId: id,
      before,
      after: input,
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const work = await this.tenant.db.work.findUnique({
      where: { id },
      include: { _count: { select: { transactions: { where: { cancelledAt: null } } } } },
    });
    if (!work) throw new NotFoundException('İş bulunamadı');
    if (work._count.transactions > 0) {
      throw new BadRequestException(
        'Bu işe bağlı ödemeler var. İşi silmek için önce ödemeleri iptal edin.',
      );
    }
    const attachments = await this.tenant.db.attachment.findMany({
      where: { workId: id },
      select: { storageKey: true },
    });
    await this.tenant.db.$transaction(async (tx) => {
      await tx.attachment.deleteMany({ where: { siteId: this.tenant.siteId, workId: id } });
      await tx.transaction.updateMany({
        where: { siteId: this.tenant.siteId, workId: id },
        data: { workId: null },
      });
      await tx.work.delete({ where: { id } });
    });
    await Promise.all(attachments.map((a) => this.storage.remove(a.storageKey)));
    await this.audit.record({ action: 'DELETE', entityType: 'Work', entityId: id, before: work });
  }

  async paidByWork(): Promise<Map<string, number>> {
    const rows = await this.tenant.db.transaction.groupBy({
      by: ['workId'],
      where: { type: 'EXPENSE', cancelledAt: null, workId: { not: null } },
      _sum: { amountKurus: true },
    });
    return new Map(rows.map((r) => [r.workId!, r._sum.amountKurus ?? 0]));
  }

  private async assertVendor(id: string) {
    const vendor = await this.tenant.db.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Firma bulunamadı');
  }
}

@ApiTags('Gelir-gider')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('works')
export class WorksController {
  constructor(private readonly works: WorksService) {}

  @Get()
  list(): Promise<WorkDto[]> {
    return this.works.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<WorkDetailDto> {
    return this.works.get(id);
  }

  @Post()
  create(@Body() body: WorkCreateDto): Promise<WorkDetailDto> {
    return this.works.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WorkUpdateDto,
  ): Promise<WorkDetailDto> {
    return this.works.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.works.remove(id);
  }
}

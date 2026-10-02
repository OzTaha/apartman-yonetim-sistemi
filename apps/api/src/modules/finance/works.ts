import {
  BadRequestException,
  Body,
  ConflictException,
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
import { toDateString } from '../../common/dates';
import { ExpenseReflectDto, WorkCreateDto, WorkUpdateDto } from '../../common/finance.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditorReadable, SiteRoles, SiteScoped, TenantContext } from '../../tenancy/tenancy';
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
import { assertNoPaidCharges, planReflection } from './reflection';
import { FileStorage } from './storage';

@Injectable()
export class WorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly storage: FileStorage,
  ) {}

  async list(residentView?: { blockIds: string[] | null }): Promise<WorkDto[]> {
    const [works, paid] = await Promise.all([
      this.tenant.db.work.findMany({
        where: this.tenant.blockScope
          ? { blockId: { in: this.tenant.blockScope } }
          : residentView
            ? {
                visibleToResidents: true,
                ...(residentView.blockIds
                  ? { OR: [{ blockId: null }, { blockId: { in: residentView.blockIds } }] }
                  : {}),
              }
            : {},
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
    const scope = this.tenant.blockScope;
    if (scope && (!work.blockId || !scope.includes(work.blockId))) {
      throw new NotFoundException('İş bulunamadı');
    }
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
    if (input.blockId) await this.assertBlock(input.blockId);
    const charges = input.reflect
      ? await planReflection(
          this.prisma,
          this.tenant,
          {
            blockId: input.blockId ?? null,
            amountKurus: input.agreedKurus!,
            description: input.title,
          },
          input.reflect,
        )
      : null;
    const work = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.work.create({
        data: {
          siteId: this.tenant.siteId,
          title: input.title,
          description: input.description ?? null,
          vendorId: input.vendorId ?? null,
          blockId: input.blockId ?? null,
          startDate: optionalDate(input.startDate),
          endDate: optionalDate(input.endDate),
          agreedKurus: input.agreedKurus ?? null,
          chargeMethod: input.reflect?.method ?? null,
          status: input.status,
          visibleToResidents: input.visibleToResidents,
          createdById: this.tenant.userId ?? null,
        },
      });
      if (charges) {
        await tx.charge.createMany({
          data: charges.map((c) => ({ ...c, siteId: this.tenant.siteId, workId: created.id })),
        });
      }
      return created;
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
    if (input.blockId) await this.assertBlock(input.blockId);
    const agreedKurus = input.agreedKurus ?? null;
    const blockId = input.blockId ?? null;
    const charges =
      agreedKurus !== before.agreedKurus || blockId !== before.blockId
        ? await this.activeCharges(id)
        : [];
    let replacement: Awaited<ReturnType<typeof planReflection>> | null = null;
    if (charges.length > 0) {
      assertNoPaidCharges(
        charges,
        'Bu işin dairelere yansıtılan borçlarına ödeme yapılmış; tutar veya blok değiştirilemez. Önce ilgili ödemeleri iptal edin.',
      );
      const first = charges[0]!;
      if (agreedKurus) {
        replacement = await planReflection(
          this.prisma,
          this.tenant,
          { blockId, amountKurus: agreedKurus, description: first.description },
          {
            chargeTypeId: first.chargeTypeId,
            method: before.chargeMethod ?? 'EQUAL',
            issueDate: toDateString(first.issueDate),
            dueDate: toDateString(first.dueDate),
            description: undefined,
          },
        );
      }
    }
    await this.tenant.db.$transaction(async (tx) => {
      if (charges.length > 0) {
        await tx.charge.updateMany({
          where: { siteId: this.tenant.siteId, id: { in: charges.map((c) => c.id) } },
          data: this.cancelled('İş tutarı veya kapsamı değişti'),
        });
      }
      if (replacement) {
        await tx.charge.createMany({
          data: replacement.map((c) => ({ ...c, siteId: this.tenant.siteId, workId: id })),
        });
      }
      await tx.work.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description ?? null,
          vendorId: input.vendorId ?? null,
          blockId: input.blockId ?? null,
          startDate: optionalDate(input.startDate),
          endDate: optionalDate(input.endDate),
          agreedKurus: input.agreedKurus ?? null,
          status: input.status,
          visibleToResidents: input.visibleToResidents,
        },
      });
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
    const charges = await this.activeCharges(id);
    assertNoPaidCharges(
      charges,
      'Bu işin dairelere yansıtılan borçlarına ödeme yapılmış. İşi silmek için önce ilgili ödemeleri iptal edin.',
    );
    const attachments = await this.tenant.db.attachment.findMany({
      where: { workId: id },
      select: { storageKey: true },
    });
    await this.tenant.db.$transaction(async (tx) => {
      if (charges.length > 0) {
        await tx.charge.updateMany({
          where: { siteId: this.tenant.siteId, id: { in: charges.map((c) => c.id) } },
          data: this.cancelled('İş silindi'),
        });
      }
      await tx.charge.updateMany({
        where: { siteId: this.tenant.siteId, workId: id },
        data: { workId: null },
      });
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

  async reflect(id: string, input: ExpenseReflectDto): Promise<WorkDetailDto> {
    const work = await this.tenant.db.work.findUnique({ where: { id } });
    if (!work) throw new NotFoundException('İş bulunamadı');
    if (!work.agreedKurus) {
      throw new BadRequestException('Dairelere yansıtmak için önce anlaşılan tutarı girin');
    }
    if ((await this.activeCharges(id)).length > 0) {
      throw new ConflictException('Bu iş zaten dairelere yansıtılmış');
    }
    if (
      await this.tenant.db.charge.count({
        where: { cancelledAt: null, transaction: { workId: id, cancelledAt: null } },
      })
    ) {
      throw new ConflictException(
        'Bu işe yapılan ödemelerden biri dairelere yansıtılmış; iş ayrıca yansıtılamaz.',
      );
    }
    const charges = await planReflection(
      this.prisma,
      this.tenant,
      { blockId: work.blockId, amountKurus: work.agreedKurus, description: work.title },
      input,
    );
    await this.tenant.db.$transaction(async (tx) => {
      await tx.charge.createMany({
        data: charges.map((c) => ({ ...c, siteId: this.tenant.siteId, workId: id })),
      });
      await tx.work.update({ where: { id }, data: { chargeMethod: input.method } });
    });
    await this.audit.record({
      action: 'REFLECT',
      entityType: 'Work',
      entityId: id,
      after: { ...input, chargeCount: charges.length },
    });
    return this.get(id);
  }

  async unreflect(id: string): Promise<WorkDetailDto> {
    const work = await this.tenant.db.work.findUnique({ where: { id } });
    if (!work) throw new NotFoundException('İş bulunamadı');
    const charges = await this.activeCharges(id);
    if (charges.length === 0) throw new ConflictException('Bu iş dairelere yansıtılmamış');
    assertNoPaidCharges(
      charges,
      'Yansıtılan borçlara ödeme yapılmış. Geri almak için önce ilgili ödemeleri iptal edin.',
    );
    await this.tenant.db.charge.updateMany({
      where: { siteId: this.tenant.siteId, id: { in: charges.map((c) => c.id) } },
      data: this.cancelled('Yansıtma geri alındı'),
    });
    await this.audit.record({
      action: 'UNREFLECT',
      entityType: 'Work',
      entityId: id,
      after: { cancelledCharges: charges.length },
    });
    return this.get(id);
  }

  private activeCharges(workId: string) {
    return this.tenant.db.charge.findMany({
      where: { workId, cancelledAt: null },
      select: {
        id: true,
        chargeTypeId: true,
        issueDate: true,
        dueDate: true,
        description: true,
        _count: { select: { allocations: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private cancelled(reason: string) {
    return {
      cancelledAt: new Date(),
      cancelReason: reason,
      cancelledById: this.tenant.userId ?? null,
    };
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

  private async assertBlock(id: string) {
    const block = await this.tenant.db.block.findUnique({ where: { id } });
    if (!block) throw new NotFoundException('Blok bulunamadı');
  }
}

@ApiTags('Gelir-gider')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@AuditorReadable()
@Controller('works')
export class WorksController {
  constructor(private readonly works: WorksService) {}

  @SiteRoles('SITE_MANAGER', 'BLOCK_MANAGER')
  @Get()
  list(): Promise<WorkDto[]> {
    return this.works.list();
  }

  @SiteRoles('SITE_MANAGER', 'BLOCK_MANAGER')
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

  @Post(':id/reflect')
  @HttpCode(200)
  reflect(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExpenseReflectDto,
  ): Promise<WorkDetailDto> {
    return this.works.reflect(id, body);
  }

  @Delete(':id/reflection')
  unreflect(@Param('id', ParseUUIDPipe) id: string): Promise<WorkDetailDto> {
    return this.works.unreflect(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.works.remove(id);
  }
}

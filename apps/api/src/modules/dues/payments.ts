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
  Post,
  Query,
  Res,
  type StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { BulkCancelResultDto } from '@apartman/shared';
import { cancelEach } from '../../common/bulk';
import {
  allocatePayment,
  AllocationError,
  formatKurusTl,
  kurusToWordsTr,
  paymentMethodLabels,
  unitLabel,
  validateManualAllocation,
  type Allocation,
  type PaymentDto,
} from '@apartman/shared';
import type { Response } from 'express';
import type { Content } from 'pdfmake/interfaces';
import { activeOn, dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import {
  BulkCancelDto,
  CancelDto,
  PaymentCreateDto,
  PaymentListQueryDto,
} from '../../common/dues.dto';
import { formatDateTr, PDF, sendFile } from '../../common/http';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteRoles, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import {
  assertDateOpen,
  defaultAccountFor,
  duesIncomeCategoryId,
  nextCounter,
} from '../finance/finance.ledger';
import { DocumentsService } from './documents.service';
import { byDueOrder, paymentInclude, toPaymentDto } from './ledger.mapper';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
  ) {}

  async list(query: PaymentListQueryDto): Promise<PaymentDto[]> {
    const where: Prisma.PaymentWhereInput = {
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.from || query.to
        ? {
            paidAt: {
              ...(query.from ? { gte: dateOnly(query.from) } : {}),
              ...(query.to ? { lte: dateOnly(query.to) } : {}),
            },
          }
        : {}),
    };
    const payments = await this.tenant.db.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    });
    return payments.map(toPaymentDto);
  }

  async create(input: PaymentCreateDto): Promise<PaymentDto> {
    if (input.paidAt > todayInIstanbul()) {
      throw new BadRequestException('Ödeme tarihi ileri bir tarih olamaz');
    }
    const siteId = this.tenant.siteId;
    await assertDateOpen(this.prisma, siteId, input.paidAt);
    const accountId = await this.accountFor(input.accountId, input.method);
    const categoryId = await duesIncomeCategoryId(this.prisma, siteId);

    const paymentId = await this.tenant.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM units WHERE id = ${input.unitId}::uuid AND "siteId" = ${siteId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Daire bulunamadı');

      const charges = await tx.charge.findMany({
        where: { siteId, unitId: input.unitId, cancelledAt: null },
        include: { allocations: { select: { amountKurus: true } } },
      });
      const open = charges
        .sort(byDueOrder)
        .map((c) => ({
          id: c.id,
          remainingKurus: c.amountKurus - c.allocations.reduce((sum, a) => sum + a.amountKurus, 0),
        }))
        .filter((c) => c.remainingKurus > 0);

      let allocations: Allocation[];
      try {
        allocations = input.allocations?.length
          ? validateManualAllocation(input.amountKurus, input.allocations, open)
          : allocatePayment(input.amountKurus, open);
      } catch (error) {
        if (error instanceof AllocationError) throw new BadRequestException(error.message);
        throw error;
      }

      const receiptNo = await nextCounter(tx, siteId, 'receipt');
      const payment = await tx.payment.create({
        data: {
          siteId,
          receiptNo,
          unitId: input.unitId,
          amountKurus: input.amountKurus,
          method: input.method,
          paidAt: dateOnly(input.paidAt),
          reference: input.reference ?? null,
          note: input.note ?? null,
          createdById: this.tenant.userId ?? null,
        },
      });
      await tx.paymentAllocation.createMany({
        data: allocations.map((a) => ({
          siteId,
          paymentId: payment.id,
          chargeId: a.chargeId,
          amountKurus: a.amountKurus,
        })),
      });
      await tx.transaction.create({
        data: {
          siteId,
          type: 'INCOME',
          amountKurus: input.amountKurus,
          date: dateOnly(input.paidAt),
          accountId,
          categoryId,
          paymentId: payment.id,
          visibleToResidents: false,
          createdById: this.tenant.userId ?? null,
        },
      });
      return payment.id;
    });

    const payment = await this.tenant.db.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: paymentInclude,
    });
    const dto = toPaymentDto(payment);
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Payment',
      entityId: paymentId,
      after: dto,
    });
    return dto;
  }

  async cancel(id: string, reason: string): Promise<PaymentDto> {
    const before = await this.tenant.db.payment.findUnique({
      where: { id },
      include: paymentInclude,
    });
    if (!before) throw new NotFoundException('Ödeme bulunamadı');
    if (before.cancelledAt) throw new ConflictException('Bu ödeme zaten iptal edilmiş');
    await assertDateOpen(this.prisma, this.tenant.siteId, toDateString(before.paidAt));

    await this.tenant.db.$transaction(async (tx) => {
      await tx.paymentAllocation.deleteMany({
        where: { siteId: this.tenant.siteId, paymentId: id },
      });
      await tx.payment.update({
        where: { id },
        data: {
          cancelledAt: new Date(),
          cancelReason: reason,
          cancelledById: this.tenant.userId ?? null,
        },
      });
      await tx.transaction.updateMany({
        where: { siteId: this.tenant.siteId, paymentId: id, cancelledAt: null },
        data: {
          cancelledAt: new Date(),
          cancelReason: reason,
          cancelledById: this.tenant.userId ?? null,
        },
      });
    });

    const payment = await this.tenant.db.payment.findUniqueOrThrow({
      where: { id },
      include: paymentInclude,
    });
    await this.audit.record({
      action: 'CANCEL',
      entityType: 'Payment',
      entityId: id,
      before: toPaymentDto(before),
      after: { reason },
    });
    return toPaymentDto(payment);
  }

  async receiptPdf(id: string): Promise<{ file: Buffer; name: string }> {
    const payment = await this.tenant.db.payment.findUnique({
      where: { id },
      include: {
        ...paymentInclude,
        site: { select: { name: true, kind: true, address: true, city: true } },
      },
    });
    if (!payment) throw new NotFoundException('Ödeme bulunamadı');
    if (this.tenant.isResident) {
      const count = await this.tenant.db.occupancy.count({
        where: { unitId: payment.unitId, userId: this.tenant.userId, ...activeOn() },
      });
      if (count === 0) throw new NotFoundException('Ödeme bulunamadı');
    }
    const payers = await this.tenant.db.occupancy.findMany({
      where: {
        unitId: payment.unitId,
        isResponsibleForDues: true,
        startDate: { lte: payment.paidAt },
        OR: [{ endDate: null }, { endDate: { gte: payment.paidAt } }],
      },
      select: { firstName: true, lastName: true },
    });
    const dto = toPaymentDto(payment);
    const unit = unitLabel(payment.site.kind, dto.blockName, dto.unitNumber);
    const right = { alignment: 'right' as const };
    const place = [payment.site.address, payment.site.city].filter(Boolean).join(', ');
    const row = (label: string, value: string) => [
      { text: label, color: '#555555' },
      { text: value, bold: true },
    ];

    const content: Content[] = [
      {
        columns: [
          {
            width: '*',
            text: [
              { text: `${payment.site.name}\n`, bold: true, fontSize: 12 },
              { text: place, color: '#555555' },
            ],
          },
          {
            width: 'auto',
            text: [
              { text: 'TAHSİLAT MAKBUZU\n', bold: true, fontSize: 14 },
              { text: `No: ${dto.receiptNo ?? '—'}`, fontSize: 11 },
            ],
            ...right,
          },
        ],
      },
      {
        margin: [0, 16, 0, 0],
        table: {
          widths: [110, '*'],
          body: [
            row('Tarih', formatDateTr(dto.paidAt)),
            row('Daire', unit),
            row('Ödeyen', payers.map((p) => `${p.firstName} ${p.lastName}`).join(', ') || '—'),
            row('Ödeme şekli', paymentMethodLabels[dto.method]),
            ...(dto.accountName ? [row('Hesap', dto.accountName)] : []),
            ...(dto.reference ? [row('Referans', dto.reference)] : []),
            ...(dto.note ? [row('Not', dto.note)] : []),
          ],
        },
        layout: 'noBorders',
      },
      {
        margin: [0, 12, 0, 0],
        table: {
          headerRows: 1,
          widths: ['*', 110],
          body: [
            [
              { text: 'Açıklama', style: 'th' },
              { text: 'Tutar', style: 'th', ...right },
            ],
            ...dto.allocations.map((a) => [
              a.label,
              { text: formatKurusTl(a.amountKurus), ...right },
            ]),
            [
              { text: 'Toplam', bold: true },
              { text: formatKurusTl(dto.amountKurus), bold: true, ...right },
            ],
          ],
        },
        layout: 'lightHorizontalLines',
      },
      {
        margin: [0, 8, 0, 0],
        text: `Yalnız: ${kurusToWordsTr(dto.amountKurus)}`,
        italics: true,
      },
      ...(dto.cancelledAt
        ? [
            {
              margin: [0, 16, 0, 0],
              text: `İPTAL EDİLDİ: ${dto.cancelReason ?? ''}`,
              color: '#b91c1c',
              bold: true,
              fontSize: 13,
            } as Content,
          ]
        : []),
      {
        margin: [0, 40, 0, 0],
        columns: [
          { width: '*', text: '' },
          {
            width: 180,
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.5 }] },
              { text: 'Tahsil eden', alignment: 'center', margin: [0, 4, 0, 0] },
            ],
          },
        ],
      },
    ];
    const file = await this.documents.render(content);
    const short = unitLabel(payment.site.kind, dto.blockName, dto.unitNumber, 'short');
    return { file, name: `makbuz-${dto.receiptNo ?? dto.id}-${short}.pdf` };
  }

  private async accountFor(accountId: string | undefined, method: PaymentCreateDto['method']) {
    if (!accountId) return defaultAccountFor(this.prisma, this.tenant.siteId, method);
    const account = await this.tenant.db.cashAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Hesap bulunamadı');
    if (!account.isActive) throw new BadRequestException(`${account.name} pasif durumda`);
    return account.id;
  }
}

@ApiTags('Aidat ve borçlar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@Query() query: PaymentListQueryDto): Promise<PaymentDto[]> {
    return this.payments.list(query);
  }

  @Post()
  create(@Body() body: PaymentCreateDto): Promise<PaymentDto> {
    return this.payments.create(body);
  }

  @SiteRoles('SITE_MANAGER', 'RESIDENT')
  @Get(':id/receipt.pdf')
  async receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, name } = await this.payments.receiptPdf(id);
    return sendFile(res, name, PDF, file);
  }

  @Post('bulk-cancel')
  @HttpCode(200)
  bulkCancel(@Body() body: BulkCancelDto): Promise<BulkCancelResultDto> {
    return cancelEach(body.ids, (id) => this.payments.cancel(id, body.reason));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: CancelDto): Promise<PaymentDto> {
    return this.payments.cancel(id, body.reason);
  }
}

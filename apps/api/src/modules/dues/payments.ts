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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  allocatePayment,
  AllocationError,
  validateManualAllocation,
  type Allocation,
  type PaymentDto,
} from '@apartman/shared';
import { dateOnly, todayInIstanbul } from '../../common/dates';
import { CancelDto, PaymentCreateDto, PaymentListQueryDto } from '../../common/dues.dto';
import type { Prisma } from '../../generated/prisma/client';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { byDueOrder, paymentInclude, toPaymentDto } from './ledger.mapper';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
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

      const payment = await tx.payment.create({
        data: {
          siteId,
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

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: CancelDto): Promise<PaymentDto> {
    return this.payments.cancel(id, body.reason);
  }
}

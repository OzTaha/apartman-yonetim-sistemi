import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PAYMENT_INTENT_MINUTES,
  unitLabel,
  type CheckoutResultDto,
  type IntentItem,
  type OnlinePaymentSettingsDto,
  type OnlinePaymentStatusDto,
  type PaymentIntentDto,
} from '@apartman/shared';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { Public } from '../../common/auth-user';
import { activeOn, toDateString } from '../../common/dates';
import {
  CheckoutDto,
  OnlinePaymentSettingsDto as SettingsBody,
  RefundDto,
} from '../../common/online.dto';
import type { Env } from '../../config/env';
import type { PaymentIntent, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteRoles, SiteScoped, TenantContext, type AppClsStore } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { PaymentsService } from '../dues/payments';
import { loadSiteSettings, readSiteSettings } from '../dues/site-settings';
import { assertDateOpen } from '../finance/finance.ledger';
import { PaymentProvider, type CallbackRequest, type ProviderEvent } from './payment.provider';

class AlreadyProcessed extends Error {}

const OPEN_INTENT = ['PENDING', 'EXPIRED'] as const;

@Injectable()
export class OnlinePaymentsService {
  private readonly logger = new Logger(OnlinePaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
    private readonly provider: PaymentProvider,
    private readonly cls: ClsService<AppClsStore>,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get available(): boolean {
    return this.provider.name !== 'none';
  }

  async settings(): Promise<OnlinePaymentSettingsDto> {
    const stored = (await loadSiteSettings(this.prisma, this.tenant.siteId)).onlinePayment;
    return {
      enabled: stored?.enabled ?? false,
      accountId: stored?.accountId ?? null,
      providerAvailable: this.available,
      testMode: this.provider.testMode,
    };
  }

  async updateSettings(input: SettingsBody): Promise<OnlinePaymentSettingsDto> {
    if (input.enabled && !this.available) {
      throw new BadRequestException(
        'Ödeme sağlayıcısı tanımlı olmadığı için online ödeme açılamaz',
      );
    }
    if (input.accountId) {
      const account = await this.tenant.db.cashAccount.findUnique({
        where: { id: input.accountId },
      });
      if (!account) throw new NotFoundException('Hesap bulunamadı');
      if (!account.isActive) throw new BadRequestException(`${account.name} pasif durumda`);
    }
    const site = await this.prisma.site.findUniqueOrThrow({
      where: { id: this.tenant.siteId },
      select: { settings: true },
    });
    const before = await this.settings();
    await this.prisma.site.update({
      where: { id: this.tenant.siteId },
      data: {
        settings: {
          ...readSiteSettings(site.settings),
          onlinePayment: { enabled: input.enabled, accountId: input.accountId },
        },
      },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'OnlinePaymentSettings',
      entityId: this.tenant.siteId,
      before,
      after: input,
    });
    return this.settings();
  }

  async status(): Promise<OnlinePaymentStatusDto> {
    const settings = await this.settings();
    return { enabled: settings.enabled && this.available, testMode: this.provider.testMode };
  }

  async checkout(input: CheckoutDto): Promise<CheckoutResultDto> {
    if (!(await this.status()).enabled) {
      throw new BadRequestException('Bu yerde online ödeme kapalı');
    }
    const userId = this.tenant.userId!;
    const siteId = this.tenant.siteId;
    const occupancy = await this.tenant.db.occupancy.findFirst({
      where: { unitId: input.unitId, userId, ...activeOn() },
      include: {
        unit: { select: { number: true, block: { select: { name: true } } } },
        site: { select: { name: true, kind: true } },
      },
    });
    if (!occupancy) throw new NotFoundException('Daire bulunamadı');

    const intent = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM units WHERE id = ${input.unitId}::uuid AND "siteId" = ${siteId}::uuid FOR UPDATE`;
      const active = await tx.paymentIntent.findMany({
        where: { siteId, unitId: input.unitId, status: 'PENDING', expiresAt: { gt: new Date() } },
      });
      if (active.some((i) => i.userId !== userId)) {
        throw new ConflictException(
          'Bu daire için şu anda başka bir online ödeme sürüyor. Birkaç dakika sonra tekrar deneyin.',
        );
      }
      await tx.paymentIntent.updateMany({
        where: { siteId, unitId: input.unitId, userId, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });

      const ids = [...new Set(input.chargeIds)];
      const charges = await tx.charge.findMany({
        where: { siteId, unitId: input.unitId, id: { in: ids }, cancelledAt: null },
        include: { allocations: { select: { amountKurus: true } } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      });
      const items: IntentItem[] = charges
        .map((c) => ({
          chargeId: c.id,
          amountKurus: c.amountKurus - c.allocations.reduce((sum, a) => sum + a.amountKurus, 0),
        }))
        .filter((i) => i.amountKurus > 0);
      if (items.length !== ids.length) {
        throw new BadRequestException(
          'Seçilen borçlardan bazıları artık ödenemez. Sayfayı yenileyip tekrar deneyin.',
        );
      }
      return tx.paymentIntent.create({
        data: {
          siteId,
          unitId: input.unitId,
          userId,
          amountKurus: items.reduce((sum, i) => sum + i.amountKurus, 0),
          items: items as unknown as Prisma.InputJsonValue,
          provider: this.provider.name,
          expiresAt: new Date(Date.now() + PAYMENT_INTENT_MINUTES * 60_000),
        },
      });
    });

    try {
      const session = await this.provider.createCheckout({
        intentId: intent.id,
        amountKurus: intent.amountKurus,
        description: `${occupancy.site.name} · ${unitLabel(occupancy.site.kind, occupancy.unit.block.name, occupancy.unit.number)}`,
        buyerName: `${occupancy.firstName} ${occupancy.lastName}`,
        returnUrl: `${this.config.get('WEB_ORIGIN', { infer: true })}/odeme/sonuc?odeme=${intent.id}&site=${siteId}`,
      });
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { providerToken: session.token },
      });
      await this.audit.record({
        action: 'CHECKOUT',
        entityType: 'PaymentIntent',
        entityId: intent.id,
        after: { unitId: input.unitId, amountKurus: intent.amountKurus },
      });
      return { intentId: intent.id, redirectUrl: session.redirectUrl };
    } catch (error) {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'FAILED', failureReason: (error as Error).message.slice(0, 300) },
      });
      throw new BadGatewayException('Ödeme sayfası açılamadı. Lütfen daha sonra tekrar deneyin.');
    }
  }

  async intent(id: string): Promise<PaymentIntentDto> {
    let intent = await this.findIntent(id);
    if (intent.status === 'PENDING' && intent.providerToken) {
      const event = await this.provider.getStatus(intent.providerToken);
      if (event) {
        await this.process(intent, event);
        intent = await this.findIntent(id);
      }
    }
    const payment = intent.paymentId
      ? await this.tenant.db.payment.findUnique({
          where: { id: intent.paymentId },
          select: { receiptNo: true },
        })
      : null;
    return {
      id: intent.id,
      unitId: intent.unitId,
      status:
        intent.status === 'PENDING' && intent.expiresAt < new Date() ? 'EXPIRED' : intent.status,
      amountKurus: intent.amountKurus,
      appliedKurus: intent.appliedKurus,
      refundedKurus: intent.refundedKurus,
      paymentId: intent.paymentId,
      receiptNo: payment?.receiptNo ?? null,
      failureReason: intent.failureReason,
      createdAt: intent.createdAt.toISOString(),
      completedAt: intent.completedAt?.toISOString() ?? null,
    };
  }

  async handleCallback(providerName: string, request: CallbackRequest): Promise<void> {
    if (providerName !== this.provider.name || !this.available) {
      throw new NotFoundException('Ödeme sağlayıcısı bulunamadı');
    }
    const event = this.provider.verifyCallback(request);
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { providerToken: event.token },
    });
    if (!intent) throw new NotFoundException('Ödeme bulunamadı');
    await this.cls.run(async () => {
      this.cls.set('siteId', intent.siteId);
      await this.process(intent, event);
    });
  }

  async refund(paymentId: string, reason: string) {
    const intent = await this.tenant.db.paymentIntent.findFirst({
      where: { paymentId },
      include: { payment: { select: { paidAt: true, cancelledAt: true } } },
    });
    if (!intent?.payment) throw new NotFoundException('Online ödeme bulunamadı');
    if (intent.payment.cancelledAt) throw new ConflictException('Bu ödeme zaten iptal edilmiş');
    if (!intent.providerPayment) throw new BadRequestException('Sağlayıcı ödeme kaydı eksik');
    await assertDateOpen(this.prisma, this.tenant.siteId, toDateString(intent.payment.paidAt));

    let reference: string;
    try {
      reference = (await this.provider.refund(intent.providerPayment, intent.appliedKurus))
        .reference;
    } catch (error) {
      throw new BadGatewayException(`İade yapılamadı: ${(error as Error).message}`);
    }
    await this.tenant.db.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: 'REFUNDED',
        refundedKurus: intent.refundedKurus + intent.appliedKurus,
        refundReference: reference,
      },
    });
    await this.audit.record({
      action: 'REFUND',
      entityType: 'PaymentIntent',
      entityId: intent.id,
      after: { paymentId, amountKurus: intent.appliedKurus, reference, reason },
    });
    return this.payments.cancel(paymentId, `İade: ${reason}`, { refunded: true });
  }

  private async findIntent(id: string): Promise<PaymentIntent> {
    const intent = await this.tenant.db.paymentIntent.findUnique({ where: { id } });
    if (!intent || (this.tenant.isResident && intent.userId !== this.tenant.userId)) {
      throw new NotFoundException('Ödeme bulunamadı');
    }
    return intent;
  }

  private async process(intent: PaymentIntent, event: ProviderEvent): Promise<void> {
    if (!OPEN_INTENT.includes(intent.status as (typeof OPEN_INTENT)[number])) return;
    if (event.status === 'FAILED') {
      await this.prisma.paymentIntent.updateMany({
        where: { id: intent.id, status: { in: [...OPEN_INTENT] } },
        data: { status: 'FAILED', failureReason: event.reason, completedAt: new Date() },
      });
      return;
    }
    if (event.amountKurus !== intent.amountKurus || !event.providerPayment) {
      this.logger.error(`Ödeme tutarı uyuşmuyor: ${intent.id}`);
      throw new BadRequestException('Ödeme bildirimi ödeme kaydıyla uyuşmuyor');
    }

    let result;
    try {
      result = await this.payments.recordOnline(
        {
          unitId: intent.unitId,
          userId: intent.userId,
          items: intent.items as unknown as IntentItem[],
          reference: event.providerPayment,
        },
        async (tx, recorded) => {
          const claimed = await tx.paymentIntent.updateMany({
            where: { id: intent.id, status: { in: [...OPEN_INTENT] } },
            data: {
              status: 'SUCCEEDED',
              providerPayment: event.providerPayment,
              paymentId: recorded.paymentId,
              appliedKurus: recorded.appliedKurus,
              completedAt: new Date(),
            },
          });
          if (claimed.count === 0) throw new AlreadyProcessed();
        },
      );
    } catch (error) {
      if (error instanceof AlreadyProcessed) return;
      throw error;
    }
    await this.audit.record({
      action: 'ONLINE_PAYMENT',
      entityType: 'PaymentIntent',
      entityId: intent.id,
      after: {
        paymentId: result.paymentId,
        applied: result.appliedKurus,
        excess: result.excessKurus,
      },
    });
    if (result.excessKurus > 0) await this.refundExcess(intent.id, event.providerPayment, result);
  }

  private async refundExcess(
    intentId: string,
    providerPayment: string,
    result: { excessKurus: number; paymentId: string | null },
  ) {
    try {
      const { reference } = await this.provider.refund(providerPayment, result.excessKurus);
      await this.prisma.paymentIntent.update({
        where: { id: intentId },
        data: {
          refundedKurus: { increment: result.excessKurus },
          refundReference: reference,
          ...(result.paymentId ? {} : { status: 'REFUNDED' as const }),
        },
      });
    } catch (error) {
      this.logger.error(`Fazla tutar iade edilemedi (${intentId}): ${(error as Error).message}`);
      await this.prisma.paymentIntent.update({
        where: { id: intentId },
        data: {
          failureReason: `Borçtan fazla ödenen ${result.excessKurus / 100} TL iade edilemedi; sağlayıcı panelinden iade edin.`,
        },
      });
    }
  }
}

@ApiTags('Online ödeme')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('online-payments')
export class OnlinePaymentsController {
  constructor(private readonly online: OnlinePaymentsService) {}

  @Get('settings')
  settings(): Promise<OnlinePaymentSettingsDto> {
    return this.online.settings();
  }

  @Put('settings')
  updateSettings(@Body() body: SettingsBody): Promise<OnlinePaymentSettingsDto> {
    return this.online.updateSettings(body);
  }

  @SiteRoles('SITE_MANAGER', 'RESIDENT')
  @Get('status')
  status(): Promise<OnlinePaymentStatusDto> {
    return this.online.status();
  }

  @SiteRoles('SITE_MANAGER', 'RESIDENT')
  @Post('checkout')
  checkout(@Body() body: CheckoutDto): Promise<CheckoutResultDto> {
    return this.online.checkout(body);
  }

  @SiteRoles('SITE_MANAGER', 'RESIDENT')
  @Get('intents/:id')
  intent(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentIntentDto> {
    return this.online.intent(id);
  }

  @Post('payments/:paymentId/refund')
  @HttpCode(200)
  refund(@Param('paymentId', ParseUUIDPipe) paymentId: string, @Body() body: RefundDto) {
    return this.online.refund(paymentId, body.reason);
  }
}

@ApiTags('Online ödeme')
@Public()
@Controller('online-payments/callback')
export class OnlinePaymentsCallbackController {
  constructor(private readonly online: OnlinePaymentsService) {}

  @Post(':provider')
  @HttpCode(200)
  async callback(@Param('provider') provider: string, @Req() req: Request) {
    await this.online.handleCallback(provider, { headers: req.headers, body: req.body });
    return { ok: true };
  }
}

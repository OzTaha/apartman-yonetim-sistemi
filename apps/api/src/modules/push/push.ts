import {
  Body,
  Controller,
  Delete,
  Get,
  Global,
  HttpCode,
  Injectable,
  Logger,
  Module,
  type OnModuleInit,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  type PushConfigDto,
  type PushMessage,
} from '@apartman/shared';
import { createZodDto } from 'nestjs-zod';
import * as webpushModule from 'web-push';
import { type AuthUser, CurrentUser } from '../../common/auth-user';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

const webpush = ((webpushModule as unknown as { default?: typeof webpushModule }).default ??
  webpushModule) as typeof webpushModule;

class PushSubscriptionDto extends createZodDto(pushSubscriptionSchema) {}
class PushUnsubscribeDto extends createZodDto(pushUnsubscribeSchema) {}

const SECRET_KEY = 'vapid';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private keys: VapidKeys | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      this.keys = await this.loadKeys();
      const origin = new URL(this.config.get('WEB_ORIGIN', { infer: true }));
      const subject =
        origin.protocol === 'https:' ? origin.origin : `mailto:bildirim@${origin.hostname}.local`;
      webpush.setVapidDetails(subject, this.keys.publicKey, this.keys.privateKey);
    } catch (error) {
      this.keys = null;
      this.logger.error(`Telefon bildirimleri başlatılamadı: ${(error as Error).message}`);
    }
  }

  private async loadKeys(): Promise<VapidKeys> {
    const stored = await this.prisma.appSecret.findUnique({ where: { key: SECRET_KEY } });
    if (stored) return JSON.parse(stored.value) as VapidKeys;
    const generated = webpush.generateVAPIDKeys();
    await this.prisma.appSecret.upsert({
      where: { key: SECRET_KEY },
      create: { key: SECRET_KEY, value: JSON.stringify(generated) },
      update: {},
    });
    const saved = await this.prisma.appSecret.findUniqueOrThrow({ where: { key: SECRET_KEY } });
    return JSON.parse(saved.value) as VapidKeys;
  }

  publicConfig(): PushConfigDto {
    if (!this.keys)
      throw new ServiceUnavailableException('Telefon bildirimleri şu an kullanılamıyor');
    return { publicKey: this.keys.publicKey };
  }

  async subscribe(userId: string, input: PushSubscriptionDto, userAgent?: string): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
      update: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth },
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async deliver(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: string,
  ): Promise<void> {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
      { TTL: 24 * 60 * 60, urgency: 'normal' },
    );
  }

  send(userIds: string[], message: PushMessage): void {
    const unique = [...new Set(userIds)];
    if (!this.keys || unique.length === 0) return;
    void this.sendNow(unique, message).catch((error: unknown) =>
      this.logger.warn(`Telefon bildirimi gönderilemedi: ${(error as Error).message}`),
    );
  }

  async sendNow(userIds: string[], message: PushMessage): Promise<number> {
    if (!this.keys) return 0;
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds }, user: { isActive: true } },
    });
    const payload = JSON.stringify(message);
    let delivered = 0;
    await Promise.all(
      subscriptions.map(async (s) => {
        try {
          await this.deliver(s, payload);
          delivered++;
          await this.prisma.pushSubscription.update({
            where: { id: s.id },
            data: { lastSuccessAt: new Date() },
          });
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.deleteMany({ where: { id: s.id } });
          } else {
            this.logger.warn(`Bildirim iletilemedi (${status ?? 'hata'})`);
          }
        }
      }),
    );
    return delivered;
  }
}

@ApiTags('Telefon bildirimleri')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('config')
  config(): PushConfigDto {
    return this.push.publicConfig();
  }

  @Post('subscriptions')
  @HttpCode(204)
  subscribe(@CurrentUser() user: AuthUser, @Body() body: PushSubscriptionDto): Promise<void> {
    return this.push.subscribe(user.id, body);
  }

  @Delete('subscriptions')
  @HttpCode(204)
  unsubscribe(@CurrentUser() user: AuthUser, @Body() body: PushUnsubscribeDto): Promise<void> {
    return this.push.unsubscribe(user.id, body.endpoint);
  }

  @Post('test')
  @HttpCode(200)
  async test(@CurrentUser() user: AuthUser): Promise<{ delivered: number }> {
    const delivered = await this.push.sendNow([user.id], {
      title: 'Bildirimler açık',
      body: 'Yeni duyuru, ödeme ve talep yanıtları telefonunuza böyle gelecek.',
      url: '/',
      tag: 'test',
    });
    return { delivered };
  }
}

@Global()
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}

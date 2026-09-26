import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  type MessageEvent,
  Module,
  NotFoundException,
  BadRequestException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  normalizeTrPhone,
  notificationListQuerySchema,
  passwordResetRequestSchema,
  unitLabel,
  type NotificationCountDto,
  type NotificationDto,
  type NotificationEventDto,
  type PasswordResetRequestData,
} from '@apartman/shared';
import { createZodDto } from 'nestjs-zod';
import { filter, interval, map, merge, type Observable, Subject } from 'rxjs';
import { type AuthUser, CurrentUser, Public } from '../../common/auth-user';
import { activeOn } from '../../common/dates';
import type { Notification, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

class PasswordResetRequestDto extends createZodDto(passwordResetRequestSchema) {}
class NotificationListQueryDto extends createZodDto(notificationListQuerySchema) {}

const DEDUPE_MS = 60 * 60_000;
const HEARTBEAT_MS = 25_000;

export const resetSubject = {
  occupancy: (id: string) => `pwreset:occ:${id}`,
  user: (id: string) => `pwreset:user:${id}`,
};

type Row = Notification & { site: { name: string } | null };

function toDto(n: Row): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    siteId: n.siteId,
    siteName: n.site?.name ?? null,
    data: n.data as unknown as PasswordResetRequestData,
    readAt: n.readAt?.toISOString() ?? null,
    resolvedAt: n.resolvedAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationHub {
  private readonly events = new Subject<{ userId: string; event: NotificationEventDto }>();

  emit(userId: string, event: NotificationEventDto) {
    this.events.next({ userId, event });
  }

  stream(userId: string): Observable<MessageEvent> {
    return merge(
      this.events.pipe(
        filter((e) => e.userId === userId),
        map((e) => ({ type: 'notification', data: e.event }) as MessageEvent),
      ),
      interval(HEARTBEAT_MS).pipe(map(() => ({ type: 'ping', data: '' }) as MessageEvent)),
    );
  }
}

interface Draft {
  siteId: string | null;
  subjectKey: string;
  title: string;
  body: string;
  data: PasswordResetRequestData;
  recipients: string[];
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: NotificationHub,
  ) {}

  async list(userId: string, onlyUnread: boolean): Promise<NotificationDto[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(onlyUnread ? { readAt: null } : {}) },
      include: { site: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toDto);
  }

  async count(userId: string): Promise<NotificationCountDto> {
    return { unread: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.notification.count({ where: { id, userId } });
      if (!exists) throw new NotFoundException('Bildirim bulunamadı');
    }
    this.hub.emit(userId, { kind: 'changed' });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    this.hub.emit(userId, { kind: 'changed' });
  }

  async resolve(subjectKey: string, resolvedById: string | null): Promise<void> {
    const open = await this.prisma.notification.findMany({
      where: { subjectKey, resolvedAt: null },
      select: { userId: true },
    });
    if (open.length === 0) return;
    await this.prisma.notification.updateMany({
      where: { subjectKey, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedById },
    });
    for (const userId of new Set(open.map((n) => n.userId))) {
      this.hub.emit(userId, { kind: 'changed' });
    }
  }

  async requestPasswordReset(identifier: string): Promise<{ message: string }> {
    const email = identifier.includes('@') ? identifier.toLowerCase() : null;
    const phone = email ? null : normalizeTrPhone(identifier);
    if (!email && !phone) {
      throw new BadRequestException('Geçerli bir telefon numarası veya e-posta adresi girin');
    }
    const user = await this.prisma.user.findFirst({
      where: email ? { email } : { phone },
      include: { memberships: { select: { role: true } } },
    });
    const activeUser = user?.isActive ? user : null;
    const contact: Prisma.OccupancyWhereInput[] = [email ? { email } : { phone }];
    if (activeUser) contact.push({ userId: activeUser.id });
    const occupancies = await this.prisma.occupancy.findMany({
      where: { AND: [activeOn(), { OR: contact }], unit: { archivedAt: null } },
      include: {
        site: { select: { name: true, kind: true } },
        unit: { select: { number: true, block: { select: { name: true } } } },
      },
    });
    const isManager =
      activeUser !== null &&
      (activeUser.isPlatformAdmin || activeUser.memberships.some((m) => m.role === 'SITE_MANAGER'));
    if (!isManager && occupancies.length === 0) {
      throw new NotFoundException(
        'Sisteme kayıtlı değilsiniz. Yeni taşındıysanız kaydınız için yönetime başvurun.',
      );
    }

    const admins = (
      await this.prisma.user.findMany({
        where: { isPlatformAdmin: true, isActive: true },
        select: { id: true },
      })
    ).map((u) => u.id);
    const others = (ids: string[]) => [...new Set(ids)].filter((id) => id !== activeUser?.id);
    const drafts: Draft[] = [];

    if (isManager) {
      const name = `${activeUser.firstName} ${activeUser.lastName}`;
      drafts.push({
        siteId: null,
        subjectKey: resetSubject.user(activeUser.id),
        title: 'Yönetici şifre yenileme talebi',
        body: `${name} yeni şifre bağlantısı istiyor.`,
        data: {
          occupancyId: null,
          userId: activeUser.id,
          hasAccount: true,
          isManager: true,
          name,
          phone: activeUser.phone,
          blockName: null,
          unitNumber: null,
        },
        recipients: others(admins),
      });
    } else {
      const managers = await this.prisma.siteMembership.findMany({
        where: {
          siteId: { in: occupancies.map((o) => o.siteId) },
          role: 'SITE_MANAGER',
          user: { isActive: true },
        },
        select: { siteId: true, userId: true },
      });
      for (const o of occupancies) {
        const name = `${o.firstName} ${o.lastName}`;
        const hasAccount = Boolean(
          o.userId && activeUser?.passwordHash && o.userId === activeUser.id,
        );
        const unit = unitLabel(o.site.kind, o.unit.block.name, o.unit.number);
        drafts.push({
          siteId: o.siteId,
          subjectKey: resetSubject.occupancy(o.id),
          title: hasAccount ? 'Şifre yenileme talebi' : 'Hesap açma talebi',
          body: hasAccount
            ? `${name} (${unit}) yeni şifre bağlantısı istiyor.`
            : `${name} (${unit}) hesabı olmadığı için davet bağlantısı istiyor.`,
          data: {
            occupancyId: o.id,
            userId: o.userId,
            hasAccount,
            isManager: false,
            name,
            phone: o.phone ?? activeUser?.phone ?? null,
            blockName: o.unit.block.name,
            unitNumber: o.unit.number,
          },
          recipients: others([
            ...managers.filter((m) => m.siteId === o.siteId).map((m) => m.userId),
            ...admins,
          ]),
        });
      }
    }

    const since = new Date(Date.now() - DEDUPE_MS);
    for (const draft of drafts) {
      const recent = await this.prisma.notification.count({
        where: { subjectKey: draft.subjectKey, resolvedAt: null, createdAt: { gt: since } },
      });
      if (recent > 0 || draft.recipients.length === 0) continue;
      const rows = await this.prisma.notification.createManyAndReturn({
        data: draft.recipients.map((userId) => ({
          userId,
          siteId: draft.siteId,
          type: 'PASSWORD_RESET_REQUEST' as const,
          subjectKey: draft.subjectKey,
          title: draft.title,
          body: draft.body,
          data: draft.data as unknown as Prisma.InputJsonValue,
        })),
        include: { site: { select: { name: true } } },
      });
      for (const row of rows) {
        this.hub.emit(row.userId, { kind: 'created', notification: toDto(row) });
      }
    }
    return {
      message: 'Talebiniz yönetime iletildi. Yönetim size şifre yenileme bağlantısı gönderecek.',
    };
  }
}

@ApiTags('Bildirimler')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly hub: NotificationHub,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: NotificationListQueryDto,
  ): Promise<NotificationDto[]> {
    return this.notifications.list(user.id, query.filter === 'unread');
  }

  @Get('count')
  count(@CurrentUser() user: AuthUser): Promise<NotificationCountDto> {
    return this.notifications.count(user.id);
  }

  @Sse('stream')
  stream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.hub.stream(user.id);
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentUser() user: AuthUser): Promise<void> {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.notifications.markRead(user.id, id);
  }
}

@ApiTags('Kimlik')
@Controller('auth/password-reset-requests')
export class PasswordResetRequestController {
  constructor(private readonly notifications: NotificationsService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  request(@Body() body: PasswordResetRequestDto): Promise<{ message: string }> {
    return this.notifications.requestPasswordReset(body.identifier);
  }
}

@Module({
  controllers: [NotificationsController, PasswordResetRequestController],
  providers: [NotificationsService, NotificationHub],
  exports: [NotificationsService],
})
export class NotificationsModule {}

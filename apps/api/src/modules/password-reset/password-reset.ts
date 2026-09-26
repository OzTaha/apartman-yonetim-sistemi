import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  GoneException,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  passwordResetSchema,
  resetLinkRequestSchema,
  type MessageChannel,
  type PasswordResetInfoDto,
  type PasswordResetLinkDto,
} from '@apartman/shared';
import { ClsService } from 'nestjs-cls';
import { createZodDto } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Public } from '../../common/auth-user';
import { sha256 } from '../../common/crypto';
import { activeOn } from '../../common/dates';
import { PlatformAdminOnly } from '../../common/platform-admin.guard';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext, type AppClsStore } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { CommunicationModule } from '../communication/communication.module';
import { MessagingProvider } from '../communication/messaging.provider';
import { createResetLink } from './tokens';

class PasswordResetDto extends createZodDto(passwordResetSchema) {}
class ResetLinkRequestDto extends createZodDto(resetLinkRequestSchema) {}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly messaging: MessagingProvider,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async forResident(occupancyId: string, send?: MessageChannel): Promise<PasswordResetLinkDto> {
    const occupancy = await this.tenant.db.occupancy.findFirst({
      where: { id: occupancyId, ...activeOn() },
      include: {
        user: { include: { memberships: { select: { role: true } } } },
        site: { select: { name: true } },
      },
    });
    if (!occupancy) throw new NotFoundException('Sakin kaydı bulunamadı');
    const user = occupancy.user;
    if (!user?.passwordHash) {
      throw new BadRequestException(
        'Bu sakinin henüz hesabı yok. Şifre bağlantısı yerine davet bağlantısı gönderin.',
      );
    }
    if (user.id === this.tenant.userId) {
      throw new BadRequestException('Kendi şifrenizi "Şifre değiştir" sayfasından değiştirin.');
    }
    const isPlatformAdmin = this.cls.get('siteRole') === 'PLATFORM_ADMIN';
    if (
      !isPlatformAdmin &&
      (user.isPlatformAdmin || user.memberships.some((m) => m.role === 'SITE_MANAGER'))
    ) {
      throw new ForbiddenException(
        'Bu kişi yönetici olduğu için şifre bağlantısını yalnızca sistem yöneticisi oluşturabilir.',
      );
    }

    const link = await this.createLink(user.id);
    const result: PasswordResetLinkDto = { ...link, sentVia: null, sendError: null };
    if (send) {
      const phone = occupancy.phone ?? user.phone;
      if (!phone) {
        result.sendError = 'Sakinin telefon numarası kayıtlı değil';
      } else {
        try {
          await this.messaging.send(
            send,
            phone,
            `${occupancy.site.name}: Şifrenizi yenilemek için bu bağlantıyı açın (24 saat geçerli): ${link.url}`,
          );
          result.sentVia = send;
        } catch (error) {
          this.logger.warn(`Şifre bağlantısı gönderilemedi: ${(error as Error).message}`);
          result.sendError = 'Mesaj gönderilemedi; bağlantıyı kopyalayıp iletebilirsiniz';
        }
      }
    }
    await this.audit.record({
      action: 'PASSWORD_RESET_LINK',
      entityType: 'User',
      entityId: user.id,
      after: { occupancyId, sentVia: result.sentVia },
    });
    return result;
  }

  async forUser(actor: AuthUser, userId: string): Promise<PasswordResetLinkDto> {
    if (actor.id === userId) {
      throw new BadRequestException('Kendi şifrenizi "Şifre değiştir" sayfasından değiştirin.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');
    const link = await this.createLink(user.id, actor.id);
    await this.audit.record({
      action: 'PASSWORD_RESET_LINK',
      entityType: 'User',
      entityId: user.id,
      siteId: null,
    });
    return { ...link, sentVia: null, sendError: null };
  }

  async info(token: string): Promise<PasswordResetInfoDto> {
    const reset = await this.findValid(token);
    return { firstName: reset.user.firstName, expiresAt: reset.expiresAt.toISOString() };
  }

  async reset(token: string, password: string): Promise<void> {
    const reset = await this.findValid(token);
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) throw new GoneException('Bu bağlantı zaten kullanılmış');
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    await this.audit.record({
      action: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: reset.userId,
      siteId: null,
    });
  }

  private async createLink(userId: string, createdById = this.tenant.userId ?? null) {
    const link = await createResetLink(this.prisma, {
      userId,
      createdById,
      webOrigin: this.config.get('WEB_ORIGIN', { infer: true }),
    });
    return { url: link.url, expiresAt: link.expiresAt.toISOString() };
  }

  private async findValid(token: string) {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { firstName: true, isActive: true } } },
    });
    if (!reset || !reset.user.isActive) {
      throw new NotFoundException('Şifre yenileme bağlantısı geçersiz');
    }
    if (reset.usedAt) throw new GoneException('Bu bağlantı zaten kullanılmış');
    if (reset.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('Bağlantının süresi dolmuş. Yöneticinizden yeni bağlantı isteyin.');
    }
    return reset;
  }
}

@ApiTags('Kimlik')
@Controller('auth/password-resets')
export class PasswordResetPublicController {
  constructor(private readonly resets: PasswordResetService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  info(@Param('token') token: string): Promise<PasswordResetInfoDto> {
    return this.resets.info(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token')
  @HttpCode(204)
  reset(@Param('token') token: string, @Body() body: PasswordResetDto): Promise<void> {
    return this.resets.reset(token, body.password);
  }
}

@ApiTags('Sakinler')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('residents')
export class ResidentPasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  @Post(':id/password-reset')
  @HttpCode(200)
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetLinkRequestDto,
  ): Promise<PasswordResetLinkDto> {
    return this.resets.forResident(id, body.send);
  }
}

@ApiTags('Kimlik')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('users')
export class UserPasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  @Post(':id/password-reset')
  @HttpCode(200)
  create(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PasswordResetLinkDto> {
    return this.resets.forUser(actor, id);
  }
}

@Module({
  imports: [CommunicationModule],
  controllers: [
    PasswordResetPublicController,
    ResidentPasswordResetController,
    UserPasswordResetController,
  ],
  providers: [PasswordResetService],
})
export class PasswordResetModule {}

import {
  applyDecorators,
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiHeader } from '@nestjs/swagger';
import type { SiteKind, SiteRole } from '@apartman/shared';
import { ClsService, type ClsStore } from 'nestjs-cls';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { createTenantClient, type TenantClient } from './tenant-extension';

export interface AppClsStore extends ClsStore {
  userId?: string;
  siteId?: string;
  siteRole?: SiteRole | 'PLATFORM_ADMIN';
}

export const SITE_ROLES_KEY = 'siteRoles';
export const SITE_HEADER = 'x-site-id';

const uuid = z.uuid();

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Oturum bulunamadı');

    const siteId = request.headers[SITE_HEADER];
    if (typeof siteId !== 'string' || !uuid.safeParse(siteId).success) {
      throw new BadRequestException('Geçerli bir X-Site-Id başlığı gerekli');
    }

    const allowedRoles =
      this.reflector.getAllAndOverride<SiteRole[] | undefined>(SITE_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (user.isPlatformAdmin) {
      const site = await this.prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true },
      });
      if (!site) throw new NotFoundException('Site bulunamadı');
      this.cls.set('siteId', siteId);
      this.cls.set('siteRole', 'PLATFORM_ADMIN');
      return true;
    }

    const membership = await this.prisma.siteMembership.findUnique({
      where: { siteId_userId: { siteId, userId: user.id } },
      select: { role: true },
    });
    if (!membership) throw new ForbiddenException('Bu siteye erişim yetkiniz yok');
    if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }

    this.cls.set('siteId', siteId);
    this.cls.set('siteRole', membership.role);
    return true;
  }
}

export function SiteScoped(...roles: SiteRole[]) {
  return applyDecorators(
    SetMetadata(SITE_ROLES_KEY, roles),
    UseGuards(TenantGuard),
    ApiHeader({ name: 'X-Site-Id', required: true, description: 'Aktif site kimliği' }),
  );
}

export const SiteRoles = (...roles: SiteRole[]) => SetMetadata(SITE_ROLES_KEY, roles);

@Injectable()
export class TenantContext {
  readonly db: TenantClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {
    this.db = createTenantClient(prisma, () => this.cls.get('siteId'));
  }

  async siteKind(): Promise<SiteKind> {
    const site = await this.prisma.site.findUniqueOrThrow({
      where: { id: this.siteId },
      select: { kind: true },
    });
    return site.kind;
  }

  get siteId(): string {
    const siteId = this.cls.get('siteId');
    if (!siteId) throw new Error('Site bağlamı bulunamadı');
    return siteId;
  }

  get userId(): string | undefined {
    return this.cls.get('userId');
  }

  get isResident(): boolean {
    return this.cls.get('siteRole') === 'RESIDENT';
  }
}

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
import { activeOn } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { createTenantClient, type TenantClient } from './tenant-extension';

export interface AppClsStore extends ClsStore {
  userId?: string;
  siteId?: string;
  siteRole?: SiteRole | 'PLATFORM_ADMIN';
  blockIds?: string[];
}

export const SITE_ROLES_KEY = 'siteRoles';
export const AUDITOR_READ_KEY = 'auditorRead';
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

    const role = this.effectiveRole(context, membership.role, allowedRoles);
    if (!role) throw new ForbiddenException('Bu işlem için yetkiniz yok');

    this.cls.set('siteId', siteId);
    this.cls.set('siteRole', role);
    if (role === 'BLOCK_MANAGER') {
      const blocks = await this.prisma.blockManager.findMany({
        where: { siteId, userId: user.id },
        select: { blockId: true },
      });
      this.cls.set(
        'blockIds',
        blocks.map((b) => b.blockId),
      );
    }
    return true;
  }

  private effectiveRole(
    context: ExecutionContext,
    role: SiteRole,
    allowed: SiteRole[],
  ): SiteRole | null {
    if (allowed.length === 0 || allowed.includes(role)) return role;
    const auditorRead = this.reflector.getAllAndOverride<boolean | undefined>(AUDITOR_READ_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const method = context.switchToHttp().getRequest<AuthenticatedRequest>().method;
    if (role === 'AUDITOR' && auditorRead && method === 'GET' && allowed.includes('SITE_MANAGER')) {
      return 'AUDITOR';
    }
    if ((role === 'BLOCK_MANAGER' || role === 'AUDITOR') && allowed.includes('RESIDENT')) {
      return 'RESIDENT';
    }
    return null;
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

export const AuditorReadable = () => SetMetadata(AUDITOR_READ_KEY, true);

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

  get blockScope(): string[] | null {
    return this.cls.get('siteRole') === 'BLOCK_MANAGER' ? (this.cls.get('blockIds') ?? []) : null;
  }

  unitScope(): Prisma.UnitWhereInput {
    const scope = this.blockScope;
    return scope ? { blockId: { in: scope } } : {};
  }

  async assertUnitInScope(unitId: string): Promise<void> {
    const scope = this.blockScope;
    if (!scope) return;
    const count = await this.db.unit.count({ where: { id: unitId, blockId: { in: scope } } });
    if (count === 0) throw new NotFoundException('Daire bulunamadı');
  }

  assertBlockInScope(blockId: string | null): void {
    const scope = this.blockScope;
    if (scope && (!blockId || !scope.includes(blockId))) {
      throw new ForbiddenException('Yalnızca yöneticisi olduğunuz blok için işlem yapabilirsiniz');
    }
  }

  async residentBlockIds(): Promise<string[]> {
    const occupancies = await this.db.occupancy.findMany({
      where: { userId: this.userId, ...activeOn() },
      select: { unit: { select: { blockId: true } } },
    });
    return [...new Set(occupancies.map((o) => o.unit.blockId))];
  }
}

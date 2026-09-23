import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SiteDto } from '@apartman/shared';
import type { AuthUser } from '../../common/auth-user';
import { activeOn } from '../../common/dates';
import type { SiteCreateDto, SiteManagerAssignDto, SiteUpdateDto } from '../../common/dto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';

const siteInclude = {
  _count: { select: { blocks: true, units: true } },
  memberships: {
    where: { role: 'SITE_MANAGER' },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  },
} satisfies Prisma.SiteInclude;

export const APARTMENT_BLOCK_NAME = 'Bina';

type SiteWithRelations = Prisma.SiteGetPayload<{ include: typeof siteInclude }>;

function toDto(site: SiteWithRelations): SiteDto {
  return {
    id: site.id,
    name: site.name,
    kind: site.kind,
    address: site.address,
    city: site.city,
    createdAt: site.createdAt.toISOString(),
    blockCount: site._count.blocks,
    unitCount: site._count.units,
    managers: site.memberships.map((m) => m.user),
  };
}

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser): Promise<SiteDto[]> {
    const sites = await this.prisma.site.findMany({
      where: user.isPlatformAdmin ? {} : { memberships: { some: { userId: user.id } } },
      include: siteInclude,
      orderBy: { name: 'asc' },
    });
    return sites.map(toDto);
  }

  async get(user: AuthUser, siteId: string): Promise<SiteDto> {
    await this.assertAccess(user, siteId, false);
    return toDto(
      await this.prisma.site.findUniqueOrThrow({ where: { id: siteId }, include: siteInclude }),
    );
  }

  async create(input: SiteCreateDto): Promise<SiteDto> {
    const site = await this.prisma.$transaction(async (tx) => {
      const created = await tx.site.create({ data: input });
      if (created.kind === 'APARTMENT') {
        await tx.block.create({ data: { siteId: created.id, name: APARTMENT_BLOCK_NAME } });
      }
      return tx.site.findUniqueOrThrow({ where: { id: created.id }, include: siteInclude });
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Site',
      entityId: site.id,
      siteId: site.id,
      after: input,
    });
    return toDto(site);
  }

  async update(user: AuthUser, siteId: string, input: SiteUpdateDto): Promise<SiteDto> {
    await this.assertAccess(user, siteId, true);
    const before = await this.prisma.site.findUniqueOrThrow({
      where: { id: siteId },
      include: { _count: { select: { blocks: true } } },
    });
    if (input.kind === 'APARTMENT' && before.kind !== 'APARTMENT') {
      if (before._count.blocks > 1) {
        throw new BadRequestException(
          'Birden fazla bloğu olan site apartmana çevrilemez. Önce blokları birleştirin veya silin.',
        );
      }
      if (before._count.blocks === 0) {
        await this.prisma.block.create({ data: { siteId, name: APARTMENT_BLOCK_NAME } });
      }
    }
    const site = await this.prisma.site.update({
      where: { id: siteId },
      data: input,
      include: siteInclude,
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Site',
      entityId: siteId,
      siteId,
      before: { name: before.name, kind: before.kind, address: before.address, city: before.city },
      after: input,
    });
    return toDto(site);
  }

  async assignManager(siteId: string, input: SiteManagerAssignDto): Promise<SiteDto> {
    await this.prisma.site.findUniqueOrThrow({ where: { id: siteId } });

    const or = [
      ...(input.email ? [{ email: input.email }] : []),
      ...(input.phone ? [{ phone: input.phone }] : []),
    ];
    let user = await this.prisma.user.findFirst({ where: { OR: or } });
    if (!user) {
      if (!input.password) {
        throw new BadRequestException('Yeni kullanıcı için ilk şifre belirlenmelidir');
      }
      user = await this.prisma.user.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          passwordHash: await hashPassword(input.password),
        },
      });
    }

    await this.prisma.siteMembership.upsert({
      where: { siteId_userId: { siteId, userId: user.id } },
      create: { siteId, userId: user.id, role: 'SITE_MANAGER' },
      update: { role: 'SITE_MANAGER' },
    });
    await this.audit.record({
      action: 'MANAGER_ASSIGNED',
      entityType: 'Site',
      entityId: siteId,
      siteId,
      after: { userId: user.id },
    });
    return this.get({ id: user.id, isPlatformAdmin: true }, siteId);
  }

  async removeManager(siteId: string, userId: string): Promise<void> {
    const membership = await this.prisma.siteMembership.findUnique({
      where: { siteId_userId: { siteId, userId } },
    });
    if (membership?.role !== 'SITE_MANAGER') throw new NotFoundException('Yönetici bulunamadı');

    const livesHere = await this.prisma.occupancy.count({
      where: { siteId, userId, ...activeOn() },
    });
    if (livesHere > 0) {
      await this.prisma.siteMembership.update({
        where: { id: membership.id },
        data: { role: 'RESIDENT' },
      });
    } else {
      await this.prisma.siteMembership.delete({ where: { id: membership.id } });
    }
    await this.audit.record({
      action: 'MANAGER_REMOVED',
      entityType: 'Site',
      entityId: siteId,
      siteId,
      before: { userId },
    });
  }

  private async assertAccess(user: AuthUser, siteId: string, requireManager: boolean) {
    if (user.isPlatformAdmin) return;
    const membership = await this.prisma.siteMembership.findUnique({
      where: { siteId_userId: { siteId, userId: user.id } },
    });
    if (!membership) throw new NotFoundException('Site bulunamadı');
    if (requireManager && membership.role !== 'SITE_MANAGER') {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
  }
}

import type { AnnouncementAudience } from '@apartman/shared';
import { activeOn, dateOnly, todayInIstanbul } from '../../common/dates';
import type { Prisma } from '../../generated/prisma/client';
import type { TenantContext } from '../../tenancy/tenancy';

export interface AudienceTarget {
  audience: AnnouncementAudience;
  blockIds: string[];
  unitIds: string[];
}

export interface AudienceMember {
  userId: string;
  name: string;
  unitId: string;
  blockId: string;
  blockName: string;
  unitNumber: string;
}

export function reaches(target: AudienceTarget, unit: { unitId: string; blockId: string }) {
  if (target.audience === 'ALL') return true;
  if (target.audience === 'BLOCKS') return target.blockIds.includes(unit.blockId);
  return target.unitIds.includes(unit.unitId);
}

export const notExpired = (today = todayInIstanbul()): Prisma.AnnouncementWhereInput => ({
  OR: [{ expiresAt: null }, { expiresAt: { gte: dateOnly(today) } }],
});

export async function portalMembers(tenant: TenantContext): Promise<AudienceMember[]> {
  const occupancies = await tenant.db.occupancy.findMany({
    where: { userId: { not: null }, ...activeOn(), unit: { archivedAt: null } },
    include: {
      unit: { select: { number: true, blockId: true, block: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return occupancies.map((o) => ({
    userId: o.userId!,
    name: `${o.firstName} ${o.lastName}`,
    unitId: o.unitId,
    blockId: o.unit.blockId,
    blockName: o.unit.block.name,
    unitNumber: o.unit.number,
  }));
}

export function audienceOf(target: AudienceTarget, members: AudienceMember[]): AudienceMember[] {
  const seen = new Set<string>();
  return members.filter((m) => {
    if (!reaches(target, m) || seen.has(m.userId)) return false;
    seen.add(m.userId);
    return true;
  });
}

export async function residentAnnouncementWhere(
  tenant: TenantContext,
  userId: string,
): Promise<Prisma.AnnouncementWhereInput | null> {
  const occupancies = await tenant.db.occupancy.findMany({
    where: { userId, ...activeOn() },
    select: { unitId: true, unit: { select: { blockId: true } } },
  });
  if (occupancies.length === 0) return null;
  return {
    AND: [
      notExpired(),
      {
        OR: [
          { audience: 'ALL' },
          { audience: 'BLOCKS', blockIds: { hasSome: occupancies.map((o) => o.unit.blockId) } },
          { audience: 'UNITS', unitIds: { hasSome: occupancies.map((o) => o.unitId) } },
        ],
      },
    ],
  };
}

export async function announcementStats(
  tenant: TenantContext,
  announcements: (AudienceTarget & { id: string })[],
): Promise<Map<string, { readCount: number; audienceCount: number }>> {
  if (announcements.length === 0) return new Map();
  const [members, reads] = await Promise.all([
    portalMembers(tenant),
    tenant.db.announcementRead.findMany({
      where: { announcementId: { in: announcements.map((a) => a.id) } },
      select: { announcementId: true, userId: true },
    }),
  ]);
  return new Map(
    announcements.map((a) => {
      const audience = new Set(audienceOf(a, members).map((m) => m.userId));
      const readCount = reads.filter(
        (r) => r.announcementId === a.id && audience.has(r.userId),
      ).length;
      return [a.id, { readCount, audienceCount: audience.size }];
    }),
  );
}

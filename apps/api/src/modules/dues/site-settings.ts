import { BadRequestException } from '@nestjs/common';
import { periodOfDate, type DistributionMethod } from '@apartman/shared';
import { todayInIstanbul } from '../../common/dates';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

export const DEFAULT_DUE_DAY = 10;

export interface SiteSettings {
  duesDueDay?: number;
  proportionalDues?: boolean;
  onlinePayment?: { enabled: boolean; accountId: string | null };
}

type UnitDataField = 'areaM2' | 'landShare';

const requiredField: Record<DistributionMethod, UnitDataField | null> = {
  EQUAL: null,
  AREA: 'areaM2',
  LAND_SHARE: 'landShare',
};

const fieldMessages: Record<UnitDataField, string> = {
  areaM2: "Aidat m²'ye göre dağıtıldığı için daire alanı girilmelidir",
  landShare: 'Aidat arsa payına göre dağıtıldığı için arsa payı girilmelidir',
};

export function currentPeriod(): string {
  return periodOfDate(todayInIstanbul());
}

export function readSiteSettings(value: Prisma.JsonValue | null | undefined): SiteSettings {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as SiteSettings) : {};
}

export async function loadSiteSettings(prisma: PrismaService, siteId: string) {
  const site = await prisma.site.findUniqueOrThrow({
    where: { id: siteId },
    select: { settings: true },
  });
  return readSiteSettings(site.settings);
}

export function assertMethodAllowed(settings: SiteSettings, method: DistributionMethod): void {
  if (method !== 'EQUAL' && !settings.proportionalDues) {
    throw new BadRequestException(
      'Bu yerde aidat yalnızca daire başı eşit dağıtılır. Oranlı dağıtım site ayarlarından açılabilir.',
    );
  }
}

export async function activeDuesMethods(
  prisma: PrismaService,
  siteId: string,
): Promise<{ current: DistributionMethod | null; all: DistributionMethod[] }> {
  const plans = await prisma.duesPlan.findMany({
    where: { siteId },
    orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    select: { method: true, validFrom: true },
  });
  const now = currentPeriod();
  const currentIndex = plans.findIndex((p) => p.validFrom <= now);
  const active = currentIndex === -1 ? plans : plans.slice(0, currentIndex + 1);
  return {
    current: currentIndex === -1 ? null : plans[currentIndex]!.method,
    all: [...new Set(active.map((p) => p.method))],
  };
}

export function requiredUnitFields(methods: DistributionMethod[]): UnitDataField[] {
  return methods.map((m) => requiredField[m]).filter((f): f is UnitDataField => f !== null);
}

export function assertUnitData(
  fields: UnitDataField[],
  unit: { areaM2: number | null; landShare: number | null },
): void {
  for (const field of fields) {
    if (unit[field] == null) throw new BadRequestException(fieldMessages[field]);
  }
}

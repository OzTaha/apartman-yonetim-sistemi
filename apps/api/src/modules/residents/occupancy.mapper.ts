import type { OccupancyDto } from '@apartman/shared';
import { toDateString } from '../../common/dates';
import type { Prisma } from '../../generated/prisma/client';

export const occupancyInclude = {
  unit: { select: { number: true, block: { select: { name: true } } } },
  user: { select: { passwordHash: true } },
} satisfies Prisma.OccupancyInclude;

export type OccupancyWithRelations = Prisma.OccupancyGetPayload<{
  include: typeof occupancyInclude;
}>;

export function toOccupancyDto(o: OccupancyWithRelations): OccupancyDto {
  return {
    id: o.id,
    unitId: o.unitId,
    blockName: o.unit.block.name,
    unitNumber: o.unit.number,
    userId: o.userId,
    firstName: o.firstName,
    lastName: o.lastName,
    phone: o.phone,
    email: o.email,
    type: o.type,
    startDate: toDateString(o.startDate),
    endDate: o.endDate ? toDateString(o.endDate) : null,
    isResponsibleForDues: o.isResponsibleForDues,
    contactConsent: o.contactConsent,
    contactConsentAt: o.contactConsentAt?.toISOString() ?? null,
    notes: o.notes,
    hasAccount: Boolean(o.user?.passwordHash),
  };
}

export function compareUnits(
  a: { blockName: string; number: string },
  b: { blockName: string; number: string },
): number {
  return (
    a.blockName.localeCompare(b.blockName, 'tr', { numeric: true }) ||
    a.number.localeCompare(b.number, 'tr', { numeric: true })
  );
}

import { chargeState, periodLabel, type ChargeDto, type PaymentDto } from '@apartman/shared';
import { toDateString } from '../../common/dates';
import type { Prisma } from '../../generated/prisma/client';

export const DUES_CODE = 'DUES';

export const DEFAULT_CHARGE_TYPES: { code: string; name: string }[] = [
  { code: DUES_CODE, name: 'Aidat' },
  { code: 'FIXTURE', name: 'Demirbaş' },
  { code: 'FUEL', name: 'Yakıt' },
  { code: 'OPENING', name: 'Devreden borç' },
];

export const chargeInclude = {
  unit: { select: { number: true, block: { select: { name: true } } } },
  chargeType: { select: { name: true, code: true } },
  allocations: { select: { amountKurus: true } },
} satisfies Prisma.ChargeInclude;

export type ChargeWithRelations = Prisma.ChargeGetPayload<{ include: typeof chargeInclude }>;

export function chargeLabel(c: {
  period: string | null;
  description: string | null;
  chargeType: { name: string };
}): string {
  return [c.chargeType.name, c.period ? periodLabel(c.period) : null, c.description]
    .filter(Boolean)
    .join(' · ');
}

export function toChargeDto(c: ChargeWithRelations, today: string): ChargeDto {
  const paidKurus = c.allocations.reduce((sum, a) => sum + a.amountKurus, 0);
  const dueDate = toDateString(c.dueDate);
  const state = chargeState(c.amountKurus, paidKurus, dueDate, today);
  return {
    id: c.id,
    unitId: c.unitId,
    blockName: c.unit.block.name,
    unitNumber: c.unit.number,
    chargeTypeId: c.chargeTypeId,
    chargeTypeName: c.chargeType.name,
    period: c.period,
    description: c.description,
    label: chargeLabel(c),
    amountKurus: c.amountKurus,
    paidKurus,
    remainingKurus: state.remainingKurus,
    issueDate: toDateString(c.issueDate),
    dueDate,
    status: state.status,
    overdue: c.cancelledAt ? false : state.overdue,
    isDues: c.chargeType.code === DUES_CODE,
    cancelledAt: c.cancelledAt?.toISOString() ?? null,
    cancelReason: c.cancelReason,
  };
}

export const paymentInclude = {
  unit: { select: { number: true, block: { select: { name: true } } } },
  allocations: {
    select: {
      chargeId: true,
      amountKurus: true,
      charge: {
        select: { period: true, description: true, chargeType: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

export type PaymentWithRelations = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export function toPaymentDto(p: PaymentWithRelations): PaymentDto {
  return {
    id: p.id,
    unitId: p.unitId,
    blockName: p.unit.block.name,
    unitNumber: p.unit.number,
    amountKurus: p.amountKurus,
    method: p.method,
    paidAt: toDateString(p.paidAt),
    reference: p.reference,
    note: p.note,
    createdAt: p.createdAt.toISOString(),
    cancelledAt: p.cancelledAt?.toISOString() ?? null,
    cancelReason: p.cancelReason,
    allocations: p.allocations.map((a) => ({
      chargeId: a.chargeId,
      label: chargeLabel(a.charge),
      amountKurus: a.amountKurus,
    })),
  };
}

export function byDueOrder(
  a: { dueDate: Date; issueDate: Date; createdAt: Date },
  b: { dueDate: Date; issueDate: Date; createdAt: Date },
): number {
  return (
    a.dueDate.getTime() - b.dueDate.getTime() ||
    a.issueDate.getTime() - b.issueDate.getTime() ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

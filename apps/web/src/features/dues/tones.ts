import { chargeStatusLabels, type ChargeStatus } from '@apartman/shared';

export type CellTone = 'paid' | 'partial' | 'overdue' | 'pending';

export function toneOf(status: ChargeStatus, overdue: boolean): CellTone {
  if (status === 'PAID') return 'paid';
  if (overdue) return 'overdue';
  if (status === 'PARTIAL') return 'partial';
  return 'pending';
}

export const toneClasses: Record<CellTone, string> = {
  paid: 'bg-emerald-500 text-white',
  partial: 'bg-amber-400 text-amber-950',
  overdue: 'bg-red-500 text-white',
  pending: 'bg-muted text-muted-foreground',
};

export const toneLabels: Record<CellTone, string> = {
  paid: chargeStatusLabels.PAID,
  partial: chargeStatusLabels.PARTIAL,
  overdue: chargeStatusLabels.OVERDUE,
  pending: 'Vadesi gelmedi',
};

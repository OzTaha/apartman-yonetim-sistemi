import type { Kurus } from './money';

export const MONTH_NAMES_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidPeriod(value: string): boolean {
  return PERIOD_PATTERN.test(value);
}

export function periodOfDate(date: string): string {
  return date.slice(0, 7);
}

export function periodLabel(period: string): string {
  const [year, month] = period.split('-');
  return `${MONTH_NAMES_TR[Number(month) - 1] ?? month} ${year}`;
}

export function addMonths(period: string, months: number): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function periodRange(from: string, to: string): string[] {
  const result: string[] = [];
  for (let p = from; p <= to; p = addMonths(p, 1)) result.push(p);
  return result;
}

export function dueDateFor(period: string, dueDay: number): string {
  return `${period}-${String(dueDay).padStart(2, '0')}`;
}

export type DistributionMethod = 'EQUAL' | 'AREA' | 'LAND_SHARE';

export const distributionMethodLabels: Record<DistributionMethod, string> = {
  EQUAL: 'Eşit',
  AREA: 'm²’ye göre',
  LAND_SHARE: 'Arsa payına göre',
};

export class DistributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DistributionError';
  }
}

export function distributeAmount(total: Kurus, weights: number[]): Kurus[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new DistributionError('Toplam tutar pozitif kuruş olmalıdır');
  }
  if (weights.length === 0) return [];
  const scaled = weights.map((w) => {
    if (!Number.isFinite(w) || w < 0) throw new DistributionError('Ağırlıklar negatif olamaz');
    return BigInt(Math.round(w * 100));
  });
  const sum = scaled.reduce((a, b) => a + b, 0n);
  if (sum === 0n) throw new DistributionError('Dağıtım için ağırlıkların toplamı sıfır olamaz');

  const t = BigInt(total);
  const base = scaled.map((w) => (t * w) / sum);
  const remainders = scaled.map((w, i) => t * w - base[i]! * sum);
  let left = Number(t - base.reduce((a, b) => a + b, 0n));

  const order = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const result = base.map(Number);
  for (const { i } of order) {
    if (left === 0) break;
    result[i]! += 1;
    left -= 1;
  }
  return result;
}

export interface DistributableUnit {
  id: string;
  label: string;
  areaM2: number | null;
  landShare: number | null;
}

export function computeUnitAmounts(
  plan: { method: DistributionMethod; amountKurus: Kurus },
  units: DistributableUnit[],
): Kurus[] {
  if (plan.method === 'EQUAL') return units.map(() => plan.amountKurus);

  const field = plan.method === 'AREA' ? 'areaM2' : 'landShare';
  const missing = units.filter((u) => !u[field] || u[field]! <= 0);
  if (missing.length > 0) {
    const what = plan.method === 'AREA' ? 'm²' : 'arsa payı';
    const list = missing
      .slice(0, 10)
      .map((u) => u.label)
      .join(', ');
    const more = missing.length > 10 ? ` ve ${missing.length - 10} daire daha` : '';
    throw new DistributionError(`Şu dairelerin ${what} bilgisi eksik: ${list}${more}`);
  }
  return distributeAmount(
    plan.amountKurus,
    units.map((u) => u[field]!),
  );
}

export type ChargeStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface ChargeState {
  status: ChargeStatus;
  overdue: boolean;
  remainingKurus: Kurus;
}

export function chargeState(
  amount: Kurus,
  paid: Kurus,
  dueDate: string,
  today: string,
): ChargeState {
  const remainingKurus = Math.max(amount - paid, 0);
  const status: ChargeStatus = remainingKurus === 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
  return { status, overdue: remainingKurus > 0 && dueDate < today, remainingKurus };
}

export const chargeStatusLabels: Record<ChargeStatus | 'OVERDUE', string> = {
  PAID: 'Ödendi',
  PARTIAL: 'Eksik ödendi',
  UNPAID: 'Ödenmedi',
  OVERDUE: 'Gecikmiş',
};

export interface OpenCharge {
  id: string;
  remainingKurus: Kurus;
}

export interface Allocation {
  chargeId: string;
  amountKurus: Kurus;
}

export class AllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllocationError';
  }
}

export function allocatePayment(amount: Kurus, openCharges: OpenCharge[]): Allocation[] {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AllocationError('Ödeme tutarı sıfırdan büyük olmalıdır');
  }
  const totalOpen = openCharges.reduce((sum, c) => sum + c.remainingKurus, 0);
  if (amount > totalOpen) {
    throw new AllocationError(
      totalOpen === 0
        ? 'Bu dairenin açık borcu yok. Borçtan fazla ödeme kabul edilmez.'
        : 'Ödeme tutarı dairenin açık borcundan fazla. Borçtan fazla ödeme kabul edilmez.',
    );
  }
  const allocations: Allocation[] = [];
  let left = amount;
  for (const charge of openCharges) {
    if (left === 0) break;
    const take = Math.min(left, charge.remainingKurus);
    if (take > 0) {
      allocations.push({ chargeId: charge.id, amountKurus: take });
      left -= take;
    }
  }
  return allocations;
}

export function validateManualAllocation(
  amount: Kurus,
  allocations: Allocation[],
  openCharges: OpenCharge[],
): Allocation[] {
  const open = new Map(openCharges.map((c) => [c.id, c.remainingKurus]));
  const seen = new Set<string>();
  let sum = 0;
  for (const a of allocations) {
    if (!Number.isSafeInteger(a.amountKurus) || a.amountKurus <= 0) {
      throw new AllocationError('Dağıtılan tutarlar sıfırdan büyük olmalıdır');
    }
    if (seen.has(a.chargeId)) throw new AllocationError('Aynı borç birden fazla kez seçilmiş');
    seen.add(a.chargeId);
    const remaining = open.get(a.chargeId);
    if (remaining === undefined)
      throw new AllocationError('Seçilen borç bu dairenin açık borçları arasında değil');
    if (a.amountKurus > remaining)
      throw new AllocationError('Bir borca kalan tutarından fazla ödeme dağıtılamaz');
    sum += a.amountKurus;
  }
  if (sum !== amount)
    throw new AllocationError('Dağıtılan tutarların toplamı ödeme tutarına eşit olmalıdır');
  return allocations;
}

export interface LedgerEntry {
  date: string;
  kind: 'CHARGE' | 'PAYMENT';
  description: string;
  amountKurus: Kurus;
  sortKey?: string;
}

export interface StatementRow {
  date: string;
  kind: 'CHARGE' | 'PAYMENT';
  description: string;
  debitKurus: Kurus;
  creditKurus: Kurus;
  balanceKurus: Kurus;
}

export interface Statement {
  from: string;
  to: string;
  openingKurus: Kurus;
  rows: StatementRow[];
  totalDebitKurus: Kurus;
  totalCreditKurus: Kurus;
  closingKurus: Kurus;
}

export function buildStatement(entries: LedgerEntry[], from: string, to: string): Statement {
  const sorted = [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.kind === b.kind ? 0 : a.kind === 'CHARGE' ? -1 : 1) ||
      (a.sortKey ?? '').localeCompare(b.sortKey ?? ''),
  );
  const signed = (e: LedgerEntry) => (e.kind === 'CHARGE' ? e.amountKurus : -e.amountKurus);

  const openingKurus = sorted.filter((e) => e.date < from).reduce((sum, e) => sum + signed(e), 0);
  let balance = openingKurus;
  let totalDebitKurus = 0;
  let totalCreditKurus = 0;
  const rows: StatementRow[] = [];
  for (const e of sorted) {
    if (e.date < from || e.date > to) continue;
    balance += signed(e);
    const debit = e.kind === 'CHARGE' ? e.amountKurus : 0;
    const credit = e.kind === 'PAYMENT' ? e.amountKurus : 0;
    totalDebitKurus += debit;
    totalCreditKurus += credit;
    rows.push({
      date: e.date,
      kind: e.kind,
      description: e.description,
      debitKurus: debit,
      creditKurus: credit,
      balanceKurus: balance,
    });
  }
  return { from, to, openingKurus, rows, totalDebitKurus, totalCreditKurus, closingKurus: balance };
}

export function splitTotal(
  method: DistributionMethod,
  totalKurus: Kurus,
  units: DistributableUnit[],
): Kurus[] {
  if (method === 'EQUAL') {
    return distributeAmount(
      totalKurus,
      units.map(() => 1),
    );
  }
  return computeUnitAmounts({ method, amountKurus: totalKurus }, units);
}

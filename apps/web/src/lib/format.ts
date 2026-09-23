import { formatTrPhone } from '@apartman/shared';

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

export function formatPhone(value: string | null | undefined): string {
  return value ? formatTrPhone(value) : '—';
}

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

export function safeRedirect(target: string | undefined): string {
  return target && target.startsWith('/') && !target.startsWith('//') ? target : '/';
}

export function isActiveOccupancy(o: { endDate: string | null }): boolean {
  return o.endDate === null || o.endDate >= todayIso();
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

export function toNumberOrUndefined(value: unknown): number | undefined {
  return toNumberOrNull(value) ?? undefined;
}

import { formatDate } from '@/lib/format';

export function formatLocalDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return `${formatDate(value.slice(0, 10))} ${value.slice(11, 16)}`;
}

export function plusDays(local: string, days: number): string {
  const date = new Date(`${local.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.toISOString().slice(0, 10)}${local.slice(10)}`;
}

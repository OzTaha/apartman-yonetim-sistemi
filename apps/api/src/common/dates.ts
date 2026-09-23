const istanbulDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayInIstanbul(now = new Date()): string {
  return istanbulDateFormatter.format(now);
}

export function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function activeOn(today = todayInIstanbul()) {
  return { OR: [{ endDate: null }, { endDate: { gte: dateOnly(today) } }] };
}

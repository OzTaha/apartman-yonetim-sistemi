import {
  requestCategoryLabels,
  requestLocationLabels,
  type RequestCategory,
  type RequestLocation,
} from '@apartman/shared';

const dateTime = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

export function formatDateTime(iso: string) {
  return dateTime.format(new Date(iso));
}

export function requestSubtitle(r: {
  number: number;
  category: RequestCategory;
  location: RequestLocation;
}) {
  return `#${r.number} · ${requestCategoryLabels[r.category]} · ${requestLocationLabels[r.location]}`;
}

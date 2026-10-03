import {
  requestCategoryLabels,
  requestLocationLabels,
  staffMessageCategoryLabels,
  type RequestCategory,
  type RequestLocation,
} from '@apartman/shared';
import { labelUnit } from '@/lib/unit-label';

const dateTime = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

export function formatDateTime(iso: string) {
  return dateTime.format(new Date(iso));
}

function categoryLabel(category: RequestCategory, fromStaff: boolean) {
  if (fromStaff && category in staffMessageCategoryLabels) {
    return staffMessageCategoryLabels[category as keyof typeof staffMessageCategoryLabels];
  }
  return requestCategoryLabels[category];
}

export function requestSubtitle(r: {
  number: number;
  category: RequestCategory;
  location: RequestLocation;
  fromStaff: boolean;
}) {
  if (r.fromStaff) return `#${r.number} · Görevliden · ${categoryLabel(r.category, true)}`;
  return `#${r.number} · ${requestCategoryLabels[r.category]} · ${requestLocationLabels[r.location]}`;
}

export function requestCategoryText(r: { category: RequestCategory; fromStaff: boolean }) {
  return categoryLabel(r.category, r.fromStaff);
}

export function requestPlace(
  r: { blockName: string | null; unitNumber: string | null },
  style: 'long' | 'short' = 'long',
) {
  return r.blockName !== null && r.unitNumber !== null
    ? labelUnit(r.blockName, r.unitNumber, style)
    : 'Görevli';
}

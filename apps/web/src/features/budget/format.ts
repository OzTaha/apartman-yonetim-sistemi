import { formatKurus, type DistributionMethod, type Kurus } from '@apartman/shared';

export function advanceLabel(b: { method: DistributionMethod; advanceKurus: Kurus }): string {
  return b.method === 'EQUAL'
    ? `Daire başı ${formatKurus(b.advanceKurus)} / ay`
    : `Aylık toplam ${formatKurus(b.advanceKurus)}`;
}

export function usagePercent(planned: Kurus, actual: Kurus): number | null {
  return planned > 0 ? Math.round((actual / planned) * 100) : null;
}

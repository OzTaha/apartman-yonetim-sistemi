import type { DistributionMethod } from '@apartman/shared';
import { todayIso } from '@/lib/format';
import { useChargeTypes } from '@/lib/queries';
import { useIsApartment } from '@/lib/unit-label';

export interface ReflectValue {
  chargeTypeId: string;
  method: DistributionMethod;
  issueDate: string;
  dueDate: string;
}

export function useReflectDefaults(): ReflectValue {
  const types = useChargeTypes();
  const active = (types.data ?? []).filter((t) => t.isActive);
  return {
    chargeTypeId: (active.find((t) => t.code === 'FIXTURE') ?? active[0])?.id ?? '',
    method: 'EQUAL',
    issueDate: todayIso(),
    dueDate: todayIso(),
  };
}

export function reflectError(value: ReflectValue): string | null {
  if (!value.chargeTypeId) return 'Borç türü seçin';
  if (!value.issueDate || !value.dueDate) return 'Tarihleri girin';
  if (value.dueDate < value.issueDate) return 'Son ödeme tarihi borç tarihinden önce olamaz';
  return null;
}

export function useScopeLabel() {
  const isApartment = useIsApartment();
  return (blockName: string | null) =>
    !isApartment && blockName ? `${blockName} Blok daireleri` : 'tüm daireler';
}

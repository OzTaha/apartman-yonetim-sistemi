export interface BulkUnitPlanInput {
  startNumber: number;
  endNumber: number;
  unitsPerFloor?: number;
  startFloor?: number;
}

export interface PlannedUnit {
  number: string;
  floor: number | null;
}

export const MAX_BULK_UNITS = 500;

export function planBulkUnits(input: BulkUnitPlanInput): PlannedUnit[] {
  const { startNumber, endNumber, unitsPerFloor, startFloor = 1 } = input;
  if (!Number.isInteger(startNumber) || !Number.isInteger(endNumber) || startNumber < 1) {
    throw new RangeError('Daire numaraları pozitif tam sayı olmalıdır');
  }
  if (endNumber < startNumber) throw new RangeError('Bitiş numarası başlangıçtan küçük olamaz');
  if (endNumber - startNumber + 1 > MAX_BULK_UNITS) {
    throw new RangeError(`Tek seferde en fazla ${MAX_BULK_UNITS} daire oluşturulabilir`);
  }

  const units: PlannedUnit[] = [];
  for (let n = startNumber; n <= endNumber; n++) {
    const floor = unitsPerFloor ? startFloor + Math.floor((n - startNumber) / unitsPerFloor) : null;
    units.push({ number: String(n), floor });
  }
  return units;
}

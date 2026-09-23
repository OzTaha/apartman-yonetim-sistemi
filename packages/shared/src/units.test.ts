import { describe, expect, it } from 'vitest';
import { MAX_BULK_UNITS, planBulkUnits } from './units';

describe('planBulkUnits', () => {
  it('kat başına daire sayısına göre katları hesaplar', () => {
    const units = planBulkUnits({ startNumber: 1, endNumber: 5, unitsPerFloor: 2 });
    expect(units).toEqual([
      { number: '1', floor: 1 },
      { number: '2', floor: 1 },
      { number: '3', floor: 2 },
      { number: '4', floor: 2 },
      { number: '5', floor: 3 },
    ]);
  });

  it('başlangıç katını dikkate alır (zemin kat = 0)', () => {
    const units = planBulkUnits({
      startNumber: 10,
      endNumber: 13,
      unitsPerFloor: 2,
      startFloor: 0,
    });
    expect(units.map((u) => u.floor)).toEqual([0, 0, 1, 1]);
  });

  it('kat bilgisi verilmezse kat boş kalır', () => {
    expect(planBulkUnits({ startNumber: 1, endNumber: 2 })).toEqual([
      { number: '1', floor: null },
      { number: '2', floor: null },
    ]);
  });

  it('hatalı aralıkları reddeder', () => {
    expect(() => planBulkUnits({ startNumber: 5, endNumber: 1 })).toThrow(RangeError);
    expect(() => planBulkUnits({ startNumber: 0, endNumber: 1 })).toThrow(RangeError);
    expect(() => planBulkUnits({ startNumber: 1, endNumber: MAX_BULK_UNITS + 1 })).toThrow(
      RangeError,
    );
  });
});

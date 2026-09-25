import { describe, expect, it } from 'vitest';
import { checkoutSchema, fitToOpenCharges } from './online';

const items = [
  { chargeId: 'eylul', amountKurus: 150_000 },
  { chargeId: 'ekim', amountKurus: 150_000 },
];

describe('online ödemenin açık borçlara sığdırılması', () => {
  it('borçlar hâlâ açıksa tamamı işlenir', () => {
    const remaining = new Map([
      ['eylul', 150_000],
      ['ekim', 150_000],
    ]);
    expect(fitToOpenCharges(items, remaining)).toEqual({
      allocations: items,
      appliedKurus: 300_000,
      excessKurus: 0,
    });
  });

  it('bu arada kısmen ödenen borçta fazla kısım iade edilecek tutara ayrılır', () => {
    const remaining = new Map([
      ['eylul', 50_000],
      ['ekim', 150_000],
    ]);
    expect(fitToOpenCharges(items, remaining)).toEqual({
      allocations: [
        { chargeId: 'eylul', amountKurus: 50_000 },
        { chargeId: 'ekim', amountKurus: 150_000 },
      ],
      appliedKurus: 200_000,
      excessKurus: 100_000,
    });
  });

  it('kapanan veya iptal edilen borca hiçbir şey yazılmaz, hepsi iade edilir', () => {
    const remaining = new Map([['eylul', 0]]);
    expect(fitToOpenCharges(items, remaining)).toEqual({
      allocations: [],
      appliedKurus: 0,
      excessKurus: 300_000,
    });
  });

  it('en az bir borç seçilmesini ister', () => {
    const unitId = '0190a000-0000-7000-8000-000000000001';
    expect(checkoutSchema.safeParse({ unitId, chargeIds: [] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ unitId, chargeIds: [unitId] }).success).toBe(true);
  });
});

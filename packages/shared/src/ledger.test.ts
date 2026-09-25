import { describe, expect, it } from 'vitest';
import {
  splitTotal,
  AllocationError,
  DistributionError,
  addMonths,
  allocatePayment,
  buildStatement,
  chargeState,
  computeUnitAmounts,
  distributeAmount,
  dueDateFor,
  periodLabel,
  periodRange,
  validateManualAllocation,
} from './ledger';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('dönem yardımcıları', () => {
  it('ay ekler ve yıl geçişini doğru yapar', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-09', 0)).toBe('2026-09');
  });

  it('dönem aralığı ve etiket üretir', () => {
    expect(periodRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(periodLabel('2026-09')).toBe('Eylül 2026');
    expect(dueDateFor('2026-02', 5)).toBe('2026-02-05');
  });
});

describe('distributeAmount', () => {
  it('eşit dağıtımda artan kuruşları baştaki dairelere verir ve toplamı korur', () => {
    const result = distributeAmount(100_000, [1, 1, 1]);
    expect(sum(result)).toBe(100_000);
    expect(result).toEqual([33_334, 33_333, 33_333]);
  });

  it('m²’ye göre oranlar ve toplam her zaman girilen tutara eşittir', () => {
    const result = distributeAmount(1_000_000, [95, 120, 95.5, 120]);
    expect(sum(result)).toBe(1_000_000);
    expect(result[2]!).toBeGreaterThan(result[0]!);
    expect(result[1]).toBe(result[3]);
  });

  it('artan kuruşu en büyük kesire sahip daireye verir', () => {
    expect(distributeAmount(10, [1, 2])).toEqual([3, 7]);
  });

  it('çok büyük tutarlarda taşma olmaz', () => {
    const result = distributeAmount(9_000_000_000_000, [123.45, 678.9, 1]);
    expect(sum(result)).toBe(9_000_000_000_000);
  });

  it('rastgele girdilerde toplam korunur ve her pay orana en fazla 1 kuruş uzaktır', () => {
    for (let run = 0; run < 200; run++) {
      const total = Math.floor(Math.random() * 10_000_000);
      const weights = Array.from(
        { length: 1 + Math.floor(Math.random() * 40) },
        () => Math.round(Math.random() * 20_000) / 100 + 1,
      );
      const result = distributeAmount(total, weights);
      expect(sum(result)).toBe(total);
      const w = sum(weights.map((x) => Math.round(x * 100)));
      result.forEach((r, i) => {
        const exact = (total * Math.round(weights[i]! * 100)) / w;
        expect(Math.abs(r - exact)).toBeLessThan(1.000001);
      });
    }
  });

  it('geçersiz girdileri reddeder', () => {
    expect(() => distributeAmount(100, [0, 0])).toThrow(DistributionError);
    expect(() => distributeAmount(100, [1, -1])).toThrow(DistributionError);
    expect(() => distributeAmount(10.5, [1])).toThrow(DistributionError);
    expect(distributeAmount(100, [])).toEqual([]);
  });
});

describe('computeUnitAmounts', () => {
  const units = [
    { id: 'a', label: 'A-1', areaM2: 100, landShare: 10 },
    { id: 'b', label: 'A-2', areaM2: 50, landShare: 30 },
  ];

  it('eşit yöntemde tutar daire başıdır', () => {
    expect(computeUnitAmounts({ method: 'EQUAL', amountKurus: 150_000 }, units)).toEqual([
      150_000, 150_000,
    ]);
  });

  it('m² ve arsa payı yönteminde toplam dağıtılır', () => {
    expect(computeUnitAmounts({ method: 'AREA', amountKurus: 300_000 }, units)).toEqual([
      200_000, 100_000,
    ]);
    expect(computeUnitAmounts({ method: 'LAND_SHARE', amountKurus: 400_000 }, units)).toEqual([
      100_000, 300_000,
    ]);
  });

  it('bilgisi eksik daireleri açıkça listeler', () => {
    const withMissing = [...units, { id: 'c', label: 'B-7', areaM2: null, landShare: null }];
    expect(() => computeUnitAmounts({ method: 'AREA', amountKurus: 1000 }, withMissing)).toThrow(
      'Şu dairelerin m² bilgisi eksik: B-7',
    );
  });
});

describe('chargeState', () => {
  it.each([
    [1000, 1000, '2026-09-10', '2026-09-20', 'PAID', false, 0],
    [1000, 400, '2026-09-10', '2026-09-05', 'PARTIAL', false, 600],
    [1000, 400, '2026-09-10', '2026-09-11', 'PARTIAL', true, 600],
    [1000, 0, '2026-09-10', '2026-09-10', 'UNPAID', false, 1000],
    [1000, 0, '2026-09-10', '2026-10-01', 'UNPAID', true, 1000],
  ] as const)(
    '%i/%i vade %s bugün %s → %s',
    (amount, paid, due, today, status, overdue, remaining) => {
      expect(chargeState(amount, paid, due, today)).toEqual({
        status,
        overdue,
        remainingKurus: remaining,
      });
    },
  );
});

describe('allocatePayment', () => {
  const open = [
    { id: 'eylul', remainingKurus: 1500 },
    { id: 'ekim', remainingKurus: 1500 },
    { id: 'kasim', remainingKurus: 1500 },
  ];

  it('en eski borçtan başlayarak kapatır', () => {
    expect(allocatePayment(2000, open)).toEqual([
      { chargeId: 'eylul', amountKurus: 1500 },
      { chargeId: 'ekim', amountKurus: 500 },
    ]);
  });

  it('borcun tamamını kapatabilir', () => {
    expect(allocatePayment(4500, open)).toHaveLength(3);
  });

  it('borçtan fazla ödemeyi reddeder', () => {
    expect(() => allocatePayment(4501, open)).toThrow(AllocationError);
    expect(() => allocatePayment(100, [])).toThrow('Bu dairenin açık borcu yok');
  });

  it('sıfır veya kesirli tutarı reddeder', () => {
    expect(() => allocatePayment(0, open)).toThrow(AllocationError);
    expect(() => allocatePayment(10.5, open)).toThrow(AllocationError);
  });
});

describe('validateManualAllocation', () => {
  const open = [
    { id: 'eylul', remainingKurus: 1500 },
    { id: 'ekim', remainingKurus: 1500 },
  ];

  it('geçerli elle dağıtımı kabul eder (ör. Ekim ödenir, Eylül borçlu kalır)', () => {
    const allocations = [{ chargeId: 'ekim', amountKurus: 1500 }];
    expect(validateManualAllocation(1500, allocations, open)).toEqual(allocations);
  });

  it('toplam uyuşmazlığını, kalan tutarı aşmayı ve yabancı borcu reddeder', () => {
    expect(() =>
      validateManualAllocation(1500, [{ chargeId: 'ekim', amountKurus: 1000 }], open),
    ).toThrow('toplamı');
    expect(() =>
      validateManualAllocation(2000, [{ chargeId: 'ekim', amountKurus: 2000 }], open),
    ).toThrow('kalan tutarından');
    expect(() =>
      validateManualAllocation(100, [{ chargeId: 'baska', amountKurus: 100 }], open),
    ).toThrow('açık borçları arasında değil');
    expect(() =>
      validateManualAllocation(
        200,
        [
          { chargeId: 'ekim', amountKurus: 100 },
          { chargeId: 'ekim', amountKurus: 100 },
        ],
        open,
      ),
    ).toThrow('birden fazla');
  });
});

describe('buildStatement', () => {
  const entries = [
    { date: '2026-07-01', kind: 'CHARGE' as const, description: 'Aidat Temmuz', amountKurus: 1500 },
    { date: '2026-07-05', kind: 'PAYMENT' as const, description: 'Ödeme', amountKurus: 1500 },
    {
      date: '2026-08-01',
      kind: 'CHARGE' as const,
      description: 'Aidat Ağustos',
      amountKurus: 1500,
    },
    { date: '2026-09-01', kind: 'PAYMENT' as const, description: 'Ödeme', amountKurus: 1000 },
    { date: '2026-09-01', kind: 'CHARGE' as const, description: 'Aidat Eylül', amountKurus: 1500 },
  ];

  it('devreden bakiye ve yürüyen bakiye hesaplar; aynı gün önce borç yazılır', () => {
    const s = buildStatement(entries, '2026-08-01', '2026-09-30');
    expect(s.openingKurus).toBe(0);
    expect(s.rows.map((r) => [r.description, r.balanceKurus])).toEqual([
      ['Aidat Ağustos', 1500],
      ['Aidat Eylül', 3000],
      ['Ödeme', 2000],
    ]);
    expect(s.totalDebitKurus).toBe(3000);
    expect(s.totalCreditKurus).toBe(1000);
    expect(s.closingKurus).toBe(2000);
  });

  it('aralık dışındaki eski hareketleri devreden bakiyeye katar', () => {
    const s = buildStatement(entries, '2026-09-01', '2026-09-30');
    expect(s.openingKurus).toBe(1500);
    expect(s.closingKurus).toBe(2000);
  });
});

describe('splitTotal', () => {
  const units = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    label: String(i + 1),
    areaM2: null,
    landShare: null,
  }));

  it('eşit bölmede toplam tutar daire sayısına bölünür', () => {
    expect(splitTotal('EQUAL', 10_000_000, units)).toEqual(Array(10).fill(1_000_000));
  });

  it('bölünmeyen kuruşlar ilk dairelere dağıtılır, toplam korunur', () => {
    const amounts = splitTotal('EQUAL', 100_003, units.slice(0, 3));
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(100_003);
    expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
  });
});

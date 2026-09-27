import { describe, expect, it } from 'vitest';
import {
  budgetAdvanceAmount,
  budgetEndPeriod,
  budgetUpdateSchema,
  elapsedBudgetMonths,
  roundUpToLira,
} from './budget';

describe('budgetAdvanceAmount', () => {
  it('eşit dağıtımda daire başı aylık avansı tam liraya yukarı yuvarlar', () => {
    expect(budgetAdvanceAmount(42_000_000, 'EQUAL', 20)).toBe(175_000);
    expect(budgetAdvanceAmount(10_000_000, 'EQUAL', 7)).toBe(119_100);
  });

  it('oranlı dağıtımda aylık toplamı döndürür', () => {
    expect(budgetAdvanceAmount(42_000_000, 'AREA', 20)).toBe(3_500_000);
    expect(budgetAdvanceAmount(1_000_001, 'LAND_SHARE', 3)).toBe(83_400);
  });

  it('boş bütçe veya dairesiz sitede sıfırdır', () => {
    expect(budgetAdvanceAmount(0, 'EQUAL', 10)).toBe(0);
    expect(budgetAdvanceAmount(1_000_000, 'EQUAL', 0)).toBe(0);
  });
});

describe('dönem hesapları', () => {
  it('bütçe 12 ay sürer ve yıl değiştirebilir', () => {
    expect(budgetEndPeriod('2026-01')).toBe('2026-12');
    expect(budgetEndPeriod('2026-04')).toBe('2027-03');
  });

  it('geçen ay sayısı 0 ile 12 arasındadır', () => {
    expect(elapsedBudgetMonths('2026-04', '2026-03')).toBe(0);
    expect(elapsedBudgetMonths('2026-04', '2026-04')).toBe(1);
    expect(elapsedBudgetMonths('2026-04', '2027-01')).toBe(10);
    expect(elapsedBudgetMonths('2026-04', '2028-01')).toBe(12);
  });

  it('roundUpToLira kuruşları yukarı tamamlar', () => {
    expect(roundUpToLira(100)).toBe(100);
    expect(roundUpToLira(101)).toBe(200);
  });
});

describe('budgetUpdateSchema', () => {
  it('aynı kategori iki kez eklenemez', () => {
    const id = '0190d7a4-7a3a-7c2e-9b1a-3f0a1b2c3d4e';
    const result = budgetUpdateSchema.safeParse({
      method: 'EQUAL',
      lines: [
        { categoryId: id, amountKurus: 100 },
        { categoryId: id, amountKurus: 200 },
      ],
    });
    expect(result.success).toBe(false);
  });
});

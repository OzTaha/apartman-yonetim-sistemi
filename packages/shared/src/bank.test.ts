import { describe, expect, it } from 'vitest';
import { normalizeForMatch, parseTrAmount, parseTrDate } from './bank';

describe('parseTrAmount', () => {
  it.each([
    ['1.250,50', 125_050],
    ['1250,5', 125_050],
    ['1,250.50', 125_050],
    ['1250.50', 125_050],
    ['1.750', 175_000],
    ['750', 75_000],
    ['₺ 2.000,00', 200_000],
    ['1.500,00 TL', 150_000],
    ['-300,00', -30_000],
    ['300,00-', -30_000],
    ['(45,10)', -4_510],
    ['+10', 1_000],
  ])('%s → %d kuruş', (raw, expected) => {
    expect(parseTrAmount(raw)).toBe(expected);
  });

  it.each(['', 'abc', '12,3,4', '--5'])('%s çözülemez', (raw) => {
    expect(parseTrAmount(raw)).toBeNull();
  });
});

describe('parseTrDate', () => {
  it.each([
    ['26.09.2026', '2026-09-26'],
    ['1/2/2026', '2026-02-01'],
    ['05-03-2026 14:22', '2026-03-05'],
    ['2026-09-26', '2026-09-26'],
    ['2026-09-26T10:00:00.000Z', '2026-09-26'],
  ])('%s → %s', (raw, expected) => {
    expect(parseTrDate(raw)).toBe(expected);
  });

  it.each(['31.02.2026', '2026-13-01', 'dün', ''])('%s geçersiz', (raw) => {
    expect(parseTrDate(raw)).toBeNull();
  });
});

describe('normalizeForMatch', () => {
  it('Türkçe harfleri sadeleştirir ve noktalamayı boşluğa çevirir', () => {
    expect(normalizeForMatch('Ayşe YILMAZ - A Blok/D:5 aidatı')).toBe(
      'AYSE YILMAZ A BLOK D 5 AIDATI',
    );
    expect(normalizeForMatch('İbrahim Çağlar Güneş')).toBe('IBRAHIM CAGLAR GUNES');
  });
});

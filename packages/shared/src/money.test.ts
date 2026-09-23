import { describe, expect, it } from 'vitest';
import { formatKurus, parseTlToKurus } from './money';

const NBSP_CHARS = new RegExp(`[${String.fromCharCode(0x00a0, 0x202f)}]`, 'g');
const normalizeSpaces = (s: string) => s.replace(NBSP_CHARS, ' ');

describe('formatKurus', () => {
  it('kuruşu Türk lirası biçiminde gösterir', () => {
    expect(normalizeSpaces(formatKurus(123456))).toBe('₺1.234,56');
    expect(normalizeSpaces(formatKurus(0))).toBe('₺0,00');
    expect(normalizeSpaces(formatKurus(5))).toBe('₺0,05');
  });

  it('tam sayı olmayan değeri reddeder', () => {
    expect(() => formatKurus(10.5)).toThrow(RangeError);
  });
});

describe('parseTlToKurus', () => {
  it.each([
    ['1234,56', 123456],
    ['1.234,56', 123456],
    ['1234.56', 123456],
    ['1.234', 123400],
    ['750', 75000],
    ['750,5', 75050],
    ['₺ 1.500,00', 150000],
    ['0,01', 1],
    ['-25,10', -2510],
  ])('"%s" → %i kuruş', (input, expected) => {
    expect(parseTlToKurus(input)).toBe(expected);
  });

  it('float hatası üretmez (0,1 + 0,2 örneği)', () => {
    expect(parseTlToKurus('0,1') + parseTlToKurus('0,2')).toBe(parseTlToKurus('0,3'));
  });

  it.each(['', 'abc', '12,345', '1,2,3', '12.3.4'])('geçersiz girdiyi reddeder: "%s"', (input) => {
    expect(() => parseTlToKurus(input)).toThrow(RangeError);
  });
});

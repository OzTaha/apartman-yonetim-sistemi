import { describe, expect, it } from 'vitest';
import { formatTrPhone, normalizeTrPhone } from './phone';

describe('normalizeTrPhone', () => {
  it.each([
    ['0532 123 45 67', '+905321234567'],
    ['05321234567', '+905321234567'],
    ['5321234567', '+905321234567'],
    ['+90 (532) 123-45-67', '+905321234567'],
    ['+905321234567', '+905321234567'],
    ['905321234567', '+905321234567'],
    ['0212 555 11 22', '+902125551122'],
  ])('"%s" → %s', (input, expected) => {
    expect(normalizeTrPhone(input)).toBe(expected);
  });

  it.each(['', 'abc', '532123456', '053212345678', '+15551234567', '0612 345 67 89', '1234567890'])(
    'geçersiz numara için null döner: "%s"',
    (input) => {
      expect(normalizeTrPhone(input)).toBeNull();
    },
  );
});

describe('formatTrPhone', () => {
  it('okunaklı biçimde gösterir', () => {
    expect(formatTrPhone('+905321234567')).toBe('0532 123 45 67');
  });
});

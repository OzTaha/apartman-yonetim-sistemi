import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('geçerli değerleri kabul eder ve varsayılanları doldurur', () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.WEB_ORIGIN).toBe('http://localhost:5173');
    expect(env.LOGIN_RATE_LIMIT).toBe(10);
  });

  it('PORT değerini sayıya çevirir', () => {
    expect(validateEnv({ ...valid, PORT: '4000' }).PORT).toBe(4000);
  });

  it('eksik DATABASE_URL için anlaşılır hata verir', () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('yanlış protokollü REDIS_URL değerini reddeder', () => {
    expect(() => validateEnv({ ...valid, REDIS_URL: 'http://localhost' })).toThrow(/REDIS_URL/);
  });

  it('kısa JWT anahtarını reddeder', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'kisa' })).toThrow(/JWT_ACCESS_SECRET/);
  });
});

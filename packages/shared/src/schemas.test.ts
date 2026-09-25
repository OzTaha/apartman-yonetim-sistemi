import { describe, expect, it } from 'vitest';
import {
  loginSchema,
  bulkUnitsSchema,
  occupancyCreateSchema,
  occupancyUpdateSchema,
  siteCreateSchema,
  siteManagerAssignSchema,
  siteUpdateSchema,
} from './schemas';
import { unitLabel } from './dto';

const UNIT_ID = '0199a3c2-7b1e-7cc0-9d2a-3f6b1c2d4e5f';

describe('occupancyCreateSchema', () => {
  const base = {
    unitId: UNIT_ID,
    firstName: 'Ayşe',
    lastName: 'Yılmaz',
    type: 'OWNER',
    startDate: '2026-01-01',
  };

  it('telefonu normalize eder, boş e-postayı yok sayar ve varsayılanları doldurur', () => {
    const result = occupancyCreateSchema.parse({ ...base, phone: '0532 123 45 67', email: '' });
    expect(result.phone).toBe('+905321234567');
    expect(result.email).toBeUndefined();
    expect(result.isResponsibleForDues).toBe(true);
    expect(result.contactConsent).toBe(false);
  });

  it('e-postayı küçük harfe çevirir', () => {
    expect(occupancyCreateSchema.parse({ ...base, email: 'Ayse@Ornek.COM' }).email).toBe(
      'ayse@ornek.com',
    );
  });

  it('geçersiz telefon ve tarihi reddeder', () => {
    expect(occupancyCreateSchema.safeParse({ ...base, phone: '123' }).success).toBe(false);
    expect(occupancyCreateSchema.safeParse({ ...base, startDate: '01.01.2026' }).success).toBe(
      false,
    );
  });
});

describe('occupancyUpdateSchema', () => {
  it('gönderilmeyen alanları varsayılana döndürmez', () => {
    expect(occupancyUpdateSchema.parse({})).toEqual({});
  });

  it('boş gönderilen telefonu "sil" olarak işaretler', () => {
    const result = occupancyUpdateSchema.parse({ phone: '' });
    expect('phone' in result).toBe(true);
    expect(result.phone).toBeUndefined();
  });
});

describe('siteManagerAssignSchema', () => {
  it('e-posta veya telefondan en az birini ister', () => {
    const result = siteManagerAssignSchema.safeParse({ firstName: 'Ali', lastName: 'Kaya' });
    expect(result.success).toBe(false);
  });
});

describe('bulkUnitsSchema', () => {
  it('bitiş numarası başlangıçtan küçükse reddeder', () => {
    const result = bulkUnitsSchema.safeParse({ blockId: UNIT_ID, startNumber: 10, endNumber: 5 });
    expect(result.success).toBe(false);
  });

  it('başlangıç katı varsayılan olarak 1 olur', () => {
    const result = bulkUnitsSchema.parse({ blockId: UNIT_ID, startNumber: 1, endNumber: 5 });
    expect(result.startFloor).toBe(1);
  });
});

describe('site türü', () => {
  it('oluştururken tür verilmezse site olur, düzenlemede gönderilmeyen tür değişmez', () => {
    expect(siteCreateSchema.parse({ name: 'Güneş Apartmanı' }).kind).toBe('SITE');
    expect(siteUpdateSchema.parse({ name: 'Yeni ad' })).toEqual({ name: 'Yeni ad' });
  });

  it('daire etiketini türe göre üretir', () => {
    expect(unitLabel('APARTMENT', 'Bina', '5')).toBe('Daire 5');
    expect(unitLabel('APARTMENT', 'Bina', '5', 'short')).toBe('5');
    expect(unitLabel('SITE', 'A', '5')).toBe('A Blok · Daire 5');
    expect(unitLabel('SITE', 'A', '5', 'short')).toBe('A-5');
  });
});

describe('loginSchema', () => {
  it('e-posta veya telefondaki tüm boşlukları siler', () => {
    const parse = (identifier: string) =>
      loginSchema.parse({ identifier, password: 'x' }).identifier;
    expect(parse('  yonetici @ornek.com ')).toBe('yonetici@ornek.com');
    expect(parse('0532 100 00 00')).toBe('05321000000');
    expect(parse('\t0532 100 0000\n')).toBe('05321000000');
  });

  it('yalnızca boşluktan oluşan değeri reddeder', () => {
    expect(loginSchema.safeParse({ identifier: '   ', password: 'x' }).success).toBe(false);
  });
});

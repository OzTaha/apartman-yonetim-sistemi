import { describe, expect, it } from 'vitest';
import {
  announcementCreateSchema,
  campaignSchema,
  DEFAULT_TEMPLATES,
  renderTemplate,
  reminderSettingsSchema,
  smsInfo,
  unknownVariables,
} from './communication';

const id = '0190a000-0000-7000-8000-000000000001';
const values = { ad: 'Ayşe Yılmaz', daire: 'Daire 3', borc: '₺3.000,00', site: 'Örnek Apartmanı' };

describe('mesaj şablonu', () => {
  it('değişkenleri doldurur, bilinmeyenleri olduğu gibi bırakır', () => {
    expect(renderTemplate('Sayın {ad}, {daire} borcu {borc}. {site} {tarih}', values)).toBe(
      'Sayın Ayşe Yılmaz, Daire 3 borcu ₺3.000,00. Örnek Apartmanı {tarih}',
    );
  });

  it('bilinmeyen değişkenleri bulur', () => {
    expect(unknownVariables('{ad} {tarih} {tarih} {}')).toEqual(['tarih', '']);
    expect(unknownVariables('Sayın {ad}, {borc}')).toEqual([]);
  });

  it('varsayılan şablonlar yalnızca bilinen değişkenleri kullanır', () => {
    for (const t of DEFAULT_TEMPLATES) expect(unknownVariables(t.body)).toEqual([]);
  });

  it('bilinmeyen değişkenli metni reddeder', () => {
    const base = { kind: 'INFO', channel: 'SMS', filter: 'ALL' } as const;
    expect(campaignSchema.safeParse({ ...base, body: 'Sayın {isim}' }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...base, body: 'Sayın {ad}' }).success).toBe(true);
  });
});

describe('SMS uzunluğu', () => {
  it('Türkçe karakter yoksa 160 karakterlik parçalar sayar', () => {
    expect(smsInfo('Merhaba')).toEqual({ characters: 7, segments: 1, unicode: false });
    expect(smsInfo('a'.repeat(160)).segments).toBe(1);
    expect(smsInfo('a'.repeat(161)).segments).toBe(2);
    expect(smsInfo('a'.repeat(306)).segments).toBe(2);
    expect(smsInfo('a'.repeat(307)).segments).toBe(3);
  });

  it('genişletilmiş karakterleri iki birim sayar', () => {
    expect(smsInfo(`${'a'.repeat(159)}€`).segments).toBe(2);
  });

  it('Türkçe karakter varsa 70 karakterlik parçalar sayar', () => {
    expect(smsInfo('Sayın').unicode).toBe(true);
    expect(smsInfo('ş'.repeat(70)).segments).toBe(1);
    expect(smsInfo('ş'.repeat(71)).segments).toBe(2);
    expect(smsInfo('').segments).toBe(0);
  });
});

describe('hedef seçimi', () => {
  it('blok veya daire hedefinde seçim ister', () => {
    const base = { title: 'Su kesintisi', body: 'Yarın 10:00-14:00 arası su kesilecek.' };
    expect(announcementCreateSchema.safeParse({ ...base, audience: 'ALL' }).success).toBe(true);
    expect(announcementCreateSchema.safeParse({ ...base, audience: 'BLOCKS' }).success).toBe(false);
    expect(
      announcementCreateSchema.safeParse({ ...base, audience: 'UNITS', unitIds: [id] }).success,
    ).toBe(true);
    const campaign = { kind: 'INFO', channel: 'SMS', body: 'Merhaba {ad}' } as const;
    expect(campaignSchema.safeParse({ ...campaign, filter: 'UNITS' }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...campaign, filter: 'OVERDUE' }).success).toBe(true);
  });

  it('otomatik hatırlatma gün sayısını sınırlar', () => {
    const base = { enabled: true, channel: 'SMS', body: 'Sayın {ad}' } as const;
    expect(reminderSettingsSchema.safeParse({ ...base, daysAfterDue: 0 }).success).toBe(false);
    expect(reminderSettingsSchema.safeParse({ ...base, daysAfterDue: 5 }).success).toBe(true);
  });
});

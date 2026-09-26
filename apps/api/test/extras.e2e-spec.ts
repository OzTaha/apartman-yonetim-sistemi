import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as ExcelJSModule from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { todayInIstanbul } from '../src/common/dates';
import { hashPassword } from '../src/modules/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';

const ExcelJS = ((ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ??
  ExcelJSModule) as typeof ExcelJSModule;

const PASSWORD = 'Deneme123!';
const today = todayInIstanbul();
const trDate = `${today.slice(8, 10)}.${today.slice(5, 7)}.${today.slice(0, 4)}`;

let app: NestExpressApplication;
let prisma: PrismaService;
let siteId: string;
const units = {} as Record<'A1' | 'A2' | 'B1', string>;
const tokens = {} as Record<'manager' | 'auditor' | 'blockManager' | 'resident', string>;
let bankId: string;

const http = () => request(app.getHttpServer());
const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Site-Id': siteId });
const M = () => as(tokens.manager);

async function login(identifier: string) {
  const res = await http()
    .post('/api/auth/login')
    .send({ identifier, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function charge(unitId: string, amountKurus: number) {
  const types = await http().get('/api/charge-types').set(M()).expect(200);
  await http()
    .post('/api/charges')
    .set(M())
    .send({
      chargeTypeId: types.body[0].id,
      scope: 'SELECTED',
      unitIds: [unitId],
      amountMode: 'PER_UNIT',
      amountKurus,
      issueDate: today,
      dueDate: today,
    })
    .expect(201);
}

function binary(res: request.Response, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, sites CASCADE');
  const passwordHash = await hashPassword(PASSWORD);
  const users = await Promise.all(
    ['yonetici', 'denetci', 'blok', 'sakin'].map((name) =>
      prisma.user.create({
        data: { firstName: name, lastName: 'Kişi', email: `${name}@ek.test`, passwordHash },
      }),
    ),
  );
  const site = await prisma.site.create({ data: { name: 'Ek Sitesi', kind: 'SITE' } });
  siteId = site.id;
  const blockA = await prisma.block.create({ data: { siteId, name: 'A' } });
  const blockB = await prisma.block.create({ data: { siteId, name: 'B' } });
  for (const [key, blockId, number] of [
    ['A1', blockA.id, '1'],
    ['A2', blockA.id, '2'],
    ['B1', blockB.id, '1'],
  ] as const) {
    units[key] = (await prisma.unit.create({ data: { siteId, blockId, number } })).id;
  }
  await prisma.siteMembership.createMany({
    data: [
      { siteId, userId: users[0]!.id, role: 'SITE_MANAGER' },
      { siteId, userId: users[1]!.id, role: 'AUDITOR' },
      { siteId, userId: users[2]!.id, role: 'BLOCK_MANAGER' },
      { siteId, userId: users[3]!.id, role: 'RESIDENT' },
    ],
  });
  await prisma.blockManager.create({ data: { siteId, blockId: blockB.id, userId: users[2]!.id } });
  const occupant = (unitId: string, firstName: string, lastName: string, userId?: string) =>
    prisma.occupancy.create({
      data: {
        siteId,
        unitId,
        userId,
        firstName,
        lastName,
        type: 'OWNER',
        startDate: new Date('2020-01-01'),
      },
    });
  await occupant(units.A1, 'Ayşe', 'Yılmaz', users[3]!.id);
  await occupant(units.A2, 'Mehmet', 'Kaya');
  await occupant(units.B1, 'Can', 'Demir');

  tokens.manager = await login('yonetici@ek.test');
  tokens.auditor = await login('denetci@ek.test');
  tokens.blockManager = await login('blok@ek.test');
  tokens.resident = await login('sakin@ek.test');

  const accounts = await http().get('/api/cash-accounts').set(M()).expect(200);
  bankId = accounts.body.find((a: { kind: string }) => a.kind === 'BANK').id;
  await charge(units.A1, 150_000);
  await charge(units.A2, 150_000);
});

afterAll(async () => {
  await app?.close();
});

describe('Borç durum yazısı', () => {
  it('borçlu daireye borç dökümüyle, sıra numaralı yazı üretir', async () => {
    const res = await http()
      .get(`/api/units/${units.A1}/clearance.pdf`)
      .set(M())
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('borc-durum-A-1');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    await http().get(`/api/units/${units.B1}/clearance.pdf`).set(M()).expect(200);
    const issued = await prisma.auditLog.findMany({
      where: { entityType: 'Clearance' },
      orderBy: { createdAt: 'asc' },
    });
    const year = today.slice(0, 4);
    expect(issued.map((l) => (l.after as { number: string }).number)).toEqual([
      `${year}/1`,
      `${year}/2`,
    ]);
    expect((issued[0]!.after as { debtKurus: number }).debtKurus).toBe(150_000);
    expect((issued[1]!.after as { debtKurus: number }).debtKurus).toBe(0);
  });

  it('blok yöneticisi yalnızca kendi bloğu için, denetçi ve sakin hiç düzenleyemez', async () => {
    await http()
      .get(`/api/units/${units.B1}/clearance.pdf`)
      .set(as(tokens.blockManager))
      .expect(200);
    await http()
      .get(`/api/units/${units.A1}/clearance.pdf`)
      .set(as(tokens.blockManager))
      .expect(404);
    await http().get(`/api/units/${units.A1}/clearance.pdf`).set(as(tokens.auditor)).expect(403);
    await http().get(`/api/units/${units.A1}/clearance.pdf`).set(as(tokens.resident)).expect(403);
  });
});

describe('Banka hareketleri', () => {
  const csv = [
    'Hesap Hareketleri;;;',
    'IBAN: TR00 0000;;;',
    'İşlem Tarihi;Açıklama;Tutar;Bakiye',
    `${trDate};AYŞE YILMAZ A BLOK D:1 AIDAT;1.000,00;5.000,00`,
    `${trDate};"GELEN EFT MEHMET KAYA";500,00;5.500,00`,
    `${trDate};Elektrik faturası;-300,00;5.200,00`,
    `${trDate};Bilinmeyen gönderici;250,00;5.450,00`,
    `${trDate};Can Demir fazla ödeme;9.999,00;15.449,00`,
  ].join('\r\n');

  const rows = () => [
    { date: today, description: 'AYŞE YILMAZ A BLOK D:1 AIDAT', amountKurus: 100_000 },
    { date: today, description: 'GELEN EFT MEHMET KAYA', amountKurus: 50_000 },
    { date: today, description: 'Bilinmeyen gönderici', amountKurus: 25_000 },
    { date: today, description: 'Can Demir fazla ödeme', amountKurus: 999_900 },
  ];

  it('CSV başlığını açıklama satırlarının altında bulur ve sütunları tahmin eder', async () => {
    const res = await http()
      .post('/api/bank-imports/parse')
      .set(M())
      .attach('file', Buffer.from(String.fromCharCode(0xfeff) + csv, 'utf8'), 'hareketler.csv')
      .expect(200);
    expect(res.body.headers).toEqual(['İşlem Tarihi', 'Açıklama', 'Tutar', 'Bakiye']);
    expect(res.body.rows).toHaveLength(5);
    expect(res.body.rows[1]).toEqual([trDate, 'GELEN EFT MEHMET KAYA', '500,00', '5.500,00']);
    expect(res.body.mapping).toEqual({
      date: 'İşlem Tarihi',
      description: 'Açıklama',
      amount: 'Tutar',
    });
  });

  it('Excel dosyasını da okur; eski .xls reddedilir', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Hareketler');
    sheet.addRow(['Tarih', 'Açıklama', 'Tutar']);
    sheet.addRow([new Date(`${today}T00:00:00Z`), 'A-2 aidat', 500]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const res = await http()
      .post('/api/bank-imports/parse')
      .set(M())
      .attach('file', buffer, 'hareketler.xlsx')
      .expect(200);
    expect(res.body.rows).toEqual([[today, 'A-2 aidat', '500']]);

    await http()
      .post('/api/bank-imports/parse')
      .set(M())
      .attach('file', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), 'eski.xls')
      .expect(400);
  });

  it('gelen havaleleri daire numarası ve sakin adıyla eşleştirir', async () => {
    const res = await http()
      .post('/api/bank-imports/match')
      .set(M())
      .send({ rows: rows() })
      .expect(200);
    const [ayse, mehmet, unknown, can] = res.body.rows;
    expect(ayse).toMatchObject({ unitId: units.A1, confidence: 'HIGH', status: 'NEW' });
    expect(mehmet).toMatchObject({ unitId: units.A2, confidence: 'MEDIUM' });
    expect(unknown).toMatchObject({ unitId: null, confidence: null });
    expect(can).toMatchObject({ unitId: units.B1 });
    expect(res.body.units).toHaveLength(3);
  });

  it('onaylanan hareketler tahsilat olur, fazla ödeme reddedilir, aynı hareket ikinci kez alınmaz', async () => {
    const [ayse, mehmet, unknown, can] = rows();
    const res = await http()
      .post('/api/bank-imports/commit')
      .set(M())
      .send({
        accountId: bankId,
        mapping: { date: 'İşlem Tarihi', description: 'Açıklama', amount: 'Tutar' },
        payments: [
          { ...ayse, occurrence: 0, unitId: units.A1 },
          { ...mehmet, occurrence: 0, unitId: units.A2 },
          { ...can, occurrence: 0, unitId: units.B1 },
        ],
        ignore: [{ ...unknown, occurrence: 0 }],
      })
      .expect(200);
    expect(res.body).toMatchObject({ imported: 2, ignored: 1, totalKurus: 150_000 });
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].description).toBe('Can Demir fazla ödeme');

    const payments = await http().get('/api/payments').set(M()).expect(200);
    const fromBank = payments.body.filter((p: { method: string }) => p.method === 'BANK_TRANSFER');
    expect(fromBank).toHaveLength(2);
    expect(fromBank.every((p: { accountId: string }) => p.accountId === bankId)).toBe(true);

    const again = await http()
      .post('/api/bank-imports/commit')
      .set(M())
      .send({ accountId: bankId, payments: [{ ...ayse, occurrence: 0, unitId: units.A1 }] })
      .expect(200);
    expect(again.body.imported).toBe(0);
    expect(again.body.errors[0].message).toContain('daha önce aktarılmış');

    const matched = await http()
      .post('/api/bank-imports/match')
      .set(M())
      .send({ rows: rows() })
      .expect(200);
    expect(matched.body.rows.map((r: { status: string }) => r.status)).toEqual([
      'IMPORTED',
      'IMPORTED',
      'IGNORED',
      'NEW',
    ]);
  });

  it('aynı gün aynı tutarda iki ayrı havale ayrı hareket sayılır; sütun seçimi hatırlanır', async () => {
    const twin = { date: today, description: 'A-2 kalan', amountKurus: 50_000 };
    const res = await http()
      .post('/api/bank-imports/match')
      .set(M())
      .send({ rows: [twin, twin] })
      .expect(200);
    expect(res.body.rows.map((r: { occurrence: number }) => r.occurrence)).toEqual([0, 1]);

    const parsed = await http()
      .post('/api/bank-imports/parse')
      .set(M())
      .attach('file', Buffer.from(csv, 'utf8'), 'hareketler.csv')
      .expect(200);
    expect(parsed.body.mapping.date).toBe('İşlem Tarihi');
  });

  it('yalnızca site yöneticisi kullanır', async () => {
    await http()
      .post('/api/bank-imports/match')
      .set(as(tokens.auditor))
      .send({ rows: rows() })
      .expect(403);
    await http()
      .post('/api/bank-imports/match')
      .set(as(tokens.blockManager))
      .send({ rows: rows() })
      .expect(403);
  });
});

describe('İşlem geçmişi', () => {
  it('yönetici ve denetçi değişiklikleri kişi ve önce/sonra bilgisiyle görür', async () => {
    const res = await http()
      .get('/api/audit-logs')
      .query({ from: today, to: today })
      .set(as(tokens.auditor))
      .expect(200);
    const actions = res.body.items.map(
      (i: { entityType: string; action: string }) => `${i.entityType}:${i.action}`,
    );
    expect(actions).toEqual(
      expect.arrayContaining(['Charge:CREATE', 'BankImport:IMPORT', 'Clearance:ISSUE']),
    );
    const imported = res.body.items.find((i: { action: string }) => i.action === 'IMPORT');
    expect(imported.userName).toBe('yonetici Kişi');
    expect(res.body.users.map((u: { name: string }) => u.name)).toContain('yonetici Kişi');

    const filtered = await http()
      .get('/api/audit-logs')
      .query({ from: today, to: today, entityType: 'Clearance' })
      .set(M())
      .expect(200);
    expect(
      filtered.body.items.every((i: { entityType: string }) => i.entityType === 'Clearance'),
    ).toBe(true);
  });

  it('şifre ve anahtar alanlarını göstermez; başka rollere kapalıdır', async () => {
    await prisma.auditLog.create({
      data: {
        siteId,
        action: 'UPDATE',
        entityType: 'User',
        entityId: siteId,
        after: { passwordHash: 'gizli', nested: { resetToken: 'x', name: 'Ali' } },
      },
    });
    const res = await http()
      .get('/api/audit-logs')
      .query({ from: today, to: today, entityType: 'User' })
      .set(M())
      .expect(200);
    expect(res.body.items[0].after).toEqual({ nested: { name: 'Ali' } });

    await http()
      .get('/api/audit-logs')
      .query({ from: today, to: today })
      .set(as(tokens.blockManager))
      .expect(403);
    await http()
      .get('/api/audit-logs')
      .query({ from: today, to: today })
      .set(as(tokens.resident))
      .expect(403);
  });
});

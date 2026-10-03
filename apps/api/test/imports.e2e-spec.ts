import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as ExcelJSModule from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';

const ExcelJS = ((ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ??
  ExcelJSModule) as typeof ExcelJSModule;

const PASSWORD = 'Deneme123!';

let app: NestExpressApplication;
let prisma: PrismaService;
let siteId: string;
let apartmentId: string;
const tokens = {} as Record<'manager' | 'resident' | 'apartment', string>;

const http = () => request(app.getHttpServer());
const as = (token: string, site = siteId) => ({
  Authorization: `Bearer ${token}`,
  'X-Site-Id': site,
});

async function login(identifier: string) {
  const res = await http()
    .post('/api/auth/login')
    .send({ identifier, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function workbook(sheets: Record<string, (string | number)[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    rows.forEach((r) => ws.addRow(r));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
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

  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_logs, refresh_tokens, invitations, occupancies, units, blocks, site_memberships, sites, users CASCADE',
  );
  const passwordHash = await hashPassword(PASSWORD);
  const [manager, resident, apartmentManager] = await Promise.all(
    ['yonetici@aktar.test', 'sakin@aktar.test', 'apt@aktar.test'].map((email, i) =>
      prisma.user.create({
        data: { firstName: 'Kişi', lastName: String(i), email, passwordHash },
      }),
    ),
  );
  const site = await prisma.site.create({ data: { name: 'Aktarma Sitesi', kind: 'SITE' } });
  const apartment = await prisma.site.create({
    data: { name: 'Aktarma Apartmanı', kind: 'APARTMENT' },
  });
  siteId = site.id;
  apartmentId = apartment.id;
  await prisma.block.create({ data: { siteId: apartment.id, name: 'Bina' } });
  const blockA = await prisma.block.create({ data: { siteId, name: 'A' } });
  const unit = await prisma.unit.create({ data: { siteId, blockId: blockA.id, number: '1' } });
  await prisma.occupancy.create({
    data: {
      siteId,
      unitId: unit.id,
      firstName: 'Mevcut',
      lastName: 'Sakin',
      type: 'OWNER',
      startDate: new Date('2020-01-01'),
    },
  });
  await prisma.siteMembership.createMany({
    data: [
      { siteId, userId: manager!.id, role: 'SITE_MANAGER' },
      { siteId, userId: resident!.id, role: 'RESIDENT' },
      { siteId: apartment.id, userId: apartmentManager!.id, role: 'SITE_MANAGER' },
    ],
  });
  tokens.manager = await login('yonetici@aktar.test');
  tokens.resident = await login('sakin@aktar.test');
  tokens.apartment = await login('apt@aktar.test');
});

afterAll(async () => {
  await app?.close();
});

describe("Excel'den toplu aktarma", () => {
  it('şablon yalnızca yöneticiye iner ve sayfaları içerir', async () => {
    await http().get('/api/imports/template.xlsx').set(as(tokens.resident)).expect(403);
    const res = await http()
      .get('/api/imports/template.xlsx')
      .set(as(tokens.manager))
      .buffer(true)
      .parse(binary)
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Nasıl doldurulur',
      'Daireler',
      'Sakinler',
      'Devreden borçlar',
    ]);
    expect(wb.getWorksheet('Daireler')!.getRow(1).getCell(1).value).toBe('Blok');
  });

  it('hatalı satırlar önizlemede gösterilir ve hiçbir şey kaydedilmez', async () => {
    const file = await workbook({
      Daireler: [
        ['Blok', 'Daire no', 'Kat'],
        ['A', '2', 'iki'],
        ['', '3', ''],
      ],
      Sakinler: [
        ['Blok', 'Daire no', 'Ad', 'Soyad', 'Telefon', 'Malik / Kiracı'],
        ['A', '9', 'Ali', 'Veli', '', 'Malik'],
        ['A', '1', 'Ayşe', 'Kaya', '123', 'Kiracı'],
        ['A', '1', 'Can', 'Er', '', 'Komşu'],
      ],
    });
    const res = await http()
      .post('/api/imports/preview')
      .set(as(tokens.manager))
      .attach('file', file, 'aktar.xlsx')
      .expect(200);
    const messages = res.body.errors.map(
      (e: { sheet: string; row: number; message: string }) => `${e.sheet}:${e.row}:${e.message}`,
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        'units:2:Kat sayı olmalıdır',
        'units:3:Blok adını yazın',
        'residents:2:A Blok · Daire 9 bulunamadı. Önce "Daireler" sayfasına ekleyin.',
        'residents:3:Telefon: Geçerli bir telefon numarası girin (ör. 0532 123 45 67)',
        'residents:4:"Malik / Kiracı" sütununa Malik veya Kiracı yazın',
      ]),
    );
    await http()
      .post('/api/imports/commit')
      .set(as(tokens.manager))
      .send({
        units: [],
        residents: [
          {
            row: 2,
            blockName: 'A',
            number: '9',
            firstName: 'Ali',
            lastName: 'Veli',
            type: 'OWNER',
            isResponsibleForDues: true,
            contactConsent: false,
            startDate: '2026-01-01',
          },
        ],
        debts: [],
      })
      .expect(400);
    expect(await prisma.unit.count({ where: { siteId } })).toBe(1);
  });

  it('geçerli dosya önizlenir, var olanlar atlanır ve tek seferde kaydedilir', async () => {
    const file = await workbook({
      Daireler: [
        ['Blok', 'Daire no', 'Kat', 'm²', 'Arsa payı'],
        ['A', '1', 1, '', ''],
        ['A', '2', 1, '95,5', 24],
        ['B', '1', 0, 110, ''],
      ],
      Sakinler: [
        [
          'Blok',
          'Daire no',
          'Ad',
          'Soyad',
          'Telefon',
          'E-posta',
          'Malik / Kiracı',
          'Aidattan sorumlu',
          'SMS izni',
          'Oturmaya başlama tarihi',
        ],
        ['A', '1', 'Mevcut', 'Sakin', '', '', 'Malik', '', '', ''],
        [
          'A',
          '2',
          'Zeynep',
          'Ak',
          '0532 111 22 33',
          'zeynep@ornek.test',
          'Malik',
          'Evet',
          'Evet',
          '01.03.2024',
        ],
        ['B', '1', 'Murat', 'Kara', '', '', 'Kiracı', 'Hayır', 'Hayır', ''],
      ],
      'Devreden borçlar': [
        ['Blok', 'Daire no', 'Açıklama', 'Tutar (TL)', 'Son ödeme tarihi'],
        ['A', '1', 'Eski yönetimden kalan', '1.250,50', '15.10.2026'],
        ['B', '1', '', 300, '2026-11-01'],
      ],
    });
    const preview = await http()
      .post('/api/imports/preview')
      .set(as(tokens.manager))
      .attach('file', file, 'aktar.xlsx')
      .expect(200);
    expect(preview.body.errors).toEqual([]);
    expect(preview.body.units.map((u: { number: string }) => u.number)).toEqual(['2', '1']);
    expect(preview.body.residents).toHaveLength(2);
    expect(preview.body.residents[0]).toMatchObject({
      phone: '+905321112233',
      startDate: '2024-03-01',
      contactConsent: true,
    });
    expect(preview.body.debts.map((d: { amountKurus: number }) => d.amountKurus)).toEqual([
      125_050, 30_000,
    ]);
    expect(preview.body.skipped.map((s: { message: string }) => s.message)).toEqual([
      'A Blok · Daire 1 sistemde zaten var',
      'Mevcut Sakin (A Blok · Daire 1) zaten kayıtlı',
    ]);

    const { units, residents, debts } = preview.body;
    await http()
      .post('/api/imports/commit')
      .set(as(tokens.resident))
      .send({ units, residents, debts })
      .expect(403);
    const result = await http()
      .post('/api/imports/commit')
      .set(as(tokens.manager))
      .send({ units, residents, debts })
      .expect(200);
    expect(result.body).toEqual({ units: 2, residents: 2, debts: 2, debtKurus: 155_050 });

    const blockB = await prisma.block.findFirstOrThrow({ where: { siteId, name: 'B' } });
    expect(await prisma.unit.count({ where: { siteId, blockId: blockB.id } })).toBe(1);
    const a2 = await prisma.unit.findFirstOrThrow({
      where: { siteId, number: '2' },
      include: { occupancies: true },
    });
    expect(a2).toMatchObject({ areaM2: 95.5, landShare: 24 });
    expect(a2.occupancies[0]).toMatchObject({ firstName: 'Zeynep', isResponsibleForDues: true });
    const charges = await prisma.charge.findMany({
      where: { siteId },
      include: { chargeType: true },
    });
    expect(charges.map((c) => c.chargeType.code)).toEqual(['OPENING', 'OPENING']);
    expect(await prisma.auditLog.count({ where: { action: 'IMPORT', entityId: siteId } })).toBe(1);

    await http()
      .post('/api/imports/commit')
      .set(as(tokens.manager))
      .send({ units, residents: [], debts: [] })
      .expect(200)
      .then((r) => expect(r.body.units).toBe(0));
  });

  it('apartmanda blok sütunu yoktur, daireler binaya eklenir', async () => {
    const file = await workbook({
      Daireler: [['Daire no'], ['1'], ['2']],
      Sakinler: [
        ['Daire no', 'Ad', 'Soyad', 'Malik / Kiracı'],
        ['2', 'Elif', 'Su', 'Ev sahibi'],
      ],
    });
    const preview = await http()
      .post('/api/imports/preview')
      .set(as(tokens.apartment, apartmentId))
      .attach('file', file, 'aktar.xlsx')
      .expect(200);
    expect(preview.body.errors).toEqual([]);
    const { units, residents, debts } = preview.body;
    await http()
      .post('/api/imports/commit')
      .set(as(tokens.apartment, apartmentId))
      .send({ units, residents, debts })
      .expect(200);
    expect(await prisma.unit.count({ where: { siteId: apartmentId } })).toBe(2);
    expect(await prisma.block.count({ where: { siteId: apartmentId } })).toBe(1);
  });
});

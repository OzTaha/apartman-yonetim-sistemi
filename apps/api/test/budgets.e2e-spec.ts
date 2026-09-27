import { addMonths } from '@apartman/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { todayInIstanbul } from '../src/common/dates';
import { hashPassword } from '../src/modules/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'Deneme123!';
const today = todayInIstanbul();
const current = today.slice(0, 7);
const start = addMonths(current, -2);

let app: NestExpressApplication;
let prisma: PrismaService;
let siteId: string;
const tokens = {} as Record<'manager' | 'auditor' | 'resident', string>;
const categories = {} as Record<'cleaning' | 'elevator' | 'repair' | 'rent', string>;
let cashId: string;

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
  const [manager, auditor, resident] = await Promise.all(
    ['yonetici', 'denetci', 'sakin'].map((name) =>
      prisma.user.create({
        data: { firstName: name, lastName: 'Kişi', email: `${name}@butce.test`, passwordHash },
      }),
    ),
  );
  const site = await prisma.site.create({ data: { name: 'Bütçe Apartmanı', kind: 'APARTMENT' } });
  siteId = site.id;
  const block = await prisma.block.create({ data: { siteId, name: 'Bina' } });
  for (const number of ['1', '2', '3']) {
    await prisma.unit.create({ data: { siteId, blockId: block.id, number } });
  }
  await prisma.siteMembership.createMany({
    data: [
      { siteId, userId: manager!.id, role: 'SITE_MANAGER' },
      { siteId, userId: auditor!.id, role: 'AUDITOR' },
      { siteId, userId: resident!.id, role: 'RESIDENT' },
    ],
  });
  tokens.manager = await login('yonetici@butce.test');
  tokens.auditor = await login('denetci@butce.test');
  tokens.resident = await login('sakin@butce.test');

  const accounts = await http().get('/api/cash-accounts').set(M()).expect(200);
  cashId = accounts.body[0].id;
  const cats = await http().get('/api/finance-categories').set(M()).expect(200);
  const byCode = (code: string) =>
    cats.body.find((c: { code: string | null }) => c.code === code).id as string;
  categories.cleaning = byCode('CLEANING');
  categories.elevator = byCode('ELEVATOR');
  categories.repair = byCode('REPAIR');
  categories.rent = byCode('RENT_INCOME');
});

afterAll(async () => {
  await app?.close();
});

describe('İşletme projesi', () => {
  let budgetId: string;

  it('boş bütçe oluşturulur; çakışan dönem ve kapalı dağıtım yöntemi reddedilir', async () => {
    const res = await http()
      .post('/api/budgets')
      .set(M())
      .send({ startPeriod: start, method: 'EQUAL' })
      .expect(201);
    budgetId = res.body.id;
    expect(res.body).toMatchObject({
      startPeriod: start,
      endPeriod: addMonths(start, 11),
      totalKurus: 0,
      advanceKurus: 0,
      isCurrent: true,
      applied: false,
      applyFrom: current,
    });
    expect(res.body.units).toHaveLength(3);

    await http()
      .post('/api/budgets')
      .set(M())
      .send({ startPeriod: addMonths(start, 6), method: 'EQUAL' })
      .expect(409);
    await http()
      .post('/api/budgets')
      .set(M())
      .send({ startPeriod: addMonths(start, 12), method: 'AREA' })
      .expect(400);
  });

  it('kalemler kaydedilir, daire başı aylık avans tam liraya yuvarlanır', async () => {
    await http()
      .put(`/api/budgets/${budgetId}`)
      .set(M())
      .send({ method: 'EQUAL', lines: [{ categoryId: categories.rent, amountKurus: 100 }] })
      .expect(400);
    await http()
      .put(`/api/budgets/${budgetId}`)
      .set(M())
      .send({
        method: 'EQUAL',
        lines: [
          { categoryId: categories.cleaning, amountKurus: 100 },
          { categoryId: categories.cleaning, amountKurus: 200 },
        ],
      })
      .expect(400);

    const res = await http()
      .put(`/api/budgets/${budgetId}`)
      .set(M())
      .send({
        method: 'EQUAL',
        lines: [
          { categoryId: categories.cleaning, amountKurus: 1_200_000, note: 'Temizlik firması' },
          { categoryId: categories.elevator, amountKurus: 600_001 },
        ],
      })
      .expect(200);
    expect(res.body.totalKurus).toBe(1_800_001);
    expect(res.body.advanceKurus).toBe(50_100);
    expect(res.body.lines[0]).toMatchObject({
      categoryName: 'Temizlik',
      amountKurus: 1_200_000,
      note: 'Temizlik firması',
    });
    expect(res.body.units.map((u: { monthlyKurus: number }) => u.monthlyKurus)).toEqual([
      50_100, 50_100, 50_100,
    ]);
  });

  it('gerçekleşen giderler bütçe kalemleriyle karşılaştırılır, bütçe dışı gider ayrı görünür', async () => {
    for (const [categoryId, amountKurus] of [
      [categories.cleaning, 100_000],
      [categories.repair, 25_000],
    ] as const) {
      await http()
        .post('/api/transactions')
        .set(M())
        .send({ type: 'EXPENSE', accountId: cashId, categoryId, amountKurus, date: today })
        .expect(201);
    }
    const res = await http().get(`/api/budgets/${budgetId}`).set(M()).expect(200);
    const c = res.body.comparison;
    expect(c.elapsedMonths).toBe(3);
    expect(c.plannedKurus).toBe(1_800_001);
    expect(c.actualKurus).toBe(125_000);
    expect(c.rows).toEqual([
      {
        categoryId: categories.cleaning,
        categoryName: 'Temizlik',
        plannedKurus: 1_200_000,
        actualKurus: 100_000,
      },
      {
        categoryId: categories.elevator,
        categoryName: 'Asansör bakımı',
        plannedKurus: 600_001,
        actualKurus: 0,
      },
      {
        categoryId: categories.repair,
        categoryName: 'Bakım ve onarım',
        plannedKurus: 0,
        actualKurus: 25_000,
      },
    ]);
  });

  it('avans aidat planı olarak uygulanır, tahakkuk bütçe raporuna yansır', async () => {
    const applied = await http().post(`/api/budgets/${budgetId}/apply`).set(M()).expect(200);
    expect(applied.body.applied).toBe(true);
    expect(applied.body.appliedPlan).toEqual({
      method: 'EQUAL',
      amountKurus: 50_100,
      validFrom: current,
    });
    await http().post(`/api/budgets/${budgetId}/apply`).set(M()).expect(409);

    const plans = await http().get('/api/dues/plans').set(M()).expect(200);
    expect(plans.body[0]).toMatchObject({ amountKurus: 50_100, validFrom: current });

    await http().post('/api/dues/accrue').set(M()).send({ period: current }).expect(200);
    const res = await http().get(`/api/budgets/${budgetId}`).set(M()).expect(200);
    expect(res.body.comparison.duesAccruedKurus).toBe(150_300);
    expect(res.body.comparison.duesCollectedKurus).toBe(0);

    const changed = await http()
      .put(`/api/budgets/${budgetId}`)
      .set(M())
      .send({ method: 'EQUAL', lines: [{ categoryId: categories.cleaning, amountKurus: 360_000 }] })
      .expect(200);
    expect(changed.body.applied).toBe(false);
    expect(changed.body.advanceKurus).toBe(10_000);
  });

  it('denetçi bütçeyi ve PDFi görür ama değiştiremez; sakin göremez', async () => {
    await http().get('/api/budgets').set(as(tokens.auditor)).expect(200);
    await http().get(`/api/budgets/${budgetId}`).set(as(tokens.auditor)).expect(200);
    const pdf = await http()
      .get(`/api/budgets/${budgetId}/pdf`)
      .set(as(tokens.auditor))
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['content-disposition']).toContain(`isletme-projesi-${start}.pdf`);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    await http()
      .put(`/api/budgets/${budgetId}`)
      .set(as(tokens.auditor))
      .send({ method: 'EQUAL', lines: [] })
      .expect(403);
    await http().post(`/api/budgets/${budgetId}/apply`).set(as(tokens.auditor)).expect(403);
    await http().get('/api/budgets').set(as(tokens.resident)).expect(403);
  });

  it('sonraki dönem önceki bütçeden kopyalanır; silinen bütçe aidat planını etkilemez', async () => {
    const next = await http()
      .post('/api/budgets')
      .set(M())
      .send({ startPeriod: addMonths(start, 12), method: 'EQUAL', copyFromId: budgetId })
      .expect(201);
    expect(next.body.lines).toEqual([
      {
        categoryId: categories.cleaning,
        categoryName: 'Temizlik',
        amountKurus: 360_000,
        note: null,
      },
    ]);
    expect(next.body.isCurrent).toBe(false);
    expect(next.body.applyFrom).toBe(addMonths(start, 12));

    const list = await http().get('/api/budgets').set(M()).expect(200);
    expect(list.body.map((b: { id: string }) => b.id)).toEqual([next.body.id, budgetId]);

    await http().delete(`/api/budgets/${budgetId}`).set(M()).expect(204);
    await http().get(`/api/budgets/${budgetId}`).set(M()).expect(404);
    const plans = await http().get('/api/dues/plans').set(M()).expect(200);
    expect(plans.body).toHaveLength(1);
  });
});

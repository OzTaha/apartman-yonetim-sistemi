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
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

let app: NestExpressApplication;
let prisma: PrismaService;
let siteId: string;
const blocks = {} as Record<'A' | 'B', string>;
const units = {} as Record<'A1' | 'A2' | 'B1' | 'B2', string>;
const tokens = {} as Record<'manager' | 'residentA' | 'residentB', string>;
let cashId: string;
let categoryId: string;
let chargeTypeId: string;

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

function expense(body: Record<string, unknown>) {
  return http()
    .post('/api/transactions')
    .set(M())
    .send({
      type: 'EXPENSE',
      accountId: cashId,
      categoryId,
      amountKurus: 10_000,
      date: today,
      ...body,
    });
}

const reflect = { chargeTypeId: '', method: 'EQUAL', issueDate: today, dueDate: today };

async function chargesOf(transactionId: string) {
  return prisma.charge.findMany({
    where: { transactionId },
    select: { unitId: true, amountKurus: true, cancelledAt: true, description: true },
    orderBy: { amountKurus: 'desc' },
  });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, sites CASCADE');
  const passwordHash = await hashPassword(PASSWORD);
  const [manager, residentA, residentB] = await Promise.all(
    ['yonetici@blok.test', 'a@blok.test', 'b@blok.test'].map((email, i) =>
      prisma.user.create({ data: { firstName: 'Kişi', lastName: String(i), email, passwordHash } }),
    ),
  );
  const site = await prisma.site.create({ data: { name: 'Bloklu Site', kind: 'SITE' } });
  siteId = site.id;
  await prisma.siteMembership.createMany({
    data: [
      { siteId, userId: manager!.id, role: 'SITE_MANAGER' },
      { siteId, userId: residentA!.id, role: 'RESIDENT' },
      { siteId, userId: residentB!.id, role: 'RESIDENT' },
    ],
  });
  for (const name of ['A', 'B'] as const) {
    const block = await prisma.block.create({ data: { siteId, name } });
    blocks[name] = block.id;
    for (const number of ['1', '2']) {
      const unit = await prisma.unit.create({ data: { siteId, blockId: block.id, number } });
      units[`${name}${number}` as keyof typeof units] = unit.id;
    }
  }
  for (const [unitId, userId] of [
    [units.A1, residentA!.id],
    [units.B1, residentB!.id],
  ] as const) {
    await prisma.occupancy.create({
      data: {
        siteId,
        unitId,
        userId,
        firstName: 'Sakin',
        lastName: 'Kişi',
        type: 'OWNER',
        startDate: new Date('2020-01-01'),
      },
    });
  }
  tokens.manager = await login('yonetici@blok.test');
  tokens.residentA = await login('a@blok.test');
  tokens.residentB = await login('b@blok.test');

  const accounts = await http().get('/api/cash-accounts').set(M()).expect(200);
  cashId = accounts.body[0].id;
  const cats = await http().get('/api/finance-categories').set(M()).expect(200);
  categoryId = cats.body.find((c: { code: string | null }) => c.code === 'RENOVATION').id;
  const types = await http().get('/api/charge-types').set(M()).expect(200);
  chargeTypeId = types.body.find((t: { code: string | null }) => t.code === 'FIXTURE').id;
  reflect.chargeTypeId = chargeTypeId;
});

afterAll(async () => {
  await app?.close();
});

const ids = {} as Record<'blockA' | 'blockB' | 'site', string>;

describe('Gider kapsamı', () => {
  it('gider bir bloğa ait girilir; gelir ve transfer bloğa bağlanamaz', async () => {
    const res = await expense({ blockId: blocks.A, description: 'Asansör bakımı' }).expect(201);
    expect(res.body).toMatchObject({ blockId: blocks.A, blockName: 'A', reflection: null });
    ids.blockA = res.body.id;

    const accounts = await http().get('/api/cash-accounts').set(M()).expect(200);
    await http()
      .post('/api/transactions')
      .set(M())
      .send({
        type: 'TRANSFER',
        accountId: cashId,
        toAccountId: accounts.body[1].id,
        amountKurus: 100,
        date: today,
        blockId: blocks.A,
      })
      .expect(400);
  });

  it('kasa hareketleri kapsama göre süzülür', async () => {
    const site = await expense({ description: 'Bahçe bakımı' }).expect(201);
    ids.site = site.body.id;
    const b = await expense({ blockId: blocks.B, description: 'B çatı' }).expect(201);
    ids.blockB = b.body.id;

    const onlyA = await http()
      .get('/api/transactions')
      .query({ block: blocks.A })
      .set(M())
      .expect(200);
    expect(onlyA.body.map((t: { id: string }) => t.id)).toEqual([ids.blockA]);
    const siteWide = await http()
      .get('/api/transactions')
      .query({ block: 'site', type: 'EXPENSE' })
      .set(M())
      .expect(200);
    expect(siteWide.body.map((t: { id: string }) => t.id)).toEqual([ids.site]);
  });

  it('sakin ortak giderleri ve yalnızca kendi bloğunun giderlerini görür', async () => {
    const a = await http().get('/api/transparency').set(as(tokens.residentA)).expect(200);
    const seenByA = a.body.expenses.map((e: { id: string }) => e.id);
    expect(seenByA).toEqual(expect.arrayContaining([ids.blockA, ids.site]));
    expect(seenByA).not.toContain(ids.blockB);
    expect(a.body.expenses.find((e: { id: string }) => e.id === ids.blockA).blockName).toBe('A');

    const b = await http().get('/api/transparency').set(as(tokens.residentB)).expect(200);
    const seenByB = b.body.expenses.map((e: { id: string }) => e.id);
    expect(seenByB).toEqual(expect.arrayContaining([ids.blockB, ids.site]));
    expect(seenByB).not.toContain(ids.blockA);

    const manager = await http().get('/api/transparency').set(M()).expect(200);
    expect(manager.body.expenses).toHaveLength(3);
  });

  it('başka bloğun gider faturası sakine açılmaz', async () => {
    const res = await http()
      .post('/api/attachments')
      .query({ target: 'transaction', targetId: ids.blockB })
      .set(M())
      .attach('file', PDF_BYTES, { filename: 'fatura.pdf', contentType: 'application/pdf' })
      .expect(201);
    await http().get(`/api/attachments/${res.body.id}`).set(as(tokens.residentA)).expect(404);
    await http().get(`/api/attachments/${res.body.id}`).set(as(tokens.residentB)).expect(200);
  });

  it('bloğa ait iş kapsamı giderlere geçer ve sakin yalnızca kendi bloğunun işini görür', async () => {
    const work = await http()
      .post('/api/works')
      .set(M())
      .send({ title: 'B blok mantolama', blockId: blocks.B })
      .expect(201);
    expect(work.body).toMatchObject({ blockName: 'B' });
    const paid = await expense({ workId: work.body.id }).expect(201);
    expect(paid.body.blockId).toBe(blocks.B);
    await expense({ workId: work.body.id, blockId: blocks.A }).expect(400);

    const a = await http().get('/api/transparency').set(as(tokens.residentA)).expect(200);
    expect(a.body.works).toHaveLength(0);
    const b = await http().get('/api/transparency').set(as(tokens.residentB)).expect(200);
    expect(b.body.works.map((w: { id: string }) => w.id)).toEqual([work.body.id]);
    await http()
      .post(`/api/transactions/${paid.body.id}/cancel`)
      .set(M())
      .send({ reason: 'Deneme' });
  });
});

describe('Dairelere yansıtma', () => {
  it('blok gideri yalnızca o bloğun dairelerine borç olarak yazılır, kuruş kaybolmaz', async () => {
    const res = await expense({
      blockId: blocks.A,
      amountKurus: 10_001,
      description: 'Asansör revizyonu',
      reflect,
    }).expect(201);
    expect(res.body.reflection).toEqual({ chargeCount: 2, totalKurus: 10_001, paidKurus: 0 });
    const charges = await chargesOf(res.body.id);
    expect(charges.map((c) => c.unitId).sort()).toEqual([units.A1, units.A2].sort());
    expect(charges.map((c) => c.amountKurus)).toEqual([5_001, 5_000]);
    expect(charges[0]!.description).toBe('Asansör revizyonu');
  });

  it('site geneli gider sonradan tüm dairelere yansıtılır, ikinci kez yansıtılamaz', async () => {
    const res = await http()
      .post(`/api/transactions/${ids.site}/reflect`)
      .set(M())
      .send(reflect)
      .expect(200);
    expect(res.body.reflection).toMatchObject({ chargeCount: 4, totalKurus: 10_000 });
    await http().post(`/api/transactions/${ids.site}/reflect`).set(M()).send(reflect).expect(409);
    await http()
      .patch(`/api/transactions/${ids.site}`)
      .set(M())
      .send({ blockId: blocks.A })
      .expect(400);
  });

  it('oranlı dağıtım kapalıyken arsa payına göre yansıtılamaz', async () => {
    await http()
      .post(`/api/transactions/${ids.blockB}/reflect`)
      .set(M())
      .send({ ...reflect, method: 'LAND_SHARE' })
      .expect(400);
  });

  it('gider iptal edilince ödenmemiş yansıtma borçları da iptal olur', async () => {
    await http().post(`/api/transactions/${ids.blockB}/reflect`).set(M()).send(reflect).expect(200);
    await http()
      .post(`/api/transactions/${ids.blockB}/cancel`)
      .set(M())
      .send({ reason: 'Yanlış giriş' })
      .expect(200);
    const charges = await chargesOf(ids.blockB);
    expect(charges).toHaveLength(2);
    expect(charges.every((c) => c.cancelledAt)).toBe(true);
  });

  it('yansıtılan borca ödeme yapılmışsa gider iptal edilemez', async () => {
    const charges = await chargesOf(ids.site);
    const b1 = charges.find((c) => c.unitId === units.B1)!;
    await http()
      .post('/api/payments')
      .set(M())
      .send({ unitId: units.B1, amountKurus: b1.amountKurus, method: 'CASH', paidAt: today })
      .expect(201);
    await http()
      .post(`/api/transactions/${ids.site}/cancel`)
      .set(M())
      .send({ reason: 'Deneme' })
      .expect(409);
    const detail = await http().get(`/api/transactions/${ids.site}`).set(M()).expect(200);
    expect(detail.body.reflection.paidKurus).toBe(b1.amountKurus);
  });
});

describe('Blok bazında borç ve rapor', () => {
  it('toplu borç seçilen bloklardaki dairelere yazılır', async () => {
    const res = await http()
      .post('/api/charges')
      .set(M())
      .send({
        chargeTypeId,
        scope: 'BLOCKS',
        blockIds: [blocks.B],
        amountMode: 'PER_UNIT',
        amountKurus: 2_500,
        issueDate: today,
        dueDate: today,
        description: 'B blok boya',
      })
      .expect(201);
    expect(res.body).toEqual({ created: 2, totalKurus: 5_000 });
    const written = await prisma.charge.findMany({ where: { description: 'B blok boya' } });
    expect(written.map((c) => c.unitId).sort()).toEqual([units.B1, units.B2].sort());

    await http()
      .post('/api/charges')
      .set(M())
      .send({
        chargeTypeId,
        scope: 'BLOCKS',
        blockIds: [],
        amountMode: 'PER_UNIT',
        amountKurus: 2_500,
        issueDate: today,
        dueDate: today,
      })
      .expect(400);
  });

  it('gelir-gider özeti blok bazında gider ve yansıtılan tutarı verir', async () => {
    const res = await http()
      .get('/api/finance/summary')
      .query({ from: today, to: today })
      .set(M())
      .expect(200);
    expect(res.body.byBlock).toEqual([
      { blockId: null, name: 'Site geneli', expenseKurus: 10_000, reflectedKurus: 10_000 },
      { blockId: blocks.A, name: 'A', expenseKurus: 20_001, reflectedKurus: 10_001 },
      { blockId: blocks.B, name: 'B', expenseKurus: 0, reflectedKurus: 0 },
    ]);
  });

  it('gideri olan blok silinemez', async () => {
    const block = await http().post('/api/blocks').set(M()).send({ name: 'C' }).expect(201);
    expect(block.body.deletable).toBe(true);
    await expense({ blockId: block.body.id }).expect(201);
    const list = await http().get('/api/blocks').set(M()).expect(200);
    expect(list.body.find((b: { id: string }) => b.id === block.body.id).deletable).toBe(false);
    await http().delete(`/api/blocks/${block.body.id}`).set(M()).expect(409);
  });
});

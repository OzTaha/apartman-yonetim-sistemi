import { addDays } from '@apartman/shared';
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

let app: NestExpressApplication;
let prisma: PrismaService;
const ids = {} as Record<'site' | 'unit1' | 'unit2' | 'chargeType' | 'cash', string>;
const tokens = {} as Record<'manager' | 'resident' | 'neighbour', string>;

const http = () => request(app.getHttpServer());
const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Site-Id': ids.site });
const M = () => as(tokens.manager);
const R = () => as(tokens.resident);
const N = () => as(tokens.neighbour);

async function login(identifier: string) {
  const res = await http()
    .post('/api/auth/login')
    .send({ identifier, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function charge(unitId: string, amountKurus: number, daysAgo = 5) {
  const res = await http()
    .post('/api/charges')
    .set(M())
    .send({
      chargeTypeId: ids.chargeType,
      scope: 'SELECTED',
      unitIds: [unitId],
      amountMode: 'PER_UNIT',
      amountKurus,
      issueDate: addDays(today, -daysAgo),
      dueDate: addDays(today, -daysAgo),
    })
    .expect(201);
  return res.body;
}

async function openChargeIds(unitId: string) {
  const res = await http().get(`/api/units/${unitId}/account`).set(M()).expect(200);
  return (res.body.charges as { id: string; remainingKurus: number; cancelledAt: string | null }[])
    .filter((c) => !c.cancelledAt && c.remainingKurus > 0)
    .map((c) => c.id);
}

const debtOf = async (unitId: string) =>
  (await http().get(`/api/units/${unitId}/account`).set(M()).expect(200)).body.debtKurus as number;

function checkout(chargeIds: string[], headers = R(), unitId = ids.unit1) {
  return http().post('/api/online-payments/checkout').set(headers).send({ unitId, chargeIds });
}

const tokenOf = (redirectUrl: string) => redirectUrl.split('/').pop()!;

const complete = (redirectUrl: string, result: 'success' | 'fail') =>
  http().post(redirectUrl).type('form').send({ result }).expect(303);

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, sites CASCADE');
  const passwordHash = await hashPassword(PASSWORD);
  const [manager, resident, neighbour] = await Promise.all(
    ['yonetici@odeme.test', 'sakin@odeme.test', 'komsu@odeme.test'].map((email, i) =>
      prisma.user.create({ data: { firstName: 'Kişi', lastName: String(i), email, passwordHash } }),
    ),
  );
  const site = await prisma.site.create({ data: { name: 'Ödeme Sitesi', kind: 'APARTMENT' } });
  await prisma.siteMembership.createMany({
    data: [
      { siteId: site.id, userId: manager!.id, role: 'SITE_MANAGER' },
      { siteId: site.id, userId: resident!.id, role: 'RESIDENT' },
      { siteId: site.id, userId: neighbour!.id, role: 'RESIDENT' },
    ],
  });
  const block = await prisma.block.create({ data: { siteId: site.id, name: 'Bina' } });
  const unit1 = await prisma.unit.create({
    data: { siteId: site.id, blockId: block.id, number: '1' },
  });
  const unit2 = await prisma.unit.create({
    data: { siteId: site.id, blockId: block.id, number: '2' },
  });
  for (const [unitId, userId] of [
    [unit1.id, resident!.id],
    [unit2.id, neighbour!.id],
  ] as const) {
    await prisma.occupancy.create({
      data: {
        siteId: site.id,
        unitId,
        userId,
        firstName: 'Sakin',
        lastName: 'Kişi',
        type: 'OWNER',
        startDate: new Date('2020-01-01'),
      },
    });
  }
  ids.site = site.id;
  ids.unit1 = unit1.id;
  ids.unit2 = unit2.id;
  tokens.manager = await login('yonetici@odeme.test');
  tokens.resident = await login('sakin@odeme.test');
  tokens.neighbour = await login('komsu@odeme.test');

  const types = await http().get('/api/charge-types').set(M()).expect(200);
  ids.chargeType = types.body[0].id;
  const accounts = await http().get('/api/cash-accounts').set(M()).expect(200);
  ids.cash = accounts.body.find((a: { code: string }) => a.code === 'CASH').id;
  await charge(ids.unit1, 150_000, 40);
  await charge(ids.unit1, 150_000, 10);
  await charge(ids.unit2, 150_000, 10);
});

afterAll(async () => {
  await app?.close();
});

describe('online ödeme ayarı', () => {
  it('varsayılan olarak kapalıdır, kapalıyken ödeme başlatılamaz', async () => {
    const status = await http().get('/api/online-payments/status').set(R()).expect(200);
    expect(status.body).toEqual({ enabled: false, testMode: true });
    await checkout(await openChargeIds(ids.unit1)).expect(400);
  });

  it('yönetici açar ve gelir hesabını seçer; sakin ayarı değiştiremez', async () => {
    await http()
      .put('/api/online-payments/settings')
      .set(R())
      .send({ enabled: true, accountId: null })
      .expect(403);
    const res = await http()
      .put('/api/online-payments/settings')
      .set(M())
      .send({ enabled: true, accountId: ids.cash })
      .expect(200);
    expect(res.body).toMatchObject({ enabled: true, accountId: ids.cash, providerAvailable: true });
    const status = await http().get('/api/online-payments/status').set(R()).expect(200);
    expect(status.body.enabled).toBe(true);
  });
});

describe('ödeme akışı', () => {
  let redirectUrl: string;
  let intentId: string;

  it('sakin yalnızca kendi dairesinin açık borçlarını ödeyebilir', async () => {
    const unit2Charges = await openChargeIds(ids.unit2);
    await checkout(unit2Charges, R(), ids.unit2).expect(404);
    await checkout(unit2Charges).expect(400);
  });

  it('tutar sunucuda hesaplanır ve test ödeme sayfası açılır', async () => {
    const res = await checkout(await openChargeIds(ids.unit1)).expect(201);
    redirectUrl = res.body.redirectUrl;
    intentId = res.body.intentId;
    expect(redirectUrl).toMatch(/^\/api\/online-payments\/mock\/[\w-]+$/);
    const page = await http().get(redirectUrl).expect(200);
    expect(page.text).toContain('₺3.000,00');
    expect(page.text).toContain('Test ödeme sayfası');
    const intent = await http()
      .get(`/api/online-payments/intents/${intentId}`)
      .set(R())
      .expect(200);
    expect(intent.body).toMatchObject({ status: 'PENDING', amountKurus: 300_000 });
  });

  it('ödeme sürerken aynı daireye elle tahsilat girilemez', async () => {
    await http()
      .post('/api/payments')
      .set(M())
      .send({ unitId: ids.unit1, amountKurus: 10_000, method: 'CASH', paidAt: today })
      .expect(409);
  });

  it('imzası geçersiz bildirim reddedilir, bilinmeyen sağlayıcı bulunamaz', async () => {
    await http()
      .post('/api/online-payments/callback/mock')
      .set('x-mock-signature', 'ab'.repeat(32))
      .send({ token: tokenOf(redirectUrl), status: 'SUCCEEDED', amountKurus: 300_000 })
      .expect(401);
    await http().post('/api/online-payments/callback/baska').send({}).expect(404);
    const intent = await http()
      .get(`/api/online-payments/intents/${intentId}`)
      .set(R())
      .expect(200);
    expect(intent.body.status).toBe('PENDING');
  });

  it('başarılı ödeme borçları kapatır, makbuz üretir ve seçilen hesaba gelir yazar', async () => {
    const res = await complete(redirectUrl, 'success');
    expect(res.headers.location).toBe(
      `http://localhost:5173/odeme/sonuc?odeme=${intentId}&site=${ids.site}`,
    );
    const intent = await http()
      .get(`/api/online-payments/intents/${intentId}`)
      .set(R())
      .expect(200);
    expect(intent.body).toMatchObject({
      status: 'SUCCEEDED',
      appliedKurus: 300_000,
      refundedKurus: 0,
    });
    expect(intent.body.receiptNo).toBeGreaterThan(0);
    expect(await debtOf(ids.unit1)).toBe(0);

    const payments = await http().get(`/api/payments?unitId=${ids.unit1}`).set(M()).expect(200);
    expect(payments.body).toHaveLength(1);
    expect(payments.body[0]).toMatchObject({
      method: 'ONLINE',
      amountKurus: 300_000,
      accountId: ids.cash,
      online: true,
    });
  });

  it('aynı bildirim tekrar gelse de ikinci ödeme oluşmaz', async () => {
    await complete(redirectUrl, 'success');
    const payments = await http().get(`/api/payments?unitId=${ids.unit1}`).set(M()).expect(200);
    expect(payments.body).toHaveLength(1);
  });

  it('başka sakin ödeme kaydını göremez', async () => {
    await http().get(`/api/online-payments/intents/${intentId}`).set(N()).expect(404);
  });

  it('online ödeme normal iptal edilemez; iade edilince borç yeniden açılır', async () => {
    const payment = (await http().get(`/api/payments?unitId=${ids.unit1}`).set(M()).expect(200))
      .body[0];
    await http()
      .post(`/api/payments/${payment.id}/cancel`)
      .set(M())
      .send({ reason: 'Yanlış ödeme' })
      .expect(400);
    await http()
      .post(`/api/online-payments/payments/${payment.id}/refund`)
      .set(R())
      .send({ reason: 'Yanlış ödeme' })
      .expect(403);
    const refunded = await http()
      .post(`/api/online-payments/payments/${payment.id}/refund`)
      .set(M())
      .send({ reason: 'Sakin talebi' })
      .expect(200);
    expect(refunded.body.cancelledAt).not.toBeNull();
    expect(refunded.body.cancelReason).toBe('İade: Sakin talebi');
    expect(await debtOf(ids.unit1)).toBe(300_000);
    const intent = await http()
      .get(`/api/online-payments/intents/${intentId}`)
      .set(M())
      .expect(200);
    expect(intent.body).toMatchObject({ status: 'REFUNDED', refundedKurus: 300_000 });
    await http()
      .post(`/api/online-payments/payments/${payment.id}/refund`)
      .set(M())
      .send({ reason: 'Tekrar' })
      .expect(409);
  });
});

describe('başarısız ve geç tamamlanan ödemeler', () => {
  it('başarısız ödeme kayıt oluşturmaz', async () => {
    const res = await checkout(await openChargeIds(ids.unit1)).expect(201);
    await complete(res.body.redirectUrl, 'fail');
    const intent = await http()
      .get(`/api/online-payments/intents/${res.body.intentId}`)
      .set(R())
      .expect(200);
    expect(intent.body).toMatchObject({ status: 'FAILED', failureReason: 'Kart reddedildi' });
    expect(await debtOf(ids.unit1)).toBe(300_000);
  });

  it('süresi dolduktan sonra bu arada elden ödenen kısım iade edilir, fazla ödeme oluşmaz', async () => {
    const res = await checkout(await openChargeIds(ids.unit1)).expect(201);
    await prisma.paymentIntent.update({
      where: { id: res.body.intentId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await http()
      .post('/api/payments')
      .set(M())
      .send({ unitId: ids.unit1, amountKurus: 200_000, method: 'CASH', paidAt: today })
      .expect(201);

    await complete(res.body.redirectUrl, 'success');
    const intent = await http()
      .get(`/api/online-payments/intents/${res.body.intentId}`)
      .set(R())
      .expect(200);
    expect(intent.body).toMatchObject({
      status: 'SUCCEEDED',
      amountKurus: 300_000,
      appliedKurus: 100_000,
      refundedKurus: 200_000,
    });
    expect(await debtOf(ids.unit1)).toBe(0);
    const account = await http().get(`/api/units/${ids.unit1}/account`).set(M()).expect(200);
    for (const c of account.body.charges as { paidKurus: number; amountKurus: number }[]) {
      expect(c.paidKurus).toBeLessThanOrEqual(c.amountKurus);
    }
  });

  it('borç tamamen kapanmışsa ödemenin tamamı iade edilir', async () => {
    await charge(ids.unit1, 50_000, 1);
    const chargeIds = await openChargeIds(ids.unit1);
    expect(chargeIds).toHaveLength(1);
    const res = await checkout(chargeIds).expect(201);
    await prisma.paymentIntent.update({
      where: { id: res.body.intentId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await http()
      .post('/api/payments')
      .set(M())
      .send({ unitId: ids.unit1, amountKurus: 50_000, method: 'CASH', paidAt: today })
      .expect(201);
    await complete(res.body.redirectUrl, 'success');
    const intent = await http()
      .get(`/api/online-payments/intents/${res.body.intentId}`)
      .set(R())
      .expect(200);
    expect(intent.body).toMatchObject({
      status: 'REFUNDED',
      appliedKurus: 0,
      refundedKurus: 50_000,
      paymentId: null,
    });
    expect(await debtOf(ids.unit1)).toBe(0);
  });
});

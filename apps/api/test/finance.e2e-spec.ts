import { addMonths, periodOfDate } from '@apartman/shared';
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
const current = periodOfDate(today);
const previous = addMonths(current, -1);
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

let app: NestExpressApplication;
let prisma: PrismaService;
const ids = {} as Record<'siteA' | 'siteB' | 'unitA1' | 'unitA2', string>;
const tokens = {} as Record<'managerA' | 'managerB' | 'resident', string>;
const accounts = {} as Record<'cash' | 'bank', string>;
const categories = {} as Record<'renovation' | 'rent' | 'duesIncome', string>;

const http = () => request(app.getHttpServer());
const as = (token: string, siteId: string) => ({
  Authorization: `Bearer ${token}`,
  'X-Site-Id': siteId,
});
const A = () => as(tokens.managerA, ids.siteA);
const B = () => as(tokens.managerB, ids.siteB);
const R = () => as(tokens.resident, ids.siteA);

function binary(res: request.Response, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function login(identifier: string) {
  const res = await http()
    .post('/api/auth/login')
    .send({ identifier, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function balances() {
  const res = await http().get('/api/cash-accounts').set(A()).expect(200);
  const list = res.body as { id: string; balanceKurus: number }[];
  return Object.fromEntries(list.map((a) => [a.id, a.balanceKurus])) as Record<string, number>;
}

async function openCharge(unitId: string, amountKurus: number, date: string) {
  const types = await http().get('/api/charge-types').set(A()).expect(200);
  await http()
    .post('/api/charges')
    .set(A())
    .send({
      chargeTypeId: types.body[0].id,
      scope: 'SELECTED',
      unitIds: [unitId],
      amountMode: 'PER_UNIT',
      amountKurus,
      issueDate: date,
      dueDate: date,
    })
    .expect(201);
}

function expense(body: Record<string, unknown>, headers = A()) {
  return http()
    .post('/api/transactions')
    .set(headers)
    .send({
      type: 'EXPENSE',
      accountId: accounts.cash,
      categoryId: categories.renovation,
      amountKurus: 10_000,
      date: today,
      ...body,
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
  const [managerA, managerB, resident] = await Promise.all(
    ['a@kasa.test', 'b@kasa.test', 'sakin@kasa.test'].map((email, i) =>
      prisma.user.create({
        data: { firstName: 'Kişi', lastName: String(i), email, passwordHash },
      }),
    ),
  );
  const siteA = await prisma.site.create({ data: { name: 'Kasa Sitesi A' } });
  const siteB = await prisma.site.create({ data: { name: 'Kasa Sitesi B' } });
  await prisma.siteMembership.createMany({
    data: [
      { siteId: siteA.id, userId: managerA!.id, role: 'SITE_MANAGER' },
      { siteId: siteB.id, userId: managerB!.id, role: 'SITE_MANAGER' },
      { siteId: siteA.id, userId: resident!.id, role: 'RESIDENT' },
    ],
  });
  const block = await prisma.block.create({ data: { siteId: siteA.id, name: 'A' } });
  const [unitA1, unitA2] = await Promise.all(
    ['1', '2'].map((number) =>
      prisma.unit.create({ data: { siteId: siteA.id, blockId: block.id, number } }),
    ),
  );
  await prisma.occupancy.create({
    data: {
      siteId: siteA.id,
      unitId: unitA1!.id,
      userId: resident!.id,
      firstName: 'Ayşe',
      lastName: 'Sakin',
      type: 'OWNER',
      startDate: new Date('2020-01-01'),
    },
  });
  Object.assign(ids, {
    siteA: siteA.id,
    siteB: siteB.id,
    unitA1: unitA1!.id,
    unitA2: unitA2!.id,
  });
  tokens.managerA = await login('a@kasa.test');
  tokens.managerB = await login('b@kasa.test');
  tokens.resident = await login('sakin@kasa.test');
});

afterAll(async () => {
  await app?.close();
});

describe('Kasa hesapları ve kategoriler', () => {
  it('yeni sitede nakit kasa, banka ve varsayılan kategoriler hazırdır', async () => {
    const res = await http().get('/api/cash-accounts').set(A()).expect(200);
    expect(res.body.map((a: { name: string }) => a.name)).toEqual(['Nakit kasa', 'Banka hesabı']);
    accounts.cash = res.body[0].id;
    accounts.bank = res.body[1].id;

    const cats = await http().get('/api/finance-categories').set(A()).expect(200);
    const byCode = (code: string) =>
      cats.body.find((c: { code: string | null }) => c.code === code).id as string;
    categories.renovation = byCode('RENOVATION');
    categories.rent = byCode('RENT_INCOME');
    categories.duesIncome = byCode('DUES_INCOME');
  });

  it('başka sitenin hesabına kayıt girilemez', async () => {
    await http().get('/api/cash-accounts').set(B()).expect(200);
    await expense({}, B()).expect(404);
  });
});

describe('Tahsilat ve kasa', () => {
  it('ödeme sıra numaralı makbuz alır ve seçilen kasaya gelir yazılır', async () => {
    await openCharge(ids.unitA1, 50_000, today);
    await openCharge(ids.unitA2, 30_000, today);
    const before = await balances();

    const first = await http()
      .post('/api/payments')
      .set(A())
      .send({ unitId: ids.unitA1, amountKurus: 50_000, method: 'CASH', paidAt: today })
      .expect(201);
    const second = await http()
      .post('/api/payments')
      .set(A())
      .send({
        unitId: ids.unitA2,
        amountKurus: 30_000,
        method: 'CASH',
        accountId: accounts.bank,
        paidAt: today,
      })
      .expect(201);
    expect(first.body).toMatchObject({ receiptNo: 1, accountName: 'Nakit kasa' });
    expect(second.body).toMatchObject({ receiptNo: 2, accountName: 'Banka hesabı' });

    const after = await balances();
    expect(after[accounts.cash]! - before[accounts.cash]!).toBe(50_000);
    expect(after[accounts.bank]! - before[accounts.bank]!).toBe(30_000);

    const list = await http()
      .get('/api/transactions')
      .query({ type: 'INCOME' })
      .set(A())
      .expect(200);
    const income = list.body.find((t: { paymentId: string }) => t.paymentId === first.body.id);
    expect(income).toMatchObject({
      receiptNo: 1,
      unitNumber: '1',
      categoryName: 'Aidat ve borç tahsilatı',
    });
    await http()
      .post(`/api/transactions/${income.id}/cancel`)
      .set(A())
      .send({ reason: 'Deneme iptali' })
      .expect(400);

    await http()
      .post(`/api/payments/${second.body.id}/cancel`)
      .set(A())
      .send({ reason: 'Yanlış hesap' })
      .expect(200);
    expect((await balances())[accounts.bank]).toBe(before[accounts.bank]);
  });

  it('makbuz PDF olarak iner; sakin yalnızca kendi dairesinin makbuzunu alır', async () => {
    const payments = await http().get('/api/payments').set(A()).expect(200);
    const own = payments.body.find((p: { unitId: string }) => p.unitId === ids.unitA1);
    const other = payments.body.find((p: { unitId: string }) => p.unitId === ids.unitA2);

    const pdf = await http()
      .get(`/api/payments/${own.id}/receipt.pdf`)
      .set(R())
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await http().get(`/api/payments/${other.id}/receipt.pdf`).set(R()).expect(404);
    await http().get(`/api/payments/${own.id}/receipt.pdf`).set(B()).expect(404);
  });

  it('aidat tahsilatı elle gelir olarak girilemez; kategori türü uyuşmalıdır', async () => {
    await http()
      .post('/api/transactions')
      .set(A())
      .send({
        type: 'INCOME',
        accountId: accounts.cash,
        categoryId: categories.duesIncome,
        amountKurus: 1_000,
        date: today,
      })
      .expect(400);
    await expense({ categoryId: categories.rent }).expect(400);
    await http()
      .post('/api/transactions')
      .set(A())
      .send({
        type: 'INCOME',
        accountId: accounts.cash,
        categoryId: categories.rent,
        amountKurus: 20_000,
        date: today,
        description: 'Otopark kirası',
      })
      .expect(201);
  });

  it('transfer iki hesabın bakiyesini birlikte değiştirir', async () => {
    const before = await balances();
    await http()
      .post('/api/transactions')
      .set(A())
      .send({
        type: 'TRANSFER',
        accountId: accounts.cash,
        toAccountId: accounts.bank,
        amountKurus: 15_000,
        date: today,
      })
      .expect(201);
    const after = await balances();
    expect(after[accounts.cash]! - before[accounts.cash]!).toBe(-15_000);
    expect(after[accounts.bank]! - before[accounts.bank]!).toBe(15_000);
  });
});

describe('Yapılan işler, firmalar ve belgeler', () => {
  let workId: string;
  let expenseId: string;
  let attachmentId: string;

  it('işe yapılan taksitler ödenen ve kalan tutarı oluşturur', async () => {
    const vendor = await http()
      .post('/api/vendors')
      .set(A())
      .send({ name: 'Renk Boya Ltd.', phone: '0532 111 22 33', taxNumber: '1234567890' })
      .expect(201);
    const work = await http()
      .post('/api/works')
      .set(A())
      .send({
        title: 'Dış cephe boyası',
        vendorId: vendor.body.id,
        agreedKurus: 100_000,
        startDate: today,
        status: 'IN_PROGRESS',
      })
      .expect(201);
    workId = work.body.id;

    const first = await expense({ workId, amountKurus: 40_000, documentNo: 'A-001' }).expect(201);
    expect(first.body.vendorName).toBe('Renk Boya Ltd.');
    expenseId = first.body.id;
    await expense({ workId, amountKurus: 25_000 }).expect(201);

    const detail = await http().get(`/api/works/${workId}`).set(A()).expect(200);
    expect(detail.body).toMatchObject({ paidKurus: 65_000, remainingKurus: 35_000 });
    expect(detail.body.payments).toHaveLength(2);

    const vendors = await http().get('/api/vendors').set(A()).expect(200);
    expect(vendors.body[0]).toMatchObject({ paidKurus: 65_000, workCount: 1 });
    await http().delete(`/api/works/${workId}`).set(A()).expect(400);
  });

  it('fatura yüklenir; Türkçe dosya adı korunur, desteklenmeyen dosya reddedilir', async () => {
    const res = await http()
      .post('/api/attachments')
      .query({ target: 'transaction', targetId: expenseId })
      .set(A())
      .attach('file', PDF_BYTES, {
        filename: 'Boya faturası Çiğdem.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      fileName: 'Boya faturası Çiğdem.pdf',
      mimeType: 'application/pdf',
    });
    attachmentId = res.body.id;

    await http()
      .post('/api/attachments')
      .query({ target: 'work', targetId: workId })
      .set(A())
      .attach('file', Buffer.from('MZ yürütülebilir'), { filename: 'fatura.pdf' })
      .expect(400);
    const tooBig = await http()
      .post('/api/attachments')
      .query({ target: 'work', targetId: workId })
      .set(A())
      .attach('file', Buffer.concat([PDF_BYTES, Buffer.alloc(10 * 1024 * 1024)]), {
        filename: 'buyuk.pdf',
      })
      .expect(413);
    expect(tooBig.body.message).toContain('10 MB');
  });

  it('sakin görünür gideri ve belgesini görür; gizlenince göremez', async () => {
    const file = await http()
      .get(`/api/attachments/${attachmentId}`)
      .set(R())
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(Buffer.compare(file.body as Buffer, PDF_BYTES)).toBe(0);
    await http().get(`/api/attachments/${attachmentId}`).set(B()).expect(404);

    const view = await http().get('/api/transparency').set(R()).expect(200);
    expect(view.body.expenses.map((e: { id: string }) => e.id)).toContain(expenseId);
    expect(view.body.works[0]).toMatchObject({ title: 'Dış cephe boyası', paidKurus: 65_000 });

    await http()
      .patch(`/api/transactions/${expenseId}`)
      .set(A())
      .send({ visibleToResidents: false })
      .expect(200);
    await http().get(`/api/attachments/${attachmentId}`).set(R()).expect(404);
    const hidden = await http().get('/api/transparency').set(R()).expect(200);
    expect(hidden.body.expenses.map((e: { id: string }) => e.id)).not.toContain(expenseId);
    await http().get('/api/transactions').set(R()).expect(403);
  });
});

describe('Ay kapanışı ve raporlar', () => {
  it('kapanan ayda kayıt eklenemez ve ödeme iptal edilemez; ay yeniden açılabilir', async () => {
    await openCharge(ids.unitA2, 12_000, `${previous}-05`);
    const payment = await http()
      .post('/api/payments')
      .set(A())
      .send({ unitId: ids.unitA2, amountKurus: 12_000, method: 'CASH', paidAt: `${previous}-06` })
      .expect(201);

    await http().post('/api/finance/closings').set(A()).send({ period: current }).expect(400);
    const closing = await http()
      .post('/api/finance/closings')
      .set(A())
      .send({ period: previous })
      .expect(201);
    expect(closing.body.incomeKurus).toBe(12_000);

    await expense({ date: `${previous}-15` }).expect(400);
    await http()
      .post(`/api/payments/${payment.body.id}/cancel`)
      .set(A())
      .send({ reason: 'Kapanmış ay' })
      .expect(400);
    const list = await http()
      .get('/api/transactions')
      .query({ to: `${previous}-28` })
      .set(A());
    expect(list.body.every((t: { locked: boolean }) => t.locked)).toBe(true);

    await http().delete('/api/finance/closings/latest').set(A()).expect(204);
    await http()
      .post(`/api/payments/${payment.body.id}/cancel`)
      .set(A())
      .send({ reason: 'Ay yeniden açıldı' })
      .expect(200);
  });

  it('özet toplamları kategorilerle tutarlıdır; rapor PDF ve Excel iner', async () => {
    const res = await http()
      .get('/api/finance/summary')
      .query({ from: `${previous}-01`, to: today })
      .set(A())
      .expect(200);
    const sum = (kind: string) =>
      res.body.byCategory
        .filter((c: { kind: string }) => c.kind === kind)
        .reduce((s: number, c: { amountKurus: number }) => s + c.amountKurus, 0);
    expect(res.body.incomeKurus).toBe(sum('INCOME'));
    expect(res.body.expenseKurus).toBe(65_000);
    expect(res.body.byMonth.map((m: { period: string }) => m.period)).toEqual([previous, current]);

    for (const format of ['pdf', 'xlsx']) {
      const file = await http()
        .get(`/api/finance/report.${format}`)
        .query({ from: `${previous}-01`, to: today })
        .set(A())
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect((file.body as Buffer).length).toBeGreaterThan(500);
    }
  });
});

describe('Toplu iptal', () => {
  it('iptal edilebilenler iptal edilir, edilemeyenler nedeniyle atlanır', async () => {
    const first = await expense({ description: 'Toplu 1' }).expect(201);
    const second = await expense({ description: 'Toplu 2' }).expect(201);
    const incomes = await http().get('/api/transactions').query({ type: 'INCOME' }).set(A());
    const fromPayment = incomes.body.find((t: { paymentId: string | null }) => t.paymentId);

    const res = await http()
      .post('/api/transactions/bulk-cancel')
      .set(A())
      .send({ ids: [first.body.id, second.body.id, fromPayment.id], reason: 'Toplu deneme' })
      .expect(200);
    expect(res.body.cancelled).toBe(2);
    expect(res.body.skipped).toEqual([
      { id: fromPayment.id, message: expect.stringContaining('tahsilat') },
    ]);
  });

  it('borçlarda ödemesi olan atlanır; başka sitenin kayıtları iptal edilemez', async () => {
    await openCharge(ids.unitA1, 7_000, today);
    await openCharge(ids.unitA1, 8_000, today);
    const open = await http()
      .get('/api/charges')
      .query({ unitId: ids.unitA1, status: 'open' })
      .set(A())
      .expect(200);
    const [a, b] = open.body as { id: string; amountKurus: number }[];
    await http()
      .post('/api/payments')
      .set(A())
      .send({
        unitId: ids.unitA1,
        amountKurus: 1_000,
        method: 'CASH',
        paidAt: today,
        allocations: [{ chargeId: a!.id, amountKurus: 1_000 }],
      })
      .expect(201);

    const foreign = await http()
      .post('/api/charges/bulk-cancel')
      .set(B())
      .send({ ids: [a!.id, b!.id], reason: 'Başka site' })
      .expect(200);
    expect(foreign.body).toMatchObject({ cancelled: 0 });
    expect(foreign.body.skipped).toHaveLength(2);

    const res = await http()
      .post('/api/charges/bulk-cancel')
      .set(A())
      .send({ ids: [a!.id, b!.id], reason: 'Yanlış yazıldı' })
      .expect(200);
    expect(res.body.cancelled).toBe(1);
    expect(res.body.skipped.map((s: { id: string }) => s.id)).toEqual([a!.id]);

    const payments = await http().get('/api/payments').query({ unitId: ids.unitA1 }).set(A());
    const active = payments.body.filter((p: { cancelledAt: string | null }) => !p.cancelledAt);
    const bulk = await http()
      .post('/api/payments/bulk-cancel')
      .set(A())
      .send({ ids: active.map((p: { id: string }) => p.id), reason: 'Toplu iptal' })
      .expect(200);
    expect(bulk.body).toEqual({ cancelled: active.length, skipped: [] });
  });
});

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
const year = Number(current.slice(0, 4));

let app: NestExpressApplication;
let prisma: PrismaService;
const ids = {} as Record<'siteA' | 'siteB' | 'blockA' | 'unitA1' | 'unitA2' | 'unitB1', string>;
const tokens = {} as Record<'managerA' | 'managerB' | 'resident', string>;

const http = () => request(app.getHttpServer());
const as = (token: string, siteId: string) => ({
  Authorization: `Bearer ${token}`,
  'X-Site-Id': siteId,
});
const A = () => as(tokens.managerA, ids.siteA);

async function login(identifier: string) {
  const res = await http()
    .post('/api/auth/login')
    .send({ identifier, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function accountOf(unitId: string) {
  return (await http().get(`/api/units/${unitId}/account`).set(A()).expect(200)).body as {
    debtKurus: number;
    charges: {
      id: string;
      period: string | null;
      amountKurus: number;
      paidKurus: number;
      status: string;
    }[];
  };
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
  const [managerA, managerB, resident] = await Promise.all([
    prisma.user.create({
      data: { firstName: 'Yönetici', lastName: 'A', email: 'a@dues.test', passwordHash },
    }),
    prisma.user.create({
      data: { firstName: 'Yönetici', lastName: 'B', email: 'b@dues.test', passwordHash },
    }),
    prisma.user.create({
      data: { firstName: 'Sakin', lastName: 'Bir', email: 'sakin@dues.test', passwordHash },
    }),
  ]);
  const siteA = await prisma.site.create({ data: { name: 'Aidat Sitesi A' } });
  const siteB = await prisma.site.create({ data: { name: 'Aidat Sitesi B' } });
  await prisma.siteMembership.createMany({
    data: [
      { siteId: siteA.id, userId: managerA.id, role: 'SITE_MANAGER' },
      { siteId: siteB.id, userId: managerB.id, role: 'SITE_MANAGER' },
      { siteId: siteA.id, userId: resident.id, role: 'RESIDENT' },
    ],
  });
  const blockA = await prisma.block.create({ data: { siteId: siteA.id, name: 'A' } });
  const blockB = await prisma.block.create({ data: { siteId: siteB.id, name: 'B' } });
  const unitA1 = await prisma.unit.create({
    data: { siteId: siteA.id, blockId: blockA.id, number: '1', areaM2: 100, landShare: 10 },
  });
  const unitA2 = await prisma.unit.create({
    data: { siteId: siteA.id, blockId: blockA.id, number: '2', areaM2: 50, landShare: 30 },
  });
  const unitB1 = await prisma.unit.create({
    data: { siteId: siteB.id, blockId: blockB.id, number: '1', areaM2: 80, landShare: 10 },
  });
  await prisma.occupancy.create({
    data: {
      siteId: siteA.id,
      unitId: unitA1.id,
      userId: resident.id,
      firstName: 'Sakin',
      lastName: 'Bir',
      type: 'OWNER',
      startDate: new Date('2020-01-01'),
    },
  });
  Object.assign(ids, {
    siteA: siteA.id,
    siteB: siteB.id,
    blockA: blockA.id,
    unitA1: unitA1.id,
    unitA2: unitA2.id,
    unitB1: unitB1.id,
  });
  tokens.managerA = await login('a@dues.test');
  tokens.managerB = await login('b@dues.test');
  tokens.resident = await login('sakin@dues.test');
});

afterAll(async () => {
  await app?.close();
});

describe('Aidat planı ve tahakkuk', () => {
  it('m² bilgisi eksik daire varken oranlı plan reddedilir ve daire adı söylenir', async () => {
    const unit = await http()
      .post('/api/units')
      .set(A())
      .send({ blockId: ids.blockA, number: '3' })
      .expect(201);
    const res = await http()
      .post('/api/dues/plans')
      .set(A())
      .send({ method: 'AREA', amountKurus: 300_000, validFrom: previous })
      .expect(400);
    expect(res.body.message).toContain('A-3');
    await http().delete(`/api/units/${unit.body.id}`).set(A()).expect(204);
  });

  it('m²’ye göre plan toplamı kuruşu kuruşuna dağıtır', async () => {
    await http()
      .post('/api/dues/plans')
      .set(A())
      .send({ method: 'AREA', amountKurus: 300_000, validFrom: previous })
      .expect(201);
    const res = await http()
      .post('/api/dues/accrue')
      .set(A())
      .send({ period: current })
      .expect(200);
    expect(res.body).toMatchObject({
      period: current,
      created: 2,
      alreadyExisted: 0,
      totalKurus: 300_000,
    });

    const a1 = await accountOf(ids.unitA1);
    const a2 = await accountOf(ids.unitA2);
    expect(a1.charges[0]).toMatchObject({
      period: current,
      amountKurus: 200_000,
      status: 'UNPAID',
    });
    expect(a2.charges[0]).toMatchObject({ period: current, amountKurus: 100_000 });
  });

  it('aynı ay ikinci kez yazılmaz; gelecek ay için tahakkuk yapılamaz', async () => {
    const again = await http()
      .post('/api/dues/accrue')
      .set(A())
      .send({ period: current })
      .expect(200);
    expect(again.body).toMatchObject({ created: 0, alreadyExisted: 2 });
    await http()
      .post('/api/dues/accrue')
      .set(A())
      .send({ period: addMonths(current, 1) })
      .expect(400);
  });

  it('son ödeme günü site ayarından gelir', async () => {
    await http().patch('/api/dues/settings').set(A()).send({ dueDay: 15 }).expect(200);
    await http().post('/api/dues/accrue').set(A()).send({ period: previous }).expect(200);
    const charges = await prisma.charge.findMany({
      where: { siteId: ids.siteA, period: previous },
    });
    expect(charges).toHaveLength(2);
    expect(charges.every((c) => c.dueDate.toISOString().startsWith(`${previous}-15`))).toBe(true);
  });
});

describe('Tahsilat', () => {
  it('borçtan fazla ödeme reddedilir', async () => {
    const res = await http()
      .post('/api/payments')
      .set(A())
      .send({ unitId: ids.unitA1, amountKurus: 400_001, method: 'CASH', paidAt: today })
      .expect(400);
    expect(res.body.message).toContain('Borçtan fazla ödeme kabul edilmez');
  });

  it('ileri tarihli ödeme reddedilir', async () => {
    await http()
      .post('/api/payments')
      .set(A())
      .send({ unitId: ids.unitA1, amountKurus: 100, method: 'CASH', paidAt: '2999-01-01' })
      .expect(400);
  });

  it('otomatik dağıtım en eski borcu önce kapatır', async () => {
    const res = await http()
      .post('/api/payments')
      .set(A())
      .send({
        unitId: ids.unitA2,
        amountKurus: 150_000,
        method: 'BANK_TRANSFER',
        paidAt: today,
        reference: 'EFT-1',
      })
      .expect(201);
    expect(res.body.allocations).toHaveLength(2);
    const a2 = await accountOf(ids.unitA2);
    const byPeriod = Object.fromEntries(a2.charges.map((c) => [c.period, c]));
    expect(byPeriod[previous]).toMatchObject({ status: 'PAID' });
    expect(byPeriod[current]).toMatchObject({ status: 'PARTIAL', paidKurus: 50_000 });
    expect(a2.debtKurus).toBe(50_000);
  });

  it('elle dağıtım: yeni ay ödenir, eski ay borçlu kalır ve tabloda böyle görünür', async () => {
    const a1 = await accountOf(ids.unitA1);
    const currentCharge = a1.charges.find((c) => c.period === current)!;
    await http()
      .post('/api/payments')
      .set(A())
      .send({
        unitId: ids.unitA1,
        amountKurus: 200_000,
        method: 'CASH',
        paidAt: today,
        allocations: [{ chargeId: currentCharge.id, amountKurus: 200_000 }],
      })
      .expect(201);

    const matrix = await http().get(`/api/dues/matrix?year=${year}`).set(A()).expect(200);
    const row = matrix.body.rows.find((r: { unitId: string }) => r.unitId === ids.unitA1);
    const index = (p: string) => matrix.body.periods.indexOf(p);
    expect(row.cells[index(current)]).toMatchObject({ status: 'PAID' });
    if (previous.startsWith(String(year))) {
      expect(row.cells[index(previous)]).toMatchObject({ status: 'UNPAID', overdue: true });
    }
    expect(row.debtKurus).toBe(200_000);
  });

  it('aynı anda gelen iki ödemeden yalnızca biri borcu kapatabilir', async () => {
    const pay = () =>
      http()
        .post('/api/payments')
        .set(A())
        .send({ unitId: ids.unitA1, amountKurus: 200_000, method: 'CASH', paidAt: today });
    const results = await Promise.all([pay(), pay()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await accountOf(ids.unitA1)).debtKurus).toBe(0);
  });
});

describe('İptaller', () => {
  it('ödemesi olan borç iptal edilemez; ödeme iptal edilince borç yeniden açılır', async () => {
    const a2 = await accountOf(ids.unitA2);
    const previousCharge = a2.charges.find((c) => c.period === previous)!;
    await http()
      .post(`/api/charges/${previousCharge.id}/cancel`)
      .set(A())
      .send({ reason: 'Hatalı tahakkuk' })
      .expect(409);

    const payments = await http().get(`/api/payments?unitId=${ids.unitA2}`).set(A()).expect(200);
    await http()
      .post(`/api/payments/${payments.body[0].id}/cancel`)
      .set(A())
      .send({ reason: 'Yanlış daireye girildi' })
      .expect(200);

    const after = await accountOf(ids.unitA2);
    expect(after.debtKurus).toBe(200_000);
    await http()
      .post(`/api/charges/${previousCharge.id}/cancel`)
      .set(A())
      .send({ reason: 'Hatalı tahakkuk' })
      .expect(200);
    expect((await accountOf(ids.unitA2)).debtKurus).toBe(100_000);
  });
});

describe('Elle borç', () => {
  it('toplam tutar arsa payına göre dağıtılır', async () => {
    const types = await http().get('/api/charge-types').set(A()).expect(200);
    const fixture = types.body.find((t: { code: string }) => t.code === 'FIXTURE');
    const res = await http()
      .post('/api/charges')
      .set(A())
      .send({
        chargeTypeId: fixture.id,
        scope: 'ALL',
        amountMode: 'DISTRIBUTE',
        method: 'LAND_SHARE',
        amountKurus: 40_000,
        issueDate: today,
        dueDate: today,
        description: 'Asansör bakımı',
      })
      .expect(201);
    expect(res.body).toEqual({ created: 2, totalKurus: 40_000 });
    const charges = await prisma.charge.findMany({
      where: { siteId: ids.siteA, description: 'Asansör bakımı' },
    });
    const byUnit = Object.fromEntries(charges.map((c) => [c.unitId, c.amountKurus]));
    expect(byUnit[ids.unitA1]).toBe(10_000);
    expect(byUnit[ids.unitA2]).toBe(30_000);
  });
});

describe('Site izolasyonu ve sakin erişimi', () => {
  it('B sitesinin yöneticisi A sitesinin dairesine ödeme giremez ve hesabını göremez', async () => {
    await http()
      .post('/api/payments')
      .set(as(tokens.managerB, ids.siteB))
      .send({ unitId: ids.unitA1, amountKurus: 100, method: 'CASH', paidAt: today })
      .expect(404);
    await http()
      .get(`/api/units/${ids.unitA1}/account`)
      .set(as(tokens.managerB, ids.siteB))
      .expect(404);
    await http().get(`/api/units/${ids.unitB1}/account`).set(A()).expect(404);
    const matrix = await http()
      .get(`/api/dues/matrix?year=${year}`)
      .set(as(tokens.managerB, ids.siteB))
      .expect(200);
    expect(matrix.body.rows.map((r: { unitId: string }) => r.unitId)).toEqual([ids.unitB1]);
  });

  it('sakin kendi hesabını ve ekstresini görür, başka daireyi göremez, ödeme giremez', async () => {
    const R = as(tokens.resident, ids.siteA);
    await http().get(`/api/units/${ids.unitA1}/account`).set(R).expect(200);
    await http().get(`/api/units/${ids.unitA2}/account`).set(R).expect(404);
    await http().get(`/api/units/${ids.unitA2}/statement.pdf`).set(R).expect(404);
    await http().get(`/api/dues/matrix?year=${year}`).set(R).expect(403);
    await http()
      .post('/api/payments')
      .set(R)
      .send({ unitId: ids.unitA1, amountKurus: 100, method: 'CASH', paidAt: today })
      .expect(403);

    const pdf = await http()
      .get(`/api/units/${ids.unitA1}/statement.pdf`)
      .set(R)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('Ekstre ve raporlar', () => {
  it('ekstre yürüyen bakiyesi daire borcuyla tutarlıdır', async () => {
    const statement = await http()
      .get(`/api/units/${ids.unitA1}/statement?from=${previous}-01&to=${today}`)
      .set(A())
      .expect(200);
    const account = await accountOf(ids.unitA1);
    expect(statement.body.closingKurus).toBe(account.debtKurus);
    expect(statement.body.openingKurus).toBe(0);
  });

  it('borç raporu Excel ve tahsilat raporu PDF olarak iner', async () => {
    const xlsx = await http()
      .get('/api/reports/debts.xlsx')
      .set(A())
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');

    const pdf = await http()
      .get(`/api/reports/payments.pdf?from=${previous}-01&to=${today}`)
      .set(A())
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect(String(pdf.headers['content-disposition'])).toContain('tahsilat-raporu');

    await http().get('/api/reports/debts.docx').set(A()).expect(404);
  });
});

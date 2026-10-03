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
let siteId: string;
const units = {} as Record<'one' | 'two', string>;
const employees = {} as Record<'doorman' | 'cleaner' | 'nophone', string>;
const tokens = {} as Record<'manager' | 'resident' | 'staff', string>;

const http = () => request(app.getHttpServer());
const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Site-Id': siteId });
const M = () => as(tokens.manager);
const R = () => as(tokens.resident);
const S = () => as(tokens.staff);

async function login(identifier: string) {
  const res = await http()
    .post('/api/auth/login')
    .send({ identifier, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
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
  const [manager, resident] = await Promise.all(
    ['yonetici@kapi.test', 'sakin@kapi.test'].map((email, i) =>
      prisma.user.create({ data: { firstName: 'Kişi', lastName: String(i), email, passwordHash } }),
    ),
  );
  const site = await prisma.site.create({ data: { name: 'Kapı Apartmanı', kind: 'APARTMENT' } });
  siteId = site.id;
  const block = await prisma.block.create({ data: { siteId, name: 'Bina' } });
  for (const [key, number] of [
    ['one', '1'],
    ['two', '2'],
  ] as const) {
    units[key] = (await prisma.unit.create({ data: { siteId, blockId: block.id, number } })).id;
  }
  await prisma.siteMembership.createMany({
    data: [
      { siteId, userId: manager!.id, role: 'SITE_MANAGER' },
      { siteId, userId: resident!.id, role: 'RESIDENT' },
    ],
  });
  await prisma.occupancy.create({
    data: {
      siteId,
      unitId: units.one,
      userId: resident!.id,
      firstName: 'Ayşe',
      lastName: 'Kaya',
      type: 'OWNER',
      startDate: new Date('2020-01-01'),
    },
  });
  for (const [key, role, phone] of [
    ['doorman', 'DOORMAN', '+905320000001'],
    ['cleaner', 'CLEANING', '+905320000002'],
    ['nophone', 'GARDENER', null],
  ] as const) {
    employees[key] = (
      await prisma.employee.create({
        data: { siteId, firstName: 'Görevli', lastName: key, role, phone },
      })
    ).id;
  }
  tokens.manager = await login('yonetici@kapi.test');
  tokens.resident = await login('sakin@kapi.test');
});

afterAll(async () => {
  await app?.close();
});

describe('Görevli hesabı', () => {
  it('yönetici davet bağlantısı üretir, görevli şifresini belirleyip girer', async () => {
    await http()
      .post(`/api/employees/${employees.nophone}/account/invitation`)
      .set(M())
      .expect(400);
    await http()
      .post(`/api/employees/${employees.doorman}/account/invitation`)
      .set(R())
      .expect(403);
    const invite = await http()
      .post(`/api/employees/${employees.doorman}/account/invitation`)
      .set(M())
      .expect(201);
    const token = String(invite.body.url).split('/davet/')[1]!;
    const info = await http().get(`/api/auth/invitations/${token}`).expect(200);
    expect(info.body).toMatchObject({
      kind: 'STAFF',
      firstName: 'Görevli',
      siteName: 'Kapı Apartmanı',
      blockName: null,
      hasExistingAccount: false,
    });
    const status = await http()
      .get(`/api/employees/${employees.doorman}/account`)
      .set(M())
      .expect(200);
    expect(status.body).toEqual({ hasAccount: false, doorAccess: false, invitationPending: true });

    await http()
      .post(`/api/auth/invitations/${token}/accept`)
      .send({ password: PASSWORD })
      .expect(200);
    tokens.staff = await login('0532 000 00 01');
    const membership = await prisma.siteMembership.findFirstOrThrow({
      where: { siteId, role: 'STAFF' },
    });
    expect(membership).toBeTruthy();
    await http()
      .post(`/api/employees/${employees.doorman}/account/invitation`)
      .set(M())
      .expect(409);
  });

  it('görevli yalnızca kendi görevlerini görür ve bitirir; yönetici sayfalarına giremez', async () => {
    await http().get('/api/units').set(S()).expect(403);
    await http().get('/api/door').set(S()).expect(403);
    const mine = await http()
      .post('/api/tasks')
      .set(M())
      .send({ title: 'Merdivenleri yıka', employeeId: employees.doorman, dueDate: today })
      .expect(201);
    const other = await http()
      .post('/api/tasks')
      .set(M())
      .send({ title: 'Bahçeyi sula', employeeId: employees.cleaner })
      .expect(201);
    const me = await http().get('/api/staff/me').set(S()).expect(200);
    expect(me.body).toMatchObject({ role: 'Kapıcı', doorAccess: false });
    expect(me.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Merdivenleri yıka']);
    await http()
      .post(`/api/staff/me/tasks/${other.body.id}/status`)
      .set(S())
      .send({ status: 'DONE' })
      .expect(404);
    const done = await http()
      .post(`/api/staff/me/tasks/${mine.body.id}/status`)
      .set(S())
      .send({ status: 'DONE', note: 'Bitti' })
      .expect(200);
    expect(done.body.tasks).toEqual([]);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: mine.body.id } });
    expect(task.status).toBe('DONE');
  });

  it('kapı yetkisi verilince kargo ve misafir kaydı yapılır, sakin kendi kaydını görür', async () => {
    await http()
      .patch(`/api/employees/${employees.doorman}/account`)
      .set(M())
      .send({ doorAccess: true })
      .expect(200);
    const doorUnits = await http().get('/api/door/units').set(S()).expect(200);
    expect(doorUnits.body).toEqual([
      { id: units.one, label: 'Daire 1', residents: ['Ayşe Kaya'] },
      { id: units.two, label: 'Daire 2', residents: [] },
    ]);

    const afterPackage = await http()
      .post('/api/door/packages')
      .set(S())
      .send({ unitId: units.one, carrier: 'Yurtiçi' })
      .expect(201);
    const pkg = afterPackage.body.waitingPackages[0];
    expect(pkg).toMatchObject({ unitLabel: 'Daire 1', carrier: 'Yurtiçi', deliveredAt: null });
    expect((await http().get('/api/door/mine').set(R()).expect(200)).body.packages).toHaveLength(1);

    await http()
      .post('/api/door/mine/visitors')
      .set(R())
      .send({ unitId: units.two, name: 'Ahmet Bey', expectedOn: today })
      .expect(403);
    const expected = await http()
      .post('/api/door/mine/visitors')
      .set(R())
      .send({ unitId: units.one, name: 'Ahmet Bey', expectedOn: today })
      .expect(201);
    const visitor = expected.body.visitors[0];
    const overview = await http().get('/api/door').set(S()).expect(200);
    expect(overview.body.expectedVisitors.map((v: { name: string }) => v.name)).toEqual([
      'Ahmet Bey',
    ]);
    const arrived = await http()
      .post(`/api/door/visitors/${visitor.id}/arrive`)
      .set(S())
      .expect(200);
    expect(arrived.body.expectedVisitors).toEqual([]);
    expect(arrived.body.recentVisitors[0]).toMatchObject({
      name: 'Ahmet Bey',
      createdByResident: true,
    });
    await http().post(`/api/door/visitors/${visitor.id}/arrive`).set(S()).expect(409);

    const delivered = await http()
      .post(`/api/door/packages/${pkg.id}/deliver`)
      .set(S())
      .send({ deliveredTo: 'Ayşe Hanım' })
      .expect(200);
    expect(delivered.body.waitingPackages).toEqual([]);
    expect(delivered.body.recentPackages[0]).toMatchObject({ deliveredTo: 'Ayşe Hanım' });
    expect((await http().get('/api/door/mine').set(R()).expect(200)).body.packages).toEqual([]);
    await http().get('/api/door').set(R()).expect(403);
  });

  it('yönetici hesabı kapatınca görevli giremez', async () => {
    const res = await http()
      .delete(`/api/employees/${employees.doorman}/account`)
      .set(M())
      .expect(200);
    expect(res.body.hasAccount).toBe(false);
    await http().get('/api/staff/me').set(S()).expect(403);
  });
});

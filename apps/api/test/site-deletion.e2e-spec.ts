import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as ExcelJSModule from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { todayInIstanbul } from '../src/common/dates';
import { hashPassword } from '../src/modules/auth/password';
import { SiteDeletionService } from '../src/modules/sites/site-deletion';
import { PrismaService } from '../src/prisma/prisma.service';

const ExcelJS = ((ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ??
  ExcelJSModule) as typeof ExcelJSModule;

const PASSWORD = 'Deneme123!';
const today = todayInIstanbul();

let app: NestExpressApplication;
let prisma: PrismaService;
const ids = {} as Record<
  'site' | 'other' | 'unit' | 'admin' | 'manager' | 'resident' | 'shared',
  string
>;
const tokens = {} as Record<'admin' | 'manager' | 'shared', string>;

const http = () => request(app.getHttpServer());
const auth = (token: string, siteId?: string) => ({
  Authorization: `Bearer ${token}`,
  ...(siteId ? { 'X-Site-Id': siteId } : {}),
});

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
  const [admin, manager, resident, shared] = await Promise.all(
    ['admin@silme.test', 'yonetici@silme.test', 'sakin@silme.test', 'ortak@silme.test'].map(
      (email, i) =>
        prisma.user.create({
          data: {
            firstName: 'Kişi',
            lastName: String(i),
            email,
            passwordHash,
            isPlatformAdmin: i === 0,
          },
        }),
    ),
  );
  const site = await prisma.site.create({ data: { name: 'Lale Apartmanı', kind: 'APARTMENT' } });
  const other = await prisma.site.create({ data: { name: 'Gül Sitesi' } });
  await prisma.siteMembership.createMany({
    data: [
      { siteId: site.id, userId: manager!.id, role: 'SITE_MANAGER' },
      { siteId: site.id, userId: resident!.id, role: 'RESIDENT' },
      { siteId: site.id, userId: shared!.id, role: 'RESIDENT' },
      { siteId: other.id, userId: shared!.id, role: 'SITE_MANAGER' },
    ],
  });
  const block = await prisma.block.create({ data: { siteId: site.id, name: 'Bina' } });
  const unit = await prisma.unit.create({
    data: { siteId: site.id, blockId: block.id, number: '3', areaM2: 120 },
  });
  await prisma.occupancy.create({
    data: {
      siteId: site.id,
      unitId: unit.id,
      userId: resident!.id,
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      phone: '+905551112233',
      type: 'OWNER',
      startDate: new Date('2024-01-01'),
    },
  });
  Object.assign(ids, {
    site: site.id,
    other: other.id,
    unit: unit.id,
    admin: admin!.id,
    manager: manager!.id,
    resident: resident!.id,
    shared: shared!.id,
  });
  tokens.admin = await login('admin@silme.test');
  tokens.manager = await login('yonetici@silme.test');
  tokens.shared = await login('ortak@silme.test');

  const types = await http().get('/api/charge-types').set(auth(tokens.admin, site.id)).expect(200);
  await http()
    .post('/api/charges')
    .set(auth(tokens.admin, site.id))
    .send({
      chargeTypeId: types.body[0].id,
      scope: 'SELECTED',
      unitIds: [unit.id],
      amountMode: 'PER_UNIT',
      amountKurus: 150_000,
      issueDate: today,
      dueDate: today,
    })
    .expect(201);
  await http()
    .post('/api/payments')
    .set(auth(tokens.admin, site.id))
    .send({ unitId: unit.id, amountKurus: 50_000, method: 'CASH', paidAt: today })
    .expect(201);
});

afterAll(async () => {
  await app?.close();
});

const deleteSite = (body: Record<string, string>, token = tokens.admin) =>
  http().delete(`/api/sites/${ids.site}`).set(auth(token)).send(body);

describe('Apartman ve site silme', () => {
  it('sistem yöneticisi verileri tek Excel dosyasında indirir', async () => {
    const res = await http()
      .get(`/api/sites/${ids.site}/export.xlsx`)
      .set(auth(tokens.admin))
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as Buffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      'Daireler',
      'Sakinler',
      'Borçlar',
      'Tahsilatlar',
      'Kasa hesapları',
      'Gelir-gider',
      'Yapılan işler',
      'Firmalar',
      'Çalışanlar',
      'Talepler',
      'Genel kurul kararları',
    ]);
    const residents = workbook.getWorksheet('Sakinler')!;
    expect(residents.getRow(4).values).toEqual(
      expect.arrayContaining(['Daire 3', 'Ayşe', 'Yılmaz', '+905551112233']),
    );
    const charges = workbook.getWorksheet('Borçlar')!;
    expect(charges.getRow(4).values).toEqual(expect.arrayContaining([1500, 500, 1000]));

    await http().get(`/api/sites/${ids.site}/export.xlsx`).set(auth(tokens.manager)).expect(403);
  });

  it('silmek için ad ve sistem yöneticisinin kendi bilgileri doğru girilmelidir', async () => {
    await deleteSite(
      { confirmName: 'Lale Apartmanı', identifier: 'yonetici@silme.test', password: PASSWORD },
      tokens.manager,
    ).expect(403);
    await deleteSite({
      confirmName: 'Lale',
      identifier: 'admin@silme.test',
      password: PASSWORD,
    }).expect(400);
    await deleteSite({
      confirmName: 'Lale Apartmanı',
      identifier: 'admin@silme.test',
      password: 'yanlis-sifre',
    }).expect(400);
    await deleteSite({
      confirmName: 'Lale Apartmanı',
      identifier: 'yonetici@silme.test',
      password: PASSWORD,
    }).expect(400);
    expect((await prisma.site.findUniqueOrThrow({ where: { id: ids.site } })).deletedAt).toBeNull();
  });

  it('silinen yer listelerden ve yetkilerden düşer, geri getirilince eski haline döner', async () => {
    await deleteSite({
      confirmName: 'lale apartmanı',
      identifier: 'admin@silme.test',
      password: PASSWORD,
    }).expect(204);

    const sites = await http().get('/api/sites').set(auth(tokens.admin)).expect(200);
    expect(sites.body.map((s: { id: string }) => s.id)).toEqual([ids.other]);
    const deleted = await http().get('/api/sites/deleted').set(auth(tokens.admin)).expect(200);
    expect(deleted.body).toHaveLength(1);
    expect(deleted.body[0]).toMatchObject({ id: ids.site, name: 'Lale Apartmanı', unitCount: 1 });
    const days =
      (Date.parse(deleted.body[0].purgeAt) - Date.parse(deleted.body[0].deletedAt)) / 86_400_000;
    expect(days).toBe(30);

    const me = await http().get('/api/auth/me').set(auth(tokens.manager)).expect(200);
    expect(me.body.memberships).toHaveLength(0);
    await http().get('/api/units').set(auth(tokens.manager, ids.site)).expect(403);
    await http().get('/api/units').set(auth(tokens.admin, ids.site)).expect(404);
    await http().get(`/api/sites/${ids.site}`).set(auth(tokens.admin)).expect(404);
    await http().get('/api/sites/deleted').set(auth(tokens.manager)).expect(403);

    await http().post(`/api/sites/${ids.site}/restore`).set(auth(tokens.manager)).expect(403);
    await http().post(`/api/sites/${ids.site}/restore`).set(auth(tokens.admin)).expect(204);
    const units = await http().get('/api/units').set(auth(tokens.manager, ids.site)).expect(200);
    expect(units.body).toHaveLength(1);
    const audit = await prisma.auditLog.findMany({
      where: { entityType: 'Site', entityId: ids.site },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual(['DELETE', 'RESTORE']);
  });

  it('30 gün dolunca veriler ve başka yerde üyeliği olmayan hesaplar kalıcı silinir', async () => {
    await deleteSite({
      confirmName: 'Lale Apartmanı',
      identifier: 'admin@silme.test',
      password: PASSWORD,
    }).expect(204);
    const deletion = app.get(SiteDeletionService);

    await deletion.purgeExpired(new Date(Date.now() + 29 * 86_400_000));
    expect(await prisma.site.count({ where: { id: ids.site } })).toBe(1);

    await deletion.purgeExpired(new Date(Date.now() + 31 * 86_400_000));
    expect(await prisma.site.count({ where: { id: ids.site } })).toBe(0);
    expect(await prisma.charge.count({ where: { siteId: ids.site } })).toBe(0);
    const users = await prisma.user.findMany({ select: { id: true } });
    const remaining = users.map((u) => u.id);
    expect(remaining).toContain(ids.admin);
    expect(remaining).toContain(ids.shared);
    expect(remaining).not.toContain(ids.manager);
    expect(remaining).not.toContain(ids.resident);
    expect(await prisma.site.count({ where: { id: ids.other } })).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { entityId: ids.site, action: 'PURGE', siteId: null } }),
    ).toBe(1);
  });
});

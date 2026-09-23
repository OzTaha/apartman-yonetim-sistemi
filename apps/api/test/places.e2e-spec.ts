import { periodOfDate } from '@apartman/shared';
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

let app: NestExpressApplication;
let prisma: PrismaService;
let adminToken: string;
let managerToken: string;
let managerId: string;
let apartmentId: string;
let siteId: string;

const http = () => request(app.getHttpServer());
const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
const at = (id: string) => ({ Authorization: `Bearer ${managerToken}`, 'X-Site-Id': id });

async function login(identifier: string) {
  const res = await http()
    .post('/api/auth/login')
    .send({ identifier, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function createPlace(name: string, kind: 'APARTMENT' | 'SITE') {
  const res = await http().post('/api/sites').set(asAdmin()).send({ name, kind }).expect(201);
  await prisma.siteMembership.create({
    data: { siteId: res.body.id, userId: managerId, role: 'SITE_MANAGER' },
  });
  return res.body as { id: string; kind: string; blockCount: number };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, sites CASCADE');
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.create({
    data: {
      firstName: 'Sistem',
      lastName: 'Yönetici',
      email: 'admin@yer.test',
      passwordHash,
      isPlatformAdmin: true,
    },
  });
  const manager = await prisma.user.create({
    data: { firstName: 'Yönetici', lastName: 'Bir', email: 'yonetici@yer.test', passwordHash },
  });
  managerId = manager.id;
  adminToken = await login('admin@yer.test');
  managerToken = await login('yonetici@yer.test');

  apartmentId = (await createPlace('Güneş Apartmanı', 'APARTMENT')).id;
  siteId = (await createPlace('Yıldız Sitesi', 'SITE')).id;
});

afterAll(async () => {
  await app?.close();
});

describe('Apartman türü', () => {
  it('apartman oluşturulunca tek bina bloğu kendiliğinden açılır', async () => {
    const site = await http().get(`/api/sites/${apartmentId}`).set(asAdmin()).expect(200);
    expect(site.body).toMatchObject({ kind: 'APARTMENT', blockCount: 1 });
    const blocks = await http().get('/api/blocks').set(at(apartmentId)).expect(200);
    expect(blocks.body).toHaveLength(1);
  });

  it('apartmanda blok seçmeden daire eklenir, blok eklenemez ve bina silinemez', async () => {
    await http().post('/api/units').set(at(apartmentId)).send({ number: '1' }).expect(201);
    const bulk = await http()
      .post('/api/units/bulk')
      .set(at(apartmentId))
      .send({ startNumber: 2, endNumber: 4, unitsPerFloor: 2 })
      .expect(201);
    expect(bulk.body.created).toBe(3);

    await http().post('/api/blocks').set(at(apartmentId)).send({ name: 'B' }).expect(400);
    const blocks = await http().get('/api/blocks').set(at(apartmentId)).expect(200);
    await http().delete(`/api/blocks/${blocks.body[0].id}`).set(at(apartmentId)).expect(400);
  });

  it('sitede blok seçmeden daire eklenemez', async () => {
    const res = await http().post('/api/units').set(at(siteId)).send({ number: '1' }).expect(400);
    expect(res.body.message).toBe('Blok seçin');
  });

  it('oturum bilgisi yer türünü içerir', async () => {
    const me = await http()
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${managerToken}` })
      .expect(200);
    const kinds = Object.fromEntries(
      me.body.memberships.map((m: { siteId: string; siteKind: string }) => [m.siteId, m.siteKind]),
    );
    expect(kinds[apartmentId]).toBe('APARTMENT');
    expect(kinds[siteId]).toBe('SITE');
  });
});

describe('Tür değiştirme', () => {
  it('birden fazla bloğu olan site apartmana çevrilemez; apartman siteye çevrilebilir', async () => {
    await http().post('/api/blocks').set(at(siteId)).send({ name: 'A' }).expect(201);
    await http().post('/api/blocks').set(at(siteId)).send({ name: 'B' }).expect(201);
    await http()
      .patch(`/api/sites/${siteId}`)
      .set(asAdmin())
      .send({ kind: 'APARTMENT' })
      .expect(400);

    const other = await createPlace('Dönüşüm Apartmanı', 'APARTMENT');
    await http().patch(`/api/sites/${other.id}`).set(asAdmin()).send({ kind: 'SITE' }).expect(200);
    await http().post('/api/blocks').set(at(other.id)).send({ name: 'Ek bina' }).expect(201);
  });

  it('düzenlemede tür gönderilmezse değişmez', async () => {
    const res = await http()
      .patch(`/api/sites/${apartmentId}`)
      .set(asAdmin())
      .send({ name: 'Güneş Apartmanı 2' })
      .expect(200);
    expect(res.body.kind).toBe('APARTMENT');
  });
});

describe('Silme ve arşivleme', () => {
  let units: Record<string, string>;

  beforeAll(async () => {
    await http()
      .post('/api/dues/plans')
      .set(at(apartmentId))
      .send({ method: 'EQUAL', amountKurus: 100_000, validFrom: current })
      .expect(201);
    await http()
      .post('/api/dues/accrue')
      .set(at(apartmentId))
      .send({ period: current })
      .expect(200);
    const list = await http().get('/api/units').set(at(apartmentId)).expect(200);
    units = Object.fromEntries(
      list.body.map((u: { number: string; id: string }) => [u.number, u.id]),
    );
  });

  it('ödemesi ve sakini olmayan daire ödenmemiş borcuyla birlikte silinir', async () => {
    const info = await http()
      .get(`/api/units/${units['1']}/removal`)
      .set(at(apartmentId))
      .expect(200);
    expect(info.body).toMatchObject({ canDelete: true, chargeCount: 1, openKurus: 100_000 });
    await http().delete(`/api/units/${units['1']}`).set(at(apartmentId)).expect(204);
    expect(await prisma.charge.count({ where: { unitId: units['1'] } })).toBe(0);
  });

  it('ödemesi olan daire silinemez, arşivlenir ve listelerden ile toplu borçtan çıkar', async () => {
    await http()
      .post('/api/payments')
      .set(at(apartmentId))
      .send({ unitId: units['2'], amountKurus: 100_000, method: 'CASH', paidAt: today })
      .expect(201);

    const info = await http()
      .get(`/api/units/${units['2']}/removal`)
      .set(at(apartmentId))
      .expect(200);
    expect(info.body).toMatchObject({ canDelete: false, canArchive: true, paymentCount: 1 });
    const del = await http().delete(`/api/units/${units['2']}`).set(at(apartmentId)).expect(409);
    expect(del.body.message).toContain('arşivleyebilirsiniz');

    await http().post(`/api/units/${units['2']}/archive`).set(at(apartmentId)).expect(200);
    const active = await http().get('/api/units').set(at(apartmentId)).expect(200);
    expect(active.body.map((u: { id: string }) => u.id)).not.toContain(units['2']);
    const archived = await http().get('/api/units?archived=only').set(at(apartmentId)).expect(200);
    expect(archived.body.map((u: { id: string }) => u.id)).toEqual([units['2']]);

    const types = await http().get('/api/charge-types').set(at(apartmentId)).expect(200);
    const fixture = types.body.find((t: { code: string }) => t.code === 'FIXTURE');
    const charge = await http()
      .post('/api/charges')
      .set(at(apartmentId))
      .send({
        chargeTypeId: fixture.id,
        scope: 'ALL',
        amountMode: 'PER_UNIT',
        amountKurus: 5_000,
        issueDate: today,
        dueDate: today,
      })
      .expect(201);
    expect(charge.body.created).toBe(2);

    await http().post(`/api/units/${units['2']}/unarchive`).set(at(apartmentId)).expect(200);
  });

  it('içinde oturan sakin olan daire arşivlenemez', async () => {
    await http()
      .post('/api/residents')
      .set(at(apartmentId))
      .send({
        unitId: units['3'],
        firstName: 'Ali',
        lastName: 'Kaya',
        type: 'OWNER',
        startDate: today,
      })
      .expect(201);
    await http().post(`/api/units/${units['3']}/archive`).set(at(apartmentId)).expect(400);
    const del = await http().delete(`/api/units/${units['3']}`).set(at(apartmentId)).expect(409);
    expect(del.body.message).toContain('arşivleyebilirsiniz');
  });

  it('geçmişi olmayan dairelerden oluşan blok daireleriyle silinir; geçmişi olan blok silinemez', async () => {
    const blocks = await http().get('/api/blocks').set(at(siteId)).expect(200);
    const [a, b] = blocks.body as { id: string; name: string }[];
    await http()
      .post('/api/units/bulk')
      .set(at(siteId))
      .send({ blockId: a!.id, startNumber: 1, endNumber: 2 })
      .expect(201);
    const bUnit = await http()
      .post('/api/units')
      .set(at(siteId))
      .send({ blockId: b!.id, number: '1' })
      .expect(201);
    await http()
      .post('/api/residents')
      .set(at(siteId))
      .send({
        unitId: bUnit.body.id,
        firstName: 'Can',
        lastName: 'Er',
        type: 'OWNER',
        startDate: today,
      })
      .expect(201);

    const listed = await http().get('/api/blocks').set(at(siteId)).expect(200);
    const byName = Object.fromEntries(listed.body.map((x: { name: string }) => [x.name, x]));
    expect(byName['A']).toMatchObject({ unitCount: 2, deletable: true });
    expect(byName['B']).toMatchObject({ unitCount: 1, deletable: false });

    await http().delete(`/api/blocks/${a!.id}`).set(at(siteId)).expect(204);
    expect(await prisma.unit.count({ where: { blockId: a!.id } })).toBe(0);
    const res = await http().delete(`/api/blocks/${b!.id}`).set(at(siteId)).expect(409);
    expect(res.body.message).toContain('1 daire');
  });
});

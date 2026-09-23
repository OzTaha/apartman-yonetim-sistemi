import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { sha256 } from '../src/common/crypto';
import { hashPassword } from '../src/modules/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'Deneme123!';

let app: NestExpressApplication;
let prisma: PrismaService;
const ids = {} as {
  siteA: string;
  siteB: string;
  blockA: string;
  blockB: string;
  unitA1: string;
  unitA2: string;
  unitB1: string;
  residentOccupancy: string;
};

const http = () => request(app.getHttpServer());

function refreshCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const rt = cookies.find((c) => c.startsWith('rt='));
  if (!rt) throw new Error('Refresh cookie bulunamadı');
  return rt.split(';')[0]!;
}

async function login(identifier: string, password = PASSWORD) {
  const res = await http().post('/api/auth/login').send({ identifier, password }).expect(200);
  return { token: res.body.accessToken as string, cookie: refreshCookie(res) };
}

const sessions = new Map<string, string>();
async function tokenFor(identifier: string): Promise<string> {
  if (!sessions.has(identifier)) sessions.set(identifier, (await login(identifier)).token);
  return sessions.get(identifier)!;
}

const auth = (token: string, siteId?: string) => ({
  Authorization: `Bearer ${token}`,
  ...(siteId ? { 'X-Site-Id': siteId } : {}),
});

async function seed() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_logs, refresh_tokens, invitations, occupancies, units, blocks, site_memberships, sites, users CASCADE',
  );
  const passwordHash = await hashPassword(PASSWORD);

  await prisma.user.create({
    data: {
      firstName: 'Platform',
      lastName: 'Admin',
      email: 'admin@test.com',
      passwordHash,
      isPlatformAdmin: true,
    },
  });
  const managerA = await prisma.user.create({
    data: { firstName: 'Yönetici', lastName: 'A', email: 'yonetici-a@test.com', passwordHash },
  });
  const managerB = await prisma.user.create({
    data: { firstName: 'Yönetici', lastName: 'B', email: 'yonetici-b@test.com', passwordHash },
  });
  const resident = await prisma.user.create({
    data: { firstName: 'Sakin', lastName: 'A', phone: '+905551112233', passwordHash },
  });

  const siteA = await prisma.site.create({ data: { name: 'Site A' } });
  const siteB = await prisma.site.create({ data: { name: 'Site B' } });
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
    data: { siteId: siteA.id, blockId: blockA.id, number: '1' },
  });
  const unitA2 = await prisma.unit.create({
    data: { siteId: siteA.id, blockId: blockA.id, number: '2' },
  });
  const unitB1 = await prisma.unit.create({
    data: { siteId: siteB.id, blockId: blockB.id, number: '1' },
  });

  const occupancy = await prisma.occupancy.create({
    data: {
      siteId: siteA.id,
      unitId: unitA1.id,
      userId: resident.id,
      firstName: 'Sakin',
      lastName: 'A',
      phone: '+905551112233',
      type: 'OWNER',
      startDate: new Date('2024-01-01'),
    },
  });
  await prisma.occupancy.create({
    data: {
      siteId: siteA.id,
      unitId: unitA1.id,
      firstName: 'Başka',
      lastName: 'Kişi',
      type: 'TENANT',
      startDate: new Date('2024-01-01'),
    },
  });

  Object.assign(ids, {
    siteA: siteA.id,
    siteB: siteB.id,
    blockA: blockA.id,
    blockB: blockB.id,
    unitA1: unitA1.id,
    unitA2: unitA2.id,
    unitB1: unitB1.id,
    residentOccupancy: occupancy.id,
  });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);
  await seed();
});

afterAll(async () => {
  await app?.close();
});

describe('Giriş', () => {
  it('yanlış şifre 401 döner ve hangi bilginin hatalı olduğunu söylemez', async () => {
    const res = await http()
      .post('/api/auth/login')
      .send({ identifier: 'yonetici-a@test.com', password: 'yanlis-sifre' })
      .expect(401);
    expect(res.body.message).toBe('E-posta/telefon veya şifre hatalı');
  });

  it('olmayan kullanıcı için de aynı hatayı verir', async () => {
    const res = await http()
      .post('/api/auth/login')
      .send({ identifier: 'yok@test.com', password: 'x' })
      .expect(401);
    expect(res.body.message).toBe('E-posta/telefon veya şifre hatalı');
  });

  it('telefon numarasıyla (farklı yazımla) giriş yapılabilir', async () => {
    const token = await tokenFor('0555 111 22 33');
    const me = await http().get('/api/auth/me').set(auth(token)).expect(200);
    expect(me.body.occupancies).toHaveLength(1);
  });

  it('hız sınırı aşılınca 429 döner', async () => {
    const attempt = () =>
      http().post('/api/auth/login').send({ identifier: 'saldiri@test.com', password: 'x' });
    for (let i = 0; i < 5; i++) await attempt().expect(401);
    const res = await attempt().expect(429);
    expect(res.body.message).toMatch(/Çok fazla deneme/);
  });

  it('oturum olmadan korumalı uç noktaya erişilemez', async () => {
    await http().get('/api/auth/me').expect(401);
    await http().get('/api/auth/me').set({ Authorization: 'Bearer bozuk-token' }).expect(401);
  });
});

describe('Refresh token', () => {
  it('yenileme yeni token üretir ve eski token tekrar kullanılırsa tüm oturumlar kapanır', async () => {
    const { cookie: first } = await login('yonetici-a@test.com');

    const refreshed = await http().post('/api/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookie(refreshed);
    expect(second).not.toBe(first);

    await prisma.refreshToken.update({
      where: { tokenHash: sha256(first.slice(3)) },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    await http().post('/api/auth/refresh').set('Cookie', first).expect(401);
    await http().post('/api/auth/refresh').set('Cookie', second).expect(401);
  });

  it('çıkış yapınca refresh token geçersiz olur', async () => {
    const { cookie } = await login('yonetici-b@test.com');
    await http().post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });
});

describe('Rol sınırları', () => {
  it('sakin yönetici uç noktalarına erişemez', async () => {
    const token = await tokenFor('+905551112233');
    await http().get('/api/blocks').set(auth(token, ids.siteA)).expect(403);
    await http().get('/api/residents').set(auth(token, ids.siteA)).expect(403);
    await http()
      .post('/api/units')
      .set(auth(token, ids.siteA))
      .send({ blockId: ids.blockA, number: '99' })
      .expect(403);
  });

  it('site yöneticisi site oluşturamaz, sistem yöneticisi oluşturabilir', async () => {
    const managerToken = await tokenFor('yonetici-a@test.com');
    await http().post('/api/sites').set(auth(managerToken)).send({ name: 'Yeni Site' }).expect(403);

    const adminToken = await tokenFor('admin@test.com');
    const res = await http()
      .post('/api/sites')
      .set(auth(adminToken))
      .send({ name: 'Yeni Site' })
      .expect(201);
    expect(res.body.name).toBe('Yeni Site');
  });

  it('site yöneticisi yalnızca kendi sitelerini listeler', async () => {
    const token = await tokenFor('yonetici-a@test.com');
    const res = await http().get('/api/sites').set(auth(token)).expect(200);
    expect(res.body.map((s: { id: string }) => s.id)).toEqual([ids.siteA]);
  });
});

describe('Site izolasyonu', () => {
  it('A sitesinin yöneticisi B sitesine erişemez', async () => {
    const token = await tokenFor('yonetici-a@test.com');
    await http().get('/api/blocks').set(auth(token, ids.siteB)).expect(403);
    await http().get('/api/units').set(auth(token, ids.siteB)).expect(403);
  });

  it('A sitesi başlığıyla B sitesinin dairesi okunamaz ve değiştirilemez', async () => {
    const token = await tokenFor('yonetici-a@test.com');
    await http().get(`/api/units/${ids.unitB1}`).set(auth(token, ids.siteA)).expect(404);
    await http()
      .patch(`/api/units/${ids.unitB1}`)
      .set(auth(token, ids.siteA))
      .send({ number: 'X9' })
      .expect(404);
    await http().delete(`/api/units/${ids.unitB1}`).set(auth(token, ids.siteA)).expect(404);

    const unit = await prisma.unit.findUniqueOrThrow({ where: { id: ids.unitB1 } });
    expect(unit.number).toBe('1');
  });

  it('başka sitenin bloğuna daire eklenemez', async () => {
    const token = await tokenFor('yonetici-a@test.com');
    await http()
      .post('/api/units')
      .set(auth(token, ids.siteA))
      .send({ blockId: ids.blockB, number: '50' })
      .expect(404);
  });

  it('listeler yalnızca aktif sitenin kayıtlarını döner', async () => {
    const token = await tokenFor('yonetici-a@test.com');
    const res = await http().get('/api/units').set(auth(token, ids.siteA)).expect(200);
    const unitIds = res.body.map((u: { id: string }) => u.id);
    expect(unitIds).toContain(ids.unitA1);
    expect(unitIds).not.toContain(ids.unitB1);
  });
});

describe('Sakinin daire erişimi', () => {
  it('sakin kendi dairesini ve yalnızca kendi kaydını görür', async () => {
    const token = await tokenFor('+905551112233');
    const res = await http()
      .get(`/api/units/${ids.unitA1}`)
      .set(auth(token, ids.siteA))
      .expect(200);
    expect(res.body.occupancies).toHaveLength(1);
    expect(res.body.occupancies[0].firstName).toBe('Sakin');
  });

  it('sakin aynı sitedeki başka bir daireyi göremez', async () => {
    const token = await tokenFor('+905551112233');
    await http().get(`/api/units/${ids.unitA2}`).set(auth(token, ids.siteA)).expect(404);
  });
});

describe('Daire ve sakin yönetimi', () => {
  it('toplu daire oluşturma mevcut numaraları atlar', async () => {
    const token = await tokenFor('yonetici-a@test.com');
    const res = await http()
      .post('/api/units/bulk')
      .set(auth(token, ids.siteA))
      .send({ blockId: ids.blockA, startNumber: 1, endNumber: 6, unitsPerFloor: 2 })
      .expect(201);
    expect(res.body).toEqual({ created: 4, skipped: expect.arrayContaining(['1', '2']) });
  });

  it('düzenleme gönderilmeyen alanları (iletişim onayı) değiştirmez', async () => {
    const token = await tokenFor('yonetici-a@test.com');
    const created = await http()
      .post('/api/residents')
      .set(auth(token, ids.siteA))
      .send({
        unitId: ids.unitA2,
        firstName: 'Onaylı',
        lastName: 'Sakin',
        type: 'TENANT',
        startDate: '2025-01-01',
        contactConsent: true,
        isResponsibleForDues: false,
      })
      .expect(201);

    const updated = await http()
      .patch(`/api/residents/${created.body.id}`)
      .set(auth(token, ids.siteA))
      .send({ lastName: 'Sakinoğlu' })
      .expect(200);
    expect(updated.body.lastName).toBe('Sakinoğlu');
    expect(updated.body.contactConsent).toBe(true);
    expect(updated.body.isResponsibleForDues).toBe(false);
  });

  it('taşınma tarihi başlangıçtan önce olamaz', async () => {
    const token = await tokenFor('yonetici-a@test.com');
    await http()
      .post(`/api/residents/${ids.residentOccupancy}/move-out`)
      .set(auth(token, ids.siteA))
      .send({ endDate: '2023-01-01' })
      .expect(400);
  });
});

describe('Davet akışı', () => {
  it('davetle hesap oluşturulur, davet ikinci kez kullanılamaz ve sakin giriş yapabilir', async () => {
    const token = await tokenFor('yonetici-a@test.com');
    const occupancy = await http()
      .post('/api/residents')
      .set(auth(token, ids.siteA))
      .send({
        unitId: ids.unitA2,
        firstName: 'Davetli',
        lastName: 'Sakin',
        phone: '0544 999 88 77',
        type: 'OWNER',
        startDate: '2025-02-01',
      })
      .expect(201);

    const invite = await http()
      .post(`/api/residents/${occupancy.body.id}/invitations`)
      .set(auth(token, ids.siteA))
      .expect(201);
    const inviteToken = String(invite.body.url).split('/davet/')[1]!;

    const info = await http().get(`/api/auth/invitations/${inviteToken}`).expect(200);
    expect(info.body).toMatchObject({
      firstName: 'Davetli',
      siteName: 'Site A',
      hasExistingAccount: false,
    });

    await http().post(`/api/auth/invitations/${inviteToken}/accept`).send({}).expect(400);

    const accepted = await http()
      .post(`/api/auth/invitations/${inviteToken}/accept`)
      .send({ password: 'YeniSifre123' })
      .expect(200);
    expect(accepted.body.status).toBe('ACTIVATED');
    expect(accepted.body.user.memberships).toEqual([
      expect.objectContaining({ siteId: ids.siteA, role: 'RESIDENT' }),
    ]);

    await http()
      .post(`/api/auth/invitations/${inviteToken}/accept`)
      .send({ password: 'BaskaSifre123' })
      .expect(410);

    await login('05449998877', 'YeniSifre123');

    await http()
      .post(`/api/residents/${occupancy.body.id}/invitations`)
      .set(auth(token, ids.siteA))
      .expect(409);
  });

  it('şifresi olan mevcut hesaba davet yalnızca bağlanır, şifre değişmez', async () => {
    const token = await tokenFor('yonetici-b@test.com');
    const occupancy = await http()
      .post('/api/residents')
      .set(auth(token, ids.siteB))
      .send({
        unitId: ids.unitB1,
        firstName: 'Sakin',
        lastName: 'Ak',
        phone: '+905551112233',
        type: 'TENANT',
        startDate: '2025-03-01',
      })
      .expect(201);
    const invite = await http()
      .post(`/api/residents/${occupancy.body.id}/invitations`)
      .set(auth(token, ids.siteB))
      .expect(201);
    const inviteToken = String(invite.body.url).split('/davet/')[1]!;

    const info = await http().get(`/api/auth/invitations/${inviteToken}`).expect(200);
    expect(info.body.hasExistingAccount).toBe(true);

    const accepted = await http()
      .post(`/api/auth/invitations/${inviteToken}/accept`)
      .send({ password: 'ElegecirilmisSifre' })
      .expect(200);
    expect(accepted.body).toEqual({ status: 'LINKED_EXISTING' });

    const { token: residentToken } = await login('+905551112233', PASSWORD);
    const me = await http().get('/api/auth/me').set(auth(residentToken)).expect(200);
    expect(me.body.memberships.map((m: { siteId: string }) => m.siteId).sort()).toEqual(
      [ids.siteA, ids.siteB].sort(),
    );
  });
});

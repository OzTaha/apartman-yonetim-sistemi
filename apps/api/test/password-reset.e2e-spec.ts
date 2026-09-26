import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword, verifyPassword } from '../src/modules/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'Deneme123!';
const NEW_PASSWORD = 'YeniSifre456';

let app: NestExpressApplication;
let prisma: PrismaService;
const ids = {} as Record<
  | 'siteA'
  | 'siteB'
  | 'residentUser'
  | 'managerA'
  | 'managerB'
  | 'residentOcc'
  | 'noAccountOcc'
  | 'managerOcc',
  string
>;
const tokens = {} as Record<'admin' | 'managerA' | 'managerB' | 'resident', string>;
let residentCookie: string;

const http = () => request(app.getHttpServer());
const as = (token: string, siteId = ids.siteA) => ({
  Authorization: `Bearer ${token}`,
  'X-Site-Id': siteId,
});
const tokenOf = (url: string) => url.split('/').pop()!;

async function login(identifier: string, password = PASSWORD) {
  return http().post('/api/auth/login').send({ identifier, password });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, sites CASCADE');
  const passwordHash = await hashPassword(PASSWORD);
  const user = (email: string, extra: Record<string, unknown> = {}) =>
    prisma.user.create({
      data: { firstName: 'Kişi', lastName: email.split('@')[0]!, email, passwordHash, ...extra },
    });
  await user('admin@sifre.test', { isPlatformAdmin: true });
  const managerA = await user('a@sifre.test');
  const managerB = await user('b@sifre.test');
  const resident = await user('sakin@sifre.test', { firstName: 'Ayşe' });
  const siteA = await prisma.site.create({ data: { name: 'Şifre Sitesi' } });
  const siteB = await prisma.site.create({ data: { name: 'Diğer Site' } });
  await prisma.siteMembership.createMany({
    data: [
      { siteId: siteA.id, userId: managerA.id, role: 'SITE_MANAGER' },
      { siteId: siteB.id, userId: managerB.id, role: 'SITE_MANAGER' },
      { siteId: siteA.id, userId: managerB.id, role: 'RESIDENT' },
      { siteId: siteA.id, userId: resident.id, role: 'RESIDENT' },
    ],
  });
  const block = await prisma.block.create({ data: { siteId: siteA.id, name: 'A' } });
  const occupancy = async (number: string, userId: string | null, phone: string | null) => {
    const unit = await prisma.unit.create({
      data: { siteId: siteA.id, blockId: block.id, number },
    });
    return prisma.occupancy.create({
      data: {
        siteId: siteA.id,
        unitId: unit.id,
        userId,
        firstName: 'Sakin',
        lastName: number,
        phone,
        type: 'OWNER',
        startDate: new Date('2020-01-01'),
      },
    });
  };
  Object.assign(ids, {
    siteA: siteA.id,
    siteB: siteB.id,
    residentUser: resident.id,
    managerA: managerA.id,
    managerB: managerB.id,
    residentOcc: (await occupancy('1', resident.id, '+905321230001')).id,
    noAccountOcc: (await occupancy('2', null, '+905321230002')).id,
    managerOcc: (await occupancy('3', managerB.id, null)).id,
  });

  tokens.admin = (await login('admin@sifre.test')).body.accessToken;
  tokens.managerA = (await login('a@sifre.test')).body.accessToken;
  tokens.managerB = (await login('b@sifre.test')).body.accessToken;
  const residentLogin = await login('sakin@sifre.test');
  tokens.resident = residentLogin.body.accessToken;
  residentCookie = ([] as string[])
    .concat(residentLogin.headers['set-cookie'] ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
});

afterAll(async () => {
  await app?.close();
});

const residentLink = (token: string, occupancyId: string, body: Record<string, unknown> = {}) =>
  http().post(`/api/residents/${occupancyId}/password-reset`).set(as(token)).send(body);

describe('sakin için şifre bağlantısı', () => {
  it('yönetici bağlantı oluşturur ve SMS ile gönderir', async () => {
    const res = await residentLink(tokens.managerA, ids.residentOcc, { send: 'SMS' }).expect(200);
    expect(res.body.url).toMatch(/^http:\/\/localhost:5173\/sifre-yenile\/[\w-]{40,}$/);
    expect(res.body).toMatchObject({ sentVia: 'SMS', sendError: null });
    const hours = (Date.parse(res.body.expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it('hesabı olmayan sakine bağlantı oluşturulmaz, telefonu yoksa gönderilmez', async () => {
    await residentLink(tokens.managerA, ids.noAccountOcc).expect(400);
    const admin = await residentLink(tokens.admin, ids.managerOcc, { send: 'SMS' }).expect(200);
    expect(admin.body).toMatchObject({
      sentVia: null,
      sendError: 'Sakinin telefon numarası kayıtlı değil',
    });
  });

  it('site yöneticisi, başka yerde yönetici olan kişiye bağlantı oluşturamaz', async () => {
    const res = await residentLink(tokens.managerA, ids.managerOcc).expect(403);
    expect(res.body.message).toContain('yalnızca sistem yöneticisi');
  });

  it('başka sitenin yöneticisi ve sakin bağlantı oluşturamaz', async () => {
    await http()
      .post(`/api/residents/${ids.residentOcc}/password-reset`)
      .set(as(tokens.managerB, ids.siteB))
      .send({})
      .expect(404);
    await residentLink(tokens.resident, ids.residentOcc).expect(403);
  });
});

describe('yeni şifre oluşturma', () => {
  it('yeni bağlantı eskisini geçersiz kılar', async () => {
    const first = await residentLink(tokens.managerA, ids.residentOcc).expect(200);
    const second = await residentLink(tokens.managerA, ids.residentOcc).expect(200);
    await http()
      .get(`/api/auth/password-resets/${tokenOf(first.body.url)}`)
      .expect(410);
    const info = await http()
      .get(`/api/auth/password-resets/${tokenOf(second.body.url)}`)
      .expect(200);
    expect(info.body.firstName).toBe('Ayşe');
  });

  it('şifre değişir, eski şifre ve eski oturumlar geçersiz olur, bağlantı tekrar kullanılamaz', async () => {
    const link = await residentLink(tokens.managerA, ids.residentOcc).expect(200);
    const token = tokenOf(link.body.url);
    await http().post(`/api/auth/password-resets/${token}`).send({ password: 'kisa' }).expect(400);
    await http()
      .post(`/api/auth/password-resets/${token}`)
      .send({ password: NEW_PASSWORD })
      .expect(204);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.residentUser } });
    expect(await verifyPassword(user.passwordHash!, PASSWORD)).toBe(false);
    await http().post('/api/auth/refresh').set('Cookie', residentCookie).expect(401);
    const fresh = await login('sakin@sifre.test', NEW_PASSWORD);
    expect(fresh.status).toBe(200);

    await http()
      .post(`/api/auth/password-resets/${token}`)
      .send({ password: 'BaskaSifre789' })
      .expect(410);
    await http().get('/api/auth/password-resets/gecersiz-token').expect(404);
  });

  it('süresi dolan bağlantı kullanılamaz', async () => {
    const link = await residentLink(tokens.managerA, ids.residentOcc).expect(200);
    await prisma.passwordReset.updateMany({
      where: { userId: ids.residentUser, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await http()
      .post(`/api/auth/password-resets/${tokenOf(link.body.url)}`)
      .send({ password: NEW_PASSWORD })
      .expect(410);
    expect(res.body.message).toContain('süresi dolmuş');
  });
});

describe('yönetici için şifre bağlantısı', () => {
  it('yalnızca sistem yöneticisi, kendisi dışındaki kullanıcılar için oluşturur', async () => {
    const res = await http()
      .post(`/api/users/${ids.managerA}/password-reset`)
      .set({ Authorization: `Bearer ${tokens.admin}` })
      .expect(200);
    expect(res.body.url).toContain('/sifre-yenile/');
    await http()
      .post(`/api/users/${ids.managerB}/password-reset`)
      .set({ Authorization: `Bearer ${tokens.managerA}` })
      .expect(403);
    const self = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@sifre.test' } });
    await http()
      .post(`/api/users/${self.id}/password-reset`)
      .set({ Authorization: `Bearer ${tokens.admin}` })
      .expect(400);
  });
});

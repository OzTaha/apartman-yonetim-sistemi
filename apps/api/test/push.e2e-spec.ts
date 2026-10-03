import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/password';
import { PushService } from '../src/modules/push/push';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'Deneme123!';

let app: NestExpressApplication;
let prisma: PrismaService;
let push: PushService;
let siteId: string;
let unitId: string;
const tokens = {} as Record<'manager' | 'resident' | 'other', string>;
const ids = {} as Record<'manager' | 'resident' | 'other', string>;

const http = () => request(app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Site-Id': siteId });
const sub = (n: number) => ({
  endpoint: `https://push.example.test/abonelik/${n}`,
  keys: { p256dh: `anahtar-${n}`, auth: `kimlik-${n}` },
});

async function login(identifier: string) {
  const res = await http()
    .post('/api/auth/login')
    .send({ identifier, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 50));
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);
  push = app.get(PushService);

  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_logs, refresh_tokens, invitations, occupancies, units, blocks, site_memberships, sites, users CASCADE',
  );
  const passwordHash = await hashPassword(PASSWORD);
  const users = await Promise.all(
    ['yonetici@push.test', 'sakin@push.test', 'diger@push.test'].map((email, i) =>
      prisma.user.create({ data: { firstName: 'Kişi', lastName: String(i), email, passwordHash } }),
    ),
  );
  ids.manager = users[0]!.id;
  ids.resident = users[1]!.id;
  ids.other = users[2]!.id;
  const site = await prisma.site.create({
    data: { name: 'Bildirim Apartmanı', kind: 'APARTMENT' },
  });
  siteId = site.id;
  const block = await prisma.block.create({ data: { siteId, name: 'Bina' } });
  const unit = await prisma.unit.create({ data: { siteId, blockId: block.id, number: '1' } });
  unitId = unit.id;
  await prisma.siteMembership.createMany({
    data: [
      { siteId, userId: ids.manager, role: 'SITE_MANAGER' },
      { siteId, userId: ids.resident, role: 'RESIDENT' },
    ],
  });
  await prisma.occupancy.create({
    data: {
      siteId,
      unitId,
      userId: ids.resident,
      firstName: 'Kişi',
      lastName: '1',
      type: 'OWNER',
      startDate: new Date('2020-01-01'),
    },
  });
  tokens.manager = await login('yonetici@push.test');
  tokens.resident = await login('sakin@push.test');
  tokens.other = await login('diger@push.test');
});

afterAll(async () => {
  await app?.close();
});

describe('Telefon bildirimleri', () => {
  it('anahtar oturum açmış kullanıcıya verilir ve her açılışta aynı kalır', async () => {
    await http().get('/api/push/config').expect(401);
    const res = await http().get('/api/push/config').set(auth(tokens.resident)).expect(200);
    expect(res.body.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    const stored = await prisma.appSecret.findUniqueOrThrow({ where: { key: 'vapid' } });
    expect(JSON.parse(stored.value).publicKey).toBe(res.body.publicKey);
  });

  it('abonelik kaydedilir; aynı cihaz başka hesapla girince ona geçer; silinebilir', async () => {
    await http().post('/api/push/subscriptions').set(auth(tokens.other)).send(sub(1)).expect(204);
    await http()
      .post('/api/push/subscriptions')
      .set(auth(tokens.resident))
      .send(sub(1))
      .expect(204);
    await http()
      .post('/api/push/subscriptions')
      .set(auth(tokens.resident))
      .send({ endpoint: 'adres-degil', keys: { p256dh: 'a', auth: 'b' } })
      .expect(400);
    const rows = await prisma.pushSubscription.findMany();
    expect(rows.map((r) => r.userId)).toEqual([ids.resident]);

    await http().post('/api/push/subscriptions').set(auth(tokens.other)).send(sub(2)).expect(204);
    await http()
      .delete('/api/push/subscriptions')
      .set(auth(tokens.other))
      .send({ endpoint: sub(2).endpoint })
      .expect(204);
    expect(await prisma.pushSubscription.count({ where: { userId: ids.other } })).toBe(0);
  });

  it('duyuru ve elle alınan ödeme sakinin telefonuna gider; geçersiz abonelik silinir', async () => {
    const sent: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
    const spy = vi.spyOn(push, 'deliver').mockImplementation(async (s, payload) => {
      sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
    });

    await http()
      .post('/api/announcements')
      .set(auth(tokens.manager))
      .send({
        title: 'Su kesintisi',
        body: 'Yarın 10:00-12:00 arası su kesilecek.',
        audience: 'ALL',
      })
      .expect(201);
    await until(() => sent.length >= 1);
    expect(sent[0]).toEqual({
      endpoint: sub(1).endpoint,
      payload: expect.objectContaining({
        title: 'Yeni duyuru · Bildirim Apartmanı',
        body: 'Su kesintisi',
        url: '/duyurular',
      }),
    });

    const chargeType = await prisma.chargeType.create({
      data: { siteId, code: 'OPENING', name: 'Devreden borç' },
    });
    await prisma.charge.create({
      data: {
        siteId,
        unitId,
        chargeTypeId: chargeType.id,
        amountKurus: 50_000,
        issueDate: new Date('2026-01-01'),
        dueDate: new Date('2026-01-10'),
      },
    });
    await http()
      .post('/api/payments')
      .set(auth(tokens.manager))
      .send({ unitId, amountKurus: 50_000, method: 'CASH', paidAt: '2026-01-05' })
      .expect(201);
    await until(() => sent.length >= 2);
    expect(sent[1]!.payload).toMatchObject({ title: 'Ödemeniz alındı', url: '/dairem' });
    expect(sent[1]!.payload.body).toContain('500,00');

    spy.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
    await http().post('/api/push/test').set(auth(tokens.resident)).expect(200);
    expect(await prisma.pushSubscription.count()).toBe(0);
    spy.mockRestore();
  });
});

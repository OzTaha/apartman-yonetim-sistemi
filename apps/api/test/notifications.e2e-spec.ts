import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'Deneme123!';

let app: NestExpressApplication;
let prisma: PrismaService;
let baseUrl: string;
let ip = 0;
const ids = {} as Record<'siteA' | 'residentOcc' | 'resident', string>;
const tokens = {} as Record<'admin' | 'managerA' | 'managerA2' | 'managerB', string>;

const http = () => request(app.getHttpServer());
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const ask = (identifier: string) =>
  http()
    .post('/api/auth/password-reset-requests')
    .set('X-Forwarded-For', `10.0.0.${++ip}`)
    .send({ identifier });

async function count(token: string) {
  const res = await http().get('/api/notifications/count').set(bearer(token)).expect(200);
  return res.body.unread as number;
}

async function list(token: string) {
  return (await http().get('/api/notifications').set(bearer(token)).expect(200)).body as {
    id: string;
    title: string;
    body: string;
    siteName: string | null;
    resolvedAt: string | null;
    readAt: string | null;
    data: { occupancyId: string | null; hasAccount: boolean; isManager: boolean; name: string };
  }[];
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  prisma = app.get(PrismaService);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, sites CASCADE');
  const passwordHash = await hashPassword(PASSWORD);
  const user = (email: string, extra: Record<string, unknown> = {}) =>
    prisma.user.create({
      data: { firstName: 'Kişi', lastName: email.split('@')[0]!, email, passwordHash, ...extra },
    });
  await user('admin@bildirim.test', { isPlatformAdmin: true });
  const managerA = await user('a@bildirim.test', { phone: '+905329990001' });
  const managerA2 = await user('a2@bildirim.test');
  const managerB = await user('b@bildirim.test');
  const resident = await user('sakin@bildirim.test', {
    firstName: 'Ayşe',
    lastName: 'Yılmaz',
    phone: '+905329990010',
  });
  const siteA = await prisma.site.create({ data: { name: 'Bildirim Sitesi' } });
  const siteB = await prisma.site.create({ data: { name: 'Başka Site' } });
  await prisma.siteMembership.createMany({
    data: [
      { siteId: siteA.id, userId: managerA.id, role: 'SITE_MANAGER' },
      { siteId: siteA.id, userId: managerA2.id, role: 'SITE_MANAGER' },
      { siteId: siteB.id, userId: managerB.id, role: 'SITE_MANAGER' },
      { siteId: siteA.id, userId: resident.id, role: 'RESIDENT' },
    ],
  });
  const block = await prisma.block.create({ data: { siteId: siteA.id, name: 'A' } });
  const occupancy = async (number: string, data: Record<string, unknown>) => {
    const unit = await prisma.unit.create({
      data: { siteId: siteA.id, blockId: block.id, number },
    });
    return prisma.occupancy.create({
      data: {
        siteId: siteA.id,
        unitId: unit.id,
        firstName: 'Sakin',
        lastName: number,
        type: 'OWNER',
        startDate: new Date('2020-01-01'),
        ...data,
      },
    });
  };
  const residentOcc = await occupancy('1', {
    userId: resident.id,
    firstName: 'Ayşe',
    lastName: 'Yılmaz',
    phone: '+905329990010',
  });
  await occupancy('2', { phone: '+905329990020', firstName: 'Hesapsız', lastName: 'Sakin' });
  await occupancy('3', {
    phone: '+905329990030',
    firstName: 'Taşınmış',
    lastName: 'Sakin',
    endDate: new Date('2021-01-01'),
  });
  Object.assign(ids, { siteA: siteA.id, residentOcc: residentOcc.id, resident: resident.id });

  const login = async (email: string) =>
    (
      await http()
        .post('/api/auth/login')
        .send({ identifier: email, password: PASSWORD })
        .expect(200)
    ).body.accessToken as string;
  tokens.admin = await login('admin@bildirim.test');
  tokens.managerA = await login('a@bildirim.test');
  tokens.managerA2 = await login('a2@bildirim.test');
  tokens.managerB = await login('b@bildirim.test');
});

afterAll(async () => {
  await app?.close();
});

describe('şifremi unuttum talebi', () => {
  it('kayıtlı olmayan veya taşınmış kişiye kayıtlı değil der', async () => {
    const res = await ask('0532 999 00 99').expect(404);
    expect(res.body.message).toContain('Sisteme kayıtlı değilsiniz');
    await ask('0532 999 00 30').expect(404);
    await ask('olmayan@bildirim.test').expect(404);
    await ask('abc').expect(400);
  });

  it('sakinin talebi sitenin yöneticilerine ve sistem yöneticisine düşer', async () => {
    const res = await ask('0532 999 00 10').expect(200);
    expect(res.body.message).toBe(
      'Talebiniz yönetime iletildi. Yönetim size şifre yenileme bağlantısı gönderecek.',
    );
    expect(await count(tokens.managerA)).toBe(1);
    expect(await count(tokens.managerA2)).toBe(1);
    expect(await count(tokens.admin)).toBe(1);
    expect(await count(tokens.managerB)).toBe(0);
    const [n] = await list(tokens.managerA);
    expect(n).toMatchObject({
      title: 'Şifre yenileme talebi',
      body: 'Ayşe Yılmaz (A Blok · Daire 1) yeni şifre bağlantısı istiyor.',
      siteName: 'Bildirim Sitesi',
      data: { occupancyId: ids.residentOcc, hasAccount: true, isManager: false },
    });
  });

  it('bir saat içinde tekrarlanan talep yeni bildirim oluşturmaz', async () => {
    await ask('sakin@bildirim.test').expect(200);
    expect(await count(tokens.managerA)).toBe(1);
  });

  it('hesabı olmayan sakin için hesap açma talebi oluşur', async () => {
    await ask('05329990020').expect(200);
    const [n] = await list(tokens.managerA);
    expect(n).toMatchObject({ title: 'Hesap açma talebi', data: { hasAccount: false } });
  });

  it('yöneticinin talebi yalnızca sistem yöneticisine düşer', async () => {
    await ask('a@bildirim.test').expect(200);
    expect(await count(tokens.managerA2)).toBe(2);
    expect(await count(tokens.admin)).toBe(3);
    const [n] = await list(tokens.admin);
    expect(n).toMatchObject({ title: 'Yönetici şifre yenileme talebi', data: { isManager: true } });
  });
});

describe('anlık bildirim', () => {
  it('yeni talep açık akışa anında gelir', async () => {
    await prisma.notification.deleteMany({ where: { subjectKey: { contains: ids.residentOcc } } });
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/notifications/stream`, {
      headers: bearer(tokens.managerA2),
      signal: controller.signal,
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    const received = (async () => {
      let text = '';
      while (!text.includes('"kind":"created"')) {
        const { value, done } = await reader.read();
        if (done) break;
        text += new TextDecoder().decode(value);
      }
      return text;
    })();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await ask('05329990010').expect(200);
    const text = await Promise.race([
      received,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('olay gelmedi')), 5000)),
    ]);
    controller.abort();
    expect(text).toContain('event: notification');
    expect(text).toContain('Ayşe Yılmaz');
  });
});

describe('talebin sonuçlanması', () => {
  it('bir yönetici bağlantı gönderince talep herkeste tamamlanır', async () => {
    await http()
      .post(`/api/residents/${ids.residentOcc}/password-reset`)
      .set({ ...bearer(tokens.managerA), 'X-Site-Id': ids.siteA })
      .send({ send: 'SMS' })
      .expect(200);
    for (const token of [tokens.managerA, tokens.managerA2, tokens.admin]) {
      const n = (await list(token)).find((x) => x.data.occupancyId === ids.residentOcc);
      expect(n?.resolvedAt).not.toBeNull();
    }
  });

  it('okundu işaretlenir; başkasının bildirimi işaretlenemez', async () => {
    const [mine] = await list(tokens.managerA);
    const [other] = await list(tokens.managerA2);
    await http()
      .post(`/api/notifications/${other!.id}/read`)
      .set(bearer(tokens.managerA))
      .expect(404);
    await http()
      .post(`/api/notifications/${mine!.id}/read`)
      .set(bearer(tokens.managerA))
      .expect(204);
    expect((await list(tokens.managerA)).find((n) => n.id === mine!.id)?.readAt).not.toBeNull();
    await http().post('/api/notifications/read-all').set(bearer(tokens.managerA)).expect(204);
    expect(await count(tokens.managerA)).toBe(0);
    await http().get('/api/notifications').expect(401);
  });
});

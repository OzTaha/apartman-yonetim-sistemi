import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'Deneme123!';
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const PDF = Buffer.from('%PDF-1.4\n%test\n');

let app: NestExpressApplication;
let prisma: PrismaService;
let siteId: string;
const units = {} as Record<'A1' | 'A2' | 'B1', string>;
const userIds = {} as Record<'manager' | 'blockManager' | 'resident', string>;
const tokens = {} as Record<
  'manager' | 'auditor' | 'blockManager' | 'resident' | 'neighbor',
  string
>;

const http = () => request(app.getHttpServer());
const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Site-Id': siteId });

async function login(identifier: string) {
  const res = await http()
    .post('/api/auth/login')
    .send({ identifier, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

function open(
  token: string,
  fields: Record<string, string>,
  photos: { name: string; data: Buffer }[] = [],
) {
  let req = http().post('/api/requests/mine').set(as(token));
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  for (const p of photos) req = req.attach('photos', p.data, p.name);
  return req;
}

const fault = (unitId: string, title = 'Asansör çalışmıyor') => ({
  unitId,
  location: 'COMMON',
  category: 'FAULT',
  title,
  description: 'Asansör 3. katta takılı kaldı.',
});

const notificationsOf = (userId: string, requestId: string) =>
  prisma.notification.findMany({ where: { userId, subjectKey: `request:${requestId}` } });

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, sites CASCADE');
  const passwordHash = await hashPassword(PASSWORD);
  const [manager, auditor, blockManager, resident, neighbor] = await Promise.all(
    ['yonetici', 'denetci', 'blok', 'sakin', 'komsu'].map((name) =>
      prisma.user.create({
        data: { firstName: name, lastName: 'Kişi', email: `${name}@talep.test`, passwordHash },
      }),
    ),
  );
  userIds.manager = manager!.id;
  userIds.blockManager = blockManager!.id;
  userIds.resident = resident!.id;

  const site = await prisma.site.create({ data: { name: 'Talep Sitesi', kind: 'SITE' } });
  siteId = site.id;
  const blockA = await prisma.block.create({ data: { siteId, name: 'A' } });
  const blockB = await prisma.block.create({ data: { siteId, name: 'B' } });
  for (const [key, blockId, number] of [
    ['A1', blockA.id, '1'],
    ['A2', blockA.id, '2'],
    ['B1', blockB.id, '1'],
  ] as const) {
    units[key] = (await prisma.unit.create({ data: { siteId, blockId, number } })).id;
  }
  await prisma.siteMembership.createMany({
    data: [
      { siteId, userId: manager!.id, role: 'SITE_MANAGER' },
      { siteId, userId: auditor!.id, role: 'AUDITOR' },
      { siteId, userId: blockManager!.id, role: 'BLOCK_MANAGER' },
      { siteId, userId: resident!.id, role: 'RESIDENT' },
      { siteId, userId: neighbor!.id, role: 'RESIDENT' },
    ],
  });
  await prisma.blockManager.create({
    data: { siteId, blockId: blockA.id, userId: blockManager!.id },
  });
  for (const [unitId, userId] of [
    [units.A1, resident!.id],
    [units.B1, neighbor!.id],
  ] as const) {
    await prisma.occupancy.create({
      data: {
        siteId,
        unitId,
        userId,
        firstName: 'Sakin',
        lastName: 'Kişi',
        type: 'OWNER',
        startDate: new Date('2020-01-01'),
      },
    });
  }

  tokens.manager = await login('yonetici@talep.test');
  tokens.auditor = await login('denetci@talep.test');
  tokens.blockManager = await login('blok@talep.test');
  tokens.resident = await login('sakin@talep.test');
  tokens.neighbor = await login('komsu@talep.test');
});

afterAll(async () => {
  await app?.close();
});

describe('Arıza ve talepler', () => {
  let requestId: string;
  let photoId: string;
  let neighborRequestId: string;

  it('sakin kendi dairesi için fotoğraflı talep açar, yönetici ve blok yöneticisi bildirim alır', async () => {
    const res = await open(tokens.resident, fault(units.A1), [
      { name: 'asansor.png', data: PNG },
    ]).expect(201);
    requestId = res.body.id;
    expect(res.body).toMatchObject({ number: 1, status: 'NEW', blockName: 'A', unseen: false });

    expect(await notificationsOf(userIds.manager, requestId)).toHaveLength(1);
    expect(await notificationsOf(userIds.blockManager, requestId)).toHaveLength(1);
    const [n] = await notificationsOf(userIds.manager, requestId);
    expect(n).toMatchObject({ type: 'SERVICE_REQUEST', title: 'Yeni arıza talebi' });

    const detail = await http()
      .get(`/api/requests/${requestId}`)
      .set(as(tokens.manager))
      .expect(200);
    expect(detail.body.photos).toHaveLength(1);
    expect(detail.body.events.map((e: { kind: string }) => e.kind)).toEqual(['CREATED']);
    photoId = detail.body.photos[0].id;

    const neighbor = await open(tokens.neighbor, fault(units.B1, 'Bahçe kapısı')).expect(201);
    neighborRequestId = neighbor.body.id;
    expect(neighbor.body.number).toBe(2);
    expect(await notificationsOf(userIds.blockManager, neighborRequestId)).toHaveLength(0);
  });

  it('başka dairenin adına talep, PDF veya 3ten fazla fotoğraf kabul edilmez', async () => {
    await open(tokens.resident, fault(units.B1)).expect(404);
    await open(tokens.resident, fault(units.A1), [{ name: 'belge.pdf', data: PDF }]).expect(400);
    await open(
      tokens.resident,
      fault(units.A1),
      Array.from({ length: 4 }, (_, i) => ({ name: `f${i}.png`, data: PNG })),
    ).expect(400);
    await open(tokens.resident, { ...fault(units.A1), title: '' }).expect(400);
    await open(tokens.auditor, fault(units.A1)).expect(404);
  });

  it('sakin yalnızca kendi taleplerini, blok yöneticisi kendi bloğunu görür; denetçi göremez', async () => {
    const mine = await http().get('/api/requests/mine').set(as(tokens.resident)).expect(200);
    expect(mine.body.map((r: { id: string }) => r.id)).toEqual([requestId]);
    await http()
      .get(`/api/requests/mine/${neighborRequestId}`)
      .set(as(tokens.resident))
      .expect(404);

    const all = await http().get('/api/requests').set(as(tokens.manager)).expect(200);
    expect(all.body).toHaveLength(2);
    const scoped = await http().get('/api/requests').set(as(tokens.blockManager)).expect(200);
    expect(scoped.body.map((r: { id: string }) => r.id)).toEqual([requestId]);
    await http().get(`/api/requests/${neighborRequestId}`).set(as(tokens.blockManager)).expect(404);

    await http().get('/api/requests').set(as(tokens.auditor)).expect(403);
    await http().get('/api/requests').set(as(tokens.resident)).expect(403);
  });

  it('fotoğrafı talep sahibi ve yetkililer açar; komşu ve denetçi açamaz', async () => {
    for (const token of [tokens.resident, tokens.manager, tokens.blockManager]) {
      await http().get(`/api/attachments/${photoId}`).set(as(token)).expect(200);
    }
    await http().get(`/api/attachments/${photoId}`).set(as(tokens.neighbor)).expect(404);
    await http().get(`/api/attachments/${photoId}`).set(as(tokens.auditor)).expect(404);
  });

  it('yönetimin yanıtı sakine yeni yanıt olarak görünür ve bildirimi kapatır', async () => {
    await http()
      .post(`/api/requests/${requestId}/comments`)
      .set(as(tokens.blockManager))
      .send({ note: 'Servis çağrıldı.' })
      .expect(200);
    const [n] = await notificationsOf(userIds.manager, requestId);
    expect(n!.resolvedAt).not.toBeNull();

    let mine = await http().get('/api/requests/mine').set(as(tokens.resident)).expect(200);
    expect(mine.body[0].unseen).toBe(true);
    const detail = await http()
      .get(`/api/requests/mine/${requestId}`)
      .set(as(tokens.resident))
      .expect(200);
    expect(detail.body.events.at(-1)).toMatchObject({
      kind: 'COMMENT',
      note: 'Servis çağrıldı.',
      userName: 'Yönetim',
    });
    mine = await http().get('/api/requests/mine').set(as(tokens.resident)).expect(200);
    expect(mine.body[0].unseen).toBe(false);

    await http()
      .post(`/api/requests/mine/${requestId}/comments`)
      .set(as(tokens.resident))
      .send({ note: 'Teşekkürler, akşam evdeyim.' })
      .expect(200);
    const fresh = await prisma.notification.count({
      where: { userId: userIds.manager, subjectKey: `request:${requestId}`, resolvedAt: null },
    });
    expect(fresh).toBe(1);
  });

  it('görev olarak verilen talep, görev tamamlanınca çözülür', async () => {
    await http()
      .post(`/api/requests/${requestId}/status`)
      .set(as(tokens.manager))
      .send({ status: 'REJECTED' })
      .expect(400);
    await http()
      .post(`/api/requests/${requestId}/task`)
      .set(as(tokens.blockManager))
      .send({})
      .expect(403);

    const withTask = await http()
      .post(`/api/requests/${requestId}/task`)
      .set(as(tokens.manager))
      .send({ priority: 'HIGH' })
      .expect(200);
    expect(withTask.body.status).toBe('IN_PROGRESS');
    const taskId = withTask.body.task.id as string;
    await http()
      .post(`/api/requests/${requestId}/task`)
      .set(as(tokens.manager))
      .send({})
      .expect(409);

    const task = await http().get(`/api/tasks/${taskId}`).set(as(tokens.manager)).expect(200);
    expect(task.body.request).toEqual({ id: requestId, number: 1 });
    expect(task.body.title).toBe('Talep #1: Asansör çalışmıyor');
    expect(task.body.priority).toBe('HIGH');

    await http()
      .post(`/api/tasks/${taskId}/status`)
      .set(as(tokens.manager))
      .send({ status: 'DONE' })
      .expect(200);
    const resolved = await http()
      .get(`/api/requests/mine/${requestId}`)
      .set(as(tokens.resident))
      .expect(200);
    expect(resolved.body.status).toBe('RESOLVED');
    expect(resolved.body.resolvedAt).not.toBeNull();
    expect(resolved.body.events.at(-1)).toMatchObject({ kind: 'STATUS', status: 'RESOLVED' });
    const open = await prisma.notification.count({
      where: { subjectKey: `request:${requestId}`, resolvedAt: null },
    });
    expect(open).toBe(0);

    await http()
      .post(`/api/requests/mine/${requestId}/comments`)
      .set(as(tokens.resident))
      .send({ note: 'Yine bozuldu' })
      .expect(400);
  });

  it('sakin, yönetim işlem yapmadıysa talebini geri çeker', async () => {
    const created = await open(tokens.resident, fault(units.A1, 'Yanlış talep'), [
      { name: 'x.png', data: PNG },
    ]).expect(201);
    const id = created.body.id as string;
    await http().delete(`/api/requests/mine/${id}`).set(as(tokens.neighbor)).expect(404);
    await http().delete(`/api/requests/mine/${id}`).set(as(tokens.resident)).expect(204);
    expect(await prisma.serviceRequest.count({ where: { id } })).toBe(0);
    expect(await prisma.attachment.count({ where: { requestId: id } })).toBe(0);
    expect(await prisma.notification.count({ where: { subjectKey: `request:${id}` } })).toBe(0);

    await http().delete(`/api/requests/mine/${requestId}`).set(as(tokens.resident)).expect(409);
  });

  it('reddedilen talep nedeniyle birlikte sakine görünür, yeniden açılabilir', async () => {
    await http()
      .post(`/api/requests/${neighborRequestId}/status`)
      .set(as(tokens.manager))
      .send({ status: 'REJECTED', note: 'Bahçe kapısı belediyenin sorumluluğunda.' })
      .expect(200);
    const seen = await http()
      .get(`/api/requests/mine/${neighborRequestId}`)
      .set(as(tokens.neighbor))
      .expect(200);
    expect(seen.body.status).toBe('REJECTED');
    expect(seen.body.events.at(-1).note).toBe('Bahçe kapısı belediyenin sorumluluğunda.');

    const reopened = await http()
      .post(`/api/requests/${neighborRequestId}/status`)
      .set(as(tokens.manager))
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(reopened.body.status).toBe('IN_PROGRESS');

    const list = await http()
      .get('/api/requests?view=REJECTED')
      .set(as(tokens.manager))
      .expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('talebi olan daire silinemez, arşivlenir', async () => {
    const info = await http()
      .get(`/api/units/${units.A1}/removal`)
      .set(as(tokens.manager))
      .expect(200);
    expect(info.body.canDelete).toBe(false);
  });
});

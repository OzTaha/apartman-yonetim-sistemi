import { addDays } from '@apartman/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { todayInIstanbul } from '../src/common/dates';
import { hashPassword } from '../src/modules/auth/password';
import { RemindersService } from '../src/modules/communication/reminders';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'Deneme123!';
const today = todayInIstanbul();
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

let app: NestExpressApplication;
let prisma: PrismaService;
const ids = {} as Record<
  'siteA' | 'siteB' | 'blockA' | 'blockB' | 'unitA1' | 'unitA2' | 'unitB1' | 'unitOther',
  string
>;
const tokens = {} as Record<'managerA' | 'managerB' | 'resident', string>;

const http = () => request(app.getHttpServer());
const as = (token: string, siteId: string) => ({
  Authorization: `Bearer ${token}`,
  'X-Site-Id': siteId,
});
const A = () => as(tokens.managerA, ids.siteA);
const B = () => as(tokens.managerB, ids.siteB);
const R = () => as(tokens.resident, ids.siteA);

async function login(identifier: string) {
  const res = await http()
    .post('/api/auth/login')
    .send({ identifier, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

async function waitForDelivery(campaignId: string) {
  for (let i = 0; i < 50; i += 1) {
    const res = await http().get(`/api/messages/${campaignId}`).set(A()).expect(200);
    if (res.body.counts.queued === 0) return res.body;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Mesajlar gönderilmedi');
}

const campaign = (body: Record<string, unknown>) => ({
  kind: 'INFO',
  channel: 'SMS',
  filter: 'ALL',
  body: 'Sayın {ad}, {daire} için bilgilendirme. {site}',
  ...body,
});

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, sites CASCADE');
  const passwordHash = await hashPassword(PASSWORD);
  const [managerA, managerB, resident] = await Promise.all(
    ['a@mesaj.test', 'b@mesaj.test', 'sakin@mesaj.test'].map((email, i) =>
      prisma.user.create({
        data: { firstName: 'Kişi', lastName: String(i), email, passwordHash },
      }),
    ),
  );
  const siteA = await prisma.site.create({ data: { name: 'Mesaj Sitesi' } });
  const siteB = await prisma.site.create({ data: { name: 'Diğer Site' } });
  await prisma.siteMembership.createMany({
    data: [
      { siteId: siteA.id, userId: managerA!.id, role: 'SITE_MANAGER' },
      { siteId: siteB.id, userId: managerB!.id, role: 'SITE_MANAGER' },
      { siteId: siteA.id, userId: resident!.id, role: 'RESIDENT' },
    ],
  });
  const blockA = await prisma.block.create({ data: { siteId: siteA.id, name: 'A' } });
  const blockB = await prisma.block.create({ data: { siteId: siteA.id, name: 'B' } });
  const otherBlock = await prisma.block.create({ data: { siteId: siteB.id, name: 'A' } });
  const unit = (siteId: string, blockId: string, number: string) =>
    prisma.unit.create({ data: { siteId, blockId, number } });
  const [unitA1, unitA2, unitB1, unitOther] = await Promise.all([
    unit(siteA.id, blockA.id, '1'),
    unit(siteA.id, blockA.id, '2'),
    unit(siteA.id, blockB.id, '1'),
    unit(siteB.id, otherBlock.id, '1'),
  ]);
  const occupant = (
    unitId: string,
    firstName: string,
    phone: string | null,
    contactConsent: boolean,
    extra: Record<string, unknown> = {},
  ) => ({
    siteId: siteA.id,
    unitId,
    firstName,
    lastName: 'Sakin',
    phone,
    contactConsent,
    type: 'OWNER' as const,
    startDate: new Date('2020-01-01'),
    ...extra,
  });
  for (const data of [
    occupant(unitA1!.id, 'Ayşe', '+905321110001', true, { userId: resident!.id }),
    occupant(unitA1!.id, 'Kiracı', '+905321110009', true, {
      type: 'TENANT',
      isResponsibleForDues: false,
    }),
    occupant(unitA2!.id, 'Onaysız', '+905321110002', false),
    occupant(unitB1!.id, 'Telefonsuz', null, true),
  ]) {
    await prisma.occupancy.create({ data });
  }
  Object.assign(ids, {
    siteA: siteA.id,
    siteB: siteB.id,
    blockA: blockA.id,
    blockB: blockB.id,
    unitA1: unitA1!.id,
    unitA2: unitA2!.id,
    unitB1: unitB1!.id,
    unitOther: unitOther!.id,
  });
  tokens.managerA = await login('a@mesaj.test');
  tokens.managerB = await login('b@mesaj.test');
  tokens.resident = await login('sakin@mesaj.test');

  const types = await http().get('/api/charge-types').set(A()).expect(200);
  await http()
    .post('/api/charges')
    .set(A())
    .send({
      chargeTypeId: types.body[0].id,
      scope: 'SELECTED',
      unitIds: [ids.unitA1],
      amountMode: 'PER_UNIT',
      amountKurus: 150_000,
      issueDate: addDays(today, -5),
      dueDate: addDays(today, -5),
    })
    .expect(201);
});

afterAll(async () => {
  await app?.close();
});

describe('mesaj şablonları', () => {
  it('varsayılan şablonlar gelir, bilinmeyen değişken reddedilir', async () => {
    const list = await http().get('/api/message-templates').set(A()).expect(200);
    expect(list.body).toHaveLength(4);
    await http()
      .post('/api/message-templates')
      .set(A())
      .send({ name: 'Hatalı', kind: 'INFO', body: 'Sayın {isim}' })
      .expect(400);
    const created = await http()
      .post('/api/message-templates')
      .set(A())
      .send({ name: 'Asansör arızası', kind: 'EMERGENCY', body: '{site}: asansör arızalı.' })
      .expect(201);
    await http()
      .patch(`/api/message-templates/${created.body.id}`)
      .set(A())
      .send({ name: 'Asansör arızası', kind: 'EMERGENCY', body: '{site}: asansör onarımda.' })
      .expect(200);
    await http().delete(`/api/message-templates/${created.body.id}`).set(A()).expect(204);
    const other = await http().get('/api/message-templates').set(B()).expect(200);
    expect(other.body.map((t: { id: string }) => t.id)).not.toContain(list.body[0].id);
  });
});

describe('toplu mesaj', () => {
  it('önizleme onaysız ve telefonsuz sakinleri ayırır, metni doldurur', async () => {
    const res = await http().post('/api/messages/preview').set(A()).send(campaign({})).expect(200);
    expect(res.body).toMatchObject({ recipients: 2, skippedNoConsent: 1, skippedNoPhone: 1 });
    expect(res.body.sample.text).toBe(
      'Sayın Ayşe Sakin, A Blok Daire 1 için bilgilendirme. Mesaj Sitesi',
    );
  });

  it('borç hatırlatması yalnızca borcu olan dairenin sorumlusuna gider', async () => {
    const sent = await http()
      .post('/api/messages')
      .set(A())
      .send(
        campaign({
          kind: 'DUES_REMINDER',
          filter: 'DEBTORS',
          body: 'Sayın {ad}, {borc} borcunuz var.',
        }),
      )
      .expect(201);
    const detail = await waitForDelivery(sent.body.id);
    expect(detail.counts).toEqual({ queued: 0, sent: 1, failed: 0, skipped: 0 });
    expect(detail.deliveries[0]).toMatchObject({
      name: 'Ayşe Sakin',
      phone: '+905321110001',
      text: 'Sayın Ayşe Sakin, ₺1.500,00 borcunuz var.',
      status: 'SENT',
      attempts: 1,
    });
  });

  it('tüm sakinlere gönderimde atlananlar nedeniyle kaydedilir', async () => {
    const sent = await http().post('/api/messages').set(A()).send(campaign({})).expect(201);
    const detail = await waitForDelivery(sent.body.id);
    expect(detail.counts).toEqual({ queued: 0, sent: 2, failed: 0, skipped: 2 });
    const skipped = detail.deliveries.filter((d: { status: string }) => d.status === 'SKIPPED');
    expect(skipped.map((d: { error: string }) => d.error).sort()).toEqual([
      'Telefon numarası yok',
      'İletişim onayı yok',
    ]);
    await http().post(`/api/messages/${sent.body.id}/retry`).set(A()).expect(400);
  });

  it('gönderilecek kimse yoksa veya başka sitenin dairesi seçilirse reddeder', async () => {
    await http()
      .post('/api/messages')
      .set(A())
      .send(campaign({ filter: 'UNITS', unitIds: [ids.unitA2] }))
      .expect(400);
    await http()
      .post('/api/messages')
      .set(A())
      .send(campaign({ filter: 'UNITS', unitIds: [ids.unitOther] }))
      .expect(400);
    await http()
      .post('/api/messages/preview')
      .set(A())
      .send(campaign({ filter: 'BLOCKS', blockIds: [ids.blockB] }))
      .expect(200)
      .expect((res) => expect(res.body.recipients).toBe(0));
  });

  it('başka site ve sakin gönderimleri göremez', async () => {
    const list = await http().get('/api/messages').set(A()).expect(200);
    expect(list.body).toHaveLength(2);
    await http().get(`/api/messages/${list.body[0].id}`).set(B()).expect(404);
    const other = await http().get('/api/messages').set(B()).expect(200);
    expect(other.body).toHaveLength(0);
    await http().get('/api/messages').set(R()).expect(403);
  });
});

describe('otomatik hatırlatma', () => {
  it('son ödeme gününden N gün sonra borçluya bir kez gönderilir', async () => {
    const settings = await http().get('/api/reminder-settings').set(A()).expect(200);
    expect(settings.body.enabled).toBe(false);
    await http()
      .put('/api/reminder-settings')
      .set(A())
      .send({ ...settings.body, enabled: true, daysAfterDue: 5 })
      .expect(200);

    const reminders = app.get(RemindersService);
    await reminders.runAllSites(today);
    await reminders.runAllSites(today);
    const list = await http().get('/api/messages').set(A()).expect(200);
    const automatic = list.body.filter((c: { automatic: boolean }) => c.automatic);
    expect(automatic).toHaveLength(1);
    const detail = await waitForDelivery(automatic[0].id);
    expect(detail.deliveries.map((d: { name: string }) => d.name)).toEqual(['Ayşe Sakin']);

    await http()
      .put('/api/reminder-settings')
      .set(A())
      .send({ ...settings.body, enabled: true, daysAfterDue: 6 })
      .expect(200);
    await reminders.runAllSites(addDays(today, 1));
    const after = await http().get('/api/messages').set(A()).expect(200);
    expect(after.body.filter((c: { automatic: boolean }) => c.automatic)).toHaveLength(2);
  });
});

describe('duyurular', () => {
  let general: string;
  let blockB: string;

  it('tüm sakinlere duyuru yayınlanır ve SMS ile bildirilir', async () => {
    const res = await http()
      .post('/api/announcements')
      .set(A())
      .send({
        title: 'Su kesintisi',
        body: 'Yarın 10:00-14:00 arası su kesilecektir.',
        audience: 'ALL',
        notify: { channel: 'SMS', body: 'Sayın {ad}, yeni duyuru: Su kesintisi' },
      })
      .expect(201);
    general = res.body.id;
    expect(res.body).toMatchObject({
      targetLabel: 'Tüm sakinler',
      readCount: 0,
      audienceCount: 1,
    });
    expect(res.body.campaignId).not.toBeNull();
    const detail = await waitForDelivery(res.body.campaignId);
    expect(detail.counts.sent).toBe(2);
  });

  it('geçmiş bitiş tarihi ve başka sitenin bloğu reddedilir', async () => {
    const base = { title: 'Deneme', body: 'Metin', audience: 'ALL' };
    await http()
      .post('/api/announcements')
      .set(A())
      .send({ ...base, expiresAt: addDays(today, -1) })
      .expect(400);
    const other = await prisma.block.findFirstOrThrow({ where: { siteId: ids.siteB } });
    await http()
      .post('/api/announcements')
      .set(A())
      .send({ ...base, audience: 'BLOCKS', blockIds: [other.id] })
      .expect(400);
  });

  it('sakin yalnızca kendisine yönelik duyuruları görür ve okundu işaretler', async () => {
    const res = await http()
      .post('/api/announcements')
      .set(A())
      .send({
        title: 'B blok boyası',
        body: 'B blok boyanacak.',
        audience: 'BLOCKS',
        blockIds: [ids.blockB],
      })
      .expect(201);
    blockB = res.body.id;
    expect(res.body).toMatchObject({ targetLabel: 'B Blok', audienceCount: 0 });

    const mine = await http().get('/api/announcements/mine').set(R()).expect(200);
    expect(mine.body.map((a: { id: string }) => a.id)).toEqual([general]);
    expect(mine.body[0].read).toBe(false);
    await http().post(`/api/announcements/${blockB}/read`).set(R()).expect(404);
    await http().post(`/api/announcements/${general}/read`).set(R()).expect(204);
    await http().post(`/api/announcements/${general}/read`).set(R()).expect(204);

    const again = await http().get('/api/announcements/mine').set(R()).expect(200);
    expect(again.body[0].read).toBe(true);
    const detail = await http().get(`/api/announcements/${general}`).set(A()).expect(200);
    expect(detail.body).toMatchObject({ readCount: 1, audienceCount: 1 });
    expect(detail.body.readers).toMatchObject([{ name: 'Ayşe Sakin', unitNumber: '1' }]);
    await http().post('/api/announcements').set(R()).send({}).expect(403);
  });

  it('sabitlenen duyuru üste çıkar; ekleri yalnızca hedefteki sakin indirir', async () => {
    await http()
      .put(`/api/announcements/${blockB}`)
      .set(A())
      .send({
        title: 'B blok boyası',
        body: 'B blok boyanacak.',
        audience: 'BLOCKS',
        blockIds: [ids.blockB],
        pinned: true,
      })
      .expect(200);
    const list = await http().get('/api/announcements').set(A()).expect(200);
    expect(list.body[0].id).toBe(blockB);

    const upload = (id: string) =>
      http()
        .post(`/api/attachments?target=announcement&targetId=${id}`)
        .set(A())
        .attach('file', PDF_BYTES, 'duyuru.pdf')
        .expect(201);
    const visible = await upload(general);
    const hidden = await upload(blockB);
    await http().get(`/api/attachments/${visible.body.id}`).set(R()).expect(200);
    await http().get(`/api/attachments/${hidden.body.id}`).set(R()).expect(404);
  });

  it('panelde son duyurular görünür; süresi dolan sakinden gizlenir; silinince gönderim kalır', async () => {
    const dashboard = await http().get('/api/dashboard').set(A()).expect(200);
    expect(dashboard.body.announcements.map((a: { id: string }) => a.id)).toEqual([
      blockB,
      general,
    ]);

    await prisma.announcement.update({
      where: { id: general },
      data: { expiresAt: new Date(`${addDays(today, -1)}T00:00:00.000Z`) },
    });
    const mine = await http().get('/api/announcements/mine').set(R()).expect(200);
    expect(mine.body).toHaveLength(0);
    const list = await http().get('/api/announcements').set(A()).expect(200);
    expect(list.body.find((a: { id: string }) => a.id === general).expired).toBe(true);

    await http().delete(`/api/announcements/${general}`).set(A()).expect(204);
    await http().get(`/api/announcements/${general}`).set(A()).expect(404);
    const messages = await http().get('/api/messages').set(A()).expect(200);
    expect(messages.body.some((c: { kind: string }) => c.kind === 'ANNOUNCEMENT')).toBe(true);
  });
});

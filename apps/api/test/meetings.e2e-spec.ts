import { addDays, addMonths } from '@apartman/shared';
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
const meetingDay = addDays(today, 20);
const startsAt = `${meetingDay}T14:00`;
const secondStartsAt = `${addDays(meetingDay, 7)}T14:00`;

let app: NestExpressApplication;
let prisma: PrismaService;
let siteId: string;
let budgetId: string;
const units = {} as Record<'A1' | 'A2' | 'B1' | 'B2', string>;
const tokens = {} as Record<'manager' | 'auditor' | 'resident' | 'blockManager', string>;

const http = () => request(app.getHttpServer());
const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Site-Id': siteId });
const M = () => as(tokens.manager);

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

async function pdf(path: string, token = tokens.manager) {
  const res = await http().get(path).set(as(token)).buffer(true).parse(binary).expect(200);
  expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  return res;
}

const meetingBody = (items: { id?: string; title: string; budgetId?: string | null }[]) => ({
  kind: 'ORDINARY',
  startsAt,
  secondStartsAt,
  location: 'Site toplantı salonu',
  items,
});

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, sites CASCADE');
  const passwordHash = await hashPassword(PASSWORD);
  const [manager, auditor, resident, blockManager] = await Promise.all(
    ['yonetici', 'denetci', 'sakin', 'blok'].map((name) =>
      prisma.user.create({
        data: { firstName: name, lastName: 'Kişi', email: `${name}@kurul.test`, passwordHash },
      }),
    ),
  );
  const site = await prisma.site.create({ data: { name: 'Kurul Sitesi', kind: 'SITE' } });
  siteId = site.id;
  const blockA = await prisma.block.create({ data: { siteId, name: 'A' } });
  const blockB = await prisma.block.create({ data: { siteId, name: 'B' } });
  for (const [key, blockId, number, landShare] of [
    ['A1', blockA.id, '1', 40],
    ['A2', blockA.id, '2', 20],
    ['B1', blockB.id, '1', 30],
    ['B2', blockB.id, '2', 10],
  ] as const) {
    units[key] = (await prisma.unit.create({ data: { siteId, blockId, number, landShare } })).id;
  }
  await prisma.siteMembership.createMany({
    data: [
      { siteId, userId: manager!.id, role: 'SITE_MANAGER' },
      { siteId, userId: auditor!.id, role: 'AUDITOR' },
      { siteId, userId: resident!.id, role: 'RESIDENT' },
      { siteId, userId: blockManager!.id, role: 'BLOCK_MANAGER' },
    ],
  });
  await prisma.blockManager.create({
    data: { siteId, blockId: blockA.id, userId: blockManager!.id },
  });
  for (const [unitId, firstName, userId] of [
    [units.A1, 'Ayşe', resident!.id],
    [units.A2, 'Mehmet', null],
    [units.B1, 'Can', null],
  ] as const) {
    await prisma.occupancy.create({
      data: {
        siteId,
        unitId,
        userId,
        firstName,
        lastName: 'Malik',
        type: 'OWNER',
        startDate: new Date('2020-01-01'),
        ...(unitId === units.A1 ? { phone: '+905321110001', contactConsent: true } : {}),
      },
    });
  }
  tokens.manager = await login('yonetici@kurul.test');
  tokens.auditor = await login('denetci@kurul.test');
  tokens.resident = await login('sakin@kurul.test');
  tokens.blockManager = await login('blok@kurul.test');

  const budget = await http()
    .post('/api/budgets')
    .set(M())
    .send({ startPeriod: addMonths(today.slice(0, 7), 1), method: 'EQUAL' })
    .expect(201);
  budgetId = budget.body.id;
});

afterAll(async () => {
  await app?.close();
});

describe('Genel kurul', () => {
  let meetingId: string;
  let items: { id: string; title: string }[];

  it('toplantı gündemiyle oluşturulur; hazirun malikleri ve arsa paylarını listeler', async () => {
    await http()
      .post('/api/meetings')
      .set(M())
      .send({ ...meetingBody([{ title: 'Açılış' }]), secondStartsAt: `${meetingDay}T13:00` })
      .expect(400);
    await http()
      .post('/api/meetings')
      .set(M())
      .send(meetingBody([{ title: 'Bütçe', budgetId: '0190d7a4-7a3a-7c2e-9b1a-3f0a1b2c3d4e' }]))
      .expect(400);

    const res = await http()
      .post('/api/meetings')
      .set(M())
      .send(
        meetingBody([
          { title: 'Açılış ve yönetim raporu' },
          { title: 'İşletme projesinin görüşülmesi', budgetId },
          { title: 'Otopark düzenlemesi' },
        ]),
      )
      .expect(201);
    meetingId = res.body.id;
    items = res.body.items;
    expect(res.body).toMatchObject({
      status: 'PLANNED',
      startsAt,
      secondStartsAt,
      noticeDays: 20,
      calledAt: null,
    });
    expect(res.body.items.map((i: { position: number }) => i.position)).toEqual([1, 2, 3]);
    expect(res.body.items[1].budgetLabel).toMatch(/işletme projesi$/);
    expect(
      res.body.attendance.map((a: { unitNumber: string; owners: string; landShare: number }) => [
        a.unitNumber,
        a.owners,
        a.landShare,
      ]),
    ).toEqual([
      ['1', 'Ayşe Malik', 40],
      ['2', 'Mehmet Malik', 20],
      ['1', 'Can Malik', 30],
      ['2', '', 10],
    ]);
    expect(res.body.quorum).toMatchObject({ totalUnits: 4, totalLandShare: 100, reached: false });

    await http().delete(`/api/budgets/${budgetId}`).set(M()).expect(409);
  });

  it('çağrı sabitlenmiş duyuru olarak yayınlanır; blok yöneticisi toplantıyı görür, sakinin genel kurul ekranı yoktur', async () => {
    await http().get('/api/assemblies').set(as(tokens.resident)).expect(403);
    const before = await http().get('/api/assemblies').set(as(tokens.blockManager)).expect(200);
    expect(before.body).toEqual([]);
    await http().get('/api/meetings').set(as(tokens.resident)).expect(403);

    const res = await http()
      .post(`/api/meetings/${meetingId}/call`)
      .set(M())
      .send({ notify: { channel: 'SMS', body: 'Genel kurul toplantımıza davetlisiniz.' } })
      .expect(200);
    expect(res.body.calledAt).not.toBeNull();
    const announcement = await prisma.announcement.findUniqueOrThrow({
      where: { id: res.body.announcementId },
    });
    expect(announcement).toMatchObject({
      title: 'Olağan genel kurul toplantı çağrısı',
      pinned: true,
      audience: 'ALL',
    });
    expect(announcement.body).toContain('Gündem:\n1. Açılış ve yönetim raporu');
    expect(announcement.body).toContain('ikinci toplantı');
    expect(await prisma.messageCampaign.count({ where: { announcementId: announcement.id } })).toBe(
      1,
    );
    await http().post(`/api/meetings/${meetingId}/call`).set(M()).send({}).expect(409);
    await http().delete(`/api/meetings/${meetingId}`).set(M()).expect(409);

    const visible = await http().get('/api/assemblies').set(as(tokens.blockManager)).expect(200);
    expect(visible.body).toHaveLength(1);
    expect(visible.body[0].items[0]).toMatchObject({
      title: 'Açılış ve yönetim raporu',
      result: null,
    });
  });

  it('yeter sayı sağlanmadan birinci toplantı tamamlanamaz; kararlar eksiksiz olmalıdır', async () => {
    let res = await http()
      .put(`/api/meetings/${meetingId}/attendance`)
      .set(M())
      .send({
        entries: [
          { unitId: units.A1, status: 'PRESENT' },
          { unitId: units.A2, status: 'PROXY', name: 'Zeynep Vekil' },
          { unitId: units.B1, status: 'ABSENT' },
        ],
      })
      .expect(200);
    expect(res.body.quorum).toMatchObject({
      presentUnits: 2,
      proxyUnits: 1,
      presentLandShare: 60,
      unitsMajority: false,
      landShareMajority: true,
      reached: false,
    });
    await http()
      .post(`/api/meetings/${meetingId}/complete`)
      .set(M())
      .send({ session: 'FIRST' })
      .expect(400);

    res = await http()
      .put(`/api/meetings/${meetingId}/attendance`)
      .set(M())
      .send({
        entries: [
          { unitId: units.A1, status: 'PRESENT' },
          { unitId: units.A2, status: 'PROXY', name: 'Zeynep Vekil' },
          { unitId: units.B1, status: 'PRESENT' },
        ],
      })
      .expect(200);
    expect(res.body.quorum.reached).toBe(true);
    expect(res.body.attendance[1]).toMatchObject({ status: 'PROXY', name: 'Zeynep Vekil' });

    await http()
      .post(`/api/meetings/${meetingId}/complete`)
      .set(M())
      .send({ session: 'FIRST' })
      .expect(400);
  });

  it('kararlar girilir, toplantı tamamlanınca sıra numarası alır ve kilitlenir; bütçe onaylanır', async () => {
    await http()
      .put(`/api/meetings/${meetingId}/items/${items[0]!.id}/decision`)
      .set(M())
      .send({ result: 'INFO', resolution: 'Yönetim raporu okundu.', votesFor: 3 })
      .expect(400);
    const decisions = [
      { result: 'INFO', resolution: 'Yönetim raporu okundu.' },
      { result: 'ACCEPTED', resolution: 'İşletme projesi aynen kabul edildi.', votesFor: 3 },
      {
        result: 'REJECTED',
        resolution: 'Otopark çizgilerinin değişmesi teklifi reddedildi.',
        votesFor: 1,
        votesAgainst: 2,
      },
    ];
    for (const [i, body] of decisions.entries()) {
      await http()
        .put(`/api/meetings/${meetingId}/items/${items[i]!.id}/decision`)
        .set(M())
        .send(body)
        .expect(200);
    }
    await http()
      .post(`/api/meetings/${meetingId}/complete`)
      .set(as(tokens.auditor))
      .send({ session: 'FIRST' })
      .expect(403);
    const done = await http()
      .post(`/api/meetings/${meetingId}/complete`)
      .set(M())
      .send({ session: 'FIRST' })
      .expect(200);
    expect(done.body).toMatchObject({ status: 'HELD', heldSession: 'FIRST', decisionCount: 2 });
    expect(done.body.items.map((i: { decisionNo: number | null }) => i.decisionNo)).toEqual([
      null,
      1,
      2,
    ]);

    const budget = await http().get(`/api/budgets/${budgetId}`).set(M()).expect(200);
    expect(budget.body.approvedAt).toBe(meetingDay);

    await http()
      .put(`/api/meetings/${meetingId}/items/${items[2]!.id}/decision`)
      .set(M())
      .send(decisions[1])
      .expect(409);
    await http()
      .put(`/api/meetings/${meetingId}/attendance`)
      .set(M())
      .send({ entries: [] })
      .expect(409);
    await http()
      .put(`/api/meetings/${meetingId}`)
      .set(M())
      .send(meetingBody([{ title: 'Yeni madde' }]))
      .expect(409);
  });

  it('karar defteri, tutanak ve hazirun cetveli alınır; sakin kararları ve tutanağı görür', async () => {
    const book = await http().get('/api/meetings/decisions').set(as(tokens.auditor)).expect(200);
    expect(
      book.body.map((d: { decisionNo: number; result: string }) => [d.decisionNo, d.result]),
    ).toEqual([
      [2, 'REJECTED'],
      [1, 'ACCEPTED'],
    ]);
    expect(book.body[1].meetingDate).toBe(meetingDay);

    await pdf('/api/meetings/decisions.pdf', tokens.auditor);
    const minutes = await pdf(`/api/meetings/${meetingId}/minutes.pdf`);
    expect(minutes.headers['content-disposition']).toContain(
      `genel-kurul-tutanagi-${meetingDay}.pdf`,
    );
    const sheet = await pdf(`/api/meetings/${meetingId}/attendance.pdf`);
    expect(sheet.headers['content-disposition']).toContain('hazirun-cetveli');

    const resident = await http().get('/api/assemblies').set(as(tokens.blockManager)).expect(200);
    expect(resident.body[0]).toMatchObject({ status: 'HELD', heldSession: 'FIRST' });
    expect(resident.body[0].items[1]).toMatchObject({
      result: 'ACCEPTED',
      decisionNo: 1,
      resolution: 'İşletme projesi aynen kabul edildi.',
    });
    await pdf(`/api/assemblies/${meetingId}/minutes.pdf`, tokens.blockManager);
    await http()
      .get(`/api/meetings/${meetingId}/attendance.pdf`)
      .set(as(tokens.resident))
      .expect(403);
  });

  it('çağrısı yapılmayan toplantı silinir; yapılan iptal edilir ve sakinlerden gizlenir', async () => {
    const draft = await http()
      .post('/api/meetings')
      .set(M())
      .send({ ...meetingBody([{ title: 'Çatı onarımı' }]), kind: 'EXTRAORDINARY' })
      .expect(201);
    const updated = await http()
      .put(`/api/meetings/${draft.body.id}`)
      .set(M())
      .send({
        ...meetingBody([
          { id: draft.body.items[0].id, title: 'Çatı onarımı ve bütçesi' },
          { title: 'Dilekler' },
        ]),
        kind: 'EXTRAORDINARY',
      })
      .expect(200);
    expect(updated.body.items.map((i: { title: string }) => i.title)).toEqual([
      'Çatı onarımı ve bütçesi',
      'Dilekler',
    ]);
    expect(updated.body.items[0].id).toBe(draft.body.items[0].id);
    await http().delete(`/api/meetings/${draft.body.id}`).set(M()).expect(204);

    const called = await http()
      .post('/api/meetings')
      .set(M())
      .send({ ...meetingBody([{ title: 'Asansör yenileme' }]), kind: 'EXTRAORDINARY' })
      .expect(201);
    await http().post(`/api/meetings/${called.body.id}/call`).set(M()).send({}).expect(200);
    await http()
      .post(`/api/meetings/${called.body.id}/cancel`)
      .set(M())
      .send({ reason: 'x' })
      .expect(400);
    const cancelled = await http()
      .post(`/api/meetings/${called.body.id}/cancel`)
      .set(M())
      .send({ reason: 'Teklifler henüz gelmedi' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    const resident = await http().get('/api/assemblies').set(as(tokens.blockManager)).expect(200);
    expect(resident.body.map((m: { id: string }) => m.id)).toEqual([meetingId]);

    const info = await http().get(`/api/units/${units.A1}/removal`).set(M()).expect(200);
    expect(info.body.canDelete).toBe(false);
  });
});

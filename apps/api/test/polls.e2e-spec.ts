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
const blocks = {} as Record<'A' | 'B', string>;
const units = {} as Record<'A1' | 'B1', string>;
const tokens = {} as Record<'manager' | 'residentA' | 'residentB', string>;
let pollId: string;
let options: { id: string; label: string }[];

const http = () => request(app.getHttpServer());
const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Site-Id': siteId });
const M = () => as(tokens.manager);
const RA = () => as(tokens.residentA);
const RB = () => as(tokens.residentB);

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
  const [manager, residentA, residentB] = await Promise.all(
    ['yonetici@anket.test', 'a@anket.test', 'b@anket.test'].map((email, i) =>
      prisma.user.create({ data: { firstName: 'Kişi', lastName: String(i), email, passwordHash } }),
    ),
  );
  const site = await prisma.site.create({ data: { name: 'Anket Sitesi', kind: 'SITE' } });
  siteId = site.id;
  for (const name of ['A', 'B'] as const) {
    const block = await prisma.block.create({ data: { siteId, name } });
    blocks[name] = block.id;
    const unit = await prisma.unit.create({ data: { siteId, blockId: block.id, number: '1' } });
    units[`${name}1`] = unit.id;
  }
  await prisma.siteMembership.createMany({
    data: [
      { siteId, userId: manager!.id, role: 'SITE_MANAGER' },
      { siteId, userId: residentA!.id, role: 'RESIDENT' },
      { siteId, userId: residentB!.id, role: 'RESIDENT' },
    ],
  });
  for (const [unitId, userId] of [
    [units.A1, residentA!.id],
    [units.B1, residentB!.id],
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
  tokens.manager = await login('yonetici@anket.test');
  tokens.residentA = await login('a@anket.test');
  tokens.residentB = await login('b@anket.test');
});

afterAll(async () => {
  await app?.close();
});

describe('Anket', () => {
  it('hatalı anket reddedilir; yönetici bloğa anket açar, sakin açamaz', async () => {
    const base = { question: 'Bahçeye bank konulsun mu?', endsOn: today, audience: 'ALL' };
    await http()
      .post('/api/polls')
      .set(M())
      .send({ ...base, options: ['Evet'] })
      .expect(400);
    await http()
      .post('/api/polls')
      .set(M())
      .send({ ...base, options: ['Evet', 'evet'] })
      .expect(400);
    await http()
      .post('/api/polls')
      .set(M())
      .send({ ...base, options: ['Evet', 'Hayır'], endsOn: '2020-01-01' })
      .expect(400);
    await http()
      .post('/api/polls')
      .set(M())
      .send({ ...base, options: ['Evet', 'Hayır'], audience: 'BLOCKS' })
      .expect(400);
    await http()
      .post('/api/polls')
      .set(RA())
      .send({ ...base, options: ['Evet', 'Hayır'] })
      .expect(403);

    const res = await http()
      .post('/api/polls')
      .set(M())
      .send({
        ...base,
        options: ['Evet', 'Hayır', 'Fark etmez'],
        audience: 'BLOCKS',
        blockIds: [blocks.A],
      })
      .expect(201);
    expect(res.body).toMatchObject({
      status: 'OPEN',
      blockNames: ['A'],
      eligibleUnits: 1,
      votedUnits: 0,
      notVoted: ['A Blok · Daire 1'],
    });
    pollId = res.body.id;
    options = res.body.options;
    expect(options.map((o) => o.label)).toEqual(['Evet', 'Hayır', 'Fark etmez']);
  });

  it('sakin yalnızca kendi dairesi adına bir oy verir, oyunu değiştirebilir; sonucu oy verince görür', async () => {
    expect((await http().get('/api/polls/mine').set(RB()).expect(200)).body).toEqual([]);
    const before = await http().get('/api/polls/mine').set(RA()).expect(200);
    expect(before.body[0]).toMatchObject({
      id: pollId,
      totalVotes: null,
      units: [{ unitId: units.A1, label: 'A Blok · Daire 1', optionId: null }],
    });
    expect(before.body[0].options.every((o: { votes: null }) => o.votes === null)).toBe(true);

    await http()
      .post(`/api/polls/${pollId}/vote`)
      .set(RA())
      .send({ unitId: units.B1, optionId: options[0]!.id })
      .expect(403);
    await http()
      .post(`/api/polls/${pollId}/vote`)
      .set(RB())
      .send({ unitId: units.B1, optionId: options[0]!.id })
      .expect(403);
    await http()
      .post(`/api/polls/${pollId}/vote`)
      .set(RA())
      .send({ unitId: units.A1, optionId: options[0]!.id })
      .expect(200);
    const changed = await http()
      .post(`/api/polls/${pollId}/vote`)
      .set(RA())
      .send({ unitId: units.A1, optionId: options[1]!.id })
      .expect(200);
    expect(changed.body.totalVotes).toBe(1);
    expect(changed.body.units[0].optionId).toBe(options[1]!.id);
    expect(changed.body.options.map((o: { votes: number }) => o.votes)).toEqual([0, 1, 0]);

    const detail = await http().get(`/api/polls/${pollId}`).set(M()).expect(200);
    expect(detail.body).toMatchObject({ votedUnits: 1, voted: ['A Blok · Daire 1'], notVoted: [] });
    expect(JSON.stringify(detail.body)).not.toContain(units.A1);
  });

  it('bitince oy verilemez, sonuç duyuru olarak bir kez paylaşılır, anket silinebilir', async () => {
    await http().post(`/api/polls/${pollId}/share`).set(M()).expect(400);
    const closed = await http().post(`/api/polls/${pollId}/close`).set(M()).expect(200);
    expect(closed.body.status).toBe('CLOSED');
    await http().post(`/api/polls/${pollId}/close`).set(M()).expect(409);
    await http()
      .post(`/api/polls/${pollId}/vote`)
      .set(RA())
      .send({ unitId: units.A1, optionId: options[0]!.id })
      .expect(400);

    const shared = await http().post(`/api/polls/${pollId}/share`).set(M()).expect(200);
    expect(shared.body.sharedAt).not.toBeNull();
    await http().post(`/api/polls/${pollId}/share`).set(M()).expect(409);
    const announcement = await prisma.announcement.findFirstOrThrow({
      where: { siteId, title: 'Anket sonucu' },
    });
    expect(announcement).toMatchObject({ audience: 'BLOCKS', blockIds: [blocks.A] });
    expect(announcement.body).toContain('Hayır: 1 oy (%100)');
    expect(announcement.body).toContain('1 daireden 1 daire oy verdi.');

    const list = await http().get('/api/polls').set(M()).expect(200);
    expect(list.body).toHaveLength(1);
    await http().delete(`/api/polls/${pollId}`).set(M()).expect(204);
    expect((await http().get('/api/polls/mine').set(RA()).expect(200)).body).toEqual([]);
    expect(await prisma.pollVote.count()).toBe(0);
  });
});

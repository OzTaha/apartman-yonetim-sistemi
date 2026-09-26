import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'Deneme123!';

let app: NestExpressApplication;
let prisma: PrismaService;
const tokens = {} as Record<'admin' | 'manager', string>;

const http = () => request(app.getHttpServer());
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function png(width: number, height: number) {
  const buf = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

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

  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, sites, branding CASCADE');
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.create({
    data: {
      firstName: 'Sistem',
      lastName: 'Yönetici',
      email: 'admin@marka.test',
      passwordHash,
      isPlatformAdmin: true,
    },
  });
  const manager = await prisma.user.create({
    data: { firstName: 'Site', lastName: 'Yönetici', email: 'yonetici@marka.test', passwordHash },
  });
  const site = await prisma.site.create({ data: { name: 'Marka Sitesi' } });
  await prisma.siteMembership.create({
    data: { siteId: site.id, userId: manager.id, role: 'SITE_MANAGER' },
  });
  tokens.admin = await login('admin@marka.test');
  tokens.manager = await login('yonetici@marka.test');
});

afterAll(async () => {
  await app?.close();
});

describe('marka', () => {
  it('oturum açmadan okunur; varsayılan ad ve ikonlar döner', async () => {
    const res = await http().get('/api/branding').expect(200);
    expect(res.body).toEqual({ appName: 'Apartman Yönetim Sistemi', logoUrl: null });
    const manifest = await http().get('/api/branding/manifest.webmanifest').expect(200);
    expect(manifest.headers['content-type']).toContain('application/manifest+json');
    expect(manifest.body).toMatchObject({
      name: 'Apartman Yönetim Sistemi',
      display: 'standalone',
    });
    expect(manifest.body.icons.map((i: { sizes: string }) => i.sizes)).toEqual([
      '192x192',
      '512x512',
      '512x512',
    ]);
  });

  it('yalnızca sistem yöneticisi değiştirebilir', async () => {
    await http().put('/api/branding').send({ appName: 'Yeni Ad' }).expect(401);
    await http()
      .put('/api/branding')
      .set(bearer(tokens.manager))
      .send({ appName: 'Yeni Ad' })
      .expect(403);
    await http().put('/api/branding').set(bearer(tokens.admin)).send({ appName: 'A' }).expect(400);
    const res = await http()
      .put('/api/branding')
      .set(bearer(tokens.admin))
      .send({ appName: 'Güneş Yönetim' })
      .expect(200);
    expect(res.body.appName).toBe('Güneş Yönetim');
    const manifest = await http().get('/api/branding/manifest.webmanifest').expect(200);
    expect(manifest.body.name).toBe('Güneş Yönetim');
  });

  it('logo kare PNG olmalı; yüklenince manifest ikonu olur, kaldırılınca varsayılana döner', async () => {
    const upload = (buf: Buffer, name = 'logo.png', token = tokens.admin) =>
      http().post('/api/branding/logo').set(bearer(token)).attach('file', buf, name);

    await upload(png(512, 512), 'logo.png', tokens.manager).expect(403);
    await upload(Buffer.from('%PDF-1.4 sahte'), 'logo.pdf').expect(400);
    await upload(png(512, 256)).expect(400);
    await upload(png(256, 256)).expect(400);

    const res = await upload(png(512, 512)).expect(201);
    expect(res.body.logoUrl).toMatch(/^\/api\/branding\/logo\?v=\d+$/);
    const logo = await http().get('/api/branding/logo').expect(200);
    expect(logo.headers['content-type']).toBe('image/png');
    const manifest = await http().get('/api/branding/manifest.webmanifest').expect(200);
    expect(manifest.body.icons).toEqual([
      { src: res.body.logoUrl, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ]);

    const removed = await http().delete('/api/branding/logo').set(bearer(tokens.admin)).expect(200);
    expect(removed.body.logoUrl).toBeNull();
    await http().get('/api/branding/logo').expect(404);
  });

  it('API güvenlik başlıkları eklenir', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

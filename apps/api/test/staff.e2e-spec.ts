import { addDays, isoWeekday, weekStartOf } from '@apartman/shared';
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
const thisWeek = weekStartOf(today);
const nextWeek = addDays(thisWeek, 7);

let app: NestExpressApplication;
let prisma: PrismaService;
const ids = {} as Record<'siteA' | 'siteB', string>;
const tokens = {} as Record<'managerA' | 'managerB' | 'resident', string>;
const staff = {} as Record<'guard' | 'cleaner', string>;

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

const shift = (body: Record<string, unknown>) =>
  http()
    .post('/api/shifts')
    .set(A())
    .send({ employeeId: staff.guard, date: thisWeek, ...body });

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, sites CASCADE');
  const passwordHash = await hashPassword(PASSWORD);
  const [managerA, managerB, resident] = await Promise.all(
    ['a@staff.test', 'b@staff.test', 'sakin@staff.test'].map((email, i) =>
      prisma.user.create({
        data: { firstName: 'Kişi', lastName: String(i), email, passwordHash },
      }),
    ),
  );
  const siteA = await prisma.site.create({ data: { name: 'Çalışan Sitesi A' } });
  const siteB = await prisma.site.create({ data: { name: 'Çalışan Sitesi B' } });
  await prisma.siteMembership.createMany({
    data: [
      { siteId: siteA.id, userId: managerA!.id, role: 'SITE_MANAGER' },
      { siteId: siteB.id, userId: managerB!.id, role: 'SITE_MANAGER' },
      { siteId: siteA.id, userId: resident!.id, role: 'RESIDENT' },
    ],
  });
  Object.assign(ids, { siteA: siteA.id, siteB: siteB.id });
  tokens.managerA = await login('a@staff.test');
  tokens.managerB = await login('b@staff.test');
  tokens.resident = await login('sakin@staff.test');
});

afterAll(async () => {
  await app?.close();
});

describe('çalışanlar', () => {
  it('yönetici çalışan ekler; telefon biçimlenir, liste ve detay döner', async () => {
    const guard = await http()
      .post('/api/employees')
      .set(A())
      .send({ firstName: 'Kemal', lastName: 'Yurt', role: 'SECURITY', phone: '0533 100 00 12' })
      .expect(201);
    expect(guard.body).toMatchObject({ phone: '+905331000012', isActive: true, openTaskCount: 0 });
    staff.guard = guard.body.id;

    const cleaner = await http()
      .post('/api/employees')
      .set(A())
      .send({ firstName: 'Gül', lastName: 'Aksoy', role: 'CLEANING', startDate: '2025-01-01' })
      .expect(201);
    staff.cleaner = cleaner.body.id;

    const list = await http().get('/api/employees').set(A()).expect(200);
    expect(list.body.map((e: { firstName: string }) => e.firstName)).toEqual(['Gül', 'Kemal']);
  });

  it('başka sitenin yöneticisi göremez, sakin erişemez', async () => {
    await http().get(`/api/employees/${staff.guard}`).set(B()).expect(404);
    const other = await http().get('/api/employees').set(B()).expect(200);
    expect(other.body).toEqual([]);
    await http().get('/api/employees').set(R()).expect(403);
    await http().get('/api/tasks').set(R()).expect(403);
  });

  it('geçmişi olmayan çalışan silinir', async () => {
    const temp = await http()
      .post('/api/employees')
      .set(A())
      .send({ firstName: 'Geçici', lastName: 'Kişi', role: 'OTHER' })
      .expect(201);
    await http().delete(`/api/employees/${temp.body.id}`).set(A()).expect(204);
  });
});

describe('vardiyalar', () => {
  it('gündüz vardiyası eklenir, çakışan vardiya reddedilir', async () => {
    const day = await shift({ startTime: '08:00', endTime: '16:00' }).expect(201);
    expect(day.body).toMatchObject({ minutes: 480, overnight: false, employeeName: 'Kemal Yurt' });
    const clash = await shift({ startTime: '15:00', endTime: '20:00' }).expect(409);
    expect(clash.body.message).toContain('Pzt 08:00–16:00');
    await shift({ startTime: '16:00', endTime: '20:00' }).expect(201);
  });

  it('gece vardiyası ertesi sabahla çakışırsa reddedilir', async () => {
    const night = await shift({
      date: addDays(thisWeek, 1),
      startTime: '20:00',
      endTime: '08:00',
    }).expect(201);
    expect(night.body).toMatchObject({ minutes: 720, overnight: true });
    await shift({ date: addDays(thisWeek, 2), startTime: '07:00', endTime: '12:00' }).expect(409);
    await shift({ date: addDays(thisWeek, 2), startTime: '08:00', endTime: '12:00' }).expect(201);
  });

  it('düzenlemede kendi kaydıyla çakışma sayılmaz', async () => {
    const created = await shift({
      employeeId: staff.cleaner,
      date: addDays(thisWeek, 3),
      startTime: '09:00',
      endTime: '13:00',
    }).expect(201);
    const updated = await http()
      .patch(`/api/shifts/${created.body.id}`)
      .set(A())
      .send({
        employeeId: staff.cleaner,
        date: addDays(thisWeek, 3),
        startTime: '10:00',
        endTime: '14:00',
        note: 'Geç başlayacak',
      })
      .expect(200);
    expect(updated.body).toMatchObject({ startTime: '10:00', note: 'Geç başlayacak' });
  });

  it('hafta aralığında listelenir; başka site göremez', async () => {
    const res = await http()
      .get(`/api/shifts?from=${thisWeek}&to=${addDays(thisWeek, 6)}`)
      .set(A())
      .expect(200);
    expect(res.body).toHaveLength(5);
    const other = await http()
      .get(`/api/shifts?from=${thisWeek}&to=${addDays(thisWeek, 6)}`)
      .set(B())
      .expect(200);
    expect(other.body).toHaveLength(0);
    await http()
      .get(`/api/shifts?from=${thisWeek}&to=${addDays(thisWeek, 90)}`)
      .set(A())
      .expect(400);
  });

  it('önceki hafta kopyalanır, çakışanlar atlanır', async () => {
    await shift({ date: addDays(nextWeek, 2), startTime: '10:00', endTime: '11:00' }).expect(201);
    const copy = await http()
      .post('/api/shifts/copy-week')
      .set(A())
      .send({ sourceWeek: thisWeek, targetWeek: nextWeek })
      .expect(200);
    expect(copy.body).toEqual({ created: 4, skipped: 1 });
    const again = await http()
      .post('/api/shifts/copy-week')
      .set(A())
      .send({ sourceWeek: thisWeek, targetWeek: nextWeek })
      .expect(200);
    expect(again.body).toEqual({ created: 0, skipped: 5 });
  });

  it('vardiya silinir', async () => {
    const created = await shift({
      date: addDays(thisWeek, 5),
      startTime: '10:00',
      endTime: '11:00',
    }).expect(201);
    await http().delete(`/api/shifts/${created.body.id}`).set(A()).expect(204);
    await http().delete(`/api/shifts/${created.body.id}`).set(A()).expect(404);
  });
});

describe('görevler', () => {
  let taskId: string;

  it('görev oluşturulur ve geçmişe yazılır', async () => {
    const res = await http()
      .post('/api/tasks')
      .set(A())
      .send({ title: 'Çatı oluğunu temizle', employeeId: staff.guard, dueDate: today })
      .expect(201);
    taskId = res.body.id;
    expect(res.body).toMatchObject({
      status: 'TODO',
      priority: 'NORMAL',
      employeeName: 'Kemal Yurt',
      overdue: false,
    });
    expect(res.body.events).toMatchObject([
      { kind: 'CREATED', assigneeName: 'Kemal Yurt', userName: 'Kişi 0' },
    ]);
  });

  it('başka çalışana atama ve düzenleme ayrı ayrı kaydedilir', async () => {
    const res = await http()
      .patch(`/api/tasks/${taskId}`)
      .set(A())
      .send({
        title: 'Çatı oluğunu temizle',
        employeeId: staff.cleaner,
        dueDate: today,
        priority: 'HIGH',
      })
      .expect(200);
    expect(res.body.events.map((e: { kind: string }) => e.kind)).toEqual([
      'CREATED',
      'ASSIGNED',
      'EDITED',
    ]);
    expect(res.body.events[1].assigneeName).toBe('Gül Aksoy');
  });

  it('durum değişir, tamamlanan görev düzenlenemez, yeniden açılabilir', async () => {
    await http()
      .post(`/api/tasks/${taskId}/status`)
      .set(A())
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    const done = await http()
      .post(`/api/tasks/${taskId}/status`)
      .set(A())
      .send({ status: 'DONE', note: 'Oluk temizlendi' })
      .expect(200);
    expect(done.body.completedAt).not.toBeNull();
    expect(done.body.events.at(-1)).toMatchObject({
      kind: 'STATUS',
      status: 'DONE',
      note: 'Oluk temizlendi',
    });
    await http().post(`/api/tasks/${taskId}/status`).set(A()).send({ status: 'DONE' }).expect(400);
    await http()
      .patch(`/api/tasks/${taskId}`)
      .set(A())
      .send({ title: 'Yeni ad', priority: 'NORMAL' })
      .expect(400);
    const reopened = await http()
      .post(`/api/tasks/${taskId}/status`)
      .set(A())
      .send({ status: 'TODO' })
      .expect(200);
    expect(reopened.body.completedAt).toBeNull();
  });

  it('iptal için neden istenir; not eklenir', async () => {
    await http()
      .post(`/api/tasks/${taskId}/status`)
      .set(A())
      .send({ status: 'CANCELLED' })
      .expect(400);
    const note = await http()
      .post(`/api/tasks/${taskId}/notes`)
      .set(A())
      .send({ note: 'Malzeme bekleniyor' })
      .expect(200);
    expect(note.body.events.at(-1)).toMatchObject({ kind: 'NOTE', note: 'Malzeme bekleniyor' });
  });

  it('son tarihi geçen açık görev gecikmiş listesinde görünür', async () => {
    const late = await http()
      .post('/api/tasks')
      .set(A())
      .send({ title: 'Kart okuyucuyu onar', employeeId: staff.guard, dueDate: addDays(today, -2) })
      .expect(201);
    expect(late.body.overdue).toBe(true);
    const overdue = await http().get('/api/tasks?view=overdue').set(A()).expect(200);
    expect(overdue.body.map((t: { id: string }) => t.id)).toEqual([late.body.id]);
    const mine = await http().get(`/api/tasks?employeeId=${staff.cleaner}`).set(A()).expect(200);
    expect(mine.body.map((t: { id: string }) => t.id)).toEqual([taskId]);
    const employees = await http().get('/api/employees').set(A()).expect(200);
    const guard = employees.body.find((e: { id: string }) => e.id === staff.guard);
    expect(guard).toMatchObject({ openTaskCount: 1, overdueTaskCount: 1 });
  });

  it('başka sitenin görevi görülemez', async () => {
    await http().get(`/api/tasks/${taskId}`).set(B()).expect(404);
    await http()
      .post('/api/tasks')
      .set(B())
      .send({ title: 'Sızma denemesi', employeeId: staff.guard })
      .expect(404);
  });
});

describe('tekrarlayan görevler', () => {
  let templateId: string;

  it('bugüne denk gelen kural bugünün görevini bir kez oluşturur', async () => {
    const res = await http()
      .post('/api/recurring-tasks')
      .set(A())
      .send({
        title: 'Merdiven temizliği',
        employeeId: staff.cleaner,
        frequency: 'WEEKLY',
        weekdays: [isoWeekday(today)],
        startDate: addDays(today, -30),
      })
      .expect(201);
    templateId = res.body.id;
    expect(res.body).toMatchObject({ taskCount: 1, employeeName: 'Gül Aksoy' });

    const again = await http()
      .patch(`/api/recurring-tasks/${templateId}`)
      .set(A())
      .send({
        title: 'Merdiven temizliği',
        employeeId: staff.cleaner,
        priority: 'NORMAL',
        frequency: 'WEEKLY',
        weekdays: [isoWeekday(today)],
        dayOfMonth: null,
        startDate: addDays(today, -30),
        isActive: true,
      })
      .expect(200);
    expect(again.body.taskCount).toBe(1);

    const tasks = await http().get('/api/tasks').set(A()).expect(200);
    const generated = tasks.body.find(
      (t: { recurringTaskId: string | null }) => t.recurringTaskId === templateId,
    );
    expect(generated).toMatchObject({ title: 'Merdiven temizliği', dueDate: today });
  });

  it('bugüne denk gelmeyen kural görev oluşturmaz', async () => {
    const res = await http()
      .post('/api/recurring-tasks')
      .set(A())
      .send({
        title: 'Aylık çatı kontrolü',
        frequency: 'MONTHLY',
        dayOfMonth: Number(today.slice(8, 10)) === 1 ? 2 : 1,
        startDate: today,
      })
      .expect(201);
    expect(res.body.taskCount).toBe(0);
    await http()
      .post('/api/recurring-tasks')
      .set(A())
      .send({ title: 'Eksik kural', frequency: 'WEEKLY', startDate: today })
      .expect(400);
  });

  it('kural silinince oluşturulmuş görevler kalır', async () => {
    await http().delete(`/api/recurring-tasks/${templateId}`).set(A()).expect(204);
    const tasks = await http().get('/api/tasks').set(A()).expect(200);
    expect(tasks.body.some((t: { title: string }) => t.title === 'Merdiven temizliği')).toBe(true);
  });
});

describe('çalışana ödeme', () => {
  let accountId: string;
  let staffCategory: string;

  beforeAll(async () => {
    const accounts = await http().get('/api/cash-accounts').set(A()).expect(200);
    accountId = accounts.body[0].id;
    const categories = await http().get('/api/finance-categories').set(A()).expect(200);
    staffCategory = categories.body.find((c: { code: string }) => c.code === 'STAFF').id;
  });

  const expense = (body: Record<string, unknown>) =>
    http()
      .post('/api/transactions')
      .set(A())
      .send({
        type: 'EXPENSE',
        accountId,
        categoryId: staffCategory,
        amountKurus: 400_000,
        date: today,
        ...body,
      });

  it('çalışana bağlı gider varsayılan olarak sakinlerden gizlenir ve çalışan sayfasında görünür', async () => {
    const res = await expense({ employeeId: staff.cleaner, description: 'Eylül maaşı' }).expect(
      201,
    );
    expect(res.body).toMatchObject({ employeeName: 'Gül Aksoy', visibleToResidents: false });

    const detail = await http().get(`/api/employees/${staff.cleaner}`).set(A()).expect(200);
    expect(detail.body.paidKurus).toBe(400_000);
    expect(detail.body.payments).toHaveLength(1);

    const view = await http().get('/api/transparency').set(R()).expect(200);
    expect(view.body.expenses).toHaveLength(0);
  });

  it('firma ile birlikte, gelirde veya başka sitenin çalışanıyla kullanılamaz', async () => {
    const vendor = await http()
      .post('/api/vendors')
      .set(A())
      .send({ name: 'Parlak Temizlik' })
      .expect(201);
    await expense({ employeeId: staff.cleaner, vendorId: vendor.body.id }).expect(400);
    await expense({ type: 'INCOME', employeeId: staff.cleaner }).expect(400);
    const created = await expense({ vendorId: vendor.body.id }).expect(201);
    await http()
      .patch(`/api/transactions/${created.body.id}`)
      .set(A())
      .send({ employeeId: staff.cleaner })
      .expect(400);
    const other = await http()
      .post('/api/employees')
      .set(B())
      .send({ firstName: 'Başka', lastName: 'Site', role: 'OTHER' })
      .expect(201);
    await expense({ employeeId: other.body.id }).expect(404);
  });

  it('geçmişi olan çalışan silinemez, pasif yapılır ve yeni işe atanamaz', async () => {
    await http().delete(`/api/employees/${staff.guard}`).set(A()).expect(409);
    await http()
      .patch(`/api/employees/${staff.guard}`)
      .set(A())
      .send({ firstName: 'Kemal', lastName: 'Yurt', role: 'SECURITY', isActive: false })
      .expect(200);
    await shift({ date: addDays(nextWeek, 6), startTime: '08:00', endTime: '09:00' }).expect(400);
    await http()
      .post('/api/tasks')
      .set(A())
      .send({ title: 'Pasife görev', employeeId: staff.guard })
      .expect(400);
  });
});

describe('çalışan raporu', () => {
  it('vardiya, görev ve ödemeleri çalışan bazında toplar', async () => {
    const res = await http()
      .get(`/api/staff/report?from=${thisWeek}&to=${addDays(thisWeek, 6)}`)
      .set(A())
      .expect(200);
    const guard = res.body.rows.find((r: { employeeId: string }) => r.employeeId === staff.guard);
    const cleaner = res.body.rows.find(
      (r: { employeeId: string }) => r.employeeId === staff.cleaner,
    );
    expect(guard).toMatchObject({
      isActive: false,
      shiftCount: 4,
      shiftMinutes: 480 + 240 + 720 + 240,
      tasksOpen: 1,
      tasksOverdue: 1,
    });
    expect(cleaner).toMatchObject({ shiftCount: 1, shiftMinutes: 240, tasksOpen: 2 });
    expect(cleaner.paidKurus).toBe(400_000);
  });
});

import 'dotenv/config';
import { addMonths, dueDateFor, periodOfDate, periodRange, planBulkUnits } from '@apartman/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { dateOnly, todayInIstanbul } from '../src/common/dates';
import { hashPassword } from '../src/modules/auth/password';
import { DEFAULT_CHARGE_TYPES, DUES_CODE } from '../src/modules/dues/ledger.mapper';

export const SEED_PASSWORD = 'Deneme123!';
const SITE_NAME = 'Örnek Sitesi';

const people: [string, string][] = [
  ['Ayşe', 'Yılmaz'],
  ['Mehmet', 'Kaya'],
  ['Fatma', 'Demir'],
  ['Ali', 'Çelik'],
  ['Zeynep', 'Şahin'],
  ['Mustafa', 'Yıldız'],
  ['Emine', 'Yıldırım'],
  ['Hüseyin', 'Öztürk'],
  ['Hatice', 'Aydın'],
  ['İbrahim', 'Özdemir'],
  ['Elif', 'Arslan'],
  ['Hasan', 'Doğan'],
  ['Merve', 'Kılıç'],
  ['Osman', 'Aslan'],
  ['Esra', 'Çetin'],
  ['Murat', 'Kara'],
  ['Büşra', 'Koç'],
  ['Emre', 'Kurt'],
  ['Seda', 'Özkan'],
  ['Burak', 'Şimşek'],
  ['Gamze', 'Polat'],
  ['Serkan', 'Erdoğan'],
  ['Derya', 'Güneş'],
  ['Onur', 'Aksoy'],
  ['Ebru', 'Tekin'],
  ['Kemal', 'Uçar'],
  ['Sibel', 'Bulut'],
  ['Cem', 'Korkmaz'],
  ['Pınar', 'Işık'],
  ['Tolga', 'Yavuz'],
];

async function main() {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Seed yalnızca geliştirme ortamı içindir; canlı sistemde çalıştırılamaz.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
  });

  try {
    const existing = await prisma.site.findFirst({ where: { name: SITE_NAME } });
    if (existing) {
      console.log(`"${SITE_NAME}" zaten var, temel veri atlandı.`);
      await seedDues(prisma, existing.id);
      return;
    }

    const passwordHash = await hashPassword(SEED_PASSWORD);

    await prisma.user.upsert({
      where: { email: 'admin@ornek.com' },
      update: {},
      create: {
        firstName: 'Sistem',
        lastName: 'Yöneticisi',
        email: 'admin@ornek.com',
        passwordHash,
        isPlatformAdmin: true,
      },
    });

    const site = await prisma.site.create({
      data: { name: SITE_NAME, address: 'Atatürk Cad. No: 1, Kadıköy', city: 'İstanbul' },
    });

    const manager = await prisma.user.upsert({
      where: { email: 'yonetici@ornek.com' },
      update: {},
      create: {
        firstName: 'Mehmet',
        lastName: 'Demir',
        email: 'yonetici@ornek.com',
        phone: '+905320000001',
        passwordHash,
      },
    });
    await prisma.siteMembership.create({
      data: { siteId: site.id, userId: manager.id, role: 'SITE_MANAGER' },
    });

    const units: { id: string }[] = [];
    for (const blockName of ['A', 'B']) {
      const block = await prisma.block.create({ data: { siteId: site.id, name: blockName } });
      for (const planned of planBulkUnits({ startNumber: 1, endNumber: 20, unitsPerFloor: 4 })) {
        const n = Number(planned.number);
        units.push(
          await prisma.unit.create({
            data: {
              siteId: site.id,
              blockId: block.id,
              number: planned.number,
              floor: planned.floor,
              areaM2: n % 2 === 0 ? 120 : 95,
              landShare: n % 2 === 0 ? 12 : 10,
            },
            select: { id: true },
          }),
        );
      }
    }

    let personIndex = 0;
    const nextPerson = () => people[personIndex++ % people.length]!;
    const occupancyIds: string[] = [];

    for (let i = 0; i < 24; i++) {
      const [firstName, lastName] = nextPerson();
      const hasTenant = i % 4 === 3;
      const owner = await prisma.occupancy.create({
        data: {
          siteId: site.id,
          unitId: units[i]!.id,
          firstName,
          lastName,
          phone: `+9053210${String(i).padStart(5, '0')}`,
          type: 'OWNER',
          startDate: new Date('2022-01-01'),
          isResponsibleForDues: !hasTenant,
          contactConsent: i % 5 !== 0,
          contactConsentAt: i % 5 !== 0 ? new Date() : null,
        },
      });
      occupancyIds.push(owner.id);

      if (hasTenant) {
        const [tFirst, tLast] = nextPerson();
        await prisma.occupancy.create({
          data: {
            siteId: site.id,
            unitId: units[i]!.id,
            firstName: tFirst,
            lastName: tLast,
            phone: `+9053220${String(i).padStart(5, '0')}`,
            type: 'TENANT',
            startDate: new Date('2025-06-01'),
            isResponsibleForDues: true,
            contactConsent: true,
            contactConsentAt: new Date(),
          },
        });
      }
    }

    await prisma.occupancy.create({
      data: {
        siteId: site.id,
        unitId: units[0]!.id,
        firstName: 'Eski',
        lastName: 'Kiracı',
        type: 'TENANT',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2024-12-31'),
      },
    });

    for (const occupancyId of occupancyIds.slice(0, 3)) {
      const occupancy = await prisma.occupancy.findUniqueOrThrow({ where: { id: occupancyId } });
      const user = await prisma.user.create({
        data: {
          firstName: occupancy.firstName,
          lastName: occupancy.lastName,
          phone: occupancy.phone,
          passwordHash,
        },
      });
      await prisma.occupancy.update({ where: { id: occupancyId }, data: { userId: user.id } });
      await prisma.siteMembership.create({
        data: { siteId: site.id, userId: user.id, role: 'RESIDENT' },
      });
    }

    await seedDues(prisma, site.id);
    console.log('Seed tamamlandı.');
    console.log(`  Sistem yöneticisi: admin@ornek.com / ${SEED_PASSWORD}`);
    console.log(`  Site yöneticisi:     yonetici@ornek.com / ${SEED_PASSWORD}`);
    console.log(`  Sakin (A-1):         0532 100 00 00 / ${SEED_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedDues(client: PrismaClient, siteId: string) {
  await client.$transaction((tx) => seedDuesTx(tx as unknown as PrismaClient, siteId), {
    timeout: 120_000,
    maxWait: 10_000,
  });
}

async function seedDuesTx(prisma: PrismaClient, siteId: string) {
  if (await prisma.duesPlan.findFirst({ where: { siteId } })) {
    console.log('Aidat verisi zaten var, atlandı.');
    return;
  }
  const today = todayInIstanbul();
  const current = periodOfDate(today);
  const start = addMonths(current, -12);
  const dueDay = 10;

  await prisma.chargeType.createMany({
    data: DEFAULT_CHARGE_TYPES.map((t) => ({ ...t, siteId })),
    skipDuplicates: true,
  });
  const duesType = await prisma.chargeType.findUniqueOrThrow({
    where: { siteId_code: { siteId, code: DUES_CODE } },
  });
  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
  await prisma.site.update({
    where: { id: siteId },
    data: { settings: { ...(site.settings as object), duesDueDay: dueDay } },
  });
  const plan = await prisma.duesPlan.create({
    data: { siteId, method: 'EQUAL', amountKurus: 150_000, validFrom: start },
  });

  const units = (
    await prisma.unit.findMany({
      where: { siteId },
      include: { block: { select: { name: true } } },
    })
  ).sort(
    (a, b) =>
      a.block.name.localeCompare(b.block.name, 'tr', { numeric: true }) ||
      a.number.localeCompare(b.number, 'tr', { numeric: true }),
  );
  const periods = periodRange(start, current);

  await prisma.charge.createMany({
    data: units.flatMap((u) =>
      periods.map((period) => ({
        siteId,
        unitId: u.id,
        chargeTypeId: duesType.id,
        duesPlanId: plan.id,
        period,
        amountKurus: plan.amountKurus,
        issueDate: dateOnly(`${period}-01`),
        dueDate: dateOnly(dueDateFor(period, dueDay)),
        accrualKey: `${u.id}:${period}`,
      })),
    ),
  });
  const charges = await prisma.charge.findMany({ where: { siteId, duesPlanId: plan.id } });
  const chargeOf = new Map(charges.map((c) => [`${c.unitId}:${c.period}`, c]));

  let payments = 0;
  for (const [i, u] of units.entries()) {
    const label = `${u.block.name}-${u.number}`;
    for (const [p, period] of periods.entries()) {
      const isCurrent = period === current;
      let amount = 150_000;
      if (label === 'A-5' && (p === 0 || p === 2)) continue;
      if (i % 7 === 3 && p >= periods.length - 3) continue;
      if (i % 11 === 5 && p >= periods.length - 2) amount = 100_000;
      if (isCurrent && i % 5 >= 3) continue;

      const paidAt = `${period}-0${1 + (i % 9)}`;
      if (paidAt > today) continue;
      const charge = chargeOf.get(`${u.id}:${period}`)!;
      await prisma.payment.create({
        data: {
          siteId,
          unitId: u.id,
          amountKurus: amount,
          method: i % 2 === 0 ? 'BANK_TRANSFER' : 'CASH',
          paidAt: dateOnly(paidAt),
          allocations: { create: { chargeId: charge.id, amountKurus: amount } },
        },
      });
      payments++;
    }
  }
  console.log(
    `Aidat verisi eklendi: ${charges.length} borç, ${payments} ödeme (${periods[0]} – ${current}).`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

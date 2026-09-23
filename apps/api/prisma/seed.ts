import 'dotenv/config';
import {
  addMonths,
  computeUnitAmounts,
  dueDateFor,
  periodOfDate,
  periodRange,
  type DistributionMethod,
} from '@apartman/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { dateOnly, todayInIstanbul } from '../src/common/dates';
import { hashPassword } from '../src/modules/auth/password';
import { DEFAULT_CHARGE_TYPES, DUES_CODE } from '../src/modules/dues/ledger.mapper';

export const SEED_PASSWORD = 'Deneme123!';
const DUE_DAY = 10;

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

interface UnitSeed {
  number: string;
  floor: number;
  areaM2: number;
  landShare: number;
  occupant?: { firstName: string; lastName: string; phone: string; type: 'OWNER' | 'TENANT' };
  paidPeriods: number[];
}

async function createPlace(
  tx: Tx,
  options: {
    name: string;
    kind: 'APARTMENT' | 'SITE';
    address: string;
    blocks: { name: string; units: UnitSeed[] }[];
    plan: { method: DistributionMethod; amountKurus: number };
    periods: string[];
    today: string;
  },
) {
  const site = await tx.site.create({
    data: {
      name: options.name,
      kind: options.kind,
      address: options.address,
      city: 'İstanbul',
      settings: { duesDueDay: DUE_DAY },
    },
  });
  await tx.chargeType.createMany({
    data: DEFAULT_CHARGE_TYPES.map((t) => ({ ...t, siteId: site.id })),
  });
  const duesType = await tx.chargeType.findUniqueOrThrow({
    where: { siteId_code: { siteId: site.id, code: DUES_CODE } },
  });
  const plan = await tx.duesPlan.create({
    data: { siteId: site.id, ...options.plan, validFrom: options.periods[0]! },
  });

  const units: { id: string; seed: UnitSeed }[] = [];
  for (const blockSeed of options.blocks) {
    const block = await tx.block.create({ data: { siteId: site.id, name: blockSeed.name } });
    for (const seed of blockSeed.units) {
      const unit = await tx.unit.create({
        data: {
          siteId: site.id,
          blockId: block.id,
          number: seed.number,
          floor: seed.floor,
          areaM2: seed.areaM2,
          landShare: seed.landShare,
        },
      });
      units.push({ id: unit.id, seed });
      if (seed.occupant) {
        await tx.occupancy.create({
          data: {
            siteId: site.id,
            unitId: unit.id,
            ...seed.occupant,
            startDate: dateOnly('2023-01-01'),
            contactConsent: true,
            contactConsentAt: new Date(),
          },
        });
      }
    }
  }

  const amounts = computeUnitAmounts(
    options.plan,
    units.map((u) => ({
      id: u.id,
      label: u.seed.number,
      areaM2: u.seed.areaM2,
      landShare: u.seed.landShare,
    })),
  );

  for (const [i, unit] of units.entries()) {
    for (const [p, period] of options.periods.entries()) {
      const charge = await tx.charge.create({
        data: {
          siteId: site.id,
          unitId: unit.id,
          chargeTypeId: duesType.id,
          duesPlanId: plan.id,
          period,
          amountKurus: amounts[i]!,
          issueDate: dateOnly(`${period}-01`),
          dueDate: dateOnly(dueDateFor(period, DUE_DAY)),
          accrualKey: `${unit.id}:${period}`,
        },
      });
      const paidAt = `${period}-05`;
      if (!unit.seed.paidPeriods.includes(p) || paidAt > options.today) continue;
      await tx.payment.create({
        data: {
          siteId: site.id,
          unitId: unit.id,
          amountKurus: amounts[i]!,
          method: i % 2 === 0 ? 'BANK_TRANSFER' : 'CASH',
          paidAt: dateOnly(paidAt),
          allocations: { create: { chargeId: charge.id, amountKurus: amounts[i]! } },
        },
      });
    }
  }
  return site;
}

const person = (
  firstName: string,
  lastName: string,
  phone: string,
  type: 'OWNER' | 'TENANT' = 'OWNER',
) => ({ firstName, lastName, phone, type });

async function main() {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Seed yalnızca geliştirme ortamı içindir; canlı sistemde çalıştırılamaz.');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
  });

  try {
    if ((await prisma.site.count()) > 0) {
      console.log('Veritabanında veri var, seed atlandı.');
      return;
    }
    const passwordHash = await hashPassword(SEED_PASSWORD);
    const today = todayInIstanbul();
    const current = periodOfDate(today);
    const periods = periodRange(addMonths(current, -2), current);
    const all = [0, 1, 2];

    await prisma.$transaction(
      async (tx) => {
        await tx.user.create({
          data: {
            firstName: 'Sistem',
            lastName: 'Yöneticisi',
            email: 'admin@ornek.com',
            passwordHash,
            isPlatformAdmin: true,
          },
        });
        const manager = await tx.user.create({
          data: {
            firstName: 'Mehmet',
            lastName: 'Demir',
            email: 'yonetici@ornek.com',
            phone: '+905320000001',
            passwordHash,
          },
        });

        const site = await createPlace(tx, {
          name: 'Örnek Sitesi',
          kind: 'SITE',
          address: 'Bağdat Cad. No: 10, Kadıköy',
          plan: { method: 'EQUAL', amountKurus: 175_000 },
          periods,
          today,
          blocks: [
            {
              name: 'A',
              units: [
                {
                  number: '1',
                  floor: 1,
                  areaM2: 95,
                  landShare: 10,
                  paidPeriods: all,
                  occupant: person('Mehmet', 'Kaya', '+905321000011'),
                },
                {
                  number: '2',
                  floor: 1,
                  areaM2: 120,
                  landShare: 12,
                  paidPeriods: [0, 1],
                  occupant: person('Elif', 'Arslan', '+905321000012'),
                },
              ],
            },
            {
              name: 'B',
              units: [
                {
                  number: '1',
                  floor: 1,
                  areaM2: 95,
                  landShare: 10,
                  paidPeriods: [0, 1],
                  occupant: person('Murat', 'Kara', '+905321000013', 'TENANT'),
                },
                { number: '2', floor: 1, areaM2: 120, landShare: 12, paidPeriods: all },
              ],
            },
          ],
        });

        const apartment = await createPlace(tx, {
          name: 'Örnek Apartmanı',
          kind: 'APARTMENT',
          address: 'Moda Cad. No: 25, Kadıköy',
          plan: { method: 'EQUAL', amountKurus: 150_000 },
          periods,
          today,
          blocks: [
            {
              name: 'Bina',
              units: [
                {
                  number: '1',
                  floor: 1,
                  areaM2: 90,
                  landShare: 10,
                  paidPeriods: all,
                  occupant: person('Ayşe', 'Yılmaz', '+905321000000'),
                },
                {
                  number: '2',
                  floor: 1,
                  areaM2: 90,
                  landShare: 10,
                  paidPeriods: [0, 1],
                  occupant: person('Ali', 'Çelik', '+905321000002'),
                },
                {
                  number: '3',
                  floor: 2,
                  areaM2: 110,
                  landShare: 12,
                  paidPeriods: [1],
                  occupant: person('Fatma', 'Demir', '+905321000003'),
                },
                {
                  number: '4',
                  floor: 2,
                  areaM2: 110,
                  landShare: 12,
                  paidPeriods: all,
                  occupant: person('Zeynep', 'Şahin', '+905321000004', 'TENANT'),
                },
                { number: '5', floor: 3, areaM2: 130, landShare: 14, paidPeriods: [0, 1] },
              ],
            },
          ],
        });

        await tx.siteMembership.create({
          data: { siteId: site.id, userId: manager.id, role: 'SITE_MANAGER' },
        });
        await tx.siteMembership.create({
          data: { siteId: apartment.id, userId: manager.id, role: 'SITE_MANAGER' },
        });

        const resident = await tx.user.create({
          data: { firstName: 'Ayşe', lastName: 'Yılmaz', phone: '+905321000000', passwordHash },
        });
        await tx.occupancy.updateMany({
          where: { siteId: apartment.id, phone: '+905321000000' },
          data: { userId: resident.id },
        });
        await tx.siteMembership.create({
          data: { siteId: apartment.id, userId: resident.id, role: 'RESIDENT' },
        });
      },
      { timeout: 60_000 },
    );

    console.log('Seed tamamlandı.');
    console.log(`  Sistem yöneticisi: admin@ornek.com / ${SEED_PASSWORD}`);
    console.log(`  Yönetici:          yonetici@ornek.com / ${SEED_PASSWORD}`);
    console.log(`  Sakin (Daire 1):   0532 100 00 00 / ${SEED_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

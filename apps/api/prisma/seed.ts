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
import { ensureFinanceDefaults } from '../src/modules/finance/finance.ledger';

export const SEED_PASSWORD = 'Deneme123!';
const DUE_DAY = 10;

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

interface FinanceSeed {
  openingKurus: { cash: number; bank: number };
  monthly: { code: string; amountKurus: number; description: string; vendor?: string }[];
  work?: {
    title: string;
    description: string;
    vendor: string;
    agreedKurus: number;
    paidKurus: number;
  };
}

interface UnitSeed {
  number: string;
  floor: number;
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
    finance: FinanceSeed;
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
  await ensureFinanceDefaults(tx, site.id);
  const accounts = Object.fromEntries(
    (await tx.cashAccount.findMany({ where: { siteId: site.id } })).map((a) => [a.code, a.id]),
  );
  await tx.cashAccount.update({
    where: { id: accounts['CASH'] },
    data: { openingBalanceKurus: options.finance.openingKurus.cash },
  });
  await tx.cashAccount.update({
    where: { id: accounts['BANK'] },
    data: { openingBalanceKurus: options.finance.openingKurus.bank },
  });
  const categories = Object.fromEntries(
    (await tx.financeCategory.findMany({ where: { siteId: site.id } })).map((c) => [c.code, c.id]),
  );
  let receiptNo = 0;

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
      areaM2: null,
      landShare: null,
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
      receiptNo += 1;
      const method = i % 2 === 0 ? 'BANK_TRANSFER' : 'CASH';
      const payment = await tx.payment.create({
        data: {
          siteId: site.id,
          unitId: unit.id,
          receiptNo,
          amountKurus: amounts[i]!,
          method,
          paidAt: dateOnly(paidAt),
          allocations: { create: { chargeId: charge.id, amountKurus: amounts[i]! } },
        },
      });
      await tx.transaction.create({
        data: {
          siteId: site.id,
          paymentId: payment.id,
          type: 'INCOME',
          amountKurus: amounts[i]!,
          date: dateOnly(paidAt),
          accountId: accounts[method === 'CASH' ? 'CASH' : 'BANK']!,
          categoryId: categories['DUES_INCOME']!,
          visibleToResidents: false,
        },
      });
    }
  }
  if (receiptNo > 0) {
    await tx.siteCounter.create({ data: { siteId: site.id, name: 'receipt', value: receiptNo } });
  }

  const { finance } = options;
  const vendorNames = [
    ...new Set(
      [...finance.monthly.map((m) => m.vendor), finance.work?.vendor].filter(
        (v): v is string => !!v,
      ),
    ),
  ];
  const vendors: Record<string, string> = {};
  for (const name of vendorNames) {
    vendors[name] = (await tx.vendor.create({ data: { siteId: site.id, name } })).id;
  }

  for (const period of options.periods) {
    const date = `${period}-15`;
    if (date > options.today) continue;
    for (const item of finance.monthly) {
      await tx.transaction.create({
        data: {
          siteId: site.id,
          type: 'EXPENSE',
          amountKurus: item.amountKurus,
          date: dateOnly(date),
          accountId: accounts['BANK']!,
          categoryId: categories[item.code]!,
          vendorId: item.vendor ? vendors[item.vendor]! : null,
          description: item.description,
        },
      });
    }
  }

  if (finance.work) {
    const start = `${options.periods[1]}-03`;
    const work = await tx.work.create({
      data: {
        siteId: site.id,
        title: finance.work.title,
        description: finance.work.description,
        vendorId: vendors[finance.work.vendor]!,
        agreedKurus: finance.work.agreedKurus,
        startDate: dateOnly(start),
        status: 'IN_PROGRESS',
      },
    });
    await tx.transaction.create({
      data: {
        siteId: site.id,
        type: 'EXPENSE',
        amountKurus: finance.work.paidKurus,
        date: dateOnly(start),
        accountId: accounts['BANK']!,
        categoryId: categories['RENOVATION']!,
        vendorId: vendors[finance.work.vendor]!,
        workId: work.id,
        description: 'Peşinat',
      },
    });
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
          finance: {
            openingKurus: { cash: 500_000, bank: 4_000_000 },
            monthly: [
              { code: 'ELECTRICITY', amountKurus: 185_000, description: 'Ortak alan elektriği' },
              {
                code: 'CLEANING',
                amountKurus: 250_000,
                description: 'Aylık temizlik',
                vendor: 'Parlak Temizlik',
              },
            ],
          },
          periods,
          today,
          blocks: [
            {
              name: 'A',
              units: [
                {
                  number: '1',
                  floor: 1,
                  paidPeriods: all,
                  occupant: person('Mehmet', 'Kaya', '+905321000011'),
                },
                {
                  number: '2',
                  floor: 1,
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
                  paidPeriods: [0, 1],
                  occupant: person('Murat', 'Kara', '+905321000013', 'TENANT'),
                },
                { number: '2', floor: 1, paidPeriods: all },
              ],
            },
          ],
        });

        const apartment = await createPlace(tx, {
          name: 'Örnek Apartmanı',
          kind: 'APARTMENT',
          address: 'Moda Cad. No: 25, Kadıköy',
          plan: { method: 'EQUAL', amountKurus: 150_000 },
          finance: {
            openingKurus: { cash: 250_000, bank: 2_500_000 },
            monthly: [
              {
                code: 'ELECTRICITY',
                amountKurus: 95_000,
                description: 'Merdiven ve asansör elektriği',
              },
              {
                code: 'ELEVATOR',
                amountKurus: 120_000,
                description: 'Aylık asansör bakımı',
                vendor: 'Yıldız Asansör',
              },
            ],
            work: {
              title: 'Dış cephe boyası',
              description: 'Bina dış cephesinin iskele kurularak boyanması',
              vendor: 'Renk Boya Ltd.',
              agreedKurus: 3_000_000,
              paidKurus: 1_500_000,
            },
          },
          periods,
          today,
          blocks: [
            {
              name: 'Bina',
              units: [
                {
                  number: '1',
                  floor: 1,
                  paidPeriods: all,
                  occupant: person('Ayşe', 'Yılmaz', '+905321000000'),
                },
                {
                  number: '2',
                  floor: 1,
                  paidPeriods: [0, 1],
                  occupant: person('Ali', 'Çelik', '+905321000002'),
                },
                {
                  number: '3',
                  floor: 2,
                  paidPeriods: [1],
                  occupant: person('Fatma', 'Demir', '+905321000003'),
                },
                {
                  number: '4',
                  floor: 2,
                  paidPeriods: all,
                  occupant: person('Zeynep', 'Şahin', '+905321000004', 'TENANT'),
                },
                { number: '5', floor: 3, paidPeriods: [0, 1] },
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
    console.log(`  Sakin (Daire 1):   05321000000 / ${SEED_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

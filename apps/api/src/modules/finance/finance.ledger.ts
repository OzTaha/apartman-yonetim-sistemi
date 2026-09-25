import { BadRequestException } from '@nestjs/common';
import {
  DUES_INCOME_CODE,
  isDateLocked,
  periodLabel,
  periodOfDate,
  type CashAccountKind,
  type FinanceKind,
  type FinanceMonthDto,
  type PaymentMethod,
} from '@apartman/shared';
import { dateOnly } from '../../common/dates';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export const DEFAULT_ACCOUNTS: { code: string; name: string; kind: CashAccountKind }[] = [
  { code: 'CASH', name: 'Nakit kasa', kind: 'CASH' },
  { code: 'BANK', name: 'Banka hesabı', kind: 'BANK' },
];

export const DEFAULT_CATEGORIES: { code: string; kind: FinanceKind; name: string }[] = [
  { code: DUES_INCOME_CODE, kind: 'INCOME', name: 'Aidat ve borç tahsilatı' },
  { code: 'RENT_INCOME', kind: 'INCOME', name: 'Kira geliri' },
  { code: 'OTHER_INCOME', kind: 'INCOME', name: 'Diğer gelir' },
  { code: 'ELECTRICITY', kind: 'EXPENSE', name: 'Elektrik' },
  { code: 'WATER', kind: 'EXPENSE', name: 'Su' },
  { code: 'HEATING', kind: 'EXPENSE', name: 'Doğalgaz ve yakıt' },
  { code: 'CLEANING', kind: 'EXPENSE', name: 'Temizlik' },
  { code: 'ELEVATOR', kind: 'EXPENSE', name: 'Asansör bakımı' },
  { code: 'REPAIR', kind: 'EXPENSE', name: 'Bakım ve onarım' },
  { code: 'RENOVATION', kind: 'EXPENSE', name: 'Boya ve tadilat' },
  { code: 'STAFF', kind: 'EXPENSE', name: 'Personel' },
  { code: 'INSURANCE', kind: 'EXPENSE', name: 'Sigorta' },
  { code: 'OTHER_EXPENSE', kind: 'EXPENSE', name: 'Diğer gider' },
];

export async function ensureFinanceDefaults(
  db: Pick<Db, 'cashAccount' | 'financeCategory'>,
  siteId: string,
): Promise<void> {
  await db.cashAccount.createMany({
    data: DEFAULT_ACCOUNTS.map((a) => ({ ...a, siteId })),
    skipDuplicates: true,
  });
  await db.financeCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, siteId })),
    skipDuplicates: true,
  });
}

export async function defaultAccountFor(
  db: Db,
  siteId: string,
  method: PaymentMethod,
): Promise<string> {
  await ensureFinanceDefaults(db, siteId);
  const code = method === 'CASH' ? 'CASH' : 'BANK';
  const preferred = await db.cashAccount.findFirst({
    where: { siteId, code, isActive: true },
    select: { id: true },
  });
  const fallback =
    preferred ??
    (await db.cashAccount.findFirst({
      where: { siteId, isActive: true, kind: method === 'CASH' ? 'CASH' : 'BANK' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })) ??
    (await db.cashAccount.findFirst({
      where: { siteId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }));
  if (!fallback) throw new BadRequestException('Tahsilatın yazılacağı aktif bir kasa yok');
  return fallback.id;
}

export async function duesIncomeCategoryId(db: Db, siteId: string): Promise<string> {
  await ensureFinanceDefaults(db, siteId);
  const category = await db.financeCategory.findUniqueOrThrow({
    where: { siteId_code: { siteId, code: DUES_INCOME_CODE } },
    select: { id: true },
  });
  return category.id;
}

export async function lockedThrough(db: Db, siteId: string): Promise<string | null> {
  const last = await db.monthClosing.findFirst({
    where: { siteId },
    orderBy: { period: 'desc' },
    select: { period: true },
  });
  return last?.period ?? null;
}

export async function assertDateOpen(db: Db, siteId: string, date: string): Promise<void> {
  const locked = await lockedThrough(db, siteId);
  if (isDateLocked(date, locked)) {
    throw new BadRequestException(
      `${periodLabel(periodOfDate(date))} kapatıldığı için bu tarihteki kayıtlar değiştirilemez`,
    );
  }
}

export async function nextCounter(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  siteId: string,
  name: string,
): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO site_counters ("siteId", name, value) VALUES (${siteId}::uuid, ${name}, 1)
    ON CONFLICT ("siteId", name) DO UPDATE SET value = site_counters.value + 1
    RETURNING value`;
  return rows[0]!.value;
}

export async function accountBalances(
  db: Db,
  siteId: string,
  until?: string,
): Promise<Map<string, number>> {
  const date = until ? { date: { lte: dateOnly(until) } } : {};
  const [accounts, outgoing, incoming] = await Promise.all([
    db.cashAccount.findMany({ where: { siteId }, select: { id: true, openingBalanceKurus: true } }),
    db.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { siteId, cancelledAt: null, ...date },
      _sum: { amountKurus: true },
    }),
    db.transaction.groupBy({
      by: ['toAccountId'],
      where: { siteId, cancelledAt: null, type: 'TRANSFER', ...date },
      _sum: { amountKurus: true },
    }),
  ]);
  const balances = new Map(accounts.map((a) => [a.id, a.openingBalanceKurus]));
  for (const row of outgoing) {
    const amount = row._sum.amountKurus ?? 0;
    const sign = row.type === 'INCOME' ? 1 : -1;
    balances.set(row.accountId, (balances.get(row.accountId) ?? 0) + sign * amount);
  }
  for (const row of incoming) {
    if (!row.toAccountId) continue;
    balances.set(
      row.toAccountId,
      (balances.get(row.toAccountId) ?? 0) + (row._sum.amountKurus ?? 0),
    );
  }
  return balances;
}

export async function monthlyTotals(
  db: Db,
  siteId: string,
  from: string,
  to: string,
): Promise<Map<string, FinanceMonthDto>> {
  const rows = await db.$queryRaw<{ period: string; type: string; total: bigint }[]>`
    SELECT to_char(date, 'YYYY-MM') AS period, type::text AS type, sum("amountKurus") AS total
    FROM transactions
    WHERE "siteId" = ${siteId}::uuid AND "cancelledAt" IS NULL AND type <> 'TRANSFER'
      AND date BETWEEN ${dateOnly(from)} AND ${dateOnly(to)}
    GROUP BY 1, 2`;
  const months = new Map<string, FinanceMonthDto>();
  for (const row of rows) {
    const month = months.get(row.period) ?? {
      period: row.period,
      incomeKurus: 0,
      expenseKurus: 0,
    };
    if (row.type === 'INCOME') month.incomeKurus += Number(row.total);
    else month.expenseKurus += Number(row.total);
    months.set(row.period, month);
  }
  return months;
}

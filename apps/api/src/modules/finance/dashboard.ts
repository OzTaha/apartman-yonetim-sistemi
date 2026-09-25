import { Controller, Get, Injectable } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  addMonths,
  chargeState,
  periodRange,
  type DashboardDto,
  type UpcomingChargeDto,
} from '@apartman/shared';
import { dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AccountService } from '../dues/account';
import { chargeLabel, DUES_CODE } from '../dues/ledger.mapper';
import { currentPeriod } from '../dues/site-settings';
import { accountBalances, lockedThrough, monthlyTotals } from './finance.ledger';
import { toTransactionDto, transactionInclude } from './finance.mapper';
import { lastDayOf } from './reports';

const UPCOMING_DAYS = 15;

function addDays(date: string, days: number): string {
  const d = dateOnly(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly accounts: AccountService,
  ) {}

  async get(): Promise<DashboardDto> {
    const siteId = this.tenant.siteId;
    const today = todayInIstanbul();
    const period = currentPeriod();
    const firstPeriod = addMonths(period, -5);

    const [
      unitCount,
      duesCharges,
      openCharges,
      collected,
      balances,
      accountIds,
      months,
      recent,
      locked,
      debts,
    ] = await Promise.all([
      this.tenant.db.unit.count({ where: { archivedAt: null } }),
      this.tenant.db.charge.findMany({
        where: {
          cancelledAt: null,
          period,
          chargeType: { code: DUES_CODE },
          unit: { archivedAt: null },
        },
        select: { amountKurus: true, allocations: { select: { amountKurus: true } } },
      }),
      this.tenant.db.charge.findMany({
        where: {
          cancelledAt: null,
          dueDate: { gte: dateOnly(today), lte: dateOnly(addDays(today, UPCOMING_DAYS)) },
        },
        include: {
          unit: { select: { number: true, block: { select: { name: true } } } },
          chargeType: { select: { name: true } },
          allocations: { select: { amountKurus: true } },
        },
        orderBy: [{ dueDate: 'asc' }],
      }),
      this.tenant.db.payment.aggregate({
        where: {
          cancelledAt: null,
          paidAt: { gte: dateOnly(`${period}-01`), lte: dateOnly(lastDayOf(period)) },
        },
        _sum: { amountKurus: true },
      }),
      accountBalances(this.prisma, siteId),
      this.tenant.db.cashAccount.findMany({ select: { id: true } }),
      monthlyTotals(this.prisma, siteId, `${firstPeriod}-01`, lastDayOf(period)),
      this.tenant.db.transaction.findMany({
        where: { cancelledAt: null },
        include: transactionInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 6,
      }),
      lockedThrough(this.prisma, siteId),
      this.accounts.debtReport(),
    ]);

    const upcomingCharges: UpcomingChargeDto[] = openCharges
      .map((c) => {
        const paid = c.allocations.reduce((sum, a) => sum + a.amountKurus, 0);
        const state = chargeState(c.amountKurus, paid, toDateString(c.dueDate), today);
        return {
          chargeId: c.id,
          unitId: c.unitId,
          blockName: c.unit.block.name,
          unitNumber: c.unit.number,
          label: chargeLabel(c),
          dueDate: toDateString(c.dueDate),
          remainingKurus: state.remainingKurus,
        };
      })
      .filter((c) => c.remainingKurus > 0)
      .slice(0, 8);

    return {
      period,
      unitCount,
      duesUnitCount: duesCharges.length,
      paidUnitCount: duesCharges.filter(
        (c) => c.allocations.reduce((sum, a) => sum + a.amountKurus, 0) >= c.amountKurus,
      ).length,
      debtorUnitCount: debts.filter((d) => d.overdueKurus > 0).length,
      collectedKurus: collected._sum.amountKurus ?? 0,
      openDebtKurus: debts.reduce((sum, d) => sum + d.debtKurus, 0),
      overdueDebtKurus: debts.reduce((sum, d) => sum + d.overdueKurus, 0),
      cashBalanceKurus: accountIds.reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0),
      months: periodRange(firstPeriod, period).map(
        (p) => months.get(p) ?? { period: p, incomeKurus: 0, expenseKurus: 0 },
      ),
      recentTransactions: recent.map((t) => toTransactionDto(t, locked)),
      upcomingCharges,
      topDebtors: debts
        .filter((d) => d.overdueKurus > 0)
        .sort((a, b) => b.overdueKurus - a.overdueKurus)
        .slice(0, 5),
    };
  }
}

@ApiTags('Yönetim paneli')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(): Promise<DashboardDto> {
    return this.dashboard.get();
  }
}

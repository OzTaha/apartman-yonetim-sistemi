import type { DebtReportRowDto } from './dues';
import type { FinanceMonthDto, TransactionDto } from './finance';
import type { Kurus } from './money';

export interface UpcomingChargeDto {
  chargeId: string;
  unitId: string;
  blockName: string;
  unitNumber: string;
  label: string;
  dueDate: string;
  remainingKurus: Kurus;
}

export interface DashboardDto {
  period: string;
  unitCount: number;
  duesUnitCount: number;
  paidUnitCount: number;
  debtorUnitCount: number;
  collectedKurus: Kurus;
  openDebtKurus: Kurus;
  overdueDebtKurus: Kurus;
  cashBalanceKurus: Kurus;
  months: FinanceMonthDto[];
  recentTransactions: TransactionDto[];
  upcomingCharges: UpcomingChargeDto[];
  topDebtors: DebtReportRowDto[];
}

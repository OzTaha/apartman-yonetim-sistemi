import { z } from 'zod';
import { amountKurusSchema, distributionMethodSchema, periodSchema } from './dues';
import { addMonths, type DistributionMethod } from './ledger';
import type { Kurus } from './money';
import { idSchema, optionalText } from './schemas';

export const BUDGET_MONTHS = 12;
export const BUDGET_MAX_LINES = 100;

export function budgetEndPeriod(startPeriod: string): string {
  return addMonths(startPeriod, BUDGET_MONTHS - 1);
}

export function roundUpToLira(kurus: Kurus): Kurus {
  return Math.ceil(kurus / 100) * 100;
}

export function budgetAdvanceAmount(
  totalKurus: Kurus,
  method: DistributionMethod,
  unitCount: number,
): Kurus {
  if (totalKurus <= 0 || unitCount <= 0) return 0;
  const monthly = totalKurus / BUDGET_MONTHS;
  return roundUpToLira(Math.ceil(method === 'EQUAL' ? monthly / unitCount : monthly));
}

export function elapsedBudgetMonths(startPeriod: string, currentPeriod: string): number {
  if (currentPeriod < startPeriod) return 0;
  const [sy, sm] = startPeriod.split('-').map(Number) as [number, number];
  const [cy, cm] = currentPeriod.split('-').map(Number) as [number, number];
  return Math.min(BUDGET_MONTHS, (cy - sy) * 12 + (cm - sm) + 1);
}

export const budgetLineSchema = z.object({
  categoryId: idSchema,
  amountKurus: amountKurusSchema,
  note: optionalText(200),
});
export type BudgetLineInput = z.input<typeof budgetLineSchema>;

export const budgetCreateSchema = z.object({
  startPeriod: periodSchema,
  method: distributionMethodSchema,
  copyFromId: idSchema.optional(),
});
export type BudgetCreateInput = z.input<typeof budgetCreateSchema>;

export const budgetUpdateSchema = z.object({
  method: distributionMethodSchema,
  lines: z
    .array(budgetLineSchema)
    .max(BUDGET_MAX_LINES, `En fazla ${BUDGET_MAX_LINES} kalem eklenebilir`)
    .refine((lines) => new Set(lines.map((l) => l.categoryId)).size === lines.length, {
      message: 'Aynı gider kalemi iki kez eklenemez',
    }),
});
export type BudgetUpdateInput = z.input<typeof budgetUpdateSchema>;

export interface BudgetDto {
  id: string;
  startPeriod: string;
  endPeriod: string;
  method: DistributionMethod;
  totalKurus: Kurus;
  advanceKurus: Kurus;
  lineCount: number;
  isCurrent: boolean;
  applied: boolean;
  appliedAt: string | null;
  createdAt: string;
}

export interface BudgetLineDto {
  categoryId: string;
  categoryName: string;
  amountKurus: Kurus;
  note: string | null;
}

export interface BudgetUnitDto {
  unitId: string;
  blockName: string;
  unitNumber: string;
  areaM2: number | null;
  landShare: number | null;
  monthlyKurus: Kurus;
}

export interface BudgetComparisonRowDto {
  categoryId: string | null;
  categoryName: string;
  plannedKurus: Kurus;
  actualKurus: Kurus;
}

export interface BudgetComparisonDto {
  elapsedMonths: number;
  plannedKurus: Kurus;
  actualKurus: Kurus;
  duesAccruedKurus: Kurus;
  duesCollectedKurus: Kurus;
  rows: BudgetComparisonRowDto[];
}

export interface BudgetDetailDto extends BudgetDto {
  lines: BudgetLineDto[];
  units: BudgetUnitDto[];
  distributionError: string | null;
  appliedPlan: { validFrom: string; amountKurus: Kurus; method: DistributionMethod } | null;
  applyFrom: string;
  comparison: BudgetComparisonDto;
}

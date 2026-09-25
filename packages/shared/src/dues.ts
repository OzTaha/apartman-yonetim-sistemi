import { z } from 'zod';
import type { ChargeStatus, DistributionMethod, StatementRow } from './ledger';
import { PERIOD_PATTERN } from './ledger';
import { parseTlToKurus, type Kurus } from './money';
import { dateSchema, idSchema, optionalText } from './schemas';

export const periodSchema = z.string().regex(PERIOD_PATTERN, 'Dönem YYYY-AA biçiminde olmalıdır');

export const amountKurusSchema = z
  .number({ error: 'Tutar girin' })
  .int('Tutar kuruş cinsinden tam sayı olmalıdır')
  .positive('Tutar sıfırdan büyük olmalıdır')
  .max(100_000_000_000, 'Tutar çok büyük');

export const tlAmountSchema = z.string().transform((value, ctx) => {
  try {
    const kurus = parseTlToKurus(value);
    if (kurus <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Tutar sıfırdan büyük olmalıdır' });
      return z.NEVER;
    }
    return kurus;
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Geçerli bir tutar girin (ör. 1.500,00)' });
    return z.NEVER;
  }
});

export const distributionMethodSchema = z.enum(['EQUAL', 'AREA', 'LAND_SHARE']);

export const PaymentMethod = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  ONLINE: 'ONLINE',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
export const paymentMethodSchema = z.enum(['CASH', 'BANK_TRANSFER', 'ONLINE']);
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: 'Elden',
  BANK_TRANSFER: 'Havale / EFT',
  ONLINE: 'Online',
};

const reasonSchema = z.string().trim().min(3, 'İptal nedenini yazın').max(300);

export const chargeTypeSchema = z.object({
  name: z.string().trim().min(2, 'En az 2 karakter olmalıdır').max(60),
});
export const chargeTypeUpdateSchema = chargeTypeSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

export const duesPlanSchema = z.object({
  method: distributionMethodSchema,
  amountKurus: amountKurusSchema,
  validFrom: periodSchema,
});
export type DuesPlanInput = z.input<typeof duesPlanSchema>;

export const duesSettingsSchema = z.object({
  dueDay: z.number({ error: 'Gün girin' }).int().min(1, 'En az 1').max(28, 'En fazla 28'),
});

export const accrueSchema = z.object({ period: periodSchema });

export const chargeCreateSchema = z
  .object({
    chargeTypeId: idSchema,
    scope: z.enum(['ALL', 'SELECTED']),
    unitIds: z.array(idSchema).max(2000).default([]),
    amountMode: z.enum(['PER_UNIT', 'DISTRIBUTE']),
    method: distributionMethodSchema.default('EQUAL'),
    amountKurus: amountKurusSchema,
    period: periodSchema.optional(),
    issueDate: dateSchema,
    dueDate: dateSchema,
    description: optionalText(200),
  })
  .refine((v) => v.scope === 'ALL' || v.unitIds.length > 0, {
    message: 'En az bir daire seçin',
    path: ['unitIds'],
  })
  .refine((v) => v.dueDate >= v.issueDate, {
    message: 'Son ödeme tarihi borç tarihinden önce olamaz',
    path: ['dueDate'],
  });
export type ChargeCreateInput = z.input<typeof chargeCreateSchema>;

export const chargeUpdateSchema = z.object({
  amountKurus: amountKurusSchema.optional(),
  dueDate: dateSchema.optional(),
  description: optionalText(200),
});

export const cancelSchema = z.object({ reason: reasonSchema });

export const paymentCreateSchema = z.object({
  unitId: idSchema,
  amountKurus: amountKurusSchema,
  method: paymentMethodSchema,
  accountId: idSchema.optional(),
  paidAt: dateSchema,
  reference: optionalText(100),
  note: optionalText(300),
  allocations: z
    .array(z.object({ chargeId: idSchema, amountKurus: amountKurusSchema }))
    .max(500)
    .optional(),
});
export type PaymentCreateInput = z.input<typeof paymentCreateSchema>;

export const chargeListQuerySchema = z.object({
  unitId: idSchema.optional(),
  blockId: idSchema.optional(),
  chargeTypeId: idSchema.optional(),
  period: periodSchema.optional(),
  status: z.enum(['open', 'overdue', 'paid', 'all']).default('open'),
});

export const paymentListQuerySchema = z.object({
  unitId: idSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  method: paymentMethodSchema.optional(),
});

export const statementQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const matrixQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  blockId: idSchema.optional(),
});

export const paymentReportQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
});

export interface ChargeTypeDto {
  id: string;
  code: string | null;
  name: string;
  isActive: boolean;
}

export interface DuesPlanDto {
  id: string;
  method: DistributionMethod;
  amountKurus: Kurus;
  validFrom: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface DuesSettingsDto {
  dueDay: number;
  proportionalDues: boolean;
  currentMethod: DistributionMethod | null;
  missingDataUnits: string[];
}

export interface ChargeCreateResultDto {
  created: number;
  totalKurus: Kurus;
}

export interface AccrualResultDto {
  period: string;
  created: number;
  alreadyExisted: number;
  totalKurus: Kurus;
}

export interface ChargeDto {
  id: string;
  unitId: string;
  blockName: string;
  unitNumber: string;
  chargeTypeId: string;
  chargeTypeName: string;
  period: string | null;
  description: string | null;
  label: string;
  amountKurus: Kurus;
  paidKurus: Kurus;
  remainingKurus: Kurus;
  issueDate: string;
  dueDate: string;
  status: ChargeStatus;
  overdue: boolean;
  isDues: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface PaymentAllocationDto {
  chargeId: string;
  label: string;
  amountKurus: Kurus;
}

export interface PaymentDto {
  id: string;
  receiptNo: number | null;
  accountId: string | null;
  accountName: string | null;
  unitId: string;
  blockName: string;
  unitNumber: string;
  amountKurus: Kurus;
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  allocations: PaymentAllocationDto[];
}

export interface UnitAccountDto {
  unitId: string;
  blockName: string;
  unitNumber: string;
  debtKurus: Kurus;
  overdueKurus: Kurus;
  charges: ChargeDto[];
  payments: PaymentDto[];
}

export interface StatementDto {
  unitId: string;
  blockName: string;
  unitNumber: string;
  siteName: string;
  from: string;
  to: string;
  openingKurus: Kurus;
  rows: StatementRow[];
  totalDebitKurus: Kurus;
  totalCreditKurus: Kurus;
  closingKurus: Kurus;
}

export interface MatrixCellDto {
  amountKurus: Kurus;
  paidKurus: Kurus;
  status: ChargeStatus;
  overdue: boolean;
}

export interface MatrixRowDto {
  unitId: string;
  blockName: string;
  unitNumber: string;
  cells: (MatrixCellDto | null)[];
  debtKurus: Kurus;
  overdueKurus: Kurus;
}

export interface MatrixDto {
  year: number;
  periods: string[];
  rows: MatrixRowDto[];
}

export interface DebtReportRowDto {
  unitId: string;
  blockName: string;
  unitNumber: string;
  responsible: string;
  debtKurus: Kurus;
  overdueKurus: Kurus;
  oldestUnpaidPeriod: string | null;
  lastPaymentDate: string | null;
}

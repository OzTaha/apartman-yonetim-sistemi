import { z } from 'zod';
import { amountKurusSchema, periodSchema } from './dues';
import { periodOfDate } from './ledger';
import type { Kurus } from './money';
import { dateSchema, idSchema, optionalPhoneSchema, optionalText } from './schemas';

export type CashAccountKind = 'CASH' | 'BANK';
export const cashAccountKindSchema = z.enum(['CASH', 'BANK']);
export const cashAccountKindLabels: Record<CashAccountKind, string> = {
  CASH: 'Nakit kasa',
  BANK: 'Banka hesabı',
};

export type FinanceKind = 'INCOME' | 'EXPENSE';
export const financeKindSchema = z.enum(['INCOME', 'EXPENSE']);
export const financeKindLabels: Record<FinanceKind, string> = {
  INCOME: 'Gelir',
  EXPENSE: 'Gider',
};

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export const transactionTypeSchema = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
export const transactionTypeLabels: Record<TransactionType, string> = {
  INCOME: 'Gelir',
  EXPENSE: 'Gider',
  TRANSFER: 'Transfer',
};

export type WorkStatus = 'PLANNED' | 'IN_PROGRESS' | 'DONE';
export const workStatusSchema = z.enum(['PLANNED', 'IN_PROGRESS', 'DONE']);
export const workStatusLabels: Record<WorkStatus, string> = {
  PLANNED: 'Planlandı',
  IN_PROGRESS: 'Devam ediyor',
  DONE: 'Tamamlandı',
};

export type AttachmentTarget = 'transaction' | 'work' | 'payment' | 'announcement';
export const attachmentTargetSchema = z.enum(['transaction', 'work', 'payment', 'announcement']);

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_RECORD = 20;
export const ATTACHMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

export const DUES_INCOME_CODE = 'DUES_INCOME';

const nameField = (max: number) =>
  z.string().trim().min(2, 'En az 2 karakter olmalıdır').max(max, `En fazla ${max} karakter`);

const signedKurusSchema = z
  .number({ error: 'Tutar girin' })
  .int('Tutar kuruş cinsinden tam sayı olmalıdır')
  .min(-100_000_000_000)
  .max(100_000_000_000, 'Tutar çok büyük');

export const cashAccountCreateSchema = z.object({
  name: nameField(60),
  kind: cashAccountKindSchema,
  openingBalanceKurus: signedKurusSchema.default(0),
});
export type CashAccountCreateInput = z.input<typeof cashAccountCreateSchema>;

export const cashAccountUpdateSchema = z.object({
  name: nameField(60).optional(),
  openingBalanceKurus: signedKurusSchema.optional(),
  isActive: z.boolean().optional(),
});
export type CashAccountUpdateInput = z.input<typeof cashAccountUpdateSchema>;

export const financeCategoryCreateSchema = z.object({
  kind: financeKindSchema,
  name: nameField(60),
});
export type FinanceCategoryCreateInput = z.input<typeof financeCategoryCreateSchema>;

export const financeCategoryUpdateSchema = z.object({
  name: nameField(60).optional(),
  isActive: z.boolean().optional(),
});

const vendorFields = z.object({
  name: nameField(120),
  phone: optionalPhoneSchema,
  taxNumber: z
    .string()
    .trim()
    .regex(/^(\d{10}|\d{11})?$/, 'Vergi numarası 10, T.C. kimlik numarası 11 haneli olmalıdır')
    .optional()
    .transform((v) => (v ? v : undefined)),
  notes: optionalText(300),
});

export const vendorCreateSchema = vendorFields;
export type VendorInput = z.input<typeof vendorCreateSchema>;

export const vendorUpdateSchema = vendorFields.extend({ isActive: z.boolean().optional() });

export const transactionCreateSchema = z
  .object({
    type: transactionTypeSchema,
    accountId: idSchema,
    toAccountId: idSchema.optional(),
    categoryId: idSchema.optional(),
    vendorId: idSchema.optional(),
    workId: idSchema.optional(),
    employeeId: idSchema.optional(),
    amountKurus: amountKurusSchema,
    date: dateSchema,
    description: optionalText(200),
    documentNo: optionalText(50),
    visibleToResidents: z.boolean().optional(),
  })
  .refine((v) => v.type !== 'TRANSFER' || Boolean(v.toAccountId), {
    message: 'Hedef hesabı seçin',
    path: ['toAccountId'],
  })
  .refine((v) => v.type !== 'TRANSFER' || v.toAccountId !== v.accountId, {
    message: 'Kaynak ve hedef hesap aynı olamaz',
    path: ['toAccountId'],
  })
  .refine((v) => v.type === 'TRANSFER' || Boolean(v.categoryId), {
    message: 'Kategori seçin',
    path: ['categoryId'],
  })
  .refine((v) => v.type === 'EXPENSE' || !v.workId, {
    message: 'Yalnızca gider bir işe bağlanabilir',
    path: ['workId'],
  })
  .refine((v) => v.type === 'EXPENSE' || !v.employeeId, {
    message: 'Yalnızca gider bir çalışana bağlanabilir',
    path: ['employeeId'],
  })
  .refine((v) => !v.employeeId || !v.vendorId, {
    message: 'Ödeme ya bir firmaya ya bir çalışana yapılır',
    path: ['employeeId'],
  });
export type TransactionCreateInput = z.input<typeof transactionCreateSchema>;

export const transactionUpdateSchema = z.object({
  categoryId: idSchema.optional(),
  vendorId: idSchema.nullable().optional(),
  workId: idSchema.nullable().optional(),
  employeeId: idSchema.nullable().optional(),
  description: z.string().trim().max(200).nullable().optional(),
  documentNo: z.string().trim().max(50).nullable().optional(),
  visibleToResidents: z.boolean().optional(),
});
export type TransactionUpdateInput = z.input<typeof transactionUpdateSchema>;

export const transactionListQuerySchema = z.object({
  accountId: idSchema.optional(),
  type: transactionTypeSchema.optional(),
  categoryId: idSchema.optional(),
  vendorId: idSchema.optional(),
  workId: idSchema.optional(),
  employeeId: idSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  cancelled: z.enum(['include', 'only']).optional(),
});

const workFields = z.object({
  title: nameField(120),
  description: optionalText(2000),
  vendorId: idSchema.nullable().optional(),
  startDate: dateSchema.nullable().optional(),
  endDate: dateSchema.nullable().optional(),
  agreedKurus: amountKurusSchema.nullable().optional(),
  status: workStatusSchema,
  visibleToResidents: z.boolean(),
});

const endAfterStart = (v: { startDate?: string | null; endDate?: string | null }) =>
  !v.startDate || !v.endDate || v.endDate >= v.startDate;
const endAfterStartIssue = {
  message: 'Bitiş tarihi başlangıçtan önce olamaz',
  path: ['endDate'],
};

export const workCreateSchema = workFields
  .extend({
    status: workStatusSchema.default('PLANNED'),
    visibleToResidents: z.boolean().default(true),
  })
  .refine(endAfterStart, endAfterStartIssue);
export type WorkInput = z.input<typeof workCreateSchema>;

export const workUpdateSchema = workFields.refine(endAfterStart, endAfterStartIssue);
export type WorkUpdateInput = z.input<typeof workUpdateSchema>;

export const monthCloseSchema = z.object({ period: periodSchema });

export const financeReportQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((v) => v.to >= v.from, { message: 'Bitiş başlangıçtan önce olamaz', path: ['to'] });

export const transparencyQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const attachmentUploadQuerySchema = z.object({
  target: attachmentTargetSchema,
  targetId: idSchema,
});

export function isDateLocked(date: string, lockedThrough: string | null): boolean {
  return lockedThrough !== null && periodOfDate(date) <= lockedThrough;
}

export interface CashAccountDto {
  id: string;
  code: string | null;
  name: string;
  kind: CashAccountKind;
  openingBalanceKurus: Kurus;
  balanceKurus: Kurus;
  isActive: boolean;
}

export interface FinanceCategoryDto {
  id: string;
  code: string | null;
  kind: FinanceKind;
  name: string;
  isActive: boolean;
}

export interface VendorDto {
  id: string;
  name: string;
  phone: string | null;
  taxNumber: string | null;
  notes: string | null;
  isActive: boolean;
  paidKurus: Kurus;
  workCount: number;
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TransactionDto {
  id: string;
  type: TransactionType;
  amountKurus: Kurus;
  date: string;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  workId: string | null;
  workTitle: string | null;
  employeeId: string | null;
  employeeName: string | null;
  paymentId: string | null;
  receiptNo: number | null;
  unitBlockName: string | null;
  unitNumber: string | null;
  description: string | null;
  documentNo: string | null;
  visibleToResidents: boolean;
  locked: boolean;
  attachments: AttachmentDto[];
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface WorkDto {
  id: string;
  title: string;
  description: string | null;
  vendorId: string | null;
  vendorName: string | null;
  startDate: string | null;
  endDate: string | null;
  agreedKurus: Kurus | null;
  paidKurus: Kurus;
  remainingKurus: Kurus | null;
  status: WorkStatus;
  visibleToResidents: boolean;
  attachmentCount: number;
  createdAt: string;
}

export interface WorkDetailDto extends WorkDto {
  payments: TransactionDto[];
  attachments: AttachmentDto[];
}

export interface FinanceMonthDto {
  period: string;
  incomeKurus: Kurus;
  expenseKurus: Kurus;
}

export interface FinanceCategoryTotalDto {
  categoryId: string;
  name: string;
  kind: FinanceKind;
  amountKurus: Kurus;
}

export interface AccountBalanceDto {
  accountId: string;
  name: string;
  openingKurus: Kurus;
  closingKurus: Kurus;
}

export interface FinanceSummaryDto {
  from: string;
  to: string;
  incomeKurus: Kurus;
  expenseKurus: Kurus;
  netKurus: Kurus;
  byCategory: FinanceCategoryTotalDto[];
  byMonth: FinanceMonthDto[];
  accounts: AccountBalanceDto[];
}

export interface MonthClosingDto {
  id: string;
  period: string;
  closedAt: string;
  closedByName: string | null;
  incomeKurus: Kurus;
  expenseKurus: Kurus;
  balances: { accountId: string; name: string; balanceKurus: Kurus }[];
}

export interface ClosingsDto {
  lockedThrough: string | null;
  closings: MonthClosingDto[];
}

export interface TransparencyExpenseDto {
  id: string;
  date: string;
  amountKurus: Kurus;
  categoryName: string | null;
  vendorName: string | null;
  workId: string | null;
  workTitle: string | null;
  description: string | null;
  attachments: AttachmentDto[];
}

export interface TransparencyWorkDto extends WorkDto {
  attachments: AttachmentDto[];
}

export interface TransparencyDto {
  year: number;
  balanceKurus: Kurus;
  months: FinanceMonthDto[];
  expenses: TransparencyExpenseDto[];
  works: TransparencyWorkDto[];
}

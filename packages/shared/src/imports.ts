import { z } from 'zod';
import { amountKurusSchema } from './dues';
import { dateSchema, nameSchema, optionalEmailSchema, optionalPhoneSchema } from './schemas';

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;

export const IMPORT_SHEETS = {
  units: 'Daireler',
  residents: 'Sakinler',
  debts: 'Devreden borçlar',
} as const;
export type ImportSheet = keyof typeof IMPORT_SHEETS;

const unitRef = {
  row: z.number().int().min(2),
  blockName: z.string().trim().max(40).default(''),
  number: z.string().trim().min(1, 'Daire numarası girin').max(10),
};

export const importUnitRowSchema = z.object({
  ...unitRef,
  floor: z.number().int().min(-5).max(200).nullable(),
  areaM2: z.number().positive().max(100_000).nullable(),
  landShare: z.number().int().positive().nullable(),
});
export type ImportUnitRow = z.output<typeof importUnitRowSchema>;

export const importResidentRowSchema = z.object({
  ...unitRef,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
  type: z.enum(['OWNER', 'TENANT']),
  isResponsibleForDues: z.boolean(),
  contactConsent: z.boolean(),
  startDate: dateSchema,
});
export type ImportResidentRow = z.output<typeof importResidentRowSchema>;

export const importDebtRowSchema = z.object({
  ...unitRef,
  description: z.string().trim().max(200).default(''),
  amountKurus: amountKurusSchema,
  dueDate: dateSchema,
});
export type ImportDebtRow = z.output<typeof importDebtRowSchema>;

export const importCommitSchema = z.object({
  units: z.array(importUnitRowSchema).max(IMPORT_MAX_ROWS),
  residents: z.array(importResidentRowSchema).max(IMPORT_MAX_ROWS),
  debts: z.array(importDebtRowSchema).max(IMPORT_MAX_ROWS),
});
export type ImportCommitInput = z.input<typeof importCommitSchema>;

export interface ImportIssueDto {
  sheet: ImportSheet;
  row: number;
  message: string;
}

export interface ImportPreviewDto {
  units: ImportUnitRow[];
  residents: ImportResidentRow[];
  debts: ImportDebtRow[];
  skipped: ImportIssueDto[];
  errors: ImportIssueDto[];
}

export interface ImportResultDto {
  units: number;
  residents: number;
  debts: number;
  debtKurus: number;
}

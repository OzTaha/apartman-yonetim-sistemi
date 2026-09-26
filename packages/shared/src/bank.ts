import { z } from 'zod';
import { dateSchema, idSchema } from './schemas';
import type { Kurus } from './money';

export const BANK_IMPORT_MAX_ROWS = 2000;
export const BANK_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export function parseTrAmount(raw: string): number | null {
  let text = raw.replace(/\s|TL|TRY|₺/gi, '').trim();
  if (!text) return null;
  let sign = 1;
  if (text.startsWith('(') && text.endsWith(')')) {
    sign = -1;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    sign = -sign;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  if (text.endsWith('-')) {
    sign = -sign;
    text = text.slice(0, -1);
  }
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    normalized = text.replace(/,/g, '');
  } else if (lastDot !== -1 && /^\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, '');
  } else {
    normalized = text;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return sign * Math.round(Number(normalized) * 100);
}

export function parseTrDate(raw: string): string | null {
  const text = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const tr = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(text);
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : tr
      ? [Number(tr[3]), Number(tr[2]), Number(tr[1])]
      : [NaN, NaN, NaN];
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

export function normalizeForMatch(text: string): string {
  return text
    .toLocaleUpperCase('tr')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export interface BankColumnMapping {
  date: string;
  description: string;
  amount: string;
}

export interface BankParseResultDto {
  headers: string[];
  rows: string[][];
  mapping: BankColumnMapping | null;
}

const bankRowSchema = z.object({
  date: dateSchema,
  description: z.string().trim().max(500),
  amountKurus: z.number().int().positive(),
});

export const bankMatchSchema = z.object({
  rows: z.array(bankRowSchema).min(1).max(BANK_IMPORT_MAX_ROWS),
});
export type BankMatchInput = z.input<typeof bankMatchSchema>;

export type BankMatchConfidence = 'HIGH' | 'MEDIUM';

export interface BankMatchRowDto {
  index: number;
  date: string;
  description: string;
  amountKurus: Kurus;
  occurrence: number;
  status: 'NEW' | 'IMPORTED' | 'IGNORED';
  unitId: string | null;
  confidence: BankMatchConfidence | null;
  reason: string | null;
}

export interface BankUnitOptionDto {
  unitId: string;
  label: string;
  debtKurus: Kurus;
}

export interface BankMatchResultDto {
  rows: BankMatchRowDto[];
  units: BankUnitOptionDto[];
}

const bankCommitItemSchema = bankRowSchema.extend({
  occurrence: z.number().int().min(0),
});

export const bankCommitSchema = z
  .object({
    accountId: idSchema,
    mapping: z
      .object({
        date: z.string().max(100),
        description: z.string().max(100),
        amount: z.string().max(100),
      })
      .optional(),
    payments: z
      .array(bankCommitItemSchema.extend({ unitId: idSchema }))
      .max(BANK_IMPORT_MAX_ROWS)
      .default([]),
    ignore: z.array(bankCommitItemSchema).max(BANK_IMPORT_MAX_ROWS).default([]),
  })
  .refine((v) => v.payments.length + v.ignore.length > 0, {
    message: 'En az bir hareket seçin',
    path: ['payments'],
  });
export type BankCommitInput = z.input<typeof bankCommitSchema>;

export interface BankCommitResultDto {
  imported: number;
  ignored: number;
  totalKurus: Kurus;
  errors: { description: string; amountKurus: Kurus; date: string; message: string }[];
}

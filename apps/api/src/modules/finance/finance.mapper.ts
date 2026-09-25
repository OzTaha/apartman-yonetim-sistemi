import {
  isDateLocked,
  type AttachmentDto,
  type TransactionDto,
  type WorkDto,
} from '@apartman/shared';
import { toDateString } from '../../common/dates';
import type { Prisma } from '../../generated/prisma/client';

export const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
} satisfies Prisma.AttachmentSelect;

type AttachmentRow = Prisma.AttachmentGetPayload<{ select: typeof attachmentSelect }>;

export function toAttachmentDto(a: AttachmentRow): AttachmentDto {
  return {
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt.toISOString(),
  };
}

export const transactionInclude = {
  account: { select: { name: true } },
  toAccount: { select: { name: true } },
  category: { select: { name: true } },
  vendor: { select: { name: true } },
  work: { select: { title: true } },
  payment: {
    select: {
      receiptNo: true,
      unit: { select: { number: true, block: { select: { name: true } } } },
    },
  },
  attachments: { select: attachmentSelect, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TransactionInclude;

export type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: typeof transactionInclude;
}>;

export function toTransactionDto(
  t: TransactionWithRelations,
  lockedThrough: string | null,
): TransactionDto {
  const date = toDateString(t.date);
  return {
    id: t.id,
    type: t.type,
    amountKurus: t.amountKurus,
    date,
    accountId: t.accountId,
    accountName: t.account.name,
    toAccountId: t.toAccountId,
    toAccountName: t.toAccount?.name ?? null,
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    vendorId: t.vendorId,
    vendorName: t.vendor?.name ?? null,
    workId: t.workId,
    workTitle: t.work?.title ?? null,
    paymentId: t.paymentId,
    receiptNo: t.payment?.receiptNo ?? null,
    unitBlockName: t.payment?.unit.block.name ?? null,
    unitNumber: t.payment?.unit.number ?? null,
    description: t.description,
    documentNo: t.documentNo,
    visibleToResidents: t.visibleToResidents,
    locked: isDateLocked(date, lockedThrough),
    attachments: t.attachments.map(toAttachmentDto),
    createdAt: t.createdAt.toISOString(),
    cancelledAt: t.cancelledAt?.toISOString() ?? null,
    cancelReason: t.cancelReason,
  };
}

export const workInclude = {
  vendor: { select: { name: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.WorkInclude;

type WorkWithRelations = Prisma.WorkGetPayload<{ include: typeof workInclude }>;

export function toWorkDto(w: WorkWithRelations, paidKurus: number): WorkDto {
  return {
    id: w.id,
    title: w.title,
    description: w.description,
    vendorId: w.vendorId,
    vendorName: w.vendor?.name ?? null,
    startDate: w.startDate ? toDateString(w.startDate) : null,
    endDate: w.endDate ? toDateString(w.endDate) : null,
    agreedKurus: w.agreedKurus,
    paidKurus,
    remainingKurus: w.agreedKurus === null ? null : w.agreedKurus - paidKurus,
    status: w.status,
    visibleToResidents: w.visibleToResidents,
    attachmentCount: w._count.attachments,
    createdAt: w.createdAt.toISOString(),
  };
}

export const optionalDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

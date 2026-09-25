import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  transactionTypeLabels,
  type AttachmentDto,
  type AttachmentTarget,
  type TransactionDto,
} from '@apartman/shared';
import { toast } from 'sonner';
import { errorMessage, uploadFile } from '@/lib/api';
import { labelUnit } from '@/lib/unit-label';

const ACCEPTED = new Set(ATTACHMENT_ACCEPT.split(','));

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}

export function checkFile(file: File): string | null {
  if (!ACCEPTED.has(file.type)) return `${file.name}: yalnızca PDF, JPG, PNG veya WEBP`;
  if (file.size > ATTACHMENT_MAX_BYTES) return `${file.name}: en fazla 10 MB olabilir`;
  return null;
}

export async function uploadAll(target: AttachmentTarget, targetId: string, files: File[]) {
  let failed = 0;
  for (const file of files) {
    try {
      await uploadFile<AttachmentDto>(`/attachments?target=${target}&targetId=${targetId}`, file);
    } catch (error) {
      failed += 1;
      toast.error(`${file.name}: ${errorMessage(error)}`);
    }
  }
  return files.length - failed;
}

export function transactionTitle(t: TransactionDto): string {
  if (t.type === 'TRANSFER') return `${t.accountName} → ${t.toAccountName}`;
  if (t.paymentId && t.unitBlockName && t.unitNumber) {
    return `Aidat tahsilatı · ${labelUnit(t.unitBlockName, t.unitNumber, 'short')}`;
  }
  return t.description || t.categoryName || transactionTypeLabels[t.type];
}

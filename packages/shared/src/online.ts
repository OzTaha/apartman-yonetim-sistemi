import { z } from 'zod';
import type { Kurus } from './money';
import { idSchema } from './schemas';

export type PaymentIntentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
export const paymentIntentStatusLabels: Record<PaymentIntentStatus, string> = {
  PENDING: 'Ödeme bekleniyor',
  SUCCEEDED: 'Ödendi',
  FAILED: 'Ödeme başarısız',
  EXPIRED: 'Süresi doldu',
  REFUNDED: 'İade edildi',
};

export const PAYMENT_INTENT_MINUTES = 30;

export const checkoutSchema = z.object({
  unitId: idSchema,
  chargeIds: z
    .array(idSchema)
    .min(1, 'Ödemek istediğiniz borçları seçin')
    .max(100, 'Tek seferde en fazla 100 borç ödenebilir'),
});
export type CheckoutInput = z.input<typeof checkoutSchema>;

export const onlinePaymentSettingsSchema = z.object({
  enabled: z.boolean(),
  accountId: idSchema.nullable(),
});
export type OnlinePaymentSettingsInput = z.input<typeof onlinePaymentSettingsSchema>;

export const refundSchema = z.object({
  reason: z.string().trim().min(3, 'İade nedenini yazın').max(300),
});

export interface IntentItem {
  chargeId: string;
  amountKurus: Kurus;
}

export interface FittedPayment {
  allocations: IntentItem[];
  appliedKurus: Kurus;
  excessKurus: Kurus;
}

export function fitToOpenCharges(
  items: IntentItem[],
  remaining: ReadonlyMap<string, Kurus>,
): FittedPayment {
  const allocations = items
    .map((item) => ({
      chargeId: item.chargeId,
      amountKurus: Math.min(item.amountKurus, Math.max(remaining.get(item.chargeId) ?? 0, 0)),
    }))
    .filter((a) => a.amountKurus > 0);
  const paid = items.reduce((sum, i) => sum + i.amountKurus, 0);
  const appliedKurus = allocations.reduce((sum, a) => sum + a.amountKurus, 0);
  return { allocations, appliedKurus, excessKurus: paid - appliedKurus };
}

export interface OnlinePaymentStatusDto {
  enabled: boolean;
  testMode: boolean;
}

export interface OnlinePaymentSettingsDto {
  enabled: boolean;
  accountId: string | null;
  providerAvailable: boolean;
  testMode: boolean;
}

export interface CheckoutResultDto {
  intentId: string;
  redirectUrl: string;
}

export interface PaymentIntentDto {
  id: string;
  unitId: string;
  status: PaymentIntentStatus;
  amountKurus: Kurus;
  appliedKurus: Kurus;
  refundedKurus: Kurus;
  paymentId: string | null;
  receiptNo: number | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

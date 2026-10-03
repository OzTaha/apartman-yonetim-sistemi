import { z } from 'zod';

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
export type PushSubscriptionInput = z.input<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.url().max(1000) });

export interface PushConfigDto {
  publicKey: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

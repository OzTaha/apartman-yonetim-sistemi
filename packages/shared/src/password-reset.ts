import { z } from 'zod';
import { messageChannelSchema, type MessageChannel } from './communication';
import { passwordSchema } from './schemas';

export const PASSWORD_RESET_HOURS = 24;

export const passwordResetSchema = z.object({ password: passwordSchema });
export type PasswordResetInput = z.input<typeof passwordResetSchema>;

export const resetLinkRequestSchema = z.object({ send: messageChannelSchema.optional() });

export interface PasswordResetLinkDto {
  url: string;
  expiresAt: string;
  sentVia: MessageChannel | null;
  sendError: string | null;
}

export interface PasswordResetInfoDto {
  firstName: string;
  expiresAt: string;
}

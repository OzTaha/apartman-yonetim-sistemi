import { z } from 'zod';
import { removeSpaces } from './schemas';

export type NotificationType = 'PASSWORD_RESET_REQUEST';

export const passwordResetRequestSchema = z.object({
  identifier: z
    .string()
    .transform((value) => removeSpaces(value))
    .pipe(z.string().min(1, 'Telefon numaranızı veya e-posta adresinizi girin').max(254)),
});
export type PasswordResetRequestInput = z.input<typeof passwordResetRequestSchema>;

export const notificationListQuerySchema = z.object({
  filter: z.enum(['unread', 'all']).optional(),
});

export interface PasswordResetRequestData {
  occupancyId: string | null;
  userId: string | null;
  hasAccount: boolean;
  isManager: boolean;
  name: string;
  phone: string | null;
  blockName: string | null;
  unitNumber: string | null;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  siteId: string | null;
  siteName: string | null;
  data: PasswordResetRequestData;
  readAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface NotificationCountDto {
  unread: number;
}

export interface NotificationEventDto {
  kind: 'created' | 'changed';
  notification?: NotificationDto;
}

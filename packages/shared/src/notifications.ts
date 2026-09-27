import { z } from 'zod';
import type { ServiceRequestNotificationData } from './requests';
import { removeSpaces } from './schemas';

export type NotificationType = 'PASSWORD_RESET_REQUEST' | 'SERVICE_REQUEST';

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

interface NotificationBase {
  id: string;
  title: string;
  body: string;
  siteId: string | null;
  siteName: string | null;
  readAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export type NotificationDto = NotificationBase &
  (
    | { type: 'PASSWORD_RESET_REQUEST'; data: PasswordResetRequestData }
    | { type: 'SERVICE_REQUEST'; data: ServiceRequestNotificationData }
  );

export interface NotificationCountDto {
  unread: number;
}

export interface NotificationEventDto {
  kind: 'created' | 'changed';
  notification?: NotificationDto;
}

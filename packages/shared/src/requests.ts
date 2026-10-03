import { z } from 'zod';
import type { AttachmentDto } from './finance';
import { dateSchema, idSchema, optionalText } from './schemas';
import { taskPrioritySchema, type TaskStatus } from './staff';

export type RequestCategory =
  'FAULT' | 'CLEANING' | 'SECURITY' | 'COMPLAINT' | 'SUGGESTION' | 'OTHER';
export const REQUEST_CATEGORIES = [
  'FAULT',
  'CLEANING',
  'SECURITY',
  'COMPLAINT',
  'SUGGESTION',
  'OTHER',
] as const satisfies readonly RequestCategory[];
export const requestCategorySchema = z.enum(REQUEST_CATEGORIES, 'Kategori seçin');
export const requestCategoryLabels: Record<RequestCategory, string> = {
  FAULT: 'Arıza',
  CLEANING: 'Temizlik',
  SECURITY: 'Güvenlik',
  COMPLAINT: 'Şikâyet',
  SUGGESTION: 'Öneri',
  OTHER: 'Diğer',
};

export type RequestStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';
export const REQUEST_STATUSES = [
  'NEW',
  'IN_PROGRESS',
  'RESOLVED',
  'REJECTED',
] as const satisfies readonly RequestStatus[];
export const requestStatusSchema = z.enum(REQUEST_STATUSES);
export const requestStatusLabels: Record<RequestStatus, string> = {
  NEW: 'Yeni',
  IN_PROGRESS: 'İşlemde',
  RESOLVED: 'Çözüldü',
  REJECTED: 'Reddedildi',
};
export const OPEN_REQUEST_STATUSES: readonly RequestStatus[] = ['NEW', 'IN_PROGRESS'];

export type RequestLocation = 'UNIT' | 'COMMON';
export const requestLocationSchema = z.enum(['UNIT', 'COMMON']);
export const requestLocationLabels: Record<RequestLocation, string> = {
  UNIT: 'Dairem',
  COMMON: 'Ortak alan',
};

export type RequestEventKind = 'CREATED' | 'STATUS' | 'COMMENT' | 'TASK';

export const REQUEST_PHOTO_MAX = 3;
export const REQUEST_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const REQUEST_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

export const requestCreateSchema = z.object({
  unitId: idSchema,
  location: requestLocationSchema,
  category: requestCategorySchema,
  title: z
    .string()
    .trim()
    .min(3, 'En az 3 karakter olmalıdır')
    .max(120, 'En fazla 120 karakter olabilir'),
  description: z
    .string()
    .trim()
    .min(5, 'Sorunu kısaca anlatın')
    .max(2000, 'En fazla 2000 karakter olabilir'),
});
export type RequestCreateInput = z.input<typeof requestCreateSchema>;

export const STAFF_MESSAGE_CATEGORIES = [
  'SECURITY',
  'FAULT',
  'OTHER',
] as const satisfies readonly RequestCategory[];
export const staffMessageCategoryLabels: Record<(typeof STAFF_MESSAGE_CATEGORIES)[number], string> =
  {
    SECURITY: 'Şüpheli durum',
    FAULT: 'Arıza',
    OTHER: 'Diğer',
  };

export const staffMessageSchema = z.object({
  category: z.enum(STAFF_MESSAGE_CATEGORIES, 'Konu seçin'),
  description: z
    .string()
    .trim()
    .min(5, 'Ne olduğunu kısaca yazın')
    .max(2000, 'En fazla 2000 karakter olabilir'),
  urgent: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => v === true || v === 'true'),
});
export type StaffMessageInput = z.input<typeof staffMessageSchema>;

export function staffMessageTitle(description: string): string {
  const text = description.trim().replace(/\s+/g, ' ');
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

export const requestCommentSchema = z.object({
  note: z.string().trim().min(1, 'Mesaj yazın').max(1000, 'En fazla 1000 karakter olabilir'),
});

export const requestStatusChangeSchema = z
  .object({ status: requestStatusSchema, note: optionalText(1000) })
  .refine((v) => v.status !== 'REJECTED' || (v.note?.length ?? 0) >= 3, {
    message: 'Reddetme nedenini yazın',
    path: ['note'],
  });
export type RequestStatusChangeInput = z.input<typeof requestStatusChangeSchema>;

export const requestTaskSchema = z.object({
  employeeId: idSchema.nullable().optional(),
  dueDate: dateSchema.nullable().optional(),
  priority: taskPrioritySchema.default('NORMAL'),
});
export type RequestTaskInput = z.input<typeof requestTaskSchema>;

export const REQUEST_VIEWS = ['open', 'NEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'all'] as const;
export type RequestView = (typeof REQUEST_VIEWS)[number];

export const requestListQuerySchema = z.object({
  view: z.enum(REQUEST_VIEWS).optional(),
  category: requestCategorySchema.optional(),
  blockId: idSchema.optional(),
});

export interface RequestEventDto {
  id: string;
  kind: RequestEventKind;
  status: RequestStatus | null;
  note: string | null;
  byResident: boolean;
  userName: string | null;
  createdAt: string;
}

export interface ServiceRequestDto {
  id: string;
  number: number;
  unitId: string | null;
  blockName: string | null;
  unitNumber: string | null;
  fromStaff: boolean;
  urgent: boolean;
  location: RequestLocation;
  category: RequestCategory;
  title: string;
  status: RequestStatus;
  requesterName: string;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRequestDetailDto extends ServiceRequestDto {
  description: string;
  requesterPhone: string | null;
  resolvedAt: string | null;
  task: { id: string; status: TaskStatus; employeeName: string | null } | null;
  photos: AttachmentDto[];
  events: RequestEventDto[];
}

export interface MyRequestDto {
  id: string;
  number: number;
  unitId: string | null;
  blockName: string | null;
  unitNumber: string | null;
  fromStaff: boolean;
  urgent: boolean;
  location: RequestLocation;
  category: RequestCategory;
  title: string;
  status: RequestStatus;
  unseen: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MyRequestDetailDto extends MyRequestDto {
  description: string;
  resolvedAt: string | null;
  photos: AttachmentDto[];
  events: RequestEventDto[];
}

export interface ServiceRequestNotificationData {
  requestId: string;
  number: number;
  blockName: string | null;
  unitNumber: string | null;
}

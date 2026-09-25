import { z } from 'zod';
import { normalizeTrPhone } from './phone';

z.config(z.locales.tr());

const number = () => z.number({ error: 'Bir sayı girin' });

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter olabilir`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'En az 2 karakter olmalıdır')
  .max(60, 'En fazla 60 karakter olabilir');

export const emailSchema = z
  .email('Geçerli bir e-posta adresi girin')
  .trim()
  .toLowerCase()
  .max(254, 'E-posta çok uzun');

export const optionalEmailSchema = z
  .union([z.literal(''), emailSchema])
  .optional()
  .transform((v) => (v ? v : undefined));

export const phoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeTrPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Geçerli bir telefon numarası girin' });
      return z.NEVER;
    }
    return normalized;
  });

export const optionalPhoneSchema = z
  .union([z.literal(''), phoneSchema])
  .optional()
  .transform((v) => (v ? v : undefined));

export const passwordSchema = z
  .string()
  .min(8, 'Şifre en az 8 karakter olmalıdır')
  .max(128, 'Şifre en fazla 128 karakter olabilir');

export const idSchema = z.uuid('Geçersiz kimlik');

export const dateSchema = z.iso.date('Geçerli bir tarih girin (YYYY-AA-GG)');

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'E-posta veya telefon girin'),
  password: z.string().min(1, 'Şifre girin'),
});
export type LoginInput = z.input<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mevcut şifrenizi girin'),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export const acceptInviteSchema = z.object({
  password: passwordSchema.optional(),
});
export type AcceptInviteInput = z.input<typeof acceptInviteSchema>;

export const siteKindSchema = z.enum(['APARTMENT', 'SITE']);

const siteFields = z.object({
  name: z.string().trim().min(2, 'En az 2 karakter olmalıdır').max(120),
  kind: siteKindSchema,
  address: optionalText(300),
  city: optionalText(60),
  proportionalDues: z.boolean(),
});

export const siteCreateSchema = siteFields.extend({
  kind: siteKindSchema.default('SITE'),
  proportionalDues: z.boolean().default(false),
});
export type SiteCreateInput = z.input<typeof siteCreateSchema>;

export const siteUpdateSchema = siteFields.partial();
export type SiteUpdateInput = z.input<typeof siteUpdateSchema>;

export const siteManagerAssignSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    email: optionalEmailSchema,
    phone: optionalPhoneSchema,
    password: z
      .union([z.literal(''), passwordSchema])
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((v) => v.email || v.phone, {
    message: 'E-posta veya telefon alanlarından en az biri gereklidir',
    path: ['email'],
  });
export type SiteManagerAssignInput = z.input<typeof siteManagerAssignSchema>;

export const blockSchema = z.object({
  name: z.string().trim().min(1, 'Blok adı girin').max(50),
});
export type BlockInput = z.input<typeof blockSchema>;

const floorSchema = number().int('Kat tam sayı olmalıdır').min(-5).max(200);

export const unitCreateSchema = z.object({
  blockId: idSchema.optional(),
  number: z.string().trim().min(1, 'Daire numarası girin').max(10),
  floor: floorSchema.nullish(),
  areaM2: number().positive('Alan pozitif olmalıdır').max(100_000).nullish(),
  landShare: number().int('Arsa payı tam sayı olmalıdır').positive().nullish(),
});
export type UnitCreateInput = z.input<typeof unitCreateSchema>;

export const unitUpdateSchema = unitCreateSchema.partial();
export type UnitUpdateInput = z.input<typeof unitUpdateSchema>;

export const bulkUnitsSchema = z
  .object({
    blockId: idSchema.optional(),
    startNumber: number().int().min(1, 'En az 1 olmalıdır'),
    endNumber: number().int().min(1, 'En az 1 olmalıdır'),
    unitsPerFloor: number().int().min(1).max(50).nullish(),
    startFloor: floorSchema.default(1),
  })
  .refine((v) => v.endNumber >= v.startNumber, {
    message: 'Bitiş numarası başlangıçtan küçük olamaz',
    path: ['endNumber'],
  })
  .refine((v) => v.endNumber - v.startNumber < 500, {
    message: 'Tek seferde en fazla 500 daire oluşturulabilir',
    path: ['endNumber'],
  });
export type BulkUnitsInput = z.input<typeof bulkUnitsSchema>;

export const unitListQuerySchema = z.object({
  blockId: idSchema.optional(),
  search: z.string().trim().max(50).optional(),
  archived: z.enum(['include', 'only']).optional(),
});

export const OccupancyType = { OWNER: 'OWNER', TENANT: 'TENANT' } as const;
export type OccupancyType = (typeof OccupancyType)[keyof typeof OccupancyType];

export const occupancyTypeLabels: Record<OccupancyType, string> = {
  OWNER: 'Malik',
  TENANT: 'Kiracı',
};

const occupancyFields = z.object({
  unitId: idSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
  type: z.enum(['OWNER', 'TENANT']),
  startDate: dateSchema,
  isResponsibleForDues: z.boolean(),
  contactConsent: z.boolean(),
  notes: optionalText(500),
});

export const occupancyCreateSchema = occupancyFields.extend({
  isResponsibleForDues: z.boolean().default(true),
  contactConsent: z.boolean().default(false),
});
export type OccupancyCreateInput = z.input<typeof occupancyCreateSchema>;

export const occupancyUpdateSchema = occupancyFields.omit({ unitId: true }).partial();
export type OccupancyUpdateInput = z.input<typeof occupancyUpdateSchema>;

export const moveOutSchema = z.object({
  endDate: dateSchema,
});
export type MoveOutInput = z.input<typeof moveOutSchema>;

export const residentListQuerySchema = z.object({
  unitId: idSchema.optional(),
  blockId: idSchema.optional(),
  status: z.enum(['active', 'past', 'all']).default('active'),
  search: z.string().trim().max(50).optional(),
});

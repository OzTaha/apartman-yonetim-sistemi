import { z } from 'zod';
import type { AttachmentDto } from './finance';
import { dateSchema, idSchema } from './schemas';

export type AnnouncementAudience = 'ALL' | 'BLOCKS' | 'UNITS';
export const announcementAudienceSchema = z.enum(['ALL', 'BLOCKS', 'UNITS']);
export const announcementAudienceLabels: Record<AnnouncementAudience, string> = {
  ALL: 'Tüm sakinler',
  BLOCKS: 'Seçili bloklar',
  UNITS: 'Seçili daireler',
};

export type MessageChannel = 'SMS' | 'WHATSAPP';
export const messageChannelSchema = z.enum(['SMS', 'WHATSAPP']);
export const messageChannelLabels: Record<MessageChannel, string> = {
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
};

export type CampaignKind = 'DUES_REMINDER' | 'ANNOUNCEMENT' | 'EMERGENCY' | 'INFO';
export const campaignKindSchema = z.enum(['DUES_REMINDER', 'ANNOUNCEMENT', 'EMERGENCY', 'INFO']);
export const campaignKindLabels: Record<CampaignKind, string> = {
  DUES_REMINDER: 'Aidat hatırlatması',
  ANNOUNCEMENT: 'Duyuru',
  EMERGENCY: 'Acil durum',
  INFO: 'Genel bilgi',
};

export type RecipientFilter = 'ALL' | 'BLOCKS' | 'UNITS' | 'DEBTORS' | 'OVERDUE';
export const recipientFilterSchema = z.enum(['ALL', 'BLOCKS', 'UNITS', 'DEBTORS', 'OVERDUE']);
export const recipientFilterLabels: Record<RecipientFilter, string> = {
  ALL: 'Tüm sakinler',
  BLOCKS: 'Seçili bloklar',
  UNITS: 'Seçili daireler',
  DEBTORS: 'Borcu olan daireler',
  OVERDUE: 'Gecikmiş borcu olan daireler',
};

export type DeliveryStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';
export const deliveryStatusLabels: Record<DeliveryStatus, string> = {
  QUEUED: 'Sırada',
  SENT: 'Gönderildi',
  FAILED: 'Gönderilemedi',
  SKIPPED: 'Atlandı',
};

export const TEMPLATE_VARIABLES = [
  { key: 'ad', label: 'Sakinin adı soyadı' },
  { key: 'daire', label: 'Daire' },
  { key: 'borc', label: 'Dairenin güncel borcu' },
  { key: 'site', label: 'Apartman veya site adı' },
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]['key'];
const VARIABLE_KEYS = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));

export function renderTemplate(body: string, values: Record<TemplateVariable, string>): string {
  return body.replace(/\{(\w+)\}/g, (match, key: string) =>
    VARIABLE_KEYS.has(key) ? values[key as TemplateVariable] : match,
  );
}

export function unknownVariables(body: string): string[] {
  const found = [...body.matchAll(/\{(\w*)\}/g)].map((m) => m[1]!);
  return [...new Set(found.filter((key) => !VARIABLE_KEYS.has(key)))];
}

const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€\f';
const gsmBasic = new Set(GSM_BASIC);
const gsmExtended = new Set(GSM_EXTENDED);

export interface SmsInfo {
  characters: number;
  segments: number;
  unicode: boolean;
}

export function smsInfo(text: string): SmsInfo {
  const chars = [...text];
  const unicode = chars.some((c) => !gsmBasic.has(c) && !gsmExtended.has(c));
  const units = unicode
    ? chars.length
    : chars.reduce((sum, c) => sum + (gsmExtended.has(c) ? 2 : 1), 0);
  const [single, multi] = unicode ? [70, 67] : [160, 153];
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  return { characters: chars.length, segments, unicode };
}

export const MESSAGE_MAX_LENGTH = 1000;

const messageBodySchema = z
  .string()
  .trim()
  .min(1, 'Mesaj metnini yazın')
  .max(MESSAGE_MAX_LENGTH, `En fazla ${MESSAGE_MAX_LENGTH} karakter olabilir`)
  .refine((v) => unknownVariables(v).length === 0, {
    message: `Kullanılabilecek alanlar: ${TEMPLATE_VARIABLES.map((v) => `{${v.key}}`).join(', ')}`,
  });

function checkTargets(
  v: { blockIds: string[]; unitIds: string[] },
  target: string,
  ctx: z.RefinementCtx,
) {
  if (target === 'BLOCKS' && v.blockIds.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'En az bir blok seçin', path: ['blockIds'] });
  }
  if (target === 'UNITS' && v.unitIds.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'En az bir daire seçin', path: ['unitIds'] });
  }
}

const announcementFields = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'En az 2 karakter olmalıdır')
    .max(150, 'En fazla 150 karakter olabilir'),
  body: z
    .string()
    .trim()
    .min(1, 'Duyuru metnini yazın')
    .max(5000, 'En fazla 5000 karakter olabilir'),
  audience: announcementAudienceSchema,
  blockIds: z.array(idSchema).max(200).default([]),
  unitIds: z.array(idSchema).max(2000).default([]),
  pinned: z.boolean().default(false),
  expiresAt: dateSchema.nullable().optional(),
});

export const announcementUpdateSchema = announcementFields.superRefine((v, ctx) =>
  checkTargets(v, v.audience, ctx),
);
export type AnnouncementUpdateInput = z.input<typeof announcementUpdateSchema>;

export const announcementCreateSchema = announcementFields
  .extend({
    notify: z
      .object({ channel: messageChannelSchema, body: messageBodySchema })
      .nullable()
      .optional(),
  })
  .superRefine((v, ctx) => checkTargets(v, v.audience, ctx));
export type AnnouncementCreateInput = z.input<typeof announcementCreateSchema>;

export const messageTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'En az 2 karakter olmalıdır')
    .max(60, 'En fazla 60 karakter olabilir'),
  kind: campaignKindSchema,
  body: messageBodySchema,
});
export type MessageTemplateInput = z.input<typeof messageTemplateSchema>;

export const campaignSchema = z
  .object({
    kind: campaignKindSchema,
    channel: messageChannelSchema,
    filter: recipientFilterSchema,
    blockIds: z.array(idSchema).max(200).default([]),
    unitIds: z.array(idSchema).max(2000).default([]),
    body: messageBodySchema,
  })
  .superRefine((v, ctx) => checkTargets(v, v.filter, ctx));
export type CampaignInput = z.input<typeof campaignSchema>;

export const reminderSettingsSchema = z.object({
  enabled: z.boolean(),
  daysAfterDue: z
    .number({ error: 'Gün sayısı girin' })
    .int()
    .min(1, 'En az 1 gün olmalıdır')
    .max(60, 'En fazla 60 gün olabilir'),
  channel: messageChannelSchema,
  body: messageBodySchema,
});
export type ReminderSettingsInput = z.input<typeof reminderSettingsSchema>;

export const DEFAULT_TEMPLATES: { kind: CampaignKind; name: string; body: string }[] = [
  {
    kind: 'DUES_REMINDER',
    name: 'Aidat hatırlatması',
    body: 'Sayın {ad}, {daire} için {borc} tutarında ödenmemiş borcunuz bulunmaktadır. Ödemeniz için teşekkür ederiz. {site} Yönetimi',
  },
  {
    kind: 'ANNOUNCEMENT',
    name: 'Yeni duyuru',
    body: 'Sayın {ad}, {site} yönetimi yeni bir duyuru yayınladı. Ayrıntılar sakin portalındadır.',
  },
  {
    kind: 'EMERGENCY',
    name: 'Su kesintisi',
    body: 'Sayın {ad}, bugün bakım çalışması nedeniyle binada su kesintisi olacaktır. {site} Yönetimi',
  },
  {
    kind: 'INFO',
    name: 'Genel toplantı',
    body: 'Sayın {ad}, {site} kat malikleri genel toplantısı yapılacaktır. Ayrıntılar sakin portalındadır.',
  },
];

export const DEFAULT_REMINDER = {
  enabled: false,
  daysAfterDue: 3,
  channel: 'SMS' as MessageChannel,
  body: DEFAULT_TEMPLATES[0]!.body,
};

export interface AnnouncementDto {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  blockIds: string[];
  unitIds: string[];
  targetLabel: string;
  pinned: boolean;
  expiresAt: string | null;
  expired: boolean;
  publishedAt: string;
  createdByName: string | null;
  attachments: AttachmentDto[];
  readCount: number;
  audienceCount: number;
  campaignId: string | null;
}

export interface AnnouncementReaderDto {
  name: string;
  blockName: string;
  unitNumber: string;
  readAt: string | null;
}

export interface AnnouncementDetailDto extends AnnouncementDto {
  readers: AnnouncementReaderDto[];
}

export interface ResidentAnnouncementDto {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  expiresAt: string | null;
  publishedAt: string;
  attachments: AttachmentDto[];
  read: boolean;
}

export interface MessageTemplateDto {
  id: string;
  name: string;
  kind: CampaignKind;
  body: string;
  createdAt: string;
}

export interface RecipientPreviewDto {
  name: string;
  blockName: string;
  unitNumber: string;
  phone: string;
  text: string;
}

export interface CampaignPreviewDto {
  recipients: number;
  skippedNoConsent: number;
  skippedNoPhone: number;
  sample: RecipientPreviewDto | null;
}

export interface CampaignCountsDto {
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface CampaignDto {
  id: string;
  kind: CampaignKind;
  channel: MessageChannel;
  filter: RecipientFilter;
  body: string;
  automatic: boolean;
  announcementId: string | null;
  createdByName: string | null;
  createdAt: string;
  counts: CampaignCountsDto;
}

export interface DeliveryDto {
  id: string;
  name: string;
  blockName: string | null;
  unitNumber: string | null;
  phone: string | null;
  text: string;
  status: DeliveryStatus;
  error: string | null;
  attempts: number;
  sentAt: string | null;
}

export interface CampaignDetailDto extends CampaignDto {
  deliveries: DeliveryDto[];
}

export interface ReminderSettingsDto {
  enabled: boolean;
  daysAfterDue: number;
  channel: MessageChannel;
  body: string;
}

export interface DashboardAnnouncementDto {
  id: string;
  title: string;
  publishedAt: string;
  readCount: number;
  audienceCount: number;
}

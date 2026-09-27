import { z } from 'zod';
import { idSchema, optionalText } from './schemas';

export type MeetingKind = 'ORDINARY' | 'EXTRAORDINARY';
export const meetingKindSchema = z.enum(['ORDINARY', 'EXTRAORDINARY']);
export const meetingKindLabels: Record<MeetingKind, string> = {
  ORDINARY: 'Olağan genel kurul',
  EXTRAORDINARY: 'Olağanüstü genel kurul',
};

export type MeetingStatus = 'PLANNED' | 'HELD' | 'CANCELLED';
export const meetingStatusLabels: Record<MeetingStatus, string> = {
  PLANNED: 'Planlandı',
  HELD: 'Yapıldı',
  CANCELLED: 'İptal edildi',
};

export type MeetingSession = 'FIRST' | 'SECOND';
export const meetingSessionSchema = z.enum(['FIRST', 'SECOND']);
export const meetingSessionLabels: Record<MeetingSession, string> = {
  FIRST: 'Birinci toplantı',
  SECOND: 'İkinci toplantı',
};

export type AttendanceStatus = 'PRESENT' | 'PROXY' | 'ABSENT';
export const attendanceStatusSchema = z.enum(['PRESENT', 'PROXY', 'ABSENT']);
export const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  PRESENT: 'Katıldı',
  PROXY: 'Vekil',
  ABSENT: 'Katılmadı',
};

export type DecisionResult = 'ACCEPTED' | 'REJECTED' | 'INFO';
export const decisionResultSchema = z.enum(['ACCEPTED', 'REJECTED', 'INFO']);
export const decisionResultLabels: Record<DecisionResult, string> = {
  ACCEPTED: 'Kabul edildi',
  REJECTED: 'Reddedildi',
  INFO: 'Bilgilendirme',
};

export const CALL_NOTICE_DAYS = 15;
export const SECOND_MEETING_GAP_DAYS = 7;
export const MEETING_MAX_ITEMS = 40;

export const DEFAULT_ORDINARY_AGENDA = [
  'Açılış ve toplantı başkanının seçimi',
  'Yönetim raporunun okunması ve görüşülmesi',
  'Denetim raporunun okunması ve görüşülmesi',
  'Yönetimin ve denetçinin ibrası',
  'İşletme projesinin görüşülmesi ve karara bağlanması',
  'Yönetici ve denetçinin seçimi',
  'Dilek ve temenniler',
] as const;

export const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const localDateTimeSchema = z.string().regex(LOCAL_DATE_TIME, 'Tarih ve saat seçin');

export const meetingItemSchema = z.object({
  id: idSchema.optional(),
  title: z
    .string()
    .trim()
    .min(2, 'Gündem maddesini yazın')
    .max(300, 'En fazla 300 karakter olabilir'),
  budgetId: idSchema.nullable().optional(),
});

export const meetingSchema = z
  .object({
    kind: meetingKindSchema,
    startsAt: localDateTimeSchema,
    secondStartsAt: localDateTimeSchema.nullable().optional(),
    location: z.string().trim().min(2, 'Toplantı yerini yazın').max(200),
    notes: optionalText(1000),
    items: z
      .array(meetingItemSchema)
      .min(1, 'En az bir gündem maddesi ekleyin')
      .max(MEETING_MAX_ITEMS, `En fazla ${MEETING_MAX_ITEMS} gündem maddesi eklenebilir`),
  })
  .refine((v) => !v.secondStartsAt || v.secondStartsAt > v.startsAt, {
    message: 'İkinci toplantı birinciden sonra olmalıdır',
    path: ['secondStartsAt'],
  });
export type MeetingInput = z.input<typeof meetingSchema>;

export const meetingCallSchema = z.object({
  notify: z
    .object({
      channel: z.enum(['SMS', 'WHATSAPP']),
      body: z.string().trim().min(1, 'Mesaj metnini yazın').max(1000),
    })
    .nullable()
    .optional(),
});
export type MeetingCallInput = z.input<typeof meetingCallSchema>;

export const attendanceSchema = z.object({
  entries: z
    .array(
      z.object({
        unitId: idSchema,
        status: attendanceStatusSchema,
        name: optionalText(120),
      }),
    )
    .max(5000),
});
export type AttendanceInput = z.input<typeof attendanceSchema>;

const voteSchema = z.number().int().min(0).max(100_000).nullable().optional();

export const decisionSchema = z
  .object({
    result: decisionResultSchema,
    resolution: z
      .string()
      .trim()
      .min(3, 'Karar metnini yazın')
      .max(5000, 'En fazla 5000 karakter olabilir'),
    votesFor: voteSchema,
    votesAgainst: voteSchema,
    votesAbstain: voteSchema,
  })
  .refine(
    (v) =>
      v.result !== 'INFO' ||
      (v.votesFor == null && v.votesAgainst == null && v.votesAbstain == null),
    { message: 'Bilgilendirme maddesinde oy girilmez', path: ['votesFor'] },
  );
export type DecisionInput = z.input<typeof decisionSchema>;

export const meetingCompleteSchema = z.object({ session: meetingSessionSchema });
export const meetingCancelSchema = z.object({
  reason: z.string().trim().min(3, 'İptal nedenini yazın').max(500),
});

export interface QuorumUnit {
  landShare: number | null;
  status: AttendanceStatus;
}

export interface QuorumDto {
  totalUnits: number;
  presentUnits: number;
  proxyUnits: number;
  totalLandShare: number | null;
  presentLandShare: number | null;
  unitsMajority: boolean;
  landShareMajority: boolean | null;
  reached: boolean;
}

export function meetingQuorum(units: QuorumUnit[]): QuorumDto {
  const present = units.filter((u) => u.status !== 'ABSENT');
  const landKnown = units.length > 0 && units.every((u) => u.landShare != null && u.landShare > 0);
  const totalLandShare = landKnown ? units.reduce((s, u) => s + u.landShare!, 0) : null;
  const presentLandShare = landKnown ? present.reduce((s, u) => s + u.landShare!, 0) : null;
  const unitsMajority = present.length * 2 > units.length;
  const landShareMajority = totalLandShare === null ? null : presentLandShare! * 2 > totalLandShare;
  return {
    totalUnits: units.length,
    presentUnits: present.length,
    proxyUnits: units.filter((u) => u.status === 'PROXY').length,
    totalLandShare,
    presentLandShare,
    unitsMajority,
    landShareMajority,
    reached: unitsMajority && landShareMajority !== false,
  };
}

export interface MeetingDto {
  id: string;
  kind: MeetingKind;
  startsAt: string;
  secondStartsAt: string | null;
  location: string;
  status: MeetingStatus;
  heldSession: MeetingSession | null;
  calledAt: string | null;
  itemCount: number;
  decisionCount: number;
  createdAt: string;
}

export interface MeetingItemDto {
  id: string;
  position: number;
  title: string;
  budgetId: string | null;
  budgetLabel: string | null;
  resolution: string | null;
  result: DecisionResult | null;
  votesFor: number | null;
  votesAgainst: number | null;
  votesAbstain: number | null;
  decisionNo: number | null;
}

export interface AttendanceRowDto {
  unitId: string;
  blockName: string;
  unitNumber: string;
  landShare: number | null;
  owners: string;
  status: AttendanceStatus;
  name: string | null;
}

export interface MeetingDetailDto extends MeetingDto {
  notes: string | null;
  cancelReason: string | null;
  heldAt: string | null;
  announcementId: string | null;
  noticeDays: number;
  items: MeetingItemDto[];
  attendance: AttendanceRowDto[];
  quorum: QuorumDto;
}

export interface DecisionDto {
  decisionNo: number;
  meetingId: string;
  meetingKind: MeetingKind;
  meetingDate: string;
  title: string;
  resolution: string;
  result: DecisionResult;
  votesFor: number | null;
  votesAgainst: number | null;
  votesAbstain: number | null;
}

export interface ResidentMeetingDto {
  id: string;
  kind: MeetingKind;
  startsAt: string;
  secondStartsAt: string | null;
  location: string;
  status: MeetingStatus;
  heldSession: MeetingSession | null;
  items: {
    id: string;
    title: string;
    result: DecisionResult | null;
    resolution: string | null;
    decisionNo: number | null;
  }[];
}

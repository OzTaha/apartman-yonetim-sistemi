import { z } from 'zod';
import type { TransactionDto } from './finance';
import type { Kurus } from './money';
import { dateSchema, idSchema, nameSchema, optionalPhoneSchema, optionalText } from './schemas';

export type EmployeeRole = 'DOORMAN' | 'SECURITY' | 'CLEANING' | 'GARDENER' | 'OTHER';
export const employeeRoleSchema = z.enum(['DOORMAN', 'SECURITY', 'CLEANING', 'GARDENER', 'OTHER']);
export const employeeRoleLabels: Record<EmployeeRole, string> = {
  DOORMAN: 'Kapıcı',
  SECURITY: 'Güvenlik',
  CLEANING: 'Temizlik',
  GARDENER: 'Bahçıvan',
  OTHER: 'Diğer',
};

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export const taskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']);
export const taskStatusLabels: Record<TaskStatus, string> = {
  TODO: 'Yapılacak',
  IN_PROGRESS: 'Devam ediyor',
  DONE: 'Tamamlandı',
  CANCELLED: 'İptal edildi',
};
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS'];

export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH';
export const taskPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH']);
export const taskPriorityLabels: Record<TaskPriority, string> = {
  LOW: 'Düşük',
  NORMAL: 'Normal',
  HIGH: 'Acil',
};

export type TaskEventKind = 'CREATED' | 'EDITED' | 'ASSIGNED' | 'STATUS' | 'NOTE';

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export const recurrenceFrequencySchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);
export const recurrenceFrequencyLabels: Record<RecurrenceFrequency, string> = {
  DAILY: 'Her gün',
  WEEKLY: 'Haftanın belirli günleri',
  MONTHLY: 'Ayda bir',
};

export const WEEKDAY_NAMES = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const;
export const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

const MINUTES_PER_DAY = 24 * 60;
const DAY_MS = 86_400_000;

const toUtc = (date: string) => Date.parse(`${date}T00:00:00.000Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function isoWeekday(date: string): number {
  const day = new Date(toUtc(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function weekStartOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours! * 60 + minutes!;
}

export function shiftMinutes(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return end > start ? end - start : end + MINUTES_PER_DAY - start;
}

export function isOvernight(startTime: string, endTime: string): boolean {
  return timeToMinutes(endTime) <= timeToMinutes(startTime);
}

export interface ShiftTime {
  date: string;
  startTime: string;
  endTime: string;
}

export function shiftSpan(shift: ShiftTime): [number, number] {
  const start = toUtc(shift.date) / 60_000 + timeToMinutes(shift.startTime);
  return [start, start + shiftMinutes(shift.startTime, shift.endTime)];
}

export function shiftsOverlap(a: ShiftTime, b: ShiftTime): boolean {
  const [aStart, aEnd] = shiftSpan(a);
  const [bStart, bEnd] = shiftSpan(b);
  return aStart < bEnd && bStart < aEnd;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} dk`;
  return rest === 0 ? `${hours} sa` : `${hours} sa ${rest} dk`;
}

export function isTaskOverdue(
  task: { status: TaskStatus; dueDate: string | null },
  today: string,
): boolean {
  return OPEN_TASK_STATUSES.includes(task.status) && task.dueDate !== null && task.dueDate < today;
}

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  weekdays: number[];
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
}

export function recurrenceMatches(rule: RecurrenceRule, date: string): boolean {
  if (date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false;
  switch (rule.frequency) {
    case 'DAILY':
      return true;
    case 'WEEKLY':
      return rule.weekdays.includes(isoWeekday(date));
    case 'MONTHLY':
      return Number(date.slice(8, 10)) === rule.dayOfMonth;
  }
}

export function describeRecurrence(
  rule: Pick<RecurrenceRule, 'frequency' | 'weekdays' | 'dayOfMonth'>,
): string {
  if (rule.frequency === 'DAILY') return 'Her gün';
  if (rule.frequency === 'MONTHLY') return `Her ayın ${rule.dayOfMonth}. günü`;
  const days = [...new Set(rule.weekdays)].sort((a, b) => a - b);
  if (days.length === 7) return 'Her gün';
  if (days.join() === '1,2,3,4,5') return 'Hafta içi her gün';
  if (days.join() === '6,7') return 'Hafta sonu her gün';
  const names = days.map((d) => WEEKDAY_NAMES[d - 1]!.toLocaleLowerCase('tr'));
  const text = names.length > 1 ? `${names.slice(0, -1).join(', ')} ve ${names.at(-1)}` : names[0];
  return `Her ${text}`;
}

const titleSchema = z
  .string()
  .trim()
  .min(2, 'En az 2 karakter olmalıdır')
  .max(120, 'En fazla 120 karakter olabilir');

const employeeFields = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  role: employeeRoleSchema,
  phone: optionalPhoneSchema,
  startDate: dateSchema.nullable().optional(),
  notes: optionalText(300),
});

export const employeeCreateSchema = employeeFields;
export type EmployeeInput = z.input<typeof employeeCreateSchema>;

export const employeeUpdateSchema = employeeFields.extend({ isActive: z.boolean() });
export type EmployeeUpdateInput = z.input<typeof employeeUpdateSchema>;

const timeSchema = z.string().regex(TIME_PATTERN, 'Saat SS:DD biçiminde olmalıdır');

export const shiftSchema = z
  .object({
    employeeId: idSchema,
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    note: optionalText(200),
  })
  .refine((v) => v.startTime !== v.endTime, {
    message: 'Başlangıç ve bitiş saati aynı olamaz',
    path: ['endTime'],
  });
export type ShiftInput = z.input<typeof shiftSchema>;

export const SHIFT_QUERY_MAX_DAYS = 62;

export const shiftListQuerySchema = z
  .object({ from: dateSchema, to: dateSchema, employeeId: idSchema.optional() })
  .refine((v) => v.to >= v.from, { message: 'Bitiş başlangıçtan önce olamaz', path: ['to'] })
  .refine((v) => daysBetween(v.from, v.to) < SHIFT_QUERY_MAX_DAYS, {
    message: `En fazla ${SHIFT_QUERY_MAX_DAYS} günlük vardiya listelenebilir`,
    path: ['to'],
  });

const mondaySchema = dateSchema.refine((v) => isoWeekday(v) === 1, {
  message: 'Hafta pazartesi günüyle belirtilmelidir',
});

export const shiftCopySchema = z
  .object({ sourceWeek: mondaySchema, targetWeek: mondaySchema })
  .refine((v) => v.sourceWeek !== v.targetWeek, {
    message: 'Kaynak ve hedef hafta aynı olamaz',
    path: ['targetWeek'],
  });

const taskFields = z.object({
  title: titleSchema,
  description: optionalText(2000),
  employeeId: idSchema.nullable().optional(),
  dueDate: dateSchema.nullable().optional(),
  priority: taskPrioritySchema,
});

export const taskCreateSchema = taskFields.extend({
  priority: taskPrioritySchema.default('NORMAL'),
});
export type TaskInput = z.input<typeof taskCreateSchema>;

export const taskUpdateSchema = taskFields;

export const taskStatusChangeSchema = z
  .object({ status: taskStatusSchema, note: optionalText(500) })
  .refine((v) => v.status !== 'CANCELLED' || (v.note?.length ?? 0) >= 3, {
    message: 'İptal nedenini yazın',
    path: ['note'],
  });
export type TaskStatusChangeInput = z.input<typeof taskStatusChangeSchema>;

export const taskNoteSchema = z.object({
  note: z.string().trim().min(1, 'Not yazın').max(1000, 'En fazla 1000 karakter olabilir'),
});

export const TASK_VIEWS = ['open', 'overdue', 'done', 'cancelled', 'all'] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export const taskListQuerySchema = z.object({
  view: z.enum(TASK_VIEWS).optional(),
  employeeId: idSchema.optional(),
});

const recurringFields = z.object({
  title: titleSchema,
  description: optionalText(2000),
  employeeId: idSchema.nullable().optional(),
  priority: taskPrioritySchema,
  frequency: recurrenceFrequencySchema,
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  dayOfMonth: z.number().int().min(1).max(28, 'Ayın en fazla 28. günü seçilebilir').nullable(),
  startDate: dateSchema,
  endDate: dateSchema.nullable().optional(),
  isActive: z.boolean(),
});

type RecurringShape = z.output<typeof recurringFields>;

function checkRecurrence(v: RecurringShape, ctx: z.RefinementCtx) {
  if (v.frequency === 'WEEKLY' && v.weekdays.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'En az bir gün seçin', path: ['weekdays'] });
  }
  if (v.frequency === 'MONTHLY' && !v.dayOfMonth) {
    ctx.addIssue({ code: 'custom', message: 'Ayın gününü seçin', path: ['dayOfMonth'] });
  }
  if (v.endDate && v.endDate < v.startDate) {
    ctx.addIssue({
      code: 'custom',
      message: 'Bitiş tarihi başlangıçtan önce olamaz',
      path: ['endDate'],
    });
  }
}

export const recurringTaskCreateSchema = recurringFields
  .extend({
    priority: taskPrioritySchema.default('NORMAL'),
    weekdays: recurringFields.shape.weekdays.default([]),
    dayOfMonth: recurringFields.shape.dayOfMonth.default(null),
    isActive: z.boolean().default(true),
  })
  .superRefine(checkRecurrence);
export type RecurringTaskInput = z.input<typeof recurringTaskCreateSchema>;

export const recurringTaskUpdateSchema = recurringFields.superRefine(checkRecurrence);

export interface EmployeeDto {
  id: string;
  firstName: string;
  lastName: string;
  role: EmployeeRole;
  phone: string | null;
  startDate: string | null;
  notes: string | null;
  isActive: boolean;
  openTaskCount: number;
  overdueTaskCount: number;
  paidKurus: Kurus;
  createdAt: string;
}

export interface ShiftDto {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: EmployeeRole;
  date: string;
  startTime: string;
  endTime: string;
  minutes: number;
  overnight: boolean;
  note: string | null;
}

export interface ShiftCopyResultDto {
  created: number;
  skipped: number;
}

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  employeeId: string | null;
  employeeName: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  overdue: boolean;
  completedAt: string | null;
  recurringTaskId: string | null;
  createdAt: string;
}

export interface TaskEventDto {
  id: string;
  kind: TaskEventKind;
  status: TaskStatus | null;
  assigneeName: string | null;
  note: string | null;
  userName: string | null;
  createdAt: string;
}

export interface TaskDetailDto extends TaskDto {
  events: TaskEventDto[];
}

export interface RecurringTaskDto {
  id: string;
  title: string;
  description: string | null;
  employeeId: string | null;
  employeeName: string | null;
  priority: TaskPriority;
  frequency: RecurrenceFrequency;
  weekdays: number[];
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  taskCount: number;
  createdAt: string;
}

export interface EmployeeDetailDto extends EmployeeDto {
  openTasks: TaskDto[];
  shifts: ShiftDto[];
  payments: TransactionDto[];
}

export interface StaffReportRowDto {
  employeeId: string;
  name: string;
  role: EmployeeRole;
  isActive: boolean;
  shiftCount: number;
  shiftMinutes: number;
  tasksDone: number;
  tasksDoneLate: number;
  tasksOpen: number;
  tasksOverdue: number;
  paidKurus: Kurus;
}

export interface StaffReportDto {
  from: string;
  to: string;
  rows: StaffReportRowDto[];
  unassignedOpenTasks: number;
}

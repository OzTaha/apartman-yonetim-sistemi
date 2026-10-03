import { z } from 'zod';
import { dateSchema, idSchema } from './schemas';
import type { TaskPriority, TaskStatus } from './staff';

export const DOOR_RETENTION_DAYS = 180;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const packageCreateSchema = z.object({
  unitId: idSchema,
  carrier: optional(60),
  note: optional(200),
});
export type PackageCreateInput = z.input<typeof packageCreateSchema>;

export const packageDeliverSchema = z.object({ deliveredTo: optional(80) });

export const visitorArrivalSchema = z.object({
  unitId: idSchema,
  name: z.string().trim().min(2, 'Misafirin adını yazın').max(80),
  plate: optional(15),
  note: optional(200),
});
export type VisitorArrivalInput = z.input<typeof visitorArrivalSchema>;

export const expectedVisitorSchema = z.object({
  unitId: idSchema,
  name: z.string().trim().min(2, 'Misafirin adını yazın').max(80),
  expectedOn: dateSchema,
  note: optional(200),
});
export type ExpectedVisitorInput = z.input<typeof expectedVisitorSchema>;

export const staffTaskStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'DONE']),
  note: optional(500),
});
export type StaffTaskStatusInput = z.input<typeof staffTaskStatusSchema>;

export const employeeAccessSchema = z.object({ doorAccess: z.boolean() });

export interface PackageDto {
  id: string;
  unitId: string;
  unitLabel: string;
  carrier: string | null;
  note: string | null;
  receivedAt: string;
  deliveredAt: string | null;
  deliveredTo: string | null;
}

export interface VisitorDto {
  id: string;
  unitId: string;
  unitLabel: string;
  name: string;
  plate: string | null;
  note: string | null;
  expectedOn: string | null;
  arrivedAt: string | null;
  createdByResident: boolean;
}

export interface DoorUnitDto {
  id: string;
  label: string;
  residents: string[];
}

export interface DoorOverviewDto {
  waitingPackages: PackageDto[];
  expectedVisitors: VisitorDto[];
  recentVisitors: VisitorDto[];
  recentPackages: PackageDto[];
}

export interface MyDoorDto {
  packages: PackageDto[];
  visitors: VisitorDto[];
}

export interface StaffTaskDto {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  overdue: boolean;
}

export interface StaffShiftDto {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
}

export interface StaffMeDto {
  employeeId: string;
  name: string;
  role: string;
  doorAccess: boolean;
  tasks: StaffTaskDto[];
  shifts: StaffShiftDto[];
}

export interface EmployeeAccountDto {
  hasAccount: boolean;
  doorAccess: boolean;
  invitationPending: boolean;
}

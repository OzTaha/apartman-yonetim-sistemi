import {
  isOvernight,
  isTaskOverdue,
  shiftMinutes,
  type RecurringTaskDto,
  type ShiftDto,
  type TaskDto,
} from '@apartman/shared';
import { toDateString } from '../../common/dates';
import type { Prisma } from '../../generated/prisma/client';

export const fullName = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`;

const employeeName = { select: { firstName: true, lastName: true } } as const;

export const shiftInclude = {
  employee: { select: { firstName: true, lastName: true, role: true } },
} satisfies Prisma.ShiftInclude;

type ShiftRow = Prisma.ShiftGetPayload<{ include: typeof shiftInclude }>;

export function toShiftDto(s: ShiftRow): ShiftDto {
  return {
    id: s.id,
    employeeId: s.employeeId,
    employeeName: fullName(s.employee),
    employeeRole: s.employee.role,
    date: toDateString(s.date),
    startTime: s.startTime,
    endTime: s.endTime,
    minutes: shiftMinutes(s.startTime, s.endTime),
    overnight: isOvernight(s.startTime, s.endTime),
    note: s.note,
  };
}

export const taskInclude = { employee: employeeName } satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function toTaskDto(t: TaskRow, today: string): TaskDto {
  const dueDate = t.dueDate ? toDateString(t.dueDate) : null;
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    employeeId: t.employeeId,
    employeeName: t.employee ? fullName(t.employee) : null,
    dueDate,
    priority: t.priority,
    status: t.status,
    overdue: isTaskOverdue({ status: t.status, dueDate }, today),
    completedAt: t.completedAt?.toISOString() ?? null,
    recurringTaskId: t.recurringTaskId,
    createdAt: t.createdAt.toISOString(),
  };
}

export const recurringInclude = {
  employee: employeeName,
  _count: { select: { tasks: true } },
} satisfies Prisma.RecurringTaskInclude;

type RecurringRow = Prisma.RecurringTaskGetPayload<{ include: typeof recurringInclude }>;

export function toRecurringTaskDto(r: RecurringRow): RecurringTaskDto {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    employeeId: r.employeeId,
    employeeName: r.employee ? fullName(r.employee) : null,
    priority: r.priority,
    frequency: r.frequency,
    weekdays: [...r.weekdays].sort((a, b) => a - b),
    dayOfMonth: r.dayOfMonth,
    startDate: toDateString(r.startDate),
    endDate: r.endDate ? toDateString(r.endDate) : null,
    isActive: r.isActive,
    taskCount: r._count.tasks,
    createdAt: r.createdAt.toISOString(),
  };
}

export const OPEN_STATUSES = ['TODO', 'IN_PROGRESS'] as const;

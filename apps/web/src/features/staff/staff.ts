import type { EmployeeDto } from '@apartman/shared';

export function employeeBody(e: EmployeeDto, patch: Partial<{ isActive: boolean }> = {}) {
  return {
    firstName: e.firstName,
    lastName: e.lastName,
    role: e.role,
    phone: e.phone ?? '',
    startDate: e.startDate,
    notes: e.notes ?? '',
    isActive: e.isActive,
    ...patch,
  };
}

export const employeeName = (e: { firstName: string; lastName: string }) =>
  `${e.firstName} ${e.lastName}`;

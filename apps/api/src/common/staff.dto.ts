import {
  employeeCreateSchema,
  employeeUpdateSchema,
  recurringTaskCreateSchema,
  recurringTaskUpdateSchema,
  shiftCopySchema,
  shiftListQuerySchema,
  shiftSchema,
  taskCreateSchema,
  taskListQuerySchema,
  taskNoteSchema,
  taskStatusChangeSchema,
  taskUpdateSchema,
} from '@apartman/shared';
import { createZodDto } from 'nestjs-zod';

export class EmployeeCreateDto extends createZodDto(employeeCreateSchema) {}
export class EmployeeUpdateDto extends createZodDto(employeeUpdateSchema) {}
export class ShiftBodyDto extends createZodDto(shiftSchema) {}
export class ShiftListQueryDto extends createZodDto(shiftListQuerySchema) {}
export class ShiftCopyDto extends createZodDto(shiftCopySchema) {}
export class TaskCreateDto extends createZodDto(taskCreateSchema) {}
export class TaskUpdateDto extends createZodDto(taskUpdateSchema) {}
export class TaskStatusChangeDto extends createZodDto(taskStatusChangeSchema) {}
export class TaskNoteDto extends createZodDto(taskNoteSchema) {}
export class TaskListQueryDto extends createZodDto(taskListQuerySchema) {}
export class RecurringTaskCreateDto extends createZodDto(recurringTaskCreateSchema) {}
export class RecurringTaskUpdateDto extends createZodDto(recurringTaskUpdateSchema) {}

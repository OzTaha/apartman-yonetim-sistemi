import {
  attachmentUploadQuerySchema,
  cashAccountCreateSchema,
  cashAccountUpdateSchema,
  financeCategoryCreateSchema,
  financeCategoryUpdateSchema,
  financeReportQuerySchema,
  monthCloseSchema,
  transactionCreateSchema,
  transactionListQuerySchema,
  transactionUpdateSchema,
  transparencyQuerySchema,
  vendorCreateSchema,
  vendorUpdateSchema,
  workCreateSchema,
  workUpdateSchema,
} from '@apartman/shared';
import { createZodDto } from 'nestjs-zod';

export class CashAccountCreateDto extends createZodDto(cashAccountCreateSchema) {}
export class CashAccountUpdateDto extends createZodDto(cashAccountUpdateSchema) {}
export class FinanceCategoryCreateDto extends createZodDto(financeCategoryCreateSchema) {}
export class FinanceCategoryUpdateDto extends createZodDto(financeCategoryUpdateSchema) {}
export class VendorCreateDto extends createZodDto(vendorCreateSchema) {}
export class VendorUpdateDto extends createZodDto(vendorUpdateSchema) {}
export class TransactionCreateDto extends createZodDto(transactionCreateSchema) {}
export class TransactionUpdateDto extends createZodDto(transactionUpdateSchema) {}
export class TransactionListQueryDto extends createZodDto(transactionListQuerySchema) {}
export class WorkCreateDto extends createZodDto(workCreateSchema) {}
export class WorkUpdateDto extends createZodDto(workUpdateSchema) {}
export class MonthCloseDto extends createZodDto(monthCloseSchema) {}
export class FinanceReportQueryDto extends createZodDto(financeReportQuerySchema) {}
export class TransparencyQueryDto extends createZodDto(transparencyQuerySchema) {}
export class AttachmentUploadQueryDto extends createZodDto(attachmentUploadQuerySchema) {}

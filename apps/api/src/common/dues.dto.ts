import {
  accrueSchema,
  cancelSchema,
  chargeCreateSchema,
  chargeListQuerySchema,
  chargeTypeSchema,
  chargeTypeUpdateSchema,
  chargeUpdateSchema,
  duesPlanSchema,
  duesSettingsSchema,
  matrixQuerySchema,
  paymentCreateSchema,
  paymentListQuerySchema,
  paymentReportQuerySchema,
  statementQuerySchema,
} from '@apartman/shared';
import { createZodDto } from 'nestjs-zod';

export class ChargeTypeDto extends createZodDto(chargeTypeSchema) {}
export class ChargeTypeUpdateDto extends createZodDto(chargeTypeUpdateSchema) {}
export class DuesPlanDto extends createZodDto(duesPlanSchema) {}
export class DuesSettingsDto extends createZodDto(duesSettingsSchema) {}
export class AccrueDto extends createZodDto(accrueSchema) {}
export class ChargeCreateDto extends createZodDto(chargeCreateSchema) {}
export class ChargeUpdateDto extends createZodDto(chargeUpdateSchema) {}
export class CancelDto extends createZodDto(cancelSchema) {}
export class ChargeListQueryDto extends createZodDto(chargeListQuerySchema) {}
export class PaymentCreateDto extends createZodDto(paymentCreateSchema) {}
export class PaymentListQueryDto extends createZodDto(paymentListQuerySchema) {}
export class StatementQueryDto extends createZodDto(statementQuerySchema) {}
export class MatrixQueryDto extends createZodDto(matrixQuerySchema) {}
export class PaymentReportQueryDto extends createZodDto(paymentReportQuerySchema) {}

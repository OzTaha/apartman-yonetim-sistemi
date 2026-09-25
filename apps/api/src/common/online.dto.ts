import { checkoutSchema, onlinePaymentSettingsSchema, refundSchema } from '@apartman/shared';
import { createZodDto } from 'nestjs-zod';

export class CheckoutDto extends createZodDto(checkoutSchema) {}
export class OnlinePaymentSettingsDto extends createZodDto(onlinePaymentSettingsSchema) {}
export class RefundDto extends createZodDto(refundSchema) {}

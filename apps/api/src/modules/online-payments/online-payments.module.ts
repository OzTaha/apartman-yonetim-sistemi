import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { DuesModule } from '../dues/dues.module';
import { MockCheckoutController } from './mock.controller';
import { MockPaymentProvider } from './mock.provider';
import {
  OnlinePaymentsCallbackController,
  OnlinePaymentsController,
  OnlinePaymentsService,
} from './online-payments';
import { DisabledPaymentProvider, PaymentProvider } from './payment.provider';

@Module({
  imports: [DuesModule],
  controllers: [OnlinePaymentsController, OnlinePaymentsCallbackController, MockCheckoutController],
  providers: [
    OnlinePaymentsService,
    {
      provide: PaymentProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('PAYMENT_PROVIDER', { infer: true }) === 'mock'
          ? new MockPaymentProvider()
          : new DisabledPaymentProvider(),
    },
  ],
})
export class OnlinePaymentsModule {}

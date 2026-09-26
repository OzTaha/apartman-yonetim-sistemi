import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { ZodValidationPipe } from 'nestjs-zod';
import { PrismaExceptionFilter, ZodValidationExceptionFilter } from './common/exception.filters';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { AuditModule } from './modules/audit/audit.service';
import { AuthModule } from './modules/auth/auth.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { BlocksModule } from './modules/blocks/blocks';
import { BrandingModule } from './modules/branding/branding';
import { DuesModule } from './modules/dues/dues.module';
import { FinanceModule } from './modules/finance/finance.module';
import { OnlinePaymentsModule } from './modules/online-payments/online-payments.module';
import { NotificationsModule } from './modules/notifications/notifications';
import { PasswordResetModule } from './modules/password-reset/password-reset';
import { ResidentsModule } from './modules/residents/residents';
import { SitesModule } from './modules/sites/sites.module';
import { StaffModule } from './modules/staff/staff.module';
import { UnitsModule } from './modules/units/units';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { TenancyModule } from './tenancy/tenancy.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      errorMessage: 'Çok fazla deneme yaptınız. Lütfen bir dakika sonra tekrar deneyin.',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    TenancyModule,
    AuditModule,
    AuthModule,
    SitesModule,
    BlocksModule,
    UnitsModule,
    ResidentsModule,
    DuesModule,
    FinanceModule,
    StaffModule,
    CommunicationModule,
    OnlinePaymentsModule,
    BrandingModule,
    PasswordResetModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: ZodValidationExceptionFilter },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { DuesModule } from '../dues/dues.module';
import { FinanceModule } from '../finance/finance.module';
import { AnnouncementsController, AnnouncementsService } from './announcements';
import { CampaignsController, CampaignsService } from './campaigns';
import {
  MESSAGE_ATTEMPTS,
  MESSAGE_QUEUE,
  MessageProcessor,
  MessageQueue,
  queuePrefix,
  redisConnection,
} from './message.queue';
import { LogMessagingProvider, MessagingProvider } from './messaging.provider';
import { RecipientsService } from './recipients';
import { RemindersService } from './reminders';
import { ReminderSettingsController, TemplatesController, TemplatesService } from './templates';

@Module({
  imports: [
    DuesModule,
    FinanceModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: redisConnection(config.get('REDIS_URL', { infer: true })),
        prefix: queuePrefix(config.get('DATABASE_URL', { infer: true })),
        defaultJobOptions: {
          attempts: MESSAGE_ATTEMPTS,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      }),
    }),
    BullModule.registerQueue({ name: MESSAGE_QUEUE }),
  ],
  controllers: [
    AnnouncementsController,
    CampaignsController,
    TemplatesController,
    ReminderSettingsController,
  ],
  providers: [
    AnnouncementsService,
    CampaignsService,
    RecipientsService,
    TemplatesService,
    RemindersService,
    MessageQueue,
    MessageProcessor,
    { provide: MessagingProvider, useClass: LogMessagingProvider },
  ],
})
export class CommunicationModule {}

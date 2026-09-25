import {
  announcementCreateSchema,
  announcementUpdateSchema,
  campaignSchema,
  messageTemplateSchema,
  reminderSettingsSchema,
} from '@apartman/shared';
import { createZodDto } from 'nestjs-zod';

export class AnnouncementCreateDto extends createZodDto(announcementCreateSchema) {}
export class AnnouncementUpdateDto extends createZodDto(announcementUpdateSchema) {}
export class CampaignDto extends createZodDto(campaignSchema) {}
export class MessageTemplateDto extends createZodDto(messageTemplateSchema) {}
export class ReminderSettingsDto extends createZodDto(reminderSettingsSchema) {}

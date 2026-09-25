import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  DEFAULT_REMINDER,
  DEFAULT_TEMPLATES,
  type MessageTemplateDto,
  type ReminderSettingsDto,
} from '@apartman/shared';
import {
  MessageTemplateDto as TemplateBody,
  ReminderSettingsDto as ReminderBody,
} from '../../common/communication.dto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { readSiteSettings } from '../dues/site-settings';

export function readReminder(settings: Prisma.JsonValue): ReminderSettingsDto {
  const stored = (readSiteSettings(settings) as { reminder?: Partial<ReminderSettingsDto> })
    .reminder;
  return { ...DEFAULT_REMINDER, ...stored };
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<MessageTemplateDto[]> {
    if ((await this.tenant.db.messageTemplate.count()) === 0) {
      await this.tenant.db.messageTemplate.createMany({
        data: DEFAULT_TEMPLATES.map((t) => ({ siteId: this.tenant.siteId, ...t })),
        skipDuplicates: true,
      });
    }
    const rows = await this.tenant.db.messageTemplate.findMany({
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      body: t.body,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  async create(input: TemplateBody): Promise<MessageTemplateDto> {
    const created = await this.tenant.db.messageTemplate.create({
      data: { siteId: this.tenant.siteId, ...input },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'MessageTemplate',
      entityId: created.id,
      after: input,
    });
    return this.one(created.id);
  }

  async update(id: string, input: TemplateBody): Promise<MessageTemplateDto> {
    const before = await this.tenant.db.messageTemplate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Şablon bulunamadı');
    await this.tenant.db.messageTemplate.update({ where: { id }, data: input });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'MessageTemplate',
      entityId: id,
      before,
      after: input,
    });
    return this.one(id);
  }

  async remove(id: string): Promise<void> {
    const before = await this.tenant.db.messageTemplate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Şablon bulunamadı');
    await this.tenant.db.messageTemplate.delete({ where: { id } });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'MessageTemplate',
      entityId: id,
      before,
    });
  }

  async reminder(): Promise<ReminderSettingsDto> {
    const site = await this.prisma.site.findUniqueOrThrow({
      where: { id: this.tenant.siteId },
      select: { settings: true },
    });
    return readReminder(site.settings);
  }

  async updateReminder(input: ReminderBody): Promise<ReminderSettingsDto> {
    const site = await this.prisma.site.findUniqueOrThrow({
      where: { id: this.tenant.siteId },
      select: { settings: true },
    });
    const before = readReminder(site.settings);
    await this.prisma.site.update({
      where: { id: this.tenant.siteId },
      data: {
        settings: {
          ...readSiteSettings(site.settings),
          reminder: {
            enabled: input.enabled,
            daysAfterDue: input.daysAfterDue,
            channel: input.channel,
            body: input.body,
          },
        },
      },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'ReminderSettings',
      entityId: this.tenant.siteId,
      before,
      after: input,
    });
    return this.reminder();
  }

  private async one(id: string): Promise<MessageTemplateDto> {
    const found = (await this.list()).find((t) => t.id === id);
    if (!found) throw new NotFoundException('Şablon bulunamadı');
    return found;
  }
}

@ApiTags('İletişim')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('message-templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(): Promise<MessageTemplateDto[]> {
    return this.templates.list();
  }

  @Post()
  create(@Body() body: TemplateBody): Promise<MessageTemplateDto> {
    return this.templates.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TemplateBody,
  ): Promise<MessageTemplateDto> {
    return this.templates.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.templates.remove(id);
  }
}

@ApiTags('İletişim')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('reminder-settings')
export class ReminderSettingsController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  get(): Promise<ReminderSettingsDto> {
    return this.templates.reminder();
  }

  @Put()
  update(@Body() body: ReminderBody): Promise<ReminderSettingsDto> {
    return this.templates.updateReminder(body);
  }
}

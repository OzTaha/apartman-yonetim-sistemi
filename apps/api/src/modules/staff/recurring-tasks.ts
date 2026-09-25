import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { recurrenceMatches, type RecurringTaskDto } from '@apartman/shared';
import { ClsService } from 'nestjs-cls';
import { dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import { RecurringTaskCreateDto, RecurringTaskUpdateDto } from '../../common/staff.dto';
import type { Env } from '../../config/env';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext, type AppClsStore } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { activeEmployee } from './employees';
import { fullName, recurringInclude, toRecurringTaskDto } from './staff.mapper';

@Injectable()
export class RecurringTasksService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RecurringTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(): Promise<RecurringTaskDto[]> {
    const rows = await this.tenant.db.recurringTask.findMany({
      include: recurringInclude,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(toRecurringTaskDto);
  }

  async create(input: RecurringTaskCreateDto): Promise<RecurringTaskDto> {
    if (input.employeeId) await activeEmployee(this.tenant, input.employeeId);
    const created = await this.tenant.db.recurringTask.create({
      data: {
        siteId: this.tenant.siteId,
        ...this.data(input),
        createdById: this.tenant.userId ?? null,
      },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'RecurringTask',
      entityId: created.id,
      after: input,
    });
    await this.generate(todayInIstanbul());
    return this.one(created.id);
  }

  async update(id: string, input: RecurringTaskUpdateDto): Promise<RecurringTaskDto> {
    const before = await this.tenant.db.recurringTask.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Tekrarlayan görev bulunamadı');
    if (input.employeeId && input.employeeId !== before.employeeId) {
      await activeEmployee(this.tenant, input.employeeId);
    }
    await this.tenant.db.recurringTask.update({ where: { id }, data: this.data(input) });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'RecurringTask',
      entityId: id,
      before,
      after: input,
    });
    await this.generate(todayInIstanbul());
    return this.one(id);
  }

  async remove(id: string): Promise<void> {
    const before = await this.tenant.db.recurringTask.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Tekrarlayan görev bulunamadı');
    await this.tenant.db.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { siteId: this.tenant.siteId, recurringTaskId: id },
        data: { recurringTaskId: null },
      });
      await tx.recurringTask.delete({ where: { id } });
    });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'RecurringTask',
      entityId: id,
      before,
    });
  }

  async generate(date: string): Promise<number> {
    const templates = await this.tenant.db.recurringTask.findMany({
      where: {
        isActive: true,
        startDate: { lte: dateOnly(date) },
        OR: [{ endDate: null }, { endDate: { gte: dateOnly(date) } }],
      },
      include: { employee: true },
    });
    const due = templates.filter((t) =>
      recurrenceMatches(
        {
          frequency: t.frequency,
          weekdays: t.weekdays,
          dayOfMonth: t.dayOfMonth,
          startDate: toDateString(t.startDate),
          endDate: t.endDate ? toDateString(t.endDate) : null,
        },
        date,
      ),
    );
    let created = 0;
    for (const template of due) {
      const employee = template.employee?.isActive ? template.employee : null;
      try {
        await this.tenant.db.$transaction(async (tx) => {
          const task = await tx.task.create({
            data: {
              siteId: this.tenant.siteId,
              title: template.title,
              description: template.description,
              employeeId: employee?.id ?? null,
              dueDate: dateOnly(date),
              priority: template.priority,
              recurringTaskId: template.id,
              occurrenceDate: dateOnly(date),
            },
          });
          await tx.taskEvent.create({
            data: {
              siteId: this.tenant.siteId,
              taskId: task.id,
              kind: 'CREATED',
              status: 'TODO',
              assigneeName: employee ? fullName(employee) : null,
            },
          });
        });
        created += 1;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
          throw error;
        }
      }
    }
    return created;
  }

  @Cron('0 10 0 * * *', { name: 'recurring-tasks', timeZone: 'Europe/Istanbul' })
  async daily(): Promise<void> {
    await this.generateAllSites(todayInIstanbul());
  }

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    void this.generateAllSites(todayInIstanbul()).catch((error: unknown) =>
      this.logger.error(`Tekrarlayan görevler oluşturulamadı: ${(error as Error).message}`),
    );
  }

  async generateAllSites(date: string): Promise<void> {
    const sites = await this.prisma.site.findMany({
      where: { recurringTasks: { some: { isActive: true } } },
      select: { id: true, name: true },
    });
    for (const site of sites) {
      await this.cls.run(async () => {
        this.cls.set('siteId', site.id);
        try {
          const created = await this.generate(date);
          if (created > 0)
            this.logger.log(`${site.name}: ${created} tekrarlayan görev oluşturuldu`);
        } catch (error) {
          this.logger.warn(
            `${site.name}: tekrarlayan görevler oluşturulamadı: ${(error as Error).message}`,
          );
        }
      });
    }
  }

  private data(input: RecurringTaskUpdateDto) {
    return {
      title: input.title,
      description: input.description ?? null,
      employeeId: input.employeeId ?? null,
      priority: input.priority,
      frequency: input.frequency,
      weekdays:
        input.frequency === 'WEEKLY' ? [...new Set(input.weekdays)].sort((a, b) => a - b) : [],
      dayOfMonth: input.frequency === 'MONTHLY' ? input.dayOfMonth : null,
      startDate: dateOnly(input.startDate),
      endDate: input.endDate ? dateOnly(input.endDate) : null,
      isActive: input.isActive,
    };
  }

  private async one(id: string): Promise<RecurringTaskDto> {
    const row = await this.tenant.db.recurringTask.findUnique({
      where: { id },
      include: recurringInclude,
    });
    if (!row) throw new NotFoundException('Tekrarlayan görev bulunamadı');
    return toRecurringTaskDto(row);
  }
}

@ApiTags('Çalışanlar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('recurring-tasks')
export class RecurringTasksController {
  constructor(private readonly recurring: RecurringTasksService) {}

  @Get()
  list(): Promise<RecurringTaskDto[]> {
    return this.recurring.list();
  }

  @Post()
  create(@Body() body: RecurringTaskCreateDto): Promise<RecurringTaskDto> {
    return this.recurring.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RecurringTaskUpdateDto,
  ): Promise<RecurringTaskDto> {
    return this.recurring.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.recurring.remove(id);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  taskStatusLabels,
  type TaskDetailDto,
  type TaskDto,
  type TaskEventKind,
  type TaskStatus,
} from '@apartman/shared';
import { dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import {
  TaskCreateDto,
  TaskListQueryDto,
  TaskNoteDto,
  TaskStatusChangeDto,
  TaskUpdateDto,
} from '../../common/staff.dto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { activeEmployee } from './employees';
import { fullName, OPEN_STATUSES, taskInclude, toTaskDto } from './staff.mapper';

interface EventInput {
  kind: TaskEventKind;
  status?: TaskStatus;
  assigneeName?: string | null;
  note?: string | null;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(query: TaskListQueryDto): Promise<TaskDto[]> {
    const today = todayInIstanbul();
    const view = query.view ?? 'open';
    const open = { status: { in: [...OPEN_STATUSES] } };
    const byView: Record<typeof view, Prisma.TaskWhereInput> = {
      open,
      overdue: { ...open, dueDate: { lt: dateOnly(today) } },
      done: { status: 'DONE' },
      cancelled: { status: 'CANCELLED' },
      all: {},
    };
    const orderBy: Prisma.TaskOrderByWithRelationInput[] =
      view === 'done' || view === 'cancelled'
        ? [{ updatedAt: 'desc' }]
        : [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }, { createdAt: 'asc' }];
    const rows = await this.tenant.db.task.findMany({
      where: { ...byView[view], ...(query.employeeId ? { employeeId: query.employeeId } : {}) },
      include: taskInclude,
      orderBy,
      take: 1000,
    });
    return rows.map((t) => toTaskDto(t, today));
  }

  async get(id: string): Promise<TaskDetailDto> {
    const task = await this.tenant.db.task.findUnique({
      where: { id },
      include: { ...taskInclude, events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!task) throw new NotFoundException('Görev bulunamadı');
    const userIds = [...new Set(task.events.map((e) => e.userId).filter((v) => v !== null))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, fullName(u)]));
    return {
      ...toTaskDto(task, todayInIstanbul()),
      events: task.events.map((e) => ({
        id: e.id,
        kind: e.kind,
        status: e.status,
        assigneeName: e.assigneeName,
        note: e.note,
        userName: e.userId ? (nameOf.get(e.userId) ?? null) : null,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async create(input: TaskCreateDto): Promise<TaskDetailDto> {
    const employee = input.employeeId ? await activeEmployee(this.tenant, input.employeeId) : null;
    const task = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          siteId: this.tenant.siteId,
          title: input.title,
          description: input.description ?? null,
          employeeId: employee?.id ?? null,
          dueDate: input.dueDate ? dateOnly(input.dueDate) : null,
          priority: input.priority,
          createdById: this.tenant.userId ?? null,
        },
      });
      await tx.taskEvent.create({
        data: this.event(created.id, {
          kind: 'CREATED',
          status: 'TODO',
          assigneeName: employee ? fullName(employee) : null,
        }),
      });
      return created;
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Task',
      entityId: task.id,
      after: input,
    });
    return this.get(task.id);
  }

  async update(id: string, input: TaskUpdateDto): Promise<TaskDetailDto> {
    const before = await this.tenant.db.task.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Görev bulunamadı');
    if (!OPEN_STATUSES.includes(before.status as (typeof OPEN_STATUSES)[number])) {
      throw new BadRequestException(
        'Tamamlanan veya iptal edilen görev düzenlenemez. Önce görevi yeniden açın.',
      );
    }
    const employeeId = input.employeeId ?? null;
    const reassigned = employeeId !== before.employeeId;
    const employee =
      reassigned && employeeId ? await activeEmployee(this.tenant, employeeId) : null;
    const dueDate = input.dueDate ?? null;
    const description = input.description ?? null;
    const edited =
      input.title !== before.title ||
      description !== before.description ||
      dueDate !== (before.dueDate ? toDateString(before.dueDate) : null) ||
      input.priority !== before.priority;

    await this.tenant.db.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: {
          title: input.title,
          description,
          employeeId,
          dueDate: dueDate ? dateOnly(dueDate) : null,
          priority: input.priority,
        },
      });
      if (reassigned) {
        await tx.taskEvent.create({
          data: this.event(id, {
            kind: 'ASSIGNED',
            assigneeName: employee ? fullName(employee) : null,
          }),
        });
      }
      if (edited) await tx.taskEvent.create({ data: this.event(id, { kind: 'EDITED' }) });
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Task',
      entityId: id,
      before,
      after: input,
    });
    return this.get(id);
  }

  async changeStatus(id: string, input: TaskStatusChangeDto): Promise<TaskDetailDto> {
    const before = await this.tenant.db.task.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Görev bulunamadı');
    if (before.status === input.status) {
      throw new BadRequestException(`Görev zaten "${taskStatusLabels[input.status]}" durumunda`);
    }
    await this.tenant.db.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: {
          status: input.status,
          completedAt: input.status === 'DONE' ? new Date() : null,
        },
      });
      await tx.taskEvent.create({
        data: this.event(id, { kind: 'STATUS', status: input.status, note: input.note }),
      });
    });
    await this.audit.record({
      action: 'STATUS',
      entityType: 'Task',
      entityId: id,
      before: { status: before.status },
      after: input,
    });
    return this.get(id);
  }

  async addNote(id: string, input: TaskNoteDto): Promise<TaskDetailDto> {
    const task = await this.tenant.db.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Görev bulunamadı');
    await this.tenant.db.taskEvent.create({
      data: this.event(id, { kind: 'NOTE', note: input.note }),
    });
    return this.get(id);
  }

  private event(taskId: string, input: EventInput): Prisma.TaskEventUncheckedCreateInput {
    return {
      siteId: this.tenant.siteId,
      taskId,
      kind: input.kind,
      status: input.status ?? null,
      assigneeName: input.assigneeName ?? null,
      note: input.note ?? null,
      userId: this.tenant.userId ?? null,
    };
  }
}

@ApiTags('Çalışanlar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Query() query: TaskListQueryDto): Promise<TaskDto[]> {
    return this.tasks.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TaskDetailDto> {
    return this.tasks.get(id);
  }

  @Post()
  create(@Body() body: TaskCreateDto): Promise<TaskDetailDto> {
    return this.tasks.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TaskUpdateDto,
  ): Promise<TaskDetailDto> {
    return this.tasks.update(id, body);
  }

  @Post(':id/status')
  @HttpCode(200)
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TaskStatusChangeDto,
  ): Promise<TaskDetailDto> {
    return this.tasks.changeStatus(id, body);
  }

  @Post(':id/notes')
  @HttpCode(200)
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TaskNoteDto,
  ): Promise<TaskDetailDto> {
    return this.tasks.addNote(id, body);
  }
}

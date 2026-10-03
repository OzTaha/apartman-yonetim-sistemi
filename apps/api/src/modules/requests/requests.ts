import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  OPEN_REQUEST_STATUSES,
  REQUEST_PHOTO_MAX,
  REQUEST_PHOTO_MAX_BYTES,
  requestCategoryLabels,
  requestCommentSchema,
  requestCreateSchema,
  requestListQuerySchema,
  requestStatusChangeSchema,
  requestStatusLabels,
  requestTaskSchema,
  staffMessageCategoryLabels,
  staffMessageSchema,
  staffMessageTitle,
  unitLabel,
  type MyRequestDetailDto,
  type MyRequestDto,
  type RequestStatus,
  type ServiceRequestDetailDto,
  type ServiceRequestDto,
} from '@apartman/shared';
import { createHash, randomUUID } from 'node:crypto';
import { createZodDto } from 'nestjs-zod';
import { activeOn, dateOnly } from '../../common/dates';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { TenantClient } from '../../tenancy/tenant-extension';
import { SiteRoles, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { PushService } from '../push/push';
import { cleanFileName, FileTooLargeFilter, type UploadedFileData } from '../finance/attachments';
import { nextCounter } from '../finance/finance.ledger';
import { FinanceModule } from '../finance/finance.module';
import { attachmentSelect, toAttachmentDto } from '../finance/finance.mapper';
import { detectFileType, FileStorage } from '../finance/storage';
import {
  NotificationsModule,
  NotificationsService,
  requestSubject,
} from '../notifications/notifications';
import { activeEmployee } from '../staff/employees';
import { fullName } from '../staff/staff.mapper';

class RequestCreateDto extends createZodDto(requestCreateSchema) {}
class RequestCommentDto extends createZodDto(requestCommentSchema) {}
class RequestStatusChangeDto extends createZodDto(requestStatusChangeSchema) {}
class RequestTaskDto extends createZodDto(requestTaskSchema) {}
class RequestListQueryDto extends createZodDto(requestListQuerySchema) {}
class StaffMessageDto extends createZodDto(staffMessageSchema) {}

type Tx = Pick<TenantClient, 'serviceRequest' | 'serviceRequestEvent'>;

const listInclude = {
  unit: { select: { number: true, blockId: true, block: { select: { name: true } } } },
  createdBy: { select: { firstName: true, lastName: true, phone: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.ServiceRequestInclude;

const detailInclude = {
  ...listInclude,
  task: {
    select: {
      id: true,
      status: true,
      employee: { select: { firstName: true, lastName: true } },
    },
  },
  attachments: { select: attachmentSelect, orderBy: { createdAt: 'asc' } },
  events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ServiceRequestInclude;

type ListRow = Prisma.ServiceRequestGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.ServiceRequestGetPayload<{ include: typeof detailInclude }>;

const isOpen = (status: RequestStatus) => OPEN_REQUEST_STATUSES.includes(status);

function toDto(r: ListRow): ServiceRequestDto {
  return {
    id: r.id,
    number: r.number,
    unitId: r.unitId,
    blockName: r.unit?.block.name ?? null,
    unitNumber: r.unit?.number ?? null,
    fromStaff: r.fromStaff,
    urgent: r.urgent,
    location: r.location,
    category: r.category,
    title: r.title,
    status: r.status,
    requesterName: fullName(r.createdBy),
    photoCount: r._count.attachments,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toMyDto(r: ListRow): MyRequestDto {
  return {
    id: r.id,
    number: r.number,
    unitId: r.unitId,
    blockName: r.unit?.block.name ?? null,
    unitNumber: r.unit?.number ?? null,
    fromStaff: r.fromStaff,
    urgent: r.urgent,
    location: r.location,
    category: r.category,
    title: r.title,
    status: r.status,
    unseen: Boolean(
      r.residentUpdatedAt && (!r.residentSeenAt || r.residentUpdatedAt > r.residentSeenAt),
    ),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function resolveRequestOfTask(
  tx: Tx,
  siteId: string,
  taskId: string,
  userId: string | null,
): Promise<string | null> {
  const request = await tx.serviceRequest.findFirst({
    where: { siteId, taskId, status: { in: [...OPEN_REQUEST_STATUSES] } },
    select: { id: true },
  });
  if (!request) return null;
  const now = new Date();
  await tx.serviceRequest.update({
    where: { id: request.id },
    data: { status: 'RESOLVED', resolvedAt: now, residentUpdatedAt: now },
  });
  await tx.serviceRequestEvent.create({
    data: {
      siteId,
      requestId: request.id,
      kind: 'STATUS',
      status: 'RESOLVED',
      note: 'İlgili görev tamamlandı.',
      userId,
    },
  });
  return request.id;
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly storage: FileStorage,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
  ) {}

  async mine(): Promise<MyRequestDto[]> {
    const rows = await this.tenant.db.serviceRequest.findMany({
      where: { createdById: this.tenant.userId },
      include: listInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map(toMyDto);
  }

  async myDetail(id: string): Promise<MyRequestDetailDto> {
    const row = await this.findOwn(id);
    await this.tenant.db.serviceRequest.update({
      where: { id },
      data: { residentSeenAt: new Date() },
    });
    const events = await this.eventDtos(row, true);
    return {
      ...toMyDto(row),
      unseen: false,
      description: row.description,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      photos: row.attachments.map(toAttachmentDto),
      events,
    };
  }

  async create(input: RequestCreateDto, files: UploadedFileData[] = []): Promise<MyRequestDto> {
    const userId = this.tenant.userId;
    const occupancy = await this.tenant.db.occupancy.findFirst({
      where: { unitId: input.unitId, userId, ...activeOn(), unit: { archivedAt: null } },
      include: {
        unit: { select: { number: true, blockId: true, block: { select: { name: true } } } },
      },
    });
    if (!occupancy || !userId) {
      throw new NotFoundException('Yalnızca oturduğunuz daire için talep açabilirsiniz');
    }
    const created = await this.store(
      {
        unitId: input.unitId,
        location: input.location,
        category: input.category,
        title: input.title,
        description: input.description,
      },
      files,
    );
    await this.audit.record({
      action: 'CREATE',
      entityType: 'ServiceRequest',
      entityId: created.id,
      after: { ...input, number: created.number, photos: files.length },
    });
    const kind = await this.tenant.siteKind();
    const unit = unitLabel(kind, occupancy.unit.block.name, occupancy.unit.number);
    await this.notifications.notifySiteStaff({
      siteId: this.tenant.siteId,
      blockId: occupancy.unit.blockId,
      subjectKey: requestSubject(created.id),
      title: `Yeni ${requestCategoryLabels[input.category].toLocaleLowerCase('tr')} talebi`,
      body: `${unit}: ${input.title}`,
      data: {
        requestId: created.id,
        number: created.number,
        blockName: occupancy.unit.block.name,
        unitNumber: occupancy.unit.number,
      },
      exclude: userId,
    });
    return this.myRow(created.id);
  }

  async createStaffMessage(
    input: StaffMessageDto,
    files: UploadedFileData[] = [],
  ): Promise<MyRequestDto> {
    const userId = this.tenant.userId!;
    const employee = await this.tenant.db.employee.findFirst({
      where: { userId, isActive: true },
      select: { firstName: true, lastName: true },
    });
    if (!employee) throw new NotFoundException('Görevli kaydınız bulunamadı');
    const title = staffMessageTitle(input.description);
    const created = await this.store(
      {
        unitId: null,
        fromStaff: true,
        urgent: input.urgent,
        location: 'COMMON',
        category: input.category,
        title,
        description: input.description,
      },
      files,
    );
    await this.audit.record({
      action: 'CREATE',
      entityType: 'ServiceRequest',
      entityId: created.id,
      after: { ...input, fromStaff: true, number: created.number, photos: files.length },
    });
    const topic = staffMessageCategoryLabels[input.category];
    await this.notifications.notifySiteStaff({
      siteId: this.tenant.siteId,
      blockId: null,
      subjectKey: requestSubject(created.id),
      title: `${input.urgent ? 'ACİL: ' : ''}Görevliden mesaj (${topic.toLocaleLowerCase('tr')})`,
      body: `${fullName(employee)}: ${title}`,
      data: { requestId: created.id, number: created.number, blockName: null, unitNumber: null },
      exclude: userId,
    });
    return this.myRow(created.id);
  }

  private async myRow(id: string): Promise<MyRequestDto> {
    const row = await this.tenant.db.serviceRequest.findUniqueOrThrow({
      where: { id },
      include: listInclude,
    });
    return toMyDto(row);
  }

  private async store(
    data: Pick<
      Prisma.ServiceRequestUncheckedCreateInput,
      'unitId' | 'fromStaff' | 'urgent' | 'location' | 'category' | 'title' | 'description'
    >,
    files: UploadedFileData[],
  ): Promise<{ id: string; number: number }> {
    const userId = this.tenant.userId!;
    if (files.length > REQUEST_PHOTO_MAX) {
      throw new BadRequestException(`En fazla ${REQUEST_PHOTO_MAX} fotoğraf eklenebilir`);
    }
    const photos = files.map((file) => {
      const type = file.buffer?.length ? detectFileType(file.buffer) : null;
      if (!type || type.mime === 'application/pdf') {
        throw new BadRequestException('Yalnızca JPG, PNG veya WEBP fotoğraf eklenebilir');
      }
      return { file, type, key: `${this.tenant.siteId}/${randomUUID()}.${type.ext}` };
    });

    const siteId = this.tenant.siteId;
    for (const p of photos) await this.storage.save(p.key, p.file.buffer);
    try {
      return await this.tenant.db.$transaction(async (tx) => {
        const number = await nextCounter(tx, siteId, 'service-request');
        const request = await tx.serviceRequest.create({
          data: { ...data, siteId, number, createdById: userId },
        });
        await tx.serviceRequestEvent.create({
          data: { siteId, requestId: request.id, kind: 'CREATED', userId, byResident: true },
        });
        for (const p of photos) {
          await tx.attachment.create({
            data: {
              siteId,
              fileName: cleanFileName(p.file.originalname, p.type.ext),
              mimeType: p.type.mime,
              sizeBytes: p.file.size,
              storageKey: p.key,
              sha256: createHash('sha256').update(p.file.buffer).digest('hex'),
              uploadedById: userId,
              requestId: request.id,
            },
          });
        }
        return { id: request.id, number: request.number };
      });
    } catch (error) {
      for (const p of photos) await this.storage.remove(p.key);
      throw error;
    }
  }

  async residentComment(id: string, input: RequestCommentDto): Promise<MyRequestDetailDto> {
    const row = await this.findOwn(id);
    if (!isOpen(row.status)) {
      throw new BadRequestException('Kapanan talebe mesaj yazılamaz. Gerekirse yeni talep açın.');
    }
    await this.tenant.db.$transaction(async (tx) => {
      await tx.serviceRequestEvent.create({
        data: {
          siteId: this.tenant.siteId,
          requestId: id,
          kind: 'COMMENT',
          note: input.note,
          userId: this.tenant.userId ?? null,
          byResident: true,
        },
      });
      await tx.serviceRequest.update({ where: { id }, data: { updatedAt: new Date() } });
    });
    await this.notifications.notifySiteStaff({
      siteId: this.tenant.siteId,
      blockId: row.unit?.blockId ?? null,
      subjectKey: requestSubject(id),
      title: `Talep #${row.number} için yeni mesaj`,
      body: input.note.length > 140 ? `${input.note.slice(0, 137)}...` : input.note,
      data: {
        requestId: id,
        number: row.number,
        blockName: row.unit?.block.name ?? null,
        unitNumber: row.unit?.number ?? null,
      },
      exclude: this.tenant.userId!,
    });
    return this.myDetail(id);
  }

  async withdraw(id: string): Promise<void> {
    const row = await this.findOwn(id);
    const handled = row.status !== 'NEW' || row.events.some((e) => !e.byResident);
    if (handled) {
      throw new ConflictException(
        'Yönetim bu talep üzerinde işlem yaptığı için talep geri çekilemez.',
      );
    }
    const files = await this.tenant.db.attachment.findMany({
      where: { requestId: id },
      select: { storageKey: true },
    });
    await this.tenant.db.$transaction(async (tx) => {
      await tx.attachment.deleteMany({ where: { siteId: this.tenant.siteId, requestId: id } });
      await tx.serviceRequest.delete({ where: { id } });
    });
    for (const f of files) await this.storage.remove(f.storageKey);
    await this.notifications.discard(requestSubject(id));
    await this.audit.record({
      action: 'DELETE',
      entityType: 'ServiceRequest',
      entityId: id,
      before: { number: row.number, title: row.title, category: row.category },
    });
  }

  async list(query: RequestListQueryDto): Promise<ServiceRequestDto[]> {
    const view = query.view ?? 'open';
    const status: Prisma.ServiceRequestWhereInput =
      view === 'all'
        ? {}
        : view === 'open'
          ? { status: { in: [...OPEN_REQUEST_STATUSES] } }
          : { status: view };
    const rows = await this.tenant.db.serviceRequest.findMany({
      where: {
        ...status,
        ...(query.category ? { category: query.category } : {}),
        ...this.scopeWhere(query.blockId),
      },
      include: listInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: 1000,
    });
    return rows.map(toDto);
  }

  async get(id: string): Promise<ServiceRequestDetailDto> {
    const row = await this.findScoped(id);
    const events = await this.eventDtos(row, false);
    return {
      ...toDto(row),
      description: row.description,
      requesterPhone: row.createdBy.phone,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      task: row.task
        ? {
            id: row.task.id,
            status: row.task.status,
            employeeName: row.task.employee ? fullName(row.task.employee) : null,
          }
        : null,
      photos: row.attachments.map(toAttachmentDto),
      events,
    };
  }

  async changeStatus(id: string, input: RequestStatusChangeDto): Promise<ServiceRequestDetailDto> {
    const row = await this.findScoped(id);
    if (row.status === input.status) {
      throw new BadRequestException(`Talep zaten "${requestStatusLabels[input.status]}" durumunda`);
    }
    const now = new Date();
    await this.tenant.db.$transaction(async (tx) => {
      await tx.serviceRequest.update({
        where: { id },
        data: {
          status: input.status,
          resolvedAt: input.status === 'RESOLVED' ? now : null,
          residentUpdatedAt: now,
        },
      });
      await tx.serviceRequestEvent.create({
        data: this.staffEvent(id, { kind: 'STATUS', status: input.status, note: input.note }),
      });
    });
    await this.notifications.resolve(requestSubject(id), this.tenant.userId ?? null);
    await this.audit.record({
      action: 'STATUS',
      entityType: 'ServiceRequest',
      entityId: id,
      before: { status: row.status },
      after: input,
    });
    this.push.send([row.createdById], {
      title: row.fromStaff ? 'Mesajınız güncellendi' : 'Talebiniz güncellendi',
      body: `"${row.title}" ${row.fromStaff ? 'mesajınızın' : 'talebinizin'} durumu: ${requestStatusLabels[input.status]}`,
      url: `/taleplerim/${id}`,
      tag: `request-${id}`,
    });
    return this.get(id);
  }

  async staffComment(id: string, input: RequestCommentDto): Promise<ServiceRequestDetailDto> {
    const row = await this.findScoped(id);
    await this.tenant.db.$transaction(async (tx) => {
      await tx.serviceRequestEvent.create({
        data: this.staffEvent(id, { kind: 'COMMENT', note: input.note }),
      });
      await tx.serviceRequest.update({ where: { id }, data: { residentUpdatedAt: new Date() } });
    });
    await this.notifications.resolve(requestSubject(id), this.tenant.userId ?? null);
    await this.audit.record({
      action: 'COMMENT',
      entityType: 'ServiceRequest',
      entityId: id,
      after: input,
    });
    this.push.send([row.createdById], {
      title: row.fromStaff ? 'Yönetim mesajınıza yanıt yazdı' : 'Yönetim talebinize yanıt yazdı',
      body: input.note.length > 140 ? `${input.note.slice(0, 137)}…` : input.note,
      url: `/taleplerim/${id}`,
      tag: `request-${id}`,
    });
    return this.get(id);
  }

  async createTask(id: string, input: RequestTaskDto): Promise<ServiceRequestDetailDto> {
    const row = await this.findScoped(id);
    if (!isOpen(row.status)) {
      throw new BadRequestException(
        'Kapanan talep için görev oluşturulamaz. Önce talebi yeniden açın.',
      );
    }
    if (row.task && row.task.status !== 'CANCELLED') {
      throw new ConflictException('Bu talep için zaten bir görev var');
    }
    const employee = input.employeeId ? await activeEmployee(this.tenant, input.employeeId) : null;
    const kind = await this.tenant.siteKind();
    const unit = row.unit
      ? unitLabel(kind, row.unit.block.name, row.unit.number)
      : 'Görevli mesajı';
    const where = row.location === 'COMMON' ? 'Ortak alan' : 'Daire içi';
    const siteId = this.tenant.siteId;
    const userId = this.tenant.userId ?? null;

    const task = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          siteId,
          title: `Talep #${row.number}: ${row.title}`.slice(0, 120),
          description:
            `${unit} · ${where} · ${fullName(row.createdBy)}\n\n${row.description}`.slice(0, 2000),
          employeeId: employee?.id ?? null,
          dueDate: input.dueDate ? dateOnly(input.dueDate) : null,
          priority: input.priority,
          createdById: userId,
        },
      });
      await tx.taskEvent.create({
        data: {
          siteId,
          taskId: created.id,
          kind: 'CREATED',
          status: 'TODO',
          assigneeName: employee ? fullName(employee) : null,
          userId,
        },
      });
      await tx.serviceRequest.update({
        where: { id },
        data: { taskId: created.id, status: 'IN_PROGRESS', residentUpdatedAt: new Date() },
      });
      await tx.serviceRequestEvent.create({
        data: this.staffEvent(id, {
          kind: 'TASK',
          note: employee ? `${fullName(employee)} görevlendirildi.` : null,
        }),
      });
      if (row.status !== 'IN_PROGRESS') {
        await tx.serviceRequestEvent.create({
          data: this.staffEvent(id, { kind: 'STATUS', status: 'IN_PROGRESS' }),
        });
      }
      return created;
    });
    await this.notifications.resolve(requestSubject(id), userId);
    await this.audit.record({
      action: 'CREATE_TASK',
      entityType: 'ServiceRequest',
      entityId: id,
      after: { ...input, taskId: task.id },
    });
    return this.get(id);
  }

  private staffEvent(
    requestId: string,
    input: { kind: 'STATUS' | 'COMMENT' | 'TASK'; status?: RequestStatus; note?: string | null },
  ): Prisma.ServiceRequestEventUncheckedCreateInput {
    return {
      siteId: this.tenant.siteId,
      requestId,
      kind: input.kind,
      status: input.status ?? null,
      note: input.note ?? null,
      userId: this.tenant.userId ?? null,
    };
  }

  private async findOwn(id: string): Promise<DetailRow> {
    const row = await this.tenant.db.serviceRequest.findFirst({
      where: { id, createdById: this.tenant.userId },
      include: detailInclude,
    });
    if (!row) throw new NotFoundException('Talep bulunamadı');
    return row;
  }

  private scopeWhere(blockId?: string): Prisma.ServiceRequestWhereInput {
    const unit: Prisma.UnitWhereInput = {
      ...this.tenant.unitScope(),
      ...(blockId ? { blockId } : {}),
    };
    return Object.keys(unit).length > 0 ? { unit } : {};
  }

  private async findScoped(id: string): Promise<DetailRow> {
    const row = await this.tenant.db.serviceRequest.findFirst({
      where: { id, ...this.scopeWhere() },
      include: detailInclude,
    });
    if (!row) throw new NotFoundException('Talep bulunamadı');
    return row;
  }

  private async eventDtos(row: DetailRow, forResident: boolean) {
    const userIds = [...new Set(row.events.map((e) => e.userId).filter((v) => v !== null))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, fullName(u)]));
    return row.events.map((e) => ({
      id: e.id,
      kind: e.kind,
      status: e.status,
      note: e.note,
      byResident: e.byResident,
      userName:
        forResident && !e.byResident ? 'Yönetim' : e.userId ? (nameOf.get(e.userId) ?? null) : null,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}

@ApiTags('Arıza ve talepler')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER', 'BLOCK_MANAGER', 'AUDITOR', 'RESIDENT', 'STAFF')
@Controller('requests/mine')
export class MyRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(): Promise<MyRequestDto[]> {
    return this.requests.mine();
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(
    FilesInterceptor('photos', REQUEST_PHOTO_MAX, {
      limits: { fileSize: REQUEST_PHOTO_MAX_BYTES, files: REQUEST_PHOTO_MAX },
    }),
  )
  @SiteRoles('SITE_MANAGER', 'BLOCK_MANAGER', 'AUDITOR', 'RESIDENT')
  create(
    @Body() body: RequestCreateDto,
    @UploadedFiles() files: UploadedFileData[] | undefined,
  ): Promise<MyRequestDto> {
    return this.requests.create(body, files ?? []);
  }

  @Post('staff-message')
  @SiteRoles('STAFF')
  @ApiConsumes('multipart/form-data')
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(
    FilesInterceptor('photos', REQUEST_PHOTO_MAX, {
      limits: { fileSize: REQUEST_PHOTO_MAX_BYTES, files: REQUEST_PHOTO_MAX },
    }),
  )
  createStaffMessage(
    @Body() body: StaffMessageDto,
    @UploadedFiles() files: UploadedFileData[] | undefined,
  ): Promise<MyRequestDto> {
    return this.requests.createStaffMessage(body, files ?? []);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<MyRequestDetailDto> {
    return this.requests.myDetail(id);
  }

  @Post(':id/comments')
  @HttpCode(200)
  comment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequestCommentDto,
  ): Promise<MyRequestDetailDto> {
    return this.requests.residentComment(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  withdraw(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.requests.withdraw(id);
  }
}

@ApiTags('Arıza ve talepler')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER', 'BLOCK_MANAGER')
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(@Query() query: RequestListQueryDto): Promise<ServiceRequestDto[]> {
    return this.requests.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceRequestDetailDto> {
    return this.requests.get(id);
  }

  @Post(':id/status')
  @HttpCode(200)
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequestStatusChangeDto,
  ): Promise<ServiceRequestDetailDto> {
    return this.requests.changeStatus(id, body);
  }

  @Post(':id/comments')
  @HttpCode(200)
  comment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequestCommentDto,
  ): Promise<ServiceRequestDetailDto> {
    return this.requests.staffComment(id, body);
  }

  @SiteRoles('SITE_MANAGER')
  @Post(':id/task')
  @HttpCode(200)
  createTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequestTaskDto,
  ): Promise<ServiceRequestDetailDto> {
    return this.requests.createTask(id, body);
  }
}

@Module({
  imports: [FinanceModule, NotificationsModule],
  controllers: [MyRequestsController, RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}

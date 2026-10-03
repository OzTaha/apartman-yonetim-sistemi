import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  addDays,
  DOOR_RETENTION_DAYS,
  employeeAccessSchema,
  employeeRoleLabels,
  expectedVisitorSchema,
  isTaskOverdue,
  packageCreateSchema,
  packageDeliverSchema,
  staffTaskStatusSchema,
  unitLabel,
  visitorArrivalSchema,
  type DoorOverviewDto,
  type DoorUnitDto,
  type EmployeeAccountDto,
  type InvitationDto,
  type MyDoorDto,
  type PackageDto,
  type SiteKind,
  type StaffMeDto,
  type VisitorDto,
} from '@apartman/shared';
import { createZodDto } from 'nestjs-zod';
import { generateOpaqueToken, sha256 } from '../../common/crypto';
import { activeOn, dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import type { Env } from '../../config/env';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteRoles, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { PushService } from '../push/push';
import { TasksService } from './tasks';

class EmployeeAccessDto extends createZodDto(employeeAccessSchema) {}
class PackageCreateDto extends createZodDto(packageCreateSchema) {}
class PackageDeliverDto extends createZodDto(packageDeliverSchema) {}
class VisitorArrivalDto extends createZodDto(visitorArrivalSchema) {}
class ExpectedVisitorDto extends createZodDto(expectedVisitorSchema) {}
class StaffTaskStatusDto extends createZodDto(staffTaskStatusSchema) {}

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const unitSelect = { number: true, block: { select: { name: true } } } as const;

@Injectable()
export class EmployeeAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private async employee(id: string) {
    const employee = await this.tenant.db.employee.findFirst({ where: { id } });
    if (!employee) throw new NotFoundException('Çalışan bulunamadı');
    return employee;
  }

  async status(id: string): Promise<EmployeeAccountDto> {
    const employee = await this.employee(id);
    const pending = await this.tenant.db.invitation.count({
      where: { employeeId: id, usedAt: null, expiresAt: { gt: new Date() } },
    });
    return {
      hasAccount: employee.userId !== null,
      doorAccess: employee.doorAccess,
      invitationPending: pending > 0,
    };
  }

  async invite(id: string): Promise<InvitationDto> {
    const employee = await this.employee(id);
    if (!employee.isActive) throw new BadRequestException('Pasif çalışana hesap açılamaz');
    if (!employee.phone) {
      throw new BadRequestException(
        'Hesap açmak için önce çalışanın telefon numarasını girin. Giriş bu numarayla yapılır.',
      );
    }
    if (employee.userId) throw new ConflictException('Bu çalışanın zaten bir hesabı var');
    await this.tenant.db.invitation.updateMany({
      where: { employeeId: id, usedAt: null },
      data: { expiresAt: new Date() },
    });
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    await this.tenant.db.invitation.create({
      data: {
        siteId: this.tenant.siteId,
        employeeId: id,
        tokenHash: sha256(token),
        expiresAt,
        createdById: this.tenant.userId ?? null,
      },
    });
    await this.audit.record({ action: 'INVITATION_CREATED', entityType: 'Employee', entityId: id });
    const webOrigin = this.config.get('WEB_ORIGIN', { infer: true }).replace(/\/$/, '');
    return { url: `${webOrigin}/davet/${token}`, expiresAt: expiresAt.toISOString() };
  }

  async setDoorAccess(id: string, input: EmployeeAccessDto): Promise<EmployeeAccountDto> {
    const employee = await this.employee(id);
    await this.tenant.db.employee.update({ where: { id }, data: { doorAccess: input.doorAccess } });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Employee',
      entityId: id,
      before: { doorAccess: employee.doorAccess },
      after: input,
    });
    return this.status(id);
  }

  async revoke(id: string): Promise<EmployeeAccountDto> {
    const employee = await this.employee(id);
    if (!employee.userId) throw new BadRequestException('Bu çalışanın hesabı yok');
    const userId = employee.userId;
    await this.tenant.db.$transaction(async (tx) => {
      await tx.employee.update({ where: { id }, data: { userId: null } });
      const membership = await tx.siteMembership.findFirst({
        where: { userId, role: 'STAFF' },
      });
      if (membership) {
        const resident = await tx.occupancy.count({ where: { userId, ...activeOn() } });
        if (resident > 0) {
          await tx.siteMembership.update({
            where: { id: membership.id },
            data: { role: 'RESIDENT' },
          });
        } else {
          await tx.siteMembership.delete({ where: { id: membership.id } });
        }
      }
    });
    await this.audit.record({ action: 'REVOKE', entityType: 'Employee', entityId: id });
    return this.status(id);
  }
}

@Injectable()
export class StaffMeService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly tasks: TasksService,
  ) {}

  async employee() {
    const employee = await this.tenant.db.employee.findFirst({
      where: { userId: this.tenant.userId, isActive: true },
    });
    if (!employee) throw new ForbiddenException('Çalışan kaydınız bulunamadı');
    return employee;
  }

  async me(): Promise<StaffMeDto> {
    const employee = await this.employee();
    const today = todayInIstanbul();
    const [tasks, shifts] = await Promise.all([
      this.tenant.db.task.findMany({
        where: { employeeId: employee.id, status: { in: ['TODO', 'IN_PROGRESS'] } },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      }),
      this.tenant.db.shift.findMany({
        where: {
          employeeId: employee.id,
          date: { gte: dateOnly(today), lte: dateOnly(addDays(today, 7)) },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
    ]);
    return {
      employeeId: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      role: employeeRoleLabels[employee.role],
      doorAccess: employee.doorAccess,
      tasks: tasks.map((t) => {
        const dueDate = t.dueDate ? toDateString(t.dueDate) : null;
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          dueDate,
          overdue: isTaskOverdue({ status: t.status, dueDate }, today),
        };
      }),
      shifts: shifts.map((s) => ({
        id: s.id,
        date: toDateString(s.date),
        startTime: s.startTime,
        endTime: s.endTime,
        note: s.note,
      })),
    };
  }

  async changeTask(taskId: string, input: StaffTaskStatusDto): Promise<StaffMeDto> {
    const employee = await this.employee();
    const task = await this.tenant.db.task.findFirst({
      where: { id: taskId, employeeId: employee.id },
    });
    if (!task) throw new NotFoundException('Görev bulunamadı');
    await this.tasks.changeStatus(taskId, input);
    return this.me();
  }
}

@Injectable()
export class DoorService {
  private readonly logger = new Logger(DoorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly push: PushService,
    private readonly staff: StaffMeService,
  ) {}

  private async assertDoorAccess() {
    if (this.tenant.role !== 'STAFF') return;
    const employee = await this.staff.employee();
    if (!employee.doorAccess) {
      throw new ForbiddenException('Kapı sayfasını kullanma yetkiniz yok');
    }
  }

  private label(kind: SiteKind, unit: { number: string; block: { name: string } }) {
    return unitLabel(kind, unit.block.name, unit.number);
  }

  private toPackage(
    kind: SiteKind,
    p: Prisma.PackageGetPayload<{ include: { unit: { select: typeof unitSelect } } }>,
  ): PackageDto {
    return {
      id: p.id,
      unitId: p.unitId,
      unitLabel: this.label(kind, p.unit),
      carrier: p.carrier,
      note: p.note,
      receivedAt: p.receivedAt.toISOString(),
      deliveredAt: p.deliveredAt?.toISOString() ?? null,
      deliveredTo: p.deliveredTo,
    };
  }

  private toVisitor(
    kind: SiteKind,
    v: Prisma.VisitorGetPayload<{ include: { unit: { select: typeof unitSelect } } }>,
  ): VisitorDto {
    return {
      id: v.id,
      unitId: v.unitId,
      unitLabel: this.label(kind, v.unit),
      name: v.name,
      plate: v.plate,
      note: v.note,
      expectedOn: v.expectedOn ? toDateString(v.expectedOn) : null,
      arrivedAt: v.arrivedAt?.toISOString() ?? null,
      createdByResident: v.createdByResident,
    };
  }

  private async assertUnit(unitId: string) {
    const unit = await this.tenant.db.unit.findFirst({
      where: { id: unitId, archivedAt: null, ...this.tenant.unitScope() },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException('Daire bulunamadı');
  }

  private async unitResidents(unitId: string): Promise<string[]> {
    const rows = await this.tenant.db.occupancy.findMany({
      where: { unitId, userId: { not: null }, ...activeOn() },
      select: { userId: true },
    });
    return rows.map((r) => r.userId!);
  }

  async units(): Promise<DoorUnitDto[]> {
    await this.assertDoorAccess();
    const kind = await this.tenant.siteKind();
    const rows = await this.tenant.db.unit.findMany({
      where: { archivedAt: null, ...this.tenant.unitScope() },
      select: {
        id: true,
        ...unitSelect,
        occupancies: { where: activeOn(), select: { firstName: true, lastName: true } },
      },
    });
    return rows
      .map((u) => ({
        id: u.id,
        label: this.label(kind, u),
        residents: u.occupancies.map((o) => `${o.firstName} ${o.lastName}`),
        sortKey: `${u.block.name}|${u.number.padStart(6, '0')}`,
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'tr', { numeric: true }))
      .map(({ sortKey: _sortKey, ...rest }) => rest);
  }

  async overview(): Promise<DoorOverviewDto> {
    await this.assertDoorAccess();
    const kind = await this.tenant.siteKind();
    const today = todayInIstanbul();
    const scope = { unit: this.tenant.unitScope() };
    const include = { unit: { select: unitSelect } };
    const [waiting, expected, recentVisitors, recentPackages] = await Promise.all([
      this.tenant.db.package.findMany({
        where: { deliveredAt: null, ...scope },
        include,
        orderBy: { receivedAt: 'desc' },
      }),
      this.tenant.db.visitor.findMany({
        where: { arrivedAt: null, expectedOn: { gte: dateOnly(today) }, ...scope },
        include,
        orderBy: [{ expectedOn: 'asc' }, { createdAt: 'asc' }],
      }),
      this.tenant.db.visitor.findMany({
        where: { arrivedAt: { not: null }, ...scope },
        include,
        orderBy: { arrivedAt: 'desc' },
        take: 20,
      }),
      this.tenant.db.package.findMany({
        where: { deliveredAt: { not: null }, ...scope },
        include,
        orderBy: { deliveredAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      waitingPackages: waiting.map((p) => this.toPackage(kind, p)),
      expectedVisitors: expected.map((v) => this.toVisitor(kind, v)),
      recentVisitors: recentVisitors.map((v) => this.toVisitor(kind, v)),
      recentPackages: recentPackages.map((p) => this.toPackage(kind, p)),
    };
  }

  async createPackage(input: PackageCreateDto): Promise<DoorOverviewDto> {
    await this.assertDoorAccess();
    await this.assertUnit(input.unitId);
    const created = await this.tenant.db.package.create({
      data: {
        siteId: this.tenant.siteId,
        unitId: input.unitId,
        carrier: input.carrier ?? null,
        note: input.note ?? null,
        receivedById: this.tenant.userId ?? null,
      },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Package',
      entityId: created.id,
      after: input,
    });
    this.push.send(await this.unitResidents(input.unitId), {
      title: 'Kargonuz geldi',
      body: input.carrier
        ? `${input.carrier} kargonuz kapıda/güvenlikte sizi bekliyor.`
        : 'Kargonuz kapıda/güvenlikte sizi bekliyor.',
      url: '/dairem',
      tag: `package-${created.id}`,
    });
    return this.overview();
  }

  async deliver(id: string, input: PackageDeliverDto): Promise<DoorOverviewDto> {
    await this.assertDoorAccess();
    const pkg = await this.tenant.db.package.findFirst({
      where: { id, unit: this.tenant.unitScope() },
    });
    if (!pkg) throw new NotFoundException('Kargo bulunamadı');
    if (pkg.deliveredAt) throw new ConflictException('Bu kargo zaten teslim edildi');
    await this.tenant.db.package.update({
      where: { id },
      data: {
        deliveredAt: new Date(),
        deliveredById: this.tenant.userId ?? null,
        deliveredTo: input.deliveredTo ?? null,
      },
    });
    await this.audit.record({
      action: 'DELIVER',
      entityType: 'Package',
      entityId: id,
      after: input,
    });
    return this.overview();
  }

  async recordArrival(input: VisitorArrivalDto): Promise<DoorOverviewDto> {
    await this.assertDoorAccess();
    await this.assertUnit(input.unitId);
    const created = await this.tenant.db.visitor.create({
      data: {
        siteId: this.tenant.siteId,
        unitId: input.unitId,
        name: input.name,
        plate: input.plate ?? null,
        note: input.note ?? null,
        arrivedAt: new Date(),
        createdById: this.tenant.userId ?? null,
        arrivalById: this.tenant.userId ?? null,
      },
    });
    this.notifyArrival(input.unitId, input.name, created.id);
    return this.overview();
  }

  async markArrived(id: string): Promise<DoorOverviewDto> {
    await this.assertDoorAccess();
    const visitor = await this.tenant.db.visitor.findFirst({
      where: { id, unit: this.tenant.unitScope() },
    });
    if (!visitor) throw new NotFoundException('Misafir bulunamadı');
    if (visitor.arrivedAt) throw new ConflictException('Bu misafirin geldiği zaten işaretlendi');
    await this.tenant.db.visitor.update({
      where: { id },
      data: { arrivedAt: new Date(), arrivalById: this.tenant.userId ?? null },
    });
    this.notifyArrival(visitor.unitId, visitor.name, id);
    return this.overview();
  }

  private notifyArrival(unitId: string, name: string, id: string) {
    void this.unitResidents(unitId).then((users) =>
      this.push.send(users, {
        title: 'Misafiriniz geldi',
        body: `${name} şu an girişte.`,
        url: '/dairem',
        tag: `visitor-${id}`,
      }),
    );
  }

  private async myUnitIds(): Promise<string[]> {
    const rows = await this.tenant.db.occupancy.findMany({
      where: { userId: this.tenant.userId, ...activeOn(), unit: { archivedAt: null } },
      select: { unitId: true },
    });
    return rows.map((r) => r.unitId);
  }

  async mine(): Promise<MyDoorDto> {
    const unitIds = await this.myUnitIds();
    if (unitIds.length === 0) return { packages: [], visitors: [] };
    const kind = await this.tenant.siteKind();
    const today = todayInIstanbul();
    const include = { unit: { select: unitSelect } };
    const [packages, visitors] = await Promise.all([
      this.tenant.db.package.findMany({
        where: { unitId: { in: unitIds }, deliveredAt: null },
        include,
        orderBy: { receivedAt: 'desc' },
      }),
      this.tenant.db.visitor.findMany({
        where: {
          unitId: { in: unitIds },
          OR: [
            { arrivedAt: null, expectedOn: { gte: dateOnly(today) } },
            { arrivedAt: { gte: dateOnly(addDays(today, -7)) } },
          ],
        },
        include,
        orderBy: [{ expectedOn: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);
    return {
      packages: packages.map((p) => this.toPackage(kind, p)),
      visitors: visitors.map((v) => this.toVisitor(kind, v)),
    };
  }

  async addExpected(input: ExpectedVisitorDto): Promise<MyDoorDto> {
    if (!(await this.myUnitIds()).includes(input.unitId)) {
      throw new ForbiddenException('Yalnızca kendi daireniz için misafir bildirebilirsiniz');
    }
    if (input.expectedOn < todayInIstanbul()) {
      throw new BadRequestException('Geçmiş bir gün seçilemez');
    }
    await this.tenant.db.visitor.create({
      data: {
        siteId: this.tenant.siteId,
        unitId: input.unitId,
        name: input.name,
        note: input.note ?? null,
        expectedOn: dateOnly(input.expectedOn),
        createdById: this.tenant.userId ?? null,
        createdByResident: true,
      },
    });
    return this.mine();
  }

  async removeExpected(id: string): Promise<MyDoorDto> {
    const unitIds = await this.myUnitIds();
    const visitor = await this.tenant.db.visitor.findFirst({
      where: { id, unitId: { in: unitIds }, arrivedAt: null },
    });
    if (!visitor) throw new NotFoundException('Misafir bulunamadı');
    await this.tenant.db.visitor.delete({ where: { id } });
    return this.mine();
  }

  @Cron('0 45 4 * * *', { name: 'door-retention', timeZone: 'Europe/Istanbul' })
  async purgeOld(): Promise<void> {
    const cutoff = dateOnly(addDays(todayInIstanbul(), -DOOR_RETENTION_DAYS));
    const [packages, visitors] = await Promise.all([
      this.prisma.package.deleteMany({ where: { receivedAt: { lt: cutoff } } }),
      this.prisma.visitor.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    ]);
    if (packages.count + visitors.count > 0) {
      this.logger.log(
        `Eski kapı kayıtları silindi: ${packages.count} kargo, ${visitors.count} misafir`,
      );
    }
  }
}

@ApiTags('Çalışanlar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('employees/:id/account')
export class EmployeeAccessController {
  constructor(private readonly access: EmployeeAccessService) {}

  @Get()
  status(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeAccountDto> {
    return this.access.status(id);
  }

  @Post('invitation')
  invite(@Param('id', ParseUUIDPipe) id: string): Promise<InvitationDto> {
    return this.access.invite(id);
  }

  @Patch()
  door(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EmployeeAccessDto,
  ): Promise<EmployeeAccountDto> {
    return this.access.setDoorAccess(id, body);
  }

  @Delete()
  @HttpCode(200)
  revoke(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeAccountDto> {
    return this.access.revoke(id);
  }
}

@ApiTags('Görevli')
@ApiBearerAuth()
@SiteScoped('STAFF')
@Controller('staff/me')
export class StaffMeController {
  constructor(private readonly staff: StaffMeService) {}

  @Get()
  me(): Promise<StaffMeDto> {
    return this.staff.me();
  }

  @Post('tasks/:taskId/status')
  @HttpCode(200)
  changeTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: StaffTaskStatusDto,
  ): Promise<StaffMeDto> {
    return this.staff.changeTask(taskId, body);
  }
}

@ApiTags('Kapı')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER', 'BLOCK_MANAGER', 'STAFF')
@Controller('door')
export class DoorController {
  constructor(private readonly door: DoorService) {}

  @Get()
  overview(): Promise<DoorOverviewDto> {
    return this.door.overview();
  }

  @Get('units')
  units(): Promise<DoorUnitDto[]> {
    return this.door.units();
  }

  @Post('packages')
  createPackage(@Body() body: PackageCreateDto): Promise<DoorOverviewDto> {
    return this.door.createPackage(body);
  }

  @Post('packages/:id/deliver')
  @HttpCode(200)
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PackageDeliverDto,
  ): Promise<DoorOverviewDto> {
    return this.door.deliver(id, body);
  }

  @Post('visitors')
  arrival(@Body() body: VisitorArrivalDto): Promise<DoorOverviewDto> {
    return this.door.recordArrival(body);
  }

  @Post('visitors/:id/arrive')
  @HttpCode(200)
  arrive(@Param('id', ParseUUIDPipe) id: string): Promise<DoorOverviewDto> {
    return this.door.markArrived(id);
  }

  @SiteRoles('SITE_MANAGER', 'BLOCK_MANAGER', 'AUDITOR', 'RESIDENT', 'STAFF')
  @Get('mine')
  mine(): Promise<MyDoorDto> {
    return this.door.mine();
  }

  @SiteRoles('SITE_MANAGER', 'BLOCK_MANAGER', 'AUDITOR', 'RESIDENT', 'STAFF')
  @Post('mine/visitors')
  addExpected(@Body() body: ExpectedVisitorDto): Promise<MyDoorDto> {
    return this.door.addExpected(body);
  }

  @SiteRoles('SITE_MANAGER', 'BLOCK_MANAGER', 'AUDITOR', 'RESIDENT', 'STAFF')
  @Delete('mine/visitors/:id')
  @HttpCode(200)
  removeExpected(@Param('id', ParseUUIDPipe) id: string): Promise<MyDoorDto> {
    return this.door.removeExpected(id);
  }
}

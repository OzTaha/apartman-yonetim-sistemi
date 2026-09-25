import {
  BadRequestException,
  Body,
  ConflictException,
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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { addDays, weekStartOf, type EmployeeDetailDto, type EmployeeDto } from '@apartman/shared';
import { dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import { EmployeeCreateDto, EmployeeUpdateDto } from '../../common/staff.dto';
import type { Employee } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { lockedThrough } from '../finance/finance.ledger';
import { toTransactionDto, transactionInclude } from '../finance/finance.mapper';
import {
  fullName,
  OPEN_STATUSES,
  shiftInclude,
  taskInclude,
  toShiftDto,
  toTaskDto,
} from './staff.mapper';

export async function activeEmployee(tenant: TenantContext, id: string): Promise<Employee> {
  const employee = await tenant.db.employee.findUnique({ where: { id } });
  if (!employee) throw new NotFoundException('Çalışan bulunamadı');
  if (!employee.isActive) throw new BadRequestException(`${fullName(employee)} pasif durumda`);
  return employee;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<EmployeeDto[]> {
    const today = dateOnly(todayInIstanbul());
    const [employees, open, overdue, paid] = await Promise.all([
      this.tenant.db.employee.findMany(),
      this.tenant.db.task.groupBy({
        by: ['employeeId'],
        where: { employeeId: { not: null }, status: { in: [...OPEN_STATUSES] } },
        _count: { _all: true },
      }),
      this.tenant.db.task.groupBy({
        by: ['employeeId'],
        where: {
          employeeId: { not: null },
          status: { in: [...OPEN_STATUSES] },
          dueDate: { lt: today },
        },
        _count: { _all: true },
      }),
      this.tenant.db.transaction.groupBy({
        by: ['employeeId'],
        where: { employeeId: { not: null }, type: 'EXPENSE', cancelledAt: null },
        _sum: { amountKurus: true },
      }),
    ]);
    const openBy = new Map(open.map((r) => [r.employeeId, r._count._all]));
    const overdueBy = new Map(overdue.map((r) => [r.employeeId, r._count._all]));
    const paidBy = new Map(paid.map((r) => [r.employeeId, r._sum.amountKurus ?? 0]));
    return employees
      .map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        role: e.role,
        phone: e.phone,
        startDate: e.startDate ? toDateString(e.startDate) : null,
        notes: e.notes,
        isActive: e.isActive,
        openTaskCount: openBy.get(e.id) ?? 0,
        overdueTaskCount: overdueBy.get(e.id) ?? 0,
        paidKurus: paidBy.get(e.id) ?? 0,
        createdAt: e.createdAt.toISOString(),
      }))
      .sort(
        (a, b) =>
          Number(b.isActive) - Number(a.isActive) || fullName(a).localeCompare(fullName(b), 'tr'),
      );
  }

  async get(id: string): Promise<EmployeeDetailDto> {
    const employee = (await this.list()).find((e) => e.id === id);
    if (!employee) throw new NotFoundException('Çalışan bulunamadı');
    const today = todayInIstanbul();
    const from = weekStartOf(today);
    const [tasks, shifts, payments, locked] = await Promise.all([
      this.tenant.db.task.findMany({
        where: { employeeId: id, status: { in: [...OPEN_STATUSES] } },
        include: taskInclude,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      }),
      this.tenant.db.shift.findMany({
        where: {
          employeeId: id,
          date: { gte: dateOnly(from), lte: dateOnly(addDays(from, 13)) },
        },
        include: shiftInclude,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.tenant.db.transaction.findMany({
        where: { employeeId: id, cancelledAt: null },
        include: transactionInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      lockedThrough(this.prisma, this.tenant.siteId),
    ]);
    return {
      ...employee,
      openTasks: tasks.map((t) => toTaskDto(t, today)),
      shifts: shifts.map(toShiftDto),
      payments: payments.map((p) => toTransactionDto(p, locked)),
    };
  }

  async create(input: EmployeeCreateDto): Promise<EmployeeDetailDto> {
    const employee = await this.tenant.db.employee.create({
      data: {
        siteId: this.tenant.siteId,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        phone: input.phone ?? null,
        startDate: input.startDate ? dateOnly(input.startDate) : null,
        notes: input.notes ?? null,
      },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Employee',
      entityId: employee.id,
      after: input,
    });
    return this.get(employee.id);
  }

  async update(id: string, input: EmployeeUpdateDto): Promise<EmployeeDetailDto> {
    const before = await this.tenant.db.employee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Çalışan bulunamadı');
    await this.tenant.db.employee.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        phone: input.phone ?? null,
        startDate: input.startDate ? dateOnly(input.startDate) : null,
        notes: input.notes ?? null,
        isActive: input.isActive,
      },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Employee',
      entityId: id,
      before,
      after: input,
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const employee = await this.tenant.db.employee.findUnique({
      where: { id },
      include: {
        _count: {
          select: { shifts: true, tasks: true, recurringTasks: true, transactions: true },
        },
      },
    });
    if (!employee) throw new NotFoundException('Çalışan bulunamadı');
    const { shifts, tasks, recurringTasks, transactions } = employee._count;
    if (shifts + tasks + recurringTasks + transactions > 0) {
      throw new ConflictException(
        'Vardiyası, görevi veya ödemesi olan çalışan silinemez. Bunun yerine pasif yapabilirsiniz.',
      );
    }
    await this.tenant.db.employee.delete({ where: { id } });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Employee',
      entityId: id,
      before: employee,
    });
  }
}

@ApiTags('Çalışanlar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(): Promise<EmployeeDto[]> {
    return this.employees.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeDetailDto> {
    return this.employees.get(id);
  }

  @Post()
  create(@Body() body: EmployeeCreateDto): Promise<EmployeeDetailDto> {
    return this.employees.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EmployeeUpdateDto,
  ): Promise<EmployeeDetailDto> {
    return this.employees.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.employees.remove(id);
  }
}

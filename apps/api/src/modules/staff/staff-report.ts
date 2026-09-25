import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  addDays,
  shiftMinutes,
  type StaffReportDto,
  type StaffReportRowDto,
} from '@apartman/shared';
import { dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import { FinanceReportQueryDto } from '../../common/finance.dto';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { fullName, OPEN_STATUSES } from './staff.mapper';

const istanbulMidnight = (date: string) => new Date(`${date}T00:00:00+03:00`);

@Injectable()
export class StaffReportService {
  constructor(private readonly tenant: TenantContext) {}

  async report(from: string, to: string): Promise<StaffReportDto> {
    const today = todayInIstanbul();
    const [employees, shifts, done, open, paid] = await Promise.all([
      this.tenant.db.employee.findMany(),
      this.tenant.db.shift.findMany({
        where: { date: { gte: dateOnly(from), lte: dateOnly(to) } },
        select: { employeeId: true, startTime: true, endTime: true },
      }),
      this.tenant.db.task.findMany({
        where: {
          status: 'DONE',
          completedAt: { gte: istanbulMidnight(from), lt: istanbulMidnight(addDays(to, 1)) },
        },
        select: { employeeId: true, dueDate: true, completedAt: true },
      }),
      this.tenant.db.task.findMany({
        where: { status: { in: [...OPEN_STATUSES] } },
        select: { employeeId: true, dueDate: true },
      }),
      this.tenant.db.transaction.groupBy({
        by: ['employeeId'],
        where: {
          employeeId: { not: null },
          type: 'EXPENSE',
          cancelledAt: null,
          date: { gte: dateOnly(from), lte: dateOnly(to) },
        },
        _sum: { amountKurus: true },
      }),
    ]);

    const rows = new Map<string, StaffReportRowDto>(
      employees.map((e) => [
        e.id,
        {
          employeeId: e.id,
          name: fullName(e),
          role: e.role,
          isActive: e.isActive,
          shiftCount: 0,
          shiftMinutes: 0,
          tasksDone: 0,
          tasksDoneLate: 0,
          tasksOpen: 0,
          tasksOverdue: 0,
          paidKurus: 0,
        },
      ]),
    );
    for (const s of shifts) {
      const row = rows.get(s.employeeId)!;
      row.shiftCount += 1;
      row.shiftMinutes += shiftMinutes(s.startTime, s.endTime);
    }
    for (const t of done) {
      const row = t.employeeId ? rows.get(t.employeeId) : undefined;
      if (!row) continue;
      row.tasksDone += 1;
      if (t.dueDate && todayInIstanbul(t.completedAt!) > toDateString(t.dueDate)) {
        row.tasksDoneLate += 1;
      }
    }
    let unassignedOpenTasks = 0;
    for (const t of open) {
      const row = t.employeeId ? rows.get(t.employeeId) : undefined;
      if (!row) {
        unassignedOpenTasks += 1;
        continue;
      }
      row.tasksOpen += 1;
      if (t.dueDate && toDateString(t.dueDate) < today) row.tasksOverdue += 1;
    }
    for (const p of paid) {
      const row = rows.get(p.employeeId!);
      if (row) row.paidKurus = p._sum.amountKurus ?? 0;
    }

    return {
      from,
      to,
      unassignedOpenTasks,
      rows: [...rows.values()]
        .filter(
          (r) => r.isActive || r.shiftCount + r.tasksDone + r.tasksOpen > 0 || r.paidKurus > 0,
        )
        .sort(
          (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'tr'),
        ),
    };
  }
}

@ApiTags('Çalışanlar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('staff')
export class StaffReportController {
  constructor(private readonly reports: StaffReportService) {}

  @Get('report')
  report(@Query() query: FinanceReportQueryDto): Promise<StaffReportDto> {
    return this.reports.report(query.from, query.to);
  }
}

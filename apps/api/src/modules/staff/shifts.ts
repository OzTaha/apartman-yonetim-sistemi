import {
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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  addDays,
  daysBetween,
  shiftsOverlap,
  WEEKDAY_SHORT,
  isoWeekday,
  type ShiftCopyResultDto,
  type ShiftDto,
  type ShiftTime,
} from '@apartman/shared';
import { dateOnly, toDateString } from '../../common/dates';
import { ShiftBodyDto, ShiftCopyDto, ShiftListQueryDto } from '../../common/staff.dto';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { activeEmployee } from './employees';
import { shiftInclude, toShiftDto } from './staff.mapper';

const describe = (s: ShiftTime) =>
  `${WEEKDAY_SHORT[isoWeekday(s.date) - 1]} ${s.startTime}–${s.endTime}`;

@Injectable()
export class ShiftsService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(query: ShiftListQueryDto): Promise<ShiftDto[]> {
    const rows = await this.tenant.db.shift.findMany({
      where: {
        date: { gte: dateOnly(query.from), lte: dateOnly(query.to) },
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      },
      include: shiftInclude,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map(toShiftDto);
  }

  async create(input: ShiftBodyDto): Promise<ShiftDto> {
    await activeEmployee(this.tenant, input.employeeId);
    await this.assertFree(input);
    const shift = await this.tenant.db.shift.create({
      data: {
        siteId: this.tenant.siteId,
        employeeId: input.employeeId,
        date: dateOnly(input.date),
        startTime: input.startTime,
        endTime: input.endTime,
        note: input.note ?? null,
        createdById: this.tenant.userId ?? null,
      },
      include: shiftInclude,
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Shift',
      entityId: shift.id,
      after: input,
    });
    return toShiftDto(shift);
  }

  async update(id: string, input: ShiftBodyDto): Promise<ShiftDto> {
    const before = await this.tenant.db.shift.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Vardiya bulunamadı');
    if (input.employeeId !== before.employeeId) await activeEmployee(this.tenant, input.employeeId);
    await this.assertFree(input, id);
    const shift = await this.tenant.db.shift.update({
      where: { id },
      data: {
        employeeId: input.employeeId,
        date: dateOnly(input.date),
        startTime: input.startTime,
        endTime: input.endTime,
        note: input.note ?? null,
      },
      include: shiftInclude,
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Shift',
      entityId: id,
      before,
      after: input,
    });
    return toShiftDto(shift);
  }

  async remove(id: string): Promise<void> {
    const shift = await this.tenant.db.shift.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException('Vardiya bulunamadı');
    await this.tenant.db.shift.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'Shift', entityId: id, before: shift });
  }

  async copyWeek(input: ShiftCopyDto): Promise<ShiftCopyResultDto> {
    const offset = daysBetween(input.sourceWeek, input.targetWeek);
    const source = await this.tenant.db.shift.findMany({
      where: {
        date: { gte: dateOnly(input.sourceWeek), lte: dateOnly(addDays(input.sourceWeek, 6)) },
        employee: { isActive: true },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    const existing = await this.tenant.db.shift.findMany({
      where: {
        date: {
          gte: dateOnly(addDays(input.targetWeek, -1)),
          lte: dateOnly(addDays(input.targetWeek, 7)),
        },
      },
    });
    const planned = existing.map((s) => ({ ...this.timeOf(s), employeeId: s.employeeId }));
    const rows: {
      siteId: string;
      employeeId: string;
      date: Date;
      startTime: string;
      endTime: string;
      note: string | null;
      createdById: string | null;
    }[] = [];
    let skipped = 0;
    for (const s of source) {
      const copy = {
        employeeId: s.employeeId,
        date: addDays(toDateString(s.date), offset),
        startTime: s.startTime,
        endTime: s.endTime,
      };
      if (planned.some((p) => p.employeeId === copy.employeeId && shiftsOverlap(p, copy))) {
        skipped += 1;
        continue;
      }
      planned.push(copy);
      rows.push({
        siteId: this.tenant.siteId,
        ...copy,
        date: dateOnly(copy.date),
        note: s.note,
        createdById: this.tenant.userId ?? null,
      });
    }
    if (rows.length > 0) await this.tenant.db.shift.createMany({ data: rows });
    const result = { created: rows.length, skipped };
    await this.audit.record({
      action: 'COPY_WEEK',
      entityType: 'Shift',
      entityId: input.targetWeek,
      after: { ...input, ...result },
    });
    return result;
  }

  private timeOf(s: { date: Date; startTime: string; endTime: string }): ShiftTime {
    return { date: toDateString(s.date), startTime: s.startTime, endTime: s.endTime };
  }

  private async assertFree(input: ShiftBodyDto, exceptId?: string) {
    const nearby = await this.tenant.db.shift.findMany({
      where: {
        employeeId: input.employeeId,
        date: { gte: dateOnly(addDays(input.date, -1)), lte: dateOnly(addDays(input.date, 1)) },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    const clash = nearby.map((s) => this.timeOf(s)).find((s) => shiftsOverlap(s, input));
    if (clash) {
      throw new ConflictException(
        `Bu çalışanın aynı saatlerde başka vardiyası var (${describe(clash)})`,
      );
    }
  }
}

@ApiTags('Çalışanlar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  list(@Query() query: ShiftListQueryDto): Promise<ShiftDto[]> {
    return this.shifts.list(query);
  }

  @Post()
  create(@Body() body: ShiftBodyDto): Promise<ShiftDto> {
    return this.shifts.create(body);
  }

  @Post('copy-week')
  @HttpCode(200)
  copyWeek(@Body() body: ShiftCopyDto): Promise<ShiftCopyResultDto> {
    return this.shifts.copyWeek(body);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: ShiftBodyDto): Promise<ShiftDto> {
    return this.shifts.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.shifts.remove(id);
  }
}

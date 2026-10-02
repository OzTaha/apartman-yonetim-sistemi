import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AUDIT_LIMIT,
  auditQuerySchema,
  type AuditLogDto,
  type AuditLogListDto,
} from '@apartman/shared';
import { createZodDto } from 'nestjs-zod';
import { dateOnly, toDateString } from '../../common/dates';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformAdminOnly } from '../../common/platform-admin.guard';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';

class AuditQueryDto extends createZodDto(auditQuerySchema) {}

const HIDDEN_KEY = /password|token|hash|secret/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !HIDDEN_KEY.test(key))
        .map(([key, v]) => [key, redact(v)]),
    );
  }
  return value;
}

const istanbulStart = (date: string) => new Date(`${date}T00:00:00+03:00`);

function nextDay(date: string): string {
  const d = dateOnly(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return toDateString(d);
}

@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(query: AuditQueryDto): Promise<AuditLogListDto> {
    const siteId = this.tenant.siteId;
    const [rows, actors] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          siteId,
          createdAt: { gte: istanbulStart(query.from), lt: istanbulStart(nextDay(query.to)) },
          ...(query.entityType ? { entityType: query.entityType } : {}),
          ...(query.action ? { action: query.action } : {}),
          ...(query.userId ? { userId: query.userId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: AUDIT_LIMIT + 1,
      }),
      this.prisma.auditLog.findMany({
        where: { siteId, userId: { not: null } },
        distinct: ['userId'],
        select: { userId: true },
      }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: actors.map((a) => a.userId!) } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    const items: AuditLogDto[] = rows.slice(0, AUDIT_LIMIT).map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      userId: r.userId,
      userName: r.userId ? (nameOf.get(r.userId) ?? null) : null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      before: redact(r.before),
      after: redact(r.after),
    }));
    return {
      items,
      truncated: rows.length > AUDIT_LIMIT,
      users: users
        .map((u) => ({ id: u.id, name: nameOf.get(u.id)! }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    };
  }
}

@ApiTags('İşlem geçmişi')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@PlatformAdminOnly()
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly logs: AuditLogService) {}

  @Get()
  list(@Query() query: AuditQueryDto): Promise<AuditLogListDto> {
    return this.logs.list(query);
  }
}

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService],
})
export class AuditLogModule {}

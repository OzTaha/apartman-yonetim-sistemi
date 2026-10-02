import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  officerAssignSchema,
  unitLabel,
  type ContactDto,
  type OfficerCandidateDto,
  type OfficerDto,
  type OfficerRole,
} from '@apartman/shared';
import { createZodDto } from 'nestjs-zod';
import { activeOn } from '../../common/dates';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';

class OfficerAssignDto extends createZodDto(officerAssignSchema) {}

const OFFICER_ROLES: OfficerRole[] = ['BLOCK_MANAGER', 'AUDITOR'];

@Injectable()
export class OfficersService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<OfficerDto[]> {
    const [memberships, labels] = await Promise.all([
      this.tenant.db.siteMembership.findMany({
        where: { role: { in: OFFICER_ROLES } },
        include: {
          user: {
            select: { firstName: true, lastName: true, phone: true, email: true },
          },
        },
      }),
      this.unitLabels(),
    ]);
    const blocks = await this.tenant.db.blockManager.findMany({
      where: { userId: { in: memberships.map((m) => m.userId) } },
      include: { block: { select: { name: true } } },
    });
    return memberships
      .map((m) => ({
        userId: m.userId,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        phone: m.user.phone,
        email: m.user.email,
        role: m.role as OfficerRole,
        blocks: blocks
          .filter((b) => b.userId === m.userId)
          .map((b) => ({ id: b.blockId, name: b.block.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true })),
        units: labels.get(m.userId) ?? [],
      }))
      .sort(
        (a, b) =>
          a.role.localeCompare(b.role) ||
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr'),
      );
  }

  async candidates(): Promise<OfficerCandidateDto[]> {
    const [labels, managers] = await Promise.all([
      this.unitLabels(),
      this.tenant.db.siteMembership.findMany({
        where: { role: 'SITE_MANAGER' },
        select: { userId: true },
      }),
    ]);
    const excluded = new Set(managers.map((m) => m.userId));
    const users = await this.tenant.db.occupancy.findMany({
      where: { userId: { not: null }, ...activeOn() },
      select: { userId: true, firstName: true, lastName: true },
      distinct: ['userId'],
    });
    return users
      .filter((u) => !excluded.has(u.userId!))
      .map((u) => ({
        userId: u.userId!,
        name: `${u.firstName} ${u.lastName}`,
        units: labels.get(u.userId!) ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  async assign(input: OfficerAssignDto): Promise<OfficerDto> {
    const membership = await this.tenant.db.siteMembership.findUnique({
      where: { siteId_userId: { siteId: this.tenant.siteId, userId: input.userId } },
    });
    if (!membership) {
      throw new NotFoundException(
        'Kişi bu sitede kayıtlı değil. Önce sakin olarak ekleyip davet bağlantısı gönderin.',
      );
    }
    if (membership.role === 'SITE_MANAGER') {
      throw new BadRequestException('Site yöneticisine ayrıca yetki verilmez');
    }
    const blockIds = input.role === 'BLOCK_MANAGER' ? [...new Set(input.blockIds)] : [];
    if (blockIds.length > 0) {
      const count = await this.tenant.db.block.count({ where: { id: { in: blockIds } } });
      if (count !== blockIds.length) throw new NotFoundException('Blok bulunamadı');
    }

    const siteId = this.tenant.siteId;
    await this.tenant.db.$transaction(async (tx) => {
      await tx.siteMembership.update({ where: { id: membership.id }, data: { role: input.role } });
      await tx.blockManager.deleteMany({ where: { siteId, userId: input.userId } });
      if (blockIds.length > 0) {
        await tx.blockManager.createMany({
          data: blockIds.map((blockId) => ({ siteId, blockId, userId: input.userId })),
        });
      }
    });
    await this.audit.record({
      action: 'OFFICER_ASSIGNED',
      entityType: 'SiteMembership',
      entityId: membership.id,
      before: { role: membership.role },
      after: { role: input.role, blockIds },
    });
    const officer = (await this.list()).find((o) => o.userId === input.userId);
    return officer!;
  }

  async remove(userId: string): Promise<void> {
    const siteId = this.tenant.siteId;
    const membership = await this.tenant.db.siteMembership.findUnique({
      where: { siteId_userId: { siteId, userId } },
    });
    if (!membership || !OFFICER_ROLES.includes(membership.role as OfficerRole)) {
      throw new NotFoundException('Yetkili bulunamadı');
    }
    const livesHere = await this.tenant.db.occupancy.count({ where: { userId, ...activeOn() } });
    await this.tenant.db.$transaction(async (tx) => {
      await tx.blockManager.deleteMany({ where: { siteId, userId } });
      if (livesHere > 0) {
        await tx.siteMembership.update({
          where: { id: membership.id },
          data: { role: 'RESIDENT' },
        });
      } else {
        await tx.siteMembership.delete({ where: { id: membership.id } });
      }
    });
    await this.audit.record({
      action: 'OFFICER_REMOVED',
      entityType: 'SiteMembership',
      entityId: membership.id,
      before: { role: membership.role },
    });
  }

  private async unitLabels(): Promise<Map<string, string[]>> {
    const kind = await this.tenant.siteKind();
    const occupancies = await this.tenant.db.occupancy.findMany({
      where: { userId: { not: null }, ...activeOn() },
      select: {
        userId: true,
        unit: { select: { number: true, block: { select: { name: true } } } },
      },
    });
    const labels = new Map<string, string[]>();
    for (const o of occupancies) {
      const list = labels.get(o.userId!) ?? [];
      list.push(unitLabel(kind, o.unit.block.name, o.unit.number));
      labels.set(o.userId!, list);
    }
    return labels;
  }
}

@Injectable()
export class ContactsService {
  constructor(private readonly tenant: TenantContext) {}

  async list(): Promise<ContactDto[]> {
    const blockIds = this.tenant.isResident ? await this.tenant.residentBlockIds() : null;
    const memberships = await this.tenant.db.siteMembership.findMany({
      where: { role: { in: ['SITE_MANAGER', 'BLOCK_MANAGER'] } },
      include: {
        user: { select: { firstName: true, lastName: true, phone: true, isActive: true } },
      },
    });
    const managed = await this.tenant.db.blockManager.findMany({
      where: { userId: { in: memberships.map((m) => m.userId) } },
      include: { block: { select: { name: true } } },
    });
    const kind = await this.tenant.siteKind();
    return memberships
      .filter((m) => m.user.isActive)
      .map((m) => {
        const own = managed.filter((b) => b.userId === m.userId);
        return {
          membership: m,
          own,
          visible:
            m.role === 'SITE_MANAGER' ||
            blockIds === null ||
            own.some((b) => blockIds.includes(b.blockId)),
        };
      })
      .filter((c) => c.visible)
      .map(({ membership: m, own }) => ({
        name: `${m.user.firstName} ${m.user.lastName}`,
        role: m.role as ContactDto['role'],
        blocks:
          kind === 'APARTMENT'
            ? []
            : own
                .map((b) => b.block.name)
                .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true })),
        phone: m.user.phone,
      }))
      .sort(
        (a, b) => a.role.localeCompare(b.role, 'en') * -1 || a.name.localeCompare(b.name, 'tr'),
      );
  }
}

@ApiTags('Yetkililer')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER', 'BLOCK_MANAGER', 'AUDITOR', 'RESIDENT')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(): Promise<ContactDto[]> {
    return this.contacts.list();
  }
}

@ApiTags('Yetkililer')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('officers')
export class OfficersController {
  constructor(private readonly officers: OfficersService) {}

  @Get()
  list(): Promise<OfficerDto[]> {
    return this.officers.list();
  }

  @Get('candidates')
  candidates(): Promise<OfficerCandidateDto[]> {
    return this.officers.candidates();
  }

  @Put()
  assign(@Body() body: OfficerAssignDto): Promise<OfficerDto> {
    return this.officers.assign(body);
  }

  @Delete(':userId')
  @HttpCode(204)
  remove(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    return this.officers.remove(userId);
  }
}

@Module({
  controllers: [OfficersController, ContactsController],
  providers: [OfficersService, ContactsService],
})
export class OfficersModule {}

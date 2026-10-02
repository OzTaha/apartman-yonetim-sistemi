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
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { InvitationDto, OccupancyDto } from '@apartman/shared';
import { generateOpaqueToken, sha256 } from '../../common/crypto';
import { activeOn, dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import {
  MoveOutDto,
  OccupancyCreateDto,
  OccupancyUpdateDto,
  ResidentListQueryDto,
} from '../../common/dto';
import type { Env } from '../../config/env';
import type { Prisma } from '../../generated/prisma/client';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import {
  NotificationsModule,
  NotificationsService,
  resetSubject,
} from '../notifications/notifications';
import { compareUnits, occupancyInclude, toOccupancyDto } from './occupancy.mapper';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class ResidentsService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ResidentListQueryDto): Promise<OccupancyDto[]> {
    const today = todayInIstanbul();
    const statusFilter: Prisma.OccupancyWhereInput =
      query.status === 'active'
        ? activeOn(today)
        : query.status === 'past'
          ? { endDate: { lte: dateOnly(today) } }
          : {};
    const search = query.search?.trim();

    const occupancies = await this.tenant.db.occupancy.findMany({
      where: {
        AND: [
          statusFilter,
          query.unitId ? { unitId: query.unitId } : {},
          query.blockId ? { unit: { blockId: query.blockId } } : {},
          { unit: this.tenant.unitScope() },
          search
            ? {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search.replace(/\D/g, '') || search } },
                ],
              }
            : {},
        ],
      },
      include: occupancyInclude,
    });

    return occupancies
      .map(toOccupancyDto)
      .sort(
        (a, b) =>
          compareUnits(
            { blockName: a.blockName, number: a.unitNumber },
            { blockName: b.blockName, number: b.unitNumber },
          ) || a.lastName.localeCompare(b.lastName, 'tr'),
      );
  }

  async create(input: OccupancyCreateDto): Promise<OccupancyDto> {
    const unit = await this.tenant.db.unit.findUnique({
      where: { id: input.unitId },
      select: { id: true, archivedAt: true },
    });
    if (!unit) throw new NotFoundException('Daire bulunamadı');
    await this.tenant.assertUnitInScope(unit.id);
    if (unit.archivedAt) throw new BadRequestException('Arşivlenmiş daireye sakin eklenemez');

    const occupancy = await this.tenant.db.occupancy.create({
      data: {
        siteId: this.tenant.siteId,
        unitId: input.unitId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        email: input.email ?? null,
        type: input.type,
        startDate: dateOnly(input.startDate),
        isResponsibleForDues: input.isResponsibleForDues,
        contactConsent: input.contactConsent,
        contactConsentAt: input.contactConsent ? new Date() : null,
        notes: input.notes ?? null,
      },
      include: occupancyInclude,
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Occupancy',
      entityId: occupancy.id,
      after: input,
    });
    if (input.type === 'OWNER') await this.setLandShare(input.unitId, input.landShare);
    return toOccupancyDto(occupancy);
  }

  private async setLandShare(unitId: string, landShare: number | null | undefined) {
    if (landShare == null) return;
    const unit = await this.tenant.db.unit.findUniqueOrThrow({ where: { id: unitId } });
    if (unit.landShare === landShare) return;
    await this.tenant.db.unit.update({ where: { id: unitId }, data: { landShare } });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Unit',
      entityId: unitId,
      before: { landShare: unit.landShare },
      after: { landShare },
    });
  }

  async update(id: string, input: OccupancyUpdateDto): Promise<OccupancyDto> {
    const before = await this.findOrThrow(id);
    if (input.startDate && before.endDate && dateOnly(input.startDate) > before.endDate) {
      throw new BadRequestException('Başlangıç tarihi taşınma tarihinden sonra olamaz');
    }

    const consentChanged =
      input.contactConsent !== undefined && input.contactConsent !== before.contactConsent;

    const occupancy = await this.tenant.db.occupancy.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        ...('phone' in input ? { phone: input.phone ?? null } : {}),
        ...('email' in input ? { email: input.email ?? null } : {}),
        ...('notes' in input ? { notes: input.notes ?? null } : {}),
        type: input.type,
        startDate: input.startDate ? dateOnly(input.startDate) : undefined,
        isResponsibleForDues: input.isResponsibleForDues,
        ...(consentChanged
          ? {
              contactConsent: input.contactConsent,
              contactConsentAt: input.contactConsent ? new Date() : null,
            }
          : {}),
      },
      include: occupancyInclude,
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Occupancy',
      entityId: id,
      before: toOccupancyDto(before),
      after: input,
    });
    if (occupancy.type === 'OWNER') await this.setLandShare(occupancy.unitId, input.landShare);
    return toOccupancyDto(occupancy);
  }

  async moveOut(id: string, input: MoveOutDto): Promise<OccupancyDto> {
    const before = await this.findOrThrow(id);
    const endDate = dateOnly(input.endDate);
    if (endDate < before.startDate) {
      throw new BadRequestException('Taşınma tarihi başlangıç tarihinden önce olamaz');
    }
    const occupancy = await this.tenant.db.occupancy.update({
      where: { id },
      data: { endDate },
      include: occupancyInclude,
    });
    await this.tenant.db.invitation.updateMany({
      where: { occupancyId: id, usedAt: null },
      data: { expiresAt: new Date() },
    });
    await this.audit.record({
      action: 'MOVE_OUT',
      entityType: 'Occupancy',
      entityId: id,
      before: { endDate: before.endDate ? toDateString(before.endDate) : null },
      after: input,
    });
    return toOccupancyDto(occupancy);
  }

  async undoMoveOut(id: string): Promise<OccupancyDto> {
    const before = await this.findOrThrow(id);
    if (!before.endDate) throw new BadRequestException('Bu sakin için taşınma kaydı yok');
    const unit = await this.tenant.db.unit.findUnique({
      where: { id: before.unitId },
      select: { archivedAt: true },
    });
    if (unit?.archivedAt) {
      throw new BadRequestException('Daire arşivde. Önce daireyi arşivden çıkarın.');
    }
    const occupancy = await this.tenant.db.occupancy.update({
      where: { id },
      data: { endDate: null },
      include: occupancyInclude,
    });
    await this.audit.record({
      action: 'UNDO_MOVE_OUT',
      entityType: 'Occupancy',
      entityId: id,
      before: { endDate: toDateString(before.endDate) },
      after: { endDate: null },
    });
    return toOccupancyDto(occupancy);
  }

  async createInvitation(id: string): Promise<InvitationDto> {
    const occupancy = await this.findOrThrow(id);
    if (occupancy.endDate && toDateString(occupancy.endDate) < todayInIstanbul()) {
      throw new BadRequestException('Taşınmış sakine davet gönderilemez');
    }
    if (!occupancy.phone && !occupancy.email) {
      throw new BadRequestException('Davet için sakinin telefon veya e-posta bilgisi gerekli');
    }
    if (occupancy.user?.passwordHash) {
      throw new ConflictException('Bu sakinin zaten bir hesabı var');
    }

    await this.tenant.db.invitation.updateMany({
      where: { occupancyId: id, usedAt: null },
      data: { expiresAt: new Date() },
    });

    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    await this.tenant.db.invitation.create({
      data: {
        siteId: this.tenant.siteId,
        occupancyId: id,
        tokenHash: sha256(token),
        expiresAt,
        createdById: this.tenant.userId ?? null,
      },
    });
    await this.audit.record({
      action: 'INVITATION_CREATED',
      entityType: 'Occupancy',
      entityId: id,
    });
    await this.notifications.resolve(resetSubject.occupancy(id), this.tenant.userId ?? null);

    const webOrigin = this.config.get('WEB_ORIGIN', { infer: true }).replace(/\/$/, '');
    return { url: `${webOrigin}/davet/${token}`, expiresAt: expiresAt.toISOString() };
  }

  async remove(id: string): Promise<void> {
    const occupancy = await this.findOrThrow(id);
    const siteId = this.tenant.siteId;
    const userId = occupancy.userId;
    let dropMembership = false;
    if (userId) {
      const membership = await this.tenant.db.siteMembership.findUnique({
        where: { siteId_userId: { siteId, userId } },
      });
      if (membership && membership.role !== 'RESIDENT') {
        throw new ConflictException(
          'Bu kişi sitede yetkili. Kaydı silmeden önce Yetkililer sayfasından yetkisini kaldırın.',
        );
      }
      const others = await this.tenant.db.occupancy.count({
        where: { userId, id: { not: id }, ...activeOn() },
      });
      dropMembership = Boolean(membership) && others === 0;
    }

    await this.tenant.db.$transaction(async (tx) => {
      await tx.occupancy.delete({ where: { id } });
      if (dropMembership) {
        await tx.siteMembership.deleteMany({ where: { siteId, userId: userId! } });
      }
    });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Occupancy',
      entityId: id,
      before: { ...toOccupancyDto(occupancy), membershipRemoved: dropMembership },
    });
    await this.notifications.resolve(resetSubject.occupancy(id), this.tenant.userId ?? null);
  }

  private async findOrThrow(id: string) {
    const occupancy = await this.tenant.db.occupancy.findUnique({
      where: { id, unit: this.tenant.unitScope() },
      include: occupancyInclude,
    });
    if (!occupancy) throw new NotFoundException('Sakin kaydı bulunamadı');
    return occupancy;
  }
}

@ApiTags('Sakinler')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER', 'BLOCK_MANAGER')
@Controller('residents')
export class ResidentsController {
  constructor(private readonly residents: ResidentsService) {}

  @Get()
  list(@Query() query: ResidentListQueryDto): Promise<OccupancyDto[]> {
    return this.residents.list(query);
  }

  @Post()
  create(@Body() body: OccupancyCreateDto): Promise<OccupancyDto> {
    return this.residents.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OccupancyUpdateDto,
  ): Promise<OccupancyDto> {
    return this.residents.update(id, body);
  }

  @Post(':id/move-out')
  @HttpCode(200)
  moveOut(@Param('id', ParseUUIDPipe) id: string, @Body() body: MoveOutDto): Promise<OccupancyDto> {
    return this.residents.moveOut(id, body);
  }

  @Post(':id/undo-move-out')
  @HttpCode(200)
  undoMoveOut(@Param('id', ParseUUIDPipe) id: string): Promise<OccupancyDto> {
    return this.residents.undoMoveOut(id);
  }

  @Post(':id/invitations')
  createInvitation(@Param('id', ParseUUIDPipe) id: string): Promise<InvitationDto> {
    return this.residents.createInvitation(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.residents.remove(id);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [ResidentsController],
  providers: [ResidentsService],
})
export class ResidentsModule {}

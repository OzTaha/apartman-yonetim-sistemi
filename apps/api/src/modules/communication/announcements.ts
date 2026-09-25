import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  announcementAudienceLabels,
  type AnnouncementDetailDto,
  type AnnouncementDto,
  type ResidentAnnouncementDto,
} from '@apartman/shared';
import { dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import { AnnouncementCreateDto, AnnouncementUpdateDto } from '../../common/communication.dto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteRoles, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { attachmentSelect, toAttachmentDto } from '../finance/finance.mapper';
import { FileStorage } from '../finance/storage';
import { compareUnits } from '../residents/occupancy.mapper';
import {
  announcementStats,
  audienceOf,
  portalMembers,
  residentAnnouncementWhere,
} from './audience';
import { CampaignsService } from './campaigns';

const announcementInclude = {
  attachments: { select: attachmentSelect, orderBy: { createdAt: 'asc' } },
  campaigns: { select: { id: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.AnnouncementInclude;

type AnnouncementRow = Prisma.AnnouncementGetPayload<{ include: typeof announcementInclude }>;

const ordering: Prisma.AnnouncementOrderByWithRelationInput[] = [
  { pinned: 'desc' },
  { publishedAt: 'desc' },
];

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly storage: FileStorage,
    private readonly campaigns: CampaignsService,
  ) {}

  async list(): Promise<AnnouncementDto[]> {
    const rows = await this.tenant.db.announcement.findMany({
      include: announcementInclude,
      orderBy: ordering,
    });
    return this.toDtos(rows);
  }

  async get(id: string): Promise<AnnouncementDetailDto> {
    const row = await this.tenant.db.announcement.findUnique({
      where: { id },
      include: announcementInclude,
    });
    if (!row) throw new NotFoundException('Duyuru bulunamadı');
    const [[dto], members, reads] = await Promise.all([
      this.toDtos([row]),
      portalMembers(this.tenant),
      this.tenant.db.announcementRead.findMany({ where: { announcementId: id } }),
    ]);
    const readAt = new Map(reads.map((r) => [r.userId, r.readAt]));
    return {
      ...dto!,
      readers: audienceOf(row, members)
        .map((m) => ({
          name: m.name,
          blockName: m.blockName,
          unitNumber: m.unitNumber,
          number: m.unitNumber,
          readAt: readAt.get(m.userId)?.toISOString() ?? null,
        }))
        .sort((a, b) => Number(!a.readAt) - Number(!b.readAt) || compareUnits(a, b))
        .map(({ number: _number, ...r }) => r),
    };
  }

  async create(input: AnnouncementCreateDto): Promise<AnnouncementDto> {
    await this.assertTargets(input);
    const created = await this.tenant.db.announcement.create({
      data: { siteId: this.tenant.siteId, ...this.data(input), createdById: this.tenant.userId },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Announcement',
      entityId: created.id,
      after: input,
    });
    if (input.notify) {
      await this.campaigns.send(
        {
          kind: 'ANNOUNCEMENT',
          channel: input.notify.channel,
          filter: input.audience,
          blockIds: input.blockIds,
          unitIds: input.unitIds,
          body: input.notify.body,
        },
        { announcementId: created.id },
      );
    }
    return this.one(created.id);
  }

  async update(id: string, input: AnnouncementUpdateDto): Promise<AnnouncementDto> {
    const before = await this.tenant.db.announcement.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Duyuru bulunamadı');
    await this.assertTargets(input, before.expiresAt);
    await this.tenant.db.announcement.update({ where: { id }, data: this.data(input) });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Announcement',
      entityId: id,
      before,
      after: input,
    });
    return this.one(id);
  }

  async remove(id: string): Promise<void> {
    const before = await this.tenant.db.announcement.findUnique({
      where: { id },
      include: { attachments: { select: { storageKey: true } } },
    });
    if (!before) throw new NotFoundException('Duyuru bulunamadı');
    const siteId = this.tenant.siteId;
    await this.tenant.db.$transaction(async (tx) => {
      await tx.attachment.deleteMany({ where: { siteId, announcementId: id } });
      await tx.messageCampaign.updateMany({
        where: { siteId, announcementId: id },
        data: { announcementId: null },
      });
      await tx.announcement.delete({ where: { id } });
    });
    await Promise.all(before.attachments.map((a) => this.storage.remove(a.storageKey)));
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Announcement',
      entityId: id,
      before: { ...before, attachments: before.attachments.length },
    });
  }

  async mine(): Promise<ResidentAnnouncementDto[]> {
    const userId = this.tenant.userId!;
    const where = await residentAnnouncementWhere(this.tenant, userId);
    if (!where) return [];
    const rows = await this.tenant.db.announcement.findMany({
      where,
      include: {
        attachments: announcementInclude.attachments,
        reads: { where: { userId }, select: { id: true } },
      },
      orderBy: ordering,
    });
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      pinned: a.pinned,
      expiresAt: a.expiresAt ? toDateString(a.expiresAt) : null,
      publishedAt: a.publishedAt.toISOString(),
      attachments: a.attachments.map(toAttachmentDto),
      read: a.reads.length > 0,
    }));
  }

  async markRead(id: string): Promise<void> {
    const userId = this.tenant.userId!;
    const where = await residentAnnouncementWhere(this.tenant, userId);
    const visible =
      where && (await this.tenant.db.announcement.count({ where: { AND: [{ id }, where] } }));
    if (!visible) throw new NotFoundException('Duyuru bulunamadı');
    await this.tenant.db.announcementRead.upsert({
      where: { announcementId_userId: { announcementId: id, userId } },
      create: { siteId: this.tenant.siteId, announcementId: id, userId },
      update: {},
    });
  }

  private data(input: AnnouncementUpdateDto) {
    return {
      title: input.title,
      body: input.body,
      audience: input.audience,
      blockIds: input.audience === 'BLOCKS' ? [...new Set(input.blockIds)] : [],
      unitIds: input.audience === 'UNITS' ? [...new Set(input.unitIds)] : [],
      pinned: input.pinned,
      expiresAt: input.expiresAt ? dateOnly(input.expiresAt) : null,
    };
  }

  private async assertTargets(input: AnnouncementUpdateDto, previousExpiry?: Date | null) {
    const unchanged =
      previousExpiry !== undefined &&
      (previousExpiry ? toDateString(previousExpiry) : null) === (input.expiresAt ?? null);
    if (input.expiresAt && input.expiresAt < todayInIstanbul() && !unchanged) {
      throw new BadRequestException('Bitiş tarihi geçmiş bir gün olamaz');
    }
    if (input.audience === 'BLOCKS') {
      const ids = [...new Set(input.blockIds)];
      const count = await this.tenant.db.block.count({ where: { id: { in: ids } } });
      if (count !== ids.length) throw new BadRequestException('Blok bulunamadı');
    }
    if (input.audience === 'UNITS') {
      const ids = [...new Set(input.unitIds)];
      const count = await this.tenant.db.unit.count({ where: { id: { in: ids } } });
      if (count !== ids.length) throw new BadRequestException('Daire bulunamadı');
    }
  }

  private async one(id: string): Promise<AnnouncementDto> {
    const row = await this.tenant.db.announcement.findUnique({
      where: { id },
      include: announcementInclude,
    });
    if (!row) throw new NotFoundException('Duyuru bulunamadı');
    const [dto] = await this.toDtos([row]);
    return dto!;
  }

  private async toDtos(rows: AnnouncementRow[]): Promise<AnnouncementDto[]> {
    if (rows.length === 0) return [];
    const today = todayInIstanbul();
    const blockIds = [...new Set(rows.flatMap((r) => r.blockIds))];
    const userIds = [
      ...new Set(rows.map((r) => r.createdById).filter((v): v is string => v !== null)),
    ];
    const [stats, blocks, users] = await Promise.all([
      announcementStats(this.tenant, rows),
      blockIds.length ? this.tenant.db.block.findMany({ where: { id: { in: blockIds } } }) : [],
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [],
    ]);
    const blockName = new Map(blocks.map((b) => [b.id, `${b.name} Blok`]));
    const userName = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    return rows.map((a) => {
      const expiresAt = a.expiresAt ? toDateString(a.expiresAt) : null;
      return {
        id: a.id,
        title: a.title,
        body: a.body,
        audience: a.audience,
        blockIds: a.blockIds,
        unitIds: a.unitIds,
        targetLabel:
          a.audience === 'BLOCKS'
            ? a.blockIds.map((id) => blockName.get(id) ?? 'Silinmiş blok').join(', ')
            : a.audience === 'UNITS'
              ? `${a.unitIds.length} daire`
              : announcementAudienceLabels.ALL,
        pinned: a.pinned,
        expiresAt,
        expired: expiresAt !== null && expiresAt < today,
        publishedAt: a.publishedAt.toISOString(),
        createdByName: a.createdById ? (userName.get(a.createdById) ?? null) : null,
        attachments: a.attachments.map(toAttachmentDto),
        readCount: stats.get(a.id)?.readCount ?? 0,
        audienceCount: stats.get(a.id)?.audienceCount ?? 0,
        campaignId: a.campaigns[0]?.id ?? null,
      };
    });
  }
}

@ApiTags('İletişim')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(): Promise<AnnouncementDto[]> {
    return this.announcements.list();
  }

  @SiteRoles('SITE_MANAGER', 'RESIDENT')
  @Get('mine')
  mine(): Promise<ResidentAnnouncementDto[]> {
    return this.announcements.mine();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AnnouncementDetailDto> {
    return this.announcements.get(id);
  }

  @Post()
  create(@Body() body: AnnouncementCreateDto): Promise<AnnouncementDto> {
    return this.announcements.create(body);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AnnouncementUpdateDto,
  ): Promise<AnnouncementDto> {
    return this.announcements.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.announcements.remove(id);
  }

  @SiteRoles('SITE_MANAGER', 'RESIDENT')
  @Post(':id/read')
  @HttpCode(204)
  markRead(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.announcements.markRead(id);
  }
}

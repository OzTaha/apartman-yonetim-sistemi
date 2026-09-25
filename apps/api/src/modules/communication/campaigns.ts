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
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  CampaignDetailDto,
  CampaignDto,
  CampaignPreviewDto,
  campaignSchema,
  DeliveryStatus,
} from '@apartman/shared';
import type { z } from 'zod';
import { CampaignDto as CampaignBody } from '../../common/communication.dto';
import type { MessageCampaign } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { MessageQueue } from './message.queue';
import { RecipientsService } from './recipients';

export interface SendOptions {
  announcementId?: string;
  autoKey?: string;
  onlyUnitIds?: string[];
}

type CampaignRequest = z.output<typeof campaignSchema>;

const emptyCounts = (): Record<DeliveryStatus, number> => ({
  QUEUED: 0,
  SENT: 0,
  FAILED: 0,
  SKIPPED: 0,
});

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly recipients: RecipientsService,
    private readonly queue: MessageQueue,
  ) {}

  async preview(input: CampaignRequest): Promise<CampaignPreviewDto> {
    const list = await this.recipients.resolve(this.query(input));
    const sendable = list.filter((r) => !r.skipReason);
    const first = sendable[0];
    return {
      recipients: sendable.length,
      skippedNoConsent: list.filter((r) => r.skipReason === 'İletişim onayı yok').length,
      skippedNoPhone: list.filter((r) => r.skipReason === 'Telefon numarası yok').length,
      sample: first
        ? {
            name: first.name,
            blockName: first.blockName,
            unitNumber: first.unitNumber,
            phone: first.phone!,
            text: this.recipients.render(input.body, first),
          }
        : null,
    };
  }

  async send(input: CampaignRequest, options: SendOptions = {}): Promise<CampaignDto | null> {
    const list = await this.recipients.resolve({
      ...this.query(input),
      onlyUnitIds: options.onlyUnitIds,
    });
    if (!list.some((r) => !r.skipReason)) {
      if (options.announcementId || options.autoKey) return null;
      throw new BadRequestException(
        'Mesaj gönderilecek kimse yok. Seçilen dairelerde iletişim onayı ve telefonu olan sakin bulunmuyor.',
      );
    }
    const siteId = this.tenant.siteId;
    const campaign = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.messageCampaign.create({
        data: {
          siteId,
          kind: input.kind,
          channel: input.channel,
          filter: input.filter,
          blockIds: input.filter === 'BLOCKS' ? input.blockIds : [],
          unitIds: input.filter === 'UNITS' ? input.unitIds : (options.onlyUnitIds ?? []),
          body: input.body,
          announcementId: options.announcementId ?? null,
          autoKey: options.autoKey ?? null,
          createdById: options.autoKey ? null : (this.tenant.userId ?? null),
        },
      });
      await tx.messageDelivery.createMany({
        data: list.map((r) => ({
          siteId,
          campaignId: created.id,
          occupancyId: r.occupancyId,
          name: r.name,
          blockName: r.blockName,
          unitNumber: r.unitNumber,
          phone: r.phone,
          text: this.recipients.render(input.body, r),
          status: r.skipReason ? ('SKIPPED' as const) : ('QUEUED' as const),
          error: r.skipReason,
        })),
      });
      return created;
    });
    const queued = await this.tenant.db.messageDelivery.findMany({
      where: { campaignId: campaign.id, status: 'QUEUED' },
      select: { id: true },
    });
    await this.queue.enqueue(queued.map((d) => d.id));
    await this.audit.record({
      action: 'SEND',
      entityType: 'MessageCampaign',
      entityId: campaign.id,
      after: { ...input, ...options, recipients: queued.length },
    });
    return this.one(campaign.id);
  }

  async list(): Promise<CampaignDto[]> {
    const campaigns = await this.tenant.db.messageCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return this.toDtos(campaigns);
  }

  async get(id: string): Promise<CampaignDetailDto> {
    const [campaign, deliveries] = await Promise.all([
      this.one(id),
      this.tenant.db.messageDelivery.findMany({
        where: { campaignId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      ...campaign,
      deliveries: deliveries.map((d) => ({
        id: d.id,
        name: d.name,
        blockName: d.blockName,
        unitNumber: d.unitNumber,
        phone: d.phone,
        text: d.text,
        status: d.status,
        error: d.error,
        attempts: d.attempts,
        sentAt: d.sentAt?.toISOString() ?? null,
      })),
    };
  }

  async retry(id: string): Promise<CampaignDto> {
    await this.one(id);
    const failed = await this.tenant.db.messageDelivery.findMany({
      where: { campaignId: id, status: 'FAILED' },
      select: { id: true },
    });
    if (failed.length === 0) throw new BadRequestException('Yeniden denenecek mesaj yok');
    await this.tenant.db.messageDelivery.updateMany({
      where: { id: { in: failed.map((d) => d.id) } },
      data: { status: 'QUEUED', error: null },
    });
    await this.queue.enqueue(failed.map((d) => d.id));
    await this.audit.record({
      action: 'RETRY',
      entityType: 'MessageCampaign',
      entityId: id,
      after: { deliveries: failed.length },
    });
    return this.one(id);
  }

  private query(input: CampaignRequest) {
    return {
      filter: input.filter,
      blockIds: input.blockIds,
      unitIds: input.unitIds,
      duesOnly: input.kind === 'DUES_REMINDER',
    };
  }

  private async one(id: string): Promise<CampaignDto> {
    const campaign = await this.tenant.db.messageCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Gönderim bulunamadı');
    const [dto] = await this.toDtos([campaign]);
    return dto!;
  }

  private async toDtos(campaigns: MessageCampaign[]): Promise<CampaignDto[]> {
    if (campaigns.length === 0) return [];
    const ids = campaigns.map((c) => c.id);
    const userIds = [
      ...new Set(campaigns.map((c) => c.createdById).filter((v): v is string => v !== null)),
    ];
    const [counts, users] = await Promise.all([
      this.tenant.db.messageDelivery.groupBy({
        by: ['campaignId', 'status'],
        where: { campaignId: { in: ids } },
        _count: { _all: true },
      }),
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [],
    ]);
    const byCampaign = new Map<string, Record<DeliveryStatus, number>>();
    for (const row of counts) {
      const acc = byCampaign.get(row.campaignId) ?? emptyCounts();
      acc[row.status] = row._count._all;
      byCampaign.set(row.campaignId, acc);
    }
    const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    return campaigns.map((c) => {
      const n = byCampaign.get(c.id) ?? emptyCounts();
      return {
        id: c.id,
        kind: c.kind,
        channel: c.channel,
        filter: c.filter,
        body: c.body,
        automatic: c.autoKey !== null,
        announcementId: c.announcementId,
        createdByName: c.createdById ? (nameOf.get(c.createdById) ?? null) : null,
        createdAt: c.createdAt.toISOString(),
        counts: { queued: n.QUEUED, sent: n.SENT, failed: n.FAILED, skipped: n.SKIPPED },
      };
    });
  }
}

@ApiTags('İletişim')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('messages')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(): Promise<CampaignDto[]> {
    return this.campaigns.list();
  }

  @Post('preview')
  @HttpCode(200)
  preview(@Body() body: CampaignBody): Promise<CampaignPreviewDto> {
    return this.campaigns.preview(body);
  }

  @Post()
  async send(@Body() body: CampaignBody): Promise<CampaignDto> {
    return (await this.campaigns.send(body))!;
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CampaignDetailDto> {
    return this.campaigns.get(id);
  }

  @Post(':id/retry')
  @HttpCode(200)
  retry(@Param('id', ParseUUIDPipe) id: string): Promise<CampaignDto> {
    return this.campaigns.retry(id);
  }
}

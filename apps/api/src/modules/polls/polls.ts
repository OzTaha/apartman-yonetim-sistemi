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
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  pollCreateSchema,
  pollVoteSchema,
  unitLabel,
  type PollDetailDto,
  type PollDto,
  type PollStatus,
  type ResidentPollDto,
  type SiteKind,
} from '@apartman/shared';
import { createZodDto } from 'nestjs-zod';
import { activeOn, dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteRoles, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { AnnouncementsService } from '../communication/announcements';
import { CommunicationModule } from '../communication/communication.module';
import { PushService } from '../push/push';
import { compareUnits } from '../residents/occupancy.mapper';

class PollCreateDto extends createZodDto(pollCreateSchema) {}
class PollVoteDto extends createZodDto(pollVoteSchema) {}

const pollInclude = {
  options: { orderBy: { position: 'asc' } },
  votes: { select: { unitId: true, optionId: true } },
} satisfies Prisma.PollInclude;
type PollRow = Prisma.PollGetPayload<{ include: typeof pollInclude }>;

interface UnitInfo {
  id: string;
  blockId: string;
  label: string;
  blockName: string;
  number: string;
}

const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

@Injectable()
export class PollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly announcements: AnnouncementsService,
    private readonly push: PushService,
  ) {}

  private status(row: { closedAt: Date | null; endsOn: Date }): PollStatus {
    return row.closedAt || toDateString(row.endsOn) < todayInIstanbul() ? 'CLOSED' : 'OPEN';
  }

  private async units(): Promise<{ kind: SiteKind; units: UnitInfo[] }> {
    const kind = await this.tenant.siteKind();
    const rows = await this.tenant.db.unit.findMany({
      where: { archivedAt: null },
      select: { id: true, blockId: true, number: true, block: { select: { name: true } } },
    });
    const units = rows
      .map((u) => ({
        id: u.id,
        blockId: u.blockId,
        blockName: u.block.name,
        number: u.number,
        label: unitLabel(kind, u.block.name, u.number),
      }))
      .sort(compareUnits);
    return { kind, units };
  }

  private eligible(row: { audience: string; blockIds: string[] }, units: UnitInfo[]) {
    return row.audience === 'ALL' ? units : units.filter((u) => row.blockIds.includes(u.blockId));
  }

  private async blockNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const blocks = await this.tenant.db.block.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(blocks.map((b) => [b.id, b.name]));
  }

  private summary(row: PollRow, units: UnitInfo[], names: Map<string, string>): PollDto {
    const eligible = this.eligible(row, units);
    const eligibleIds = new Set(eligible.map((u) => u.id));
    return {
      id: row.id,
      question: row.question,
      endsOn: toDateString(row.endsOn),
      status: this.status(row),
      audience: row.audience,
      blockNames: row.blockIds
        .map((id) => names.get(id))
        .filter((n): n is string => Boolean(n))
        .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true })),
      votedUnits: row.votes.filter((v) => eligibleIds.has(v.unitId)).length,
      eligibleUnits: eligible.length,
      sharedAt: row.sharedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async find(id: string): Promise<PollRow> {
    const row = await this.tenant.db.poll.findFirst({ where: { id }, include: pollInclude });
    if (!row) throw new NotFoundException('Anket bulunamadı');
    return row;
  }

  async list(): Promise<PollDto[]> {
    const rows = await this.tenant.db.poll.findMany({
      include: pollInclude,
      orderBy: { createdAt: 'desc' },
    });
    const { units } = await this.units();
    const names = await this.blockNames([...new Set(rows.flatMap((r) => r.blockIds))]);
    return rows.map((r) => this.summary(r, units, names));
  }

  async get(id: string): Promise<PollDetailDto> {
    const row = await this.find(id);
    const { units } = await this.units();
    const names = await this.blockNames(row.blockIds);
    const eligible = this.eligible(row, units);
    const voted = new Set(row.votes.map((v) => v.unitId));
    return {
      ...this.summary(row, units, names),
      options: row.options.map((o) => ({
        id: o.id,
        label: o.label,
        votes: row.votes.filter((v) => v.optionId === o.id).length,
      })),
      voted: eligible.filter((u) => voted.has(u.id)).map((u) => u.label),
      notVoted: eligible.filter((u) => !voted.has(u.id)).map((u) => u.label),
    };
  }

  async create(input: PollCreateDto): Promise<PollDetailDto> {
    if (input.endsOn < todayInIstanbul()) {
      throw new BadRequestException('Bitiş tarihi bugünden önce olamaz');
    }
    const blockIds = input.audience === 'BLOCKS' ? [...new Set(input.blockIds)] : [];
    if (blockIds.length > 0) {
      const found = await this.tenant.db.block.count({ where: { id: { in: blockIds } } });
      if (found !== blockIds.length) throw new BadRequestException('Seçilen blok bulunamadı');
    }
    const siteId = this.tenant.siteId;
    const poll = await this.tenant.db.poll.create({
      data: {
        siteId,
        question: input.question,
        endsOn: dateOnly(input.endsOn),
        audience: input.audience,
        blockIds,
        createdById: this.tenant.userId ?? null,
        options: {
          create: input.options.map((label, position) => ({ label, position })),
        },
      },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Poll',
      entityId: poll.id,
      after: input,
    });

    const [occupants, site, { units }] = await Promise.all([
      this.tenant.db.occupancy.findMany({
        where: { userId: { not: null }, ...activeOn(), unit: { archivedAt: null } },
        select: { userId: true, unitId: true },
      }),
      this.prisma.site.findUnique({ where: { id: siteId }, select: { name: true } }),
      this.units(),
    ]);
    const eligibleIds = new Set(
      this.eligible({ audience: input.audience, blockIds }, units).map((u) => u.id),
    );
    this.push.send(
      occupants.filter((o) => eligibleIds.has(o.unitId)).map((o) => o.userId!),
      {
        title: `Yeni anket · ${site?.name ?? ''}`,
        body: input.question,
        url: '/anketler',
        tag: `poll-${poll.id}`,
      },
    );
    return this.get(poll.id);
  }

  async close(id: string): Promise<PollDetailDto> {
    const row = await this.find(id);
    if (this.status(row) === 'CLOSED') throw new ConflictException('Anket zaten bitti');
    await this.tenant.db.poll.update({ where: { id }, data: { closedAt: new Date() } });
    await this.audit.record({ action: 'FINISH', entityType: 'Poll', entityId: id });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const row = await this.find(id);
    await this.tenant.db.poll.delete({ where: { id } });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Poll',
      entityId: id,
      before: { question: row.question, votes: row.votes.length },
    });
  }

  async share(id: string): Promise<PollDetailDto> {
    const detail = await this.get(id);
    if (detail.status !== 'CLOSED') {
      throw new BadRequestException('Sonucu paylaşmak için önce anketi bitirin');
    }
    if (detail.sharedAt) throw new ConflictException('Bu anketin sonucu zaten paylaşıldı');
    const row = await this.find(id);
    const total = detail.options.reduce((sum, o) => sum + o.votes, 0);
    const lines = [
      detail.question,
      '',
      ...[...detail.options]
        .sort((a, b) => b.votes - a.votes)
        .map((o) => `${o.label}: ${o.votes} oy (%${percent(o.votes, total)})`),
      '',
      `${detail.eligibleUnits} daireden ${detail.votedUnits} daire oy verdi.`,
    ];
    const announcement = await this.announcements.create({
      title: 'Anket sonucu',
      body: lines.join('\n'),
      audience: row.audience,
      blockIds: row.blockIds,
      unitIds: [],
      pinned: false,
      expiresAt: undefined,
      notify: null,
    });
    await this.tenant.db.poll.update({
      where: { id },
      data: { sharedAt: new Date(), announcementId: announcement.id },
    });
    await this.audit.record({
      action: 'SHARE',
      entityType: 'Poll',
      entityId: id,
      after: { announcementId: announcement.id },
    });
    return this.get(id);
  }

  private async myUnits(): Promise<Set<string>> {
    const rows = await this.tenant.db.occupancy.findMany({
      where: { userId: this.tenant.userId, ...activeOn(), unit: { archivedAt: null } },
      select: { unitId: true },
    });
    return new Set(rows.map((r) => r.unitId));
  }

  async mine(): Promise<ResidentPollDto[]> {
    const mine = await this.myUnits();
    if (mine.size === 0) return [];
    const { units } = await this.units();
    const rows = await this.tenant.db.poll.findMany({
      include: pollInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.flatMap((row) => {
      const own = this.eligible(row, units).filter((u) => mine.has(u.id));
      if (own.length === 0) return [];
      const status = this.status(row);
      const ownVotes = new Map(row.votes.map((v) => [v.unitId, v.optionId]));
      const show = status === 'CLOSED' || own.some((u) => ownVotes.has(u.id));
      return [
        {
          id: row.id,
          question: row.question,
          endsOn: toDateString(row.endsOn),
          status,
          options: row.options.map((o) => ({
            id: o.id,
            label: o.label,
            votes: show ? row.votes.filter((v) => v.optionId === o.id).length : null,
          })),
          units: own.map((u) => ({
            unitId: u.id,
            label: u.label,
            optionId: ownVotes.get(u.id) ?? null,
          })),
          totalVotes: show ? row.votes.length : null,
        },
      ];
    });
  }

  async vote(id: string, input: PollVoteDto): Promise<ResidentPollDto> {
    const row = await this.find(id);
    if (this.status(row) === 'CLOSED')
      throw new BadRequestException('Bu anket bitti, oy verilemez');
    if (!row.options.some((o) => o.id === input.optionId)) {
      throw new BadRequestException('Seçenek bulunamadı');
    }
    const mine = await this.myUnits();
    const { units } = await this.units();
    const eligible = this.eligible(row, units);
    if (!mine.has(input.unitId) || !eligible.some((u) => u.id === input.unitId)) {
      throw new ForbiddenException('Bu anket için bu daire adına oy veremezsiniz');
    }
    await this.tenant.db.pollVote.upsert({
      where: { pollId_unitId: { pollId: id, unitId: input.unitId } },
      create: {
        siteId: this.tenant.siteId,
        pollId: id,
        unitId: input.unitId,
        optionId: input.optionId,
        userId: this.tenant.userId ?? null,
      },
      update: { optionId: input.optionId, userId: this.tenant.userId ?? null },
    });
    const result = (await this.mine()).find((p) => p.id === id);
    if (!result) throw new NotFoundException('Anket bulunamadı');
    return result;
  }
}

@ApiTags('Anketler')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('polls')
export class PollsController {
  constructor(private readonly polls: PollsService) {}

  @Get()
  list(): Promise<PollDto[]> {
    return this.polls.list();
  }

  @SiteRoles('SITE_MANAGER', 'BLOCK_MANAGER', 'AUDITOR', 'RESIDENT')
  @Get('mine')
  mine(): Promise<ResidentPollDto[]> {
    return this.polls.mine();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PollDetailDto> {
    return this.polls.get(id);
  }

  @Post()
  create(@Body() body: PollCreateDto): Promise<PollDetailDto> {
    return this.polls.create(body);
  }

  @SiteRoles('SITE_MANAGER', 'BLOCK_MANAGER', 'AUDITOR', 'RESIDENT')
  @Post(':id/vote')
  @HttpCode(200)
  vote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PollVoteDto,
  ): Promise<ResidentPollDto> {
    return this.polls.vote(id, body);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@Param('id', ParseUUIDPipe) id: string): Promise<PollDetailDto> {
    return this.polls.close(id);
  }

  @Post(':id/share')
  @HttpCode(200)
  share(@Param('id', ParseUUIDPipe) id: string): Promise<PollDetailDto> {
    return this.polls.share(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.polls.remove(id);
  }
}

@Module({
  imports: [CommunicationModule],
  controllers: [PollsController],
  providers: [PollsService],
})
export class PollsModule {}

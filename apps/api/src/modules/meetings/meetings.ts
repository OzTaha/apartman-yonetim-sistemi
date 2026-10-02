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
  Post,
  Put,
  Res,
  type StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  attendanceSchema,
  attendanceStatusLabels,
  budgetEndPeriod,
  daysBetween,
  decisionResultLabels,
  decisionSchema,
  meetingCallSchema,
  meetingCancelSchema,
  meetingCompleteSchema,
  meetingShareDecisionsSchema,
  meetingKindLabels,
  meetingQuorum,
  meetingSchema,
  meetingSessionLabels,
  periodLabel,
  unitLabel,
  type DecisionDto,
  type MeetingDetailDto,
  type MeetingDto,
  type ResidentMeetingDto,
} from '@apartman/shared';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import type { Content } from 'pdfmake/interfaces';
import { activeOn, todayInIstanbul } from '../../common/dates';
import { formatDateTr, PDF, sendFile } from '../../common/http';
import type { Meeting, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditorReadable, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { CommunicationModule } from '../communication/communication.module';
import { AnnouncementsService } from '../communication/announcements';
import { DocumentsService } from '../dues/documents.service';
import { DuesModule } from '../dues/dues.module';
import { nextCounter } from '../finance/finance.ledger';
import { compareUnits } from '../residents/occupancy.mapper';

class MeetingBodyDto extends createZodDto(meetingSchema) {}
class MeetingCallDto extends createZodDto(meetingCallSchema) {}
class AttendanceDto extends createZodDto(attendanceSchema) {}
class DecisionBodyDto extends createZodDto(decisionSchema) {}
class MeetingCompleteDto extends createZodDto(meetingCompleteSchema) {}
class MeetingShareDecisionsDto extends createZodDto(meetingShareDecisionsSchema) {}
class MeetingCancelDto extends createZodDto(meetingCancelSchema) {}

const localFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function toLocal(date: Date): string {
  return localFormat.format(date).replace(' ', 'T');
}

function fromLocal(value: string): Date {
  return new Date(`${value}:00+03:00`);
}

function formatLocal(date: Date): string {
  const local = toLocal(date);
  return `${formatDateTr(local.slice(0, 10))} ${local.slice(11)}`;
}

const itemInclude = {
  budget: { select: { startPeriod: true } },
} satisfies Prisma.MeetingItemInclude;

const meetingInclude = {
  items: { include: itemInclude, orderBy: { position: 'asc' } },
  attendance: true,
} satisfies Prisma.MeetingInclude;

type MeetingRow = Prisma.MeetingGetPayload<{ include: typeof meetingInclude }>;

function budgetLabel(startPeriod: string): string {
  return `${periodLabel(startPeriod)} – ${periodLabel(budgetEndPeriod(startPeriod))} işletme projesi`;
}

function toDto(m: MeetingRow): MeetingDto {
  return {
    id: m.id,
    kind: m.kind,
    startsAt: toLocal(m.startsAt),
    secondStartsAt: m.secondStartsAt ? toLocal(m.secondStartsAt) : null,
    location: m.location,
    status: m.status,
    heldSession: m.heldSession,
    calledAt: m.calledAt?.toISOString() ?? null,
    itemCount: m.items.length,
    decisionCount: m.items.filter((i) => i.decisionNo !== null).length,
    createdAt: m.createdAt.toISOString(),
  };
}

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly announcements: AnnouncementsService,
    private readonly documents: DocumentsService,
  ) {}

  async list(): Promise<MeetingDto[]> {
    const rows = await this.tenant.db.meeting.findMany({
      include: meetingInclude,
      orderBy: { startsAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async get(id: string): Promise<MeetingDetailDto> {
    const meeting = await this.find(id);
    const attendance = await this.attendanceRows(meeting);
    return {
      ...toDto(meeting),
      notes: meeting.notes,
      cancelReason: meeting.cancelReason,
      heldAt: meeting.heldAt?.toISOString() ?? null,
      announcementId: meeting.announcementId,
      decisionsSharedAt: meeting.decisionsSharedAt?.toISOString() ?? null,
      noticeDays: daysBetween(todayInIstanbul(), toLocal(meeting.startsAt).slice(0, 10)),
      items: meeting.items.map((i) => ({
        id: i.id,
        position: i.position,
        title: i.title,
        budgetId: i.budgetId,
        budgetLabel: i.budget ? budgetLabel(i.budget.startPeriod) : null,
        resolution: i.resolution,
        result: i.result,
        votesFor: i.votesFor,
        votesAgainst: i.votesAgainst,
        votesAbstain: i.votesAbstain,
        decisionNo: i.decisionNo,
      })),
      attendance,
      quorum: meetingQuorum(attendance),
    };
  }

  async create(input: MeetingBodyDto): Promise<MeetingDetailDto> {
    await this.assertBudgets(input.items);
    const siteId = this.tenant.siteId;
    const meeting = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.meeting.create({
        data: {
          siteId,
          kind: input.kind,
          startsAt: fromLocal(input.startsAt),
          secondStartsAt: input.secondStartsAt ? fromLocal(input.secondStartsAt) : null,
          location: input.location,
          notes: input.notes ?? null,
          createdById: this.tenant.userId ?? null,
        },
      });
      await tx.meetingItem.createMany({
        data: input.items.map((item, i) => ({
          siteId,
          meetingId: created.id,
          position: i + 1,
          title: item.title,
          budgetId: item.budgetId ?? null,
        })),
      });
      return created;
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'Meeting',
      entityId: meeting.id,
      after: input,
    });
    return this.get(meeting.id);
  }

  async update(id: string, input: MeetingBodyDto): Promise<MeetingDetailDto> {
    const before = await this.findPlanned(id);
    await this.assertBudgets(input.items);
    const known = new Set(before.items.map((i) => i.id));
    if (input.items.some((i) => i.id && !known.has(i.id))) {
      throw new BadRequestException('Gündem maddesi bu toplantıya ait değil');
    }
    const kept = new Set(input.items.map((i) => i.id).filter(Boolean));
    const siteId = this.tenant.siteId;
    await this.tenant.db.$transaction(async (tx) => {
      await tx.meeting.update({
        where: { id },
        data: {
          kind: input.kind,
          startsAt: fromLocal(input.startsAt),
          secondStartsAt: input.secondStartsAt ? fromLocal(input.secondStartsAt) : null,
          location: input.location,
          notes: input.notes ?? null,
        },
      });
      await tx.meetingItem.deleteMany({
        where: { siteId, meetingId: id, id: { notIn: [...kept] as string[] } },
      });
      for (const [i, item] of input.items.entries()) {
        const data = { position: i + 1, title: item.title, budgetId: item.budgetId ?? null };
        if (item.id) await tx.meetingItem.update({ where: { id: item.id }, data });
        else await tx.meetingItem.create({ data: { siteId, meetingId: id, ...data } });
      }
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Meeting',
      entityId: id,
      before: { ...before, items: before.items.map((i) => i.title), attendance: undefined },
      after: input,
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const meeting = await this.findPlanned(id);
    if (meeting.calledAt) {
      throw new ConflictException('Çağrısı yapılmış toplantı silinemez; iptal edebilirsiniz');
    }
    await this.tenant.db.meeting.delete({ where: { id } });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Meeting',
      entityId: id,
      before: { kind: meeting.kind, startsAt: meeting.startsAt },
    });
  }

  async call(id: string, input: MeetingCallDto): Promise<MeetingDetailDto> {
    const meeting = await this.findPlanned(id);
    if (meeting.calledAt) throw new ConflictException('Bu toplantının çağrısı zaten yayınlandı');
    const site = await this.prisma.site.findUniqueOrThrow({
      where: { id: this.tenant.siteId },
      select: { name: true },
    });
    const lines = [
      `${site.name} ${meetingKindLabels[meeting.kind].toLocaleLowerCase('tr')} toplantısı ${formatLocal(meeting.startsAt)} tarihinde ${meeting.location} adresinde yapılacaktır.`,
      meeting.secondStartsAt
        ? `İlk toplantıda yeter sayı sağlanamazsa ikinci toplantı ${formatLocal(meeting.secondStartsAt)} tarihinde aynı yerde yapılacaktır.`
        : null,
      '',
      'Gündem:',
      ...meeting.items.map((i) => `${i.position}. ${i.title}`),
      meeting.notes ? `\n${meeting.notes}` : null,
      '',
      'Katılamayacak kat malikleri noter onayı gerektirmeyen yazılı vekaletle temsil edilebilir.',
    ].filter((l) => l !== null);
    const announcement = await this.announcements.create({
      title: `${meetingKindLabels[meeting.kind]} toplantı çağrısı`,
      body: lines.join('\n'),
      audience: 'ALL',
      blockIds: [],
      unitIds: [],
      pinned: true,
      expiresAt: toLocal(meeting.secondStartsAt ?? meeting.startsAt).slice(0, 10),
      notify: input.notify ?? null,
    });
    await this.tenant.db.meeting.update({
      where: { id },
      data: { announcementId: announcement.id, calledAt: new Date() },
    });
    await this.audit.record({
      action: 'CALL',
      entityType: 'Meeting',
      entityId: id,
      after: { announcementId: announcement.id, notify: input.notify?.channel ?? null },
    });
    return this.get(id);
  }

  async saveAttendance(id: string, input: AttendanceDto): Promise<MeetingDetailDto> {
    await this.findPlanned(id);
    const unitIds = input.entries.map((e) => e.unitId);
    const units = await this.tenant.db.unit.count({
      where: { id: { in: unitIds }, archivedAt: null },
    });
    if (units !== new Set(unitIds).size || units !== unitIds.length) {
      throw new BadRequestException('Hazirun listesinde geçersiz daire var');
    }
    const siteId = this.tenant.siteId;
    const present = input.entries.filter((e) => e.status !== 'ABSENT');
    await this.tenant.db.$transaction(async (tx) => {
      await tx.meetingAttendance.deleteMany({ where: { siteId, meetingId: id } });
      await tx.meetingAttendance.createMany({
        data: present.map((e) => ({
          siteId,
          meetingId: id,
          unitId: e.unitId,
          status: e.status,
          name: e.name ?? null,
        })),
      });
    });
    await this.audit.record({
      action: 'ATTENDANCE',
      entityType: 'Meeting',
      entityId: id,
      after: { present: present.length, proxy: present.filter((e) => e.status === 'PROXY').length },
    });
    return this.get(id);
  }

  async saveDecision(
    id: string,
    itemId: string,
    input: DecisionBodyDto,
  ): Promise<MeetingDetailDto> {
    const meeting = await this.findPlanned(id);
    if (!meeting.items.some((i) => i.id === itemId)) {
      throw new NotFoundException('Gündem maddesi bulunamadı');
    }
    await this.tenant.db.meetingItem.update({
      where: { id: itemId },
      data: {
        result: input.result,
        resolution: input.resolution,
        votesFor: input.votesFor ?? null,
        votesAgainst: input.votesAgainst ?? null,
        votesAbstain: input.votesAbstain ?? null,
      },
    });
    await this.audit.record({
      action: 'DECISION',
      entityType: 'Meeting',
      entityId: id,
      after: { itemId, ...input },
    });
    return this.get(id);
  }

  async complete(id: string, input: MeetingCompleteDto): Promise<MeetingDetailDto> {
    const meeting = await this.findPlanned(id);
    const detail = await this.get(id);
    if (input.session === 'FIRST' && !detail.quorum.reached) {
      throw new BadRequestException(
        'Birinci toplantıda yeter sayı sağlanmadı. Toplantıyı ikinci toplantı olarak tamamlayın.',
      );
    }
    if (detail.quorum.presentUnits === 0) {
      throw new BadRequestException('Önce hazirun listesinde katılanları işaretleyin');
    }
    const missing = meeting.items.filter((i) => !i.result || !i.resolution);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Karar yazılmamış gündem maddeleri var: ${missing.map((i) => i.position).join(', ')}`,
      );
    }
    const siteId = this.tenant.siteId;
    const heldDate =
      input.session === 'SECOND' && meeting.secondStartsAt
        ? meeting.secondStartsAt
        : meeting.startsAt;
    const approvedAt = new Date(`${toLocal(heldDate).slice(0, 10)}T00:00:00.000Z`);
    await this.tenant.db.$transaction(async (tx) => {
      for (const item of meeting.items) {
        if (item.result === 'INFO') continue;
        const decisionNo = await nextCounter(tx, siteId, 'decision');
        await tx.meetingItem.update({ where: { id: item.id }, data: { decisionNo } });
        if (item.budgetId && item.result === 'ACCEPTED') {
          await tx.budget.update({ where: { id: item.budgetId }, data: { approvedAt } });
        }
      }
      await tx.meeting.update({
        where: { id },
        data: { status: 'HELD', heldSession: input.session, heldAt: new Date() },
      });
    });
    await this.audit.record({
      action: 'COMPLETE',
      entityType: 'Meeting',
      entityId: id,
      after: { session: input.session, quorum: detail.quorum },
    });
    if (input.shareDecisions) return this.shareDecisions(id, { notify: input.notify ?? null });
    return this.get(id);
  }

  async shareDecisions(id: string, input: MeetingShareDecisionsDto): Promise<MeetingDetailDto> {
    const meeting = await this.find(id);
    if (meeting.status !== 'HELD') {
      throw new BadRequestException('Kararlar toplantı tamamlandıktan sonra paylaşılabilir');
    }
    if (meeting.decisionsSharedAt) {
      throw new ConflictException('Bu toplantının kararları zaten duyuru olarak paylaşıldı');
    }
    const site = await this.prisma.site.findUniqueOrThrow({
      where: { id: this.tenant.siteId },
      select: { name: true },
    });
    const heldOn =
      meeting.heldSession === 'SECOND' && meeting.secondStartsAt
        ? meeting.secondStartsAt
        : meeting.startsAt;
    const kind = meetingKindLabels[meeting.kind];
    const votes = (i: (typeof meeting.items)[number]) =>
      [
        i.votesFor !== null ? `kabul ${i.votesFor}` : null,
        i.votesAgainst !== null ? `ret ${i.votesAgainst}` : null,
        i.votesAbstain !== null ? `çekimser ${i.votesAbstain}` : null,
      ]
        .filter(Boolean)
        .join(', ');
    const lines = [
      `${site.name} ${kind.toLocaleLowerCase('tr')} toplantısı ${formatLocal(heldOn)} tarihinde yapılmış ve aşağıdaki kararlar alınmıştır.`,
      ...meeting.items.flatMap((i) => {
        const result = i.result ? decisionResultLabels[i.result] : '';
        const voteText = votes(i);
        return [
          '',
          `${i.position}. ${i.title}`,
          [
            result,
            i.decisionNo ? `karar no ${i.decisionNo}` : null,
            voteText ? `oylar: ${voteText}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          i.resolution ?? '',
        ].filter((l) => l !== '');
      }),
    ];
    const announcement = await this.announcements.create({
      title: `${kind} kararları`,
      body: lines.join('\n'),
      audience: 'ALL',
      blockIds: [],
      unitIds: [],
      pinned: false,
      expiresAt: undefined,
      notify: input.notify ?? null,
    });
    await this.tenant.db.meeting.update({
      where: { id },
      data: { decisionsAnnouncementId: announcement.id, decisionsSharedAt: new Date() },
    });
    await this.audit.record({
      action: 'SHARE',
      entityType: 'Meeting',
      entityId: id,
      after: { announcementId: announcement.id, notify: input.notify?.channel ?? null },
    });
    return this.get(id);
  }

  async cancel(id: string, input: MeetingCancelDto): Promise<MeetingDetailDto> {
    await this.findPlanned(id);
    await this.tenant.db.meeting.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason: input.reason },
    });
    await this.audit.record({
      action: 'CANCEL',
      entityType: 'Meeting',
      entityId: id,
      after: input,
    });
    return this.get(id);
  }

  async decisions(): Promise<DecisionDto[]> {
    const items = await this.tenant.db.meetingItem.findMany({
      where: { decisionNo: { not: null } },
      include: { meeting: true },
      orderBy: { decisionNo: 'desc' },
    });
    return items.map((i) => ({
      decisionNo: i.decisionNo!,
      meetingId: i.meetingId,
      meetingKind: i.meeting.kind,
      meetingDate: toLocal(heldDate(i.meeting)).slice(0, 10),
      title: i.title,
      resolution: i.resolution ?? '',
      result: i.result!,
      votesFor: i.votesFor,
      votesAgainst: i.votesAgainst,
      votesAbstain: i.votesAbstain,
    }));
  }

  async forResidents(): Promise<ResidentMeetingDto[]> {
    const rows = await this.tenant.db.meeting.findMany({
      where: {
        OR: [{ status: 'HELD' }, { status: 'PLANNED', calledAt: { not: null } }],
      },
      include: meetingInclude,
      orderBy: { startsAt: 'desc' },
    });
    return rows.map((m) => ({
      id: m.id,
      kind: m.kind,
      startsAt: toLocal(m.startsAt),
      secondStartsAt: m.secondStartsAt ? toLocal(m.secondStartsAt) : null,
      location: m.location,
      status: m.status,
      heldSession: m.heldSession,
      items: m.items.map((i) => ({
        id: i.id,
        title: i.title,
        result: m.status === 'HELD' ? i.result : null,
        resolution: m.status === 'HELD' ? i.resolution : null,
        decisionNo: i.decisionNo,
      })),
    }));
  }

  async minutesPdf(id: string, residentView = false): Promise<{ file: Buffer; name: string }> {
    const detail = await this.get(id);
    if (detail.status !== 'HELD') {
      if (residentView) throw new NotFoundException('Toplantı bulunamadı');
      throw new BadRequestException('Tutanak toplantı tamamlandıktan sonra alınabilir');
    }
    const meeting = await this.find(id);
    const site = await this.siteInfo();
    const q = detail.quorum;
    const held = heldDate(meeting);
    const content: Content[] = [
      ...this.header(site.name, site.place),
      {
        text: 'GENEL KURUL TOPLANTI TUTANAĞI',
        style: 'title',
        alignment: 'center',
        margin: [0, 20, 0, 2],
      },
      {
        text: `${meetingKindLabels[detail.kind]} · ${meetingSessionLabels[detail.heldSession!]}`,
        style: 'subtitle',
        alignment: 'center',
      },
      {
        table: {
          widths: [140, '*'],
          body: [
            ['Tarih ve saat', formatLocal(held)],
            ['Yer', detail.location],
            [
              'Katılım',
              `${q.totalUnits} bağımsız bölümden ${q.presentUnits} bölüm temsil edildi (${q.proxyUnits} vekaleten).`,
            ],
            ...(q.totalLandShare === null
              ? []
              : [
                  [
                    'Arsa payı',
                    `${q.totalLandShare} arsa payından ${q.presentLandShare} temsil edildi.`,
                  ],
                ]),
            [
              'Toplantı yeter sayısı',
              detail.heldSession === 'SECOND'
                ? 'İkinci toplantıda katılanların çoğunluğuyla karar alınır.'
                : 'Sağlandı.',
            ],
          ],
        },
        layout: 'lightHorizontalLines',
      },
      { text: 'Gündem ve kararlar', bold: true, fontSize: 11, margin: [0, 16, 0, 6] },
      ...detail.items.flatMap((i): Content[] => [
        {
          text: [
            { text: `${i.position}. ${i.title}`, bold: true },
            i.decisionNo ? { text: `   (Karar no: ${i.decisionNo})`, color: '#555555' } : '',
          ],
          margin: [0, 8, 0, 2],
        },
        { text: i.resolution ?? '', lineHeight: 1.3 },
        {
          text: [
            decisionResultLabels[i.result!],
            i.votesFor != null || i.votesAgainst != null || i.votesAbstain != null
              ? ` · Kabul ${i.votesFor ?? 0}, ret ${i.votesAgainst ?? 0}, çekimser ${i.votesAbstain ?? 0}`
              : '',
          ].join(''),
          color: '#555555',
          margin: [0, 2, 0, 0],
        },
      ]),
      {
        margin: [0, 40, 0, 0],
        columns: ['Toplantı başkanı', 'Yazman', 'Üye'].map((role) => ({
          width: '*',
          alignment: 'center',
          text: [`${role}\n\n\n`, { text: 'İmza', color: '#777777' }],
        })),
      },
    ];
    const file = await this.documents.render(content);
    return { file, name: `genel-kurul-tutanagi-${toLocal(held).slice(0, 10)}.pdf` };
  }

  async attendancePdf(id: string): Promise<{ file: Buffer; name: string }> {
    const detail = await this.get(id);
    const site = await this.siteInfo();
    const kind = await this.tenant.siteKind();
    const right = { alignment: 'right' as const };
    const marked = detail.status === 'HELD' || detail.quorum.presentUnits > 0;
    const shares = detail.attendance.some((a) => a.landShare != null);
    const content: Content[] = [
      ...this.header(site.name, site.place),
      { text: 'HAZİRUN CETVELİ', style: 'title', alignment: 'center', margin: [0, 20, 0, 2] },
      {
        text: `${meetingKindLabels[detail.kind]} · ${formatLocal(fromLocal(detail.startsAt))} · ${detail.location}`,
        style: 'subtitle',
        alignment: 'center',
      },
      {
        table: {
          headerRows: 1,
          widths: [70, '*', ...(shares ? [45] : []), ...(marked ? [60] : []), 110],
          body: [
            [
              { text: 'Bağımsız bölüm', style: 'th' },
              { text: 'Kat maliki / temsilci', style: 'th' },
              ...(shares ? [{ text: 'Arsa payı', style: 'th', ...right }] : []),
              ...(marked ? [{ text: 'Durum', style: 'th' }] : []),
              { text: 'İmza', style: 'th' },
            ],
            ...detail.attendance.map((a) => [
              unitLabel(kind, a.blockName, a.unitNumber, 'short'),
              a.status === 'PROXY' && a.name
                ? `${a.owners}\nVekil: ${a.name}`
                : a.name || a.owners || '—',
              ...(shares ? [{ text: a.landShare?.toString() ?? '—', ...right }] : []),
              ...(marked ? [attendanceStatusLabels[a.status]] : []),
              { text: '', margin: [0, 10, 0, 10] as [number, number, number, number] },
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      },
      ...(marked
        ? [
            {
              text: `Toplam ${detail.quorum.totalUnits} bağımsız bölümden ${detail.quorum.presentUnits} bölüm temsil edildi.`,
              margin: [0, 10, 0, 0],
            } as Content,
          ]
        : []),
    ];
    const file = await this.documents.render(content);
    return { file, name: `hazirun-cetveli-${detail.startsAt.slice(0, 10)}.pdf` };
  }

  async decisionsPdf(): Promise<{ file: Buffer; name: string }> {
    const decisions = (await this.decisions()).sort((a, b) => a.decisionNo - b.decisionNo);
    const site = await this.siteInfo();
    const content: Content[] = [
      ...this.header(site.name, site.place),
      { text: 'KARAR DEFTERİ', style: 'title', alignment: 'center', margin: [0, 20, 0, 12] },
      decisions.length === 0
        ? { text: 'Henüz kayıtlı karar yok.' }
        : {
            table: {
              headerRows: 1,
              widths: [40, 60, '*', 70],
              body: [
                [
                  { text: 'No', style: 'th' },
                  { text: 'Tarih', style: 'th' },
                  { text: 'Karar', style: 'th' },
                  { text: 'Sonuç', style: 'th' },
                ],
                ...decisions.map((d) => [
                  String(d.decisionNo),
                  formatDateTr(d.meetingDate),
                  { text: [{ text: `${d.title}\n`, bold: true }, d.resolution] },
                  decisionResultLabels[d.result],
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
          },
    ];
    const file = await this.documents.render(content);
    return { file, name: `karar-defteri-${todayInIstanbul()}.pdf` };
  }

  private header(name: string, place: string): Content[] {
    return [
      {
        columns: [
          {
            width: '*',
            text: [
              { text: `${name}\n`, bold: true, fontSize: 12 },
              { text: place, color: '#555555' },
            ],
          },
          { width: 'auto', text: `Tarih: ${formatDateTr(todayInIstanbul())}`, alignment: 'right' },
        ],
      },
    ];
  }

  private async siteInfo() {
    const site = await this.prisma.site.findUniqueOrThrow({
      where: { id: this.tenant.siteId },
      select: { name: true, address: true, city: true },
    });
    return { name: site.name, place: [site.address, site.city].filter(Boolean).join(', ') };
  }

  private async attendanceRows(meeting: MeetingRow) {
    const units = await this.tenant.db.unit.findMany({
      where: { archivedAt: null },
      include: {
        block: { select: { name: true } },
        occupancies: {
          where: { ...activeOn(), type: 'OWNER' },
          select: { firstName: true, lastName: true },
          orderBy: { startDate: 'asc' },
        },
      },
    });
    const byUnit = new Map(meeting.attendance.map((a) => [a.unitId, a]));
    return units
      .map((u) => {
        const record = byUnit.get(u.id);
        return {
          unitId: u.id,
          blockName: u.block.name,
          number: u.number,
          unitNumber: u.number,
          landShare: u.landShare,
          owners: u.occupancies.map((o) => `${o.firstName} ${o.lastName}`).join(', '),
          status: record?.status ?? ('ABSENT' as const),
          name: record?.name ?? null,
        };
      })
      .sort(compareUnits)
      .map(({ number: _number, ...row }) => row);
  }

  private async assertBudgets(items: MeetingBodyDto['items']) {
    const ids = [...new Set(items.map((i) => i.budgetId).filter((v): v is string => Boolean(v)))];
    if (ids.length === 0) return;
    const count = await this.tenant.db.budget.count({ where: { id: { in: ids } } });
    if (count !== ids.length) throw new BadRequestException('Bağlanan bütçe bulunamadı');
  }

  private async find(id: string): Promise<MeetingRow> {
    const meeting = await this.tenant.db.meeting.findUnique({
      where: { id },
      include: meetingInclude,
    });
    if (!meeting) throw new NotFoundException('Toplantı bulunamadı');
    return meeting;
  }

  private async findPlanned(id: string): Promise<MeetingRow> {
    const meeting = await this.find(id);
    if (meeting.status !== 'PLANNED') {
      throw new ConflictException(
        meeting.status === 'HELD'
          ? 'Tamamlanan toplantı ve kararları değiştirilemez'
          : 'İptal edilen toplantı değiştirilemez',
      );
    }
    return meeting;
  }
}

function heldDate(m: Pick<Meeting, 'heldSession' | 'startsAt' | 'secondStartsAt'>): Date {
  return m.heldSession === 'SECOND' && m.secondStartsAt ? m.secondStartsAt : m.startsAt;
}

@ApiTags('Genel kurul')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@AuditorReadable()
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  list(): Promise<MeetingDto[]> {
    return this.meetings.list();
  }

  @Post()
  create(@Body() body: MeetingBodyDto): Promise<MeetingDetailDto> {
    return this.meetings.create(body);
  }

  @Get('decisions')
  decisions(): Promise<DecisionDto[]> {
    return this.meetings.decisions();
  }

  @Get('decisions.pdf')
  async decisionsPdf(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { file, name } = await this.meetings.decisionsPdf();
    return sendFile(res, name, PDF, file);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<MeetingDetailDto> {
    return this.meetings.get(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MeetingBodyDto,
  ): Promise<MeetingDetailDto> {
    return this.meetings.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.meetings.remove(id);
  }

  @Post(':id/share-decisions')
  @HttpCode(200)
  shareDecisions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MeetingShareDecisionsDto,
  ): Promise<MeetingDetailDto> {
    return this.meetings.shareDecisions(id, body);
  }

  @Post(':id/call')
  @HttpCode(200)
  call(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MeetingCallDto,
  ): Promise<MeetingDetailDto> {
    return this.meetings.call(id, body);
  }

  @Put(':id/attendance')
  attendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AttendanceDto,
  ): Promise<MeetingDetailDto> {
    return this.meetings.saveAttendance(id, body);
  }

  @Put(':id/items/:itemId/decision')
  decision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: DecisionBodyDto,
  ): Promise<MeetingDetailDto> {
    return this.meetings.saveDecision(id, itemId, body);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MeetingCompleteDto,
  ): Promise<MeetingDetailDto> {
    return this.meetings.complete(id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MeetingCancelDto,
  ): Promise<MeetingDetailDto> {
    return this.meetings.cancel(id, body);
  }

  @Get(':id/minutes.pdf')
  async minutes(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, name } = await this.meetings.minutesPdf(id);
    return sendFile(res, name, PDF, file);
  }

  @Get(':id/attendance.pdf')
  async attendancePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, name } = await this.meetings.attendancePdf(id);
    return sendFile(res, name, PDF, file);
  }
}

@ApiTags('Genel kurul')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER', 'BLOCK_MANAGER', 'AUDITOR')
@Controller('assemblies')
export class AssembliesController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  list(): Promise<ResidentMeetingDto[]> {
    return this.meetings.forResidents();
  }

  @Get(':id/minutes.pdf')
  async minutes(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, name } = await this.meetings.minutesPdf(id, true);
    return sendFile(res, name, PDF, file);
  }
}

@Module({
  imports: [CommunicationModule, DuesModule],
  controllers: [MeetingsController, AssembliesController],
  providers: [MeetingsService],
})
export class MeetingsModule {}

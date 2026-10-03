import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  cashAccountKindLabels,
  decisionResultLabels,
  employeeRoleLabels,
  meetingKindLabels,
  normalizeTrPhone,
  occupancyTypeLabels,
  paymentMethodLabels,
  requestCategoryLabels,
  requestStatusLabels,
  SITE_RESTORE_DAYS,
  transactionTypeLabels,
  workStatusLabels,
  type DeletedSiteDto,
} from '@apartman/shared';
import type { AuthUser } from '../../common/auth-user';
import { toDateString } from '../../common/dates';
import type { SiteDeleteDto } from '../../common/dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { verifyPassword } from '../auth/password';
import { DocumentsService, workbookSheet } from '../dues/documents.service';
import { accountBalances } from '../finance/finance.ledger';
import { FileStorage } from '../finance/storage';
import { compareUnits } from '../residents/occupancy.mapper';

const DAY_MS = 24 * 60 * 60 * 1000;

const trDate = (value: Date | null | undefined) => {
  if (!value) return null;
  const [y, m, d] = toDateString(value).split('-');
  return `${d}.${m}.${y}`;
};

const unitLabel = (unit: { number: string; block: { name: string } }, apartment: boolean) =>
  apartment ? `Daire ${unit.number}` : `${unit.block.name} Blok ${unit.number}`;

@Injectable()
export class SiteDeletionService {
  private readonly logger = new Logger(SiteDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
    private readonly storage: FileStorage,
  ) {}

  async listDeleted(): Promise<DeletedSiteDto[]> {
    const sites = await this.prisma.site.findMany({
      where: { deletedAt: { not: null } },
      include: { _count: { select: { units: true } } },
      orderBy: { deletedAt: 'desc' },
    });
    return sites.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      unitCount: s._count.units,
      deletedAt: s.deletedAt!.toISOString(),
      purgeAt: new Date(s.deletedAt!.getTime() + SITE_RESTORE_DAYS * DAY_MS).toISOString(),
    }));
  }

  async softDelete(user: AuthUser, siteId: string, input: SiteDeleteDto): Promise<void> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId, deletedAt: null } });
    if (!site) throw new NotFoundException('Site bulunamadı');
    if (input.confirmName.trim().toLocaleLowerCase('tr') !== site.name.toLocaleLowerCase('tr')) {
      throw new BadRequestException('Yazdığınız ad silinecek yerin adıyla aynı değil');
    }
    await this.verifyIdentity(user.id, input.identifier, input.password);
    await this.prisma.site.update({
      where: { id: siteId },
      data: { deletedAt: new Date(), deletedById: user.id },
    });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Site',
      entityId: siteId,
      siteId: null,
      before: { name: site.name, kind: site.kind },
    });
  }

  async restore(siteId: string): Promise<void> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId, deletedAt: { not: null } },
    });
    if (!site) throw new NotFoundException('Silinmiş site bulunamadı');
    await this.prisma.site.update({
      where: { id: siteId },
      data: { deletedAt: null, deletedById: null },
    });
    await this.audit.record({
      action: 'RESTORE',
      entityType: 'Site',
      entityId: siteId,
      siteId,
      after: { name: site.name },
    });
  }

  @Cron('0 30 4 * * *', { name: 'purge-deleted-sites', timeZone: 'Europe/Istanbul' })
  async purgeExpired(now = new Date()): Promise<void> {
    const sites = await this.prisma.site.findMany({
      where: { deletedAt: { lte: new Date(now.getTime() - SITE_RESTORE_DAYS * DAY_MS) } },
      select: { id: true, name: true },
    });
    for (const site of sites) {
      try {
        await this.purge(site.id);
        this.logger.log(`${site.name} kalıcı olarak silindi`);
      } catch (error) {
        this.logger.error(`${site.name} silinemedi: ${(error as Error).message}`);
      }
    }
  }

  async purge(siteId: string): Promise<void> {
    const [attachments, memberships, occupancies] = await Promise.all([
      this.prisma.attachment.findMany({ where: { siteId }, select: { storageKey: true } }),
      this.prisma.siteMembership.findMany({ where: { siteId }, select: { userId: true } }),
      this.prisma.occupancy.findMany({
        where: { siteId, userId: { not: null } },
        select: { userId: true },
      }),
    ]);
    const candidates = [
      ...new Set([...memberships, ...occupancies].map((m) => m.userId!).filter(Boolean)),
    ];
    const site = await this.prisma.site.findUniqueOrThrow({ where: { id: siteId } });

    const removedUsers = await this.prisma.$transaction(async (tx) => {
      await tx.site.delete({ where: { id: siteId } });
      const orphans = await tx.user.findMany({
        where: {
          id: { in: candidates },
          isPlatformAdmin: false,
          memberships: { none: {} },
          occupancies: { none: {} },
        },
        select: { id: true },
      });
      await tx.user.deleteMany({ where: { id: { in: orphans.map((u) => u.id) } } });
      return orphans.length;
    });
    await Promise.all(
      attachments.map((a) => this.storage.remove(a.storageKey).catch(() => undefined)),
    );
    await this.audit.record({
      action: 'PURGE',
      entityType: 'Site',
      entityId: siteId,
      siteId: null,
      before: { name: site.name, removedUsers },
    });
  }

  async exportXlsx(siteId: string): Promise<{ name: string; buffer: Buffer }> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site bulunamadı');
    const apartment = site.kind === 'APARTMENT';
    const unitInclude = { select: { number: true, block: { select: { name: true } } } } as const;
    const label = (u: { number: string; block: { name: string } }) => unitLabel(u, apartment);

    const [
      units,
      occupancies,
      charges,
      payments,
      accounts,
      balances,
      transactions,
      works,
      vendors,
      employees,
      requests,
      decisions,
    ] = await Promise.all([
      this.prisma.unit.findMany({ where: { siteId }, include: { block: true } }),
      this.prisma.occupancy.findMany({
        where: { siteId },
        include: { unit: unitInclude },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.charge.findMany({
        where: { siteId },
        include: {
          unit: unitInclude,
          chargeType: { select: { name: true } },
          allocations: { select: { amountKurus: true } },
        },
        orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.payment.findMany({
        where: { siteId },
        include: { unit: unitInclude },
        orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.cashAccount.findMany({ where: { siteId }, orderBy: { createdAt: 'asc' } }),
      accountBalances(this.prisma, siteId),
      this.prisma.transaction.findMany({
        where: { siteId },
        include: {
          account: { select: { name: true } },
          toAccount: { select: { name: true } },
          category: { select: { name: true } },
          vendor: { select: { name: true } },
          work: { select: { title: true } },
          block: { select: { name: true } },
        },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.work.findMany({
        where: { siteId },
        include: { vendor: { select: { name: true } }, block: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.vendor.findMany({ where: { siteId }, orderBy: { name: 'asc' } }),
      this.prisma.employee.findMany({ where: { siteId }, orderBy: { firstName: 'asc' } }),
      this.prisma.serviceRequest.findMany({
        where: { siteId },
        include: { unit: unitInclude },
        orderBy: { number: 'asc' },
      }),
      this.prisma.meetingItem.findMany({
        where: { siteId, decisionNo: { not: null } },
        include: { meeting: { select: { kind: true, heldAt: true, startsAt: true } } },
        orderBy: { decisionNo: 'asc' },
      }),
    ]);

    const sortedUnits = units.map((u) => ({ ...u, blockName: u.block.name })).sort(compareUnits);
    const paidOf = (c: { allocations: { amountKurus: number }[] }) =>
      c.allocations.reduce((sum, a) => sum + a.amountKurus, 0);

    const buffer = await this.documents.workbookXlsx([
      workbookSheet('Daireler', {
        title: `${site.name} · Daireler`,
        rows: sortedUnits,
        columns: [
          ...(apartment
            ? []
            : [{ header: 'Blok', value: (u: (typeof sortedUnits)[number]) => u.block.name }]),
          { header: 'Daire no', value: (u) => u.number },
          { header: 'Kat', value: (u) => u.floor },
          { header: 'm²', value: (u) => u.areaM2 },
          { header: 'Arsa payı', value: (u) => u.landShare },
          { header: 'Arşivlendi', value: (u) => trDate(u.archivedAt) },
        ],
      }),
      workbookSheet('Sakinler', {
        title: `${site.name} · Sakinler`,
        rows: occupancies,
        columns: [
          { header: 'Daire', value: (o) => label(o.unit) },
          { header: 'Ad', value: (o) => o.firstName },
          { header: 'Soyad', value: (o) => o.lastName },
          { header: 'Tür', value: (o) => occupancyTypeLabels[o.type] },
          { header: 'Telefon', value: (o) => o.phone },
          { header: 'E-posta', value: (o) => o.email },
          { header: 'Giriş', value: (o) => trDate(o.startDate) },
          { header: 'Çıkış', value: (o) => trDate(o.endDate) },
          { header: 'Borçtan sorumlu', value: (o) => (o.isResponsibleForDues ? 'Evet' : 'Hayır') },
          { header: 'İletişim onayı', value: (o) => (o.contactConsent ? 'Evet' : 'Hayır') },
          { header: 'Not', value: (o) => o.notes },
        ],
      }),
      workbookSheet('Borçlar', {
        title: `${site.name} · Borçlar`,
        rows: charges,
        columns: [
          { header: 'Daire', value: (c) => label(c.unit) },
          { header: 'Tür', value: (c) => c.chargeType.name },
          { header: 'Dönem', value: (c) => c.period },
          { header: 'Açıklama', value: (c) => c.description },
          { header: 'Borç tarihi', value: (c) => trDate(c.issueDate) },
          { header: 'Son ödeme', value: (c) => trDate(c.dueDate) },
          { header: 'Tutar', value: (c) => c.amountKurus, money: true },
          { header: 'Ödenen', value: (c) => paidOf(c), money: true },
          {
            header: 'Kalan',
            value: (c) => (c.cancelledAt ? 0 : c.amountKurus - paidOf(c)),
            money: true,
          },
          {
            header: 'İptal',
            value: (c) => (c.cancelledAt ? `İptal: ${c.cancelReason ?? ''}` : null),
          },
        ],
      }),
      workbookSheet('Tahsilatlar', {
        title: `${site.name} · Tahsilatlar`,
        rows: payments,
        columns: [
          { header: 'Makbuz no', value: (p) => p.receiptNo },
          { header: 'Daire', value: (p) => label(p.unit) },
          { header: 'Tarih', value: (p) => trDate(p.paidAt) },
          { header: 'Yöntem', value: (p) => paymentMethodLabels[p.method] },
          { header: 'Tutar', value: (p) => p.amountKurus, money: true },
          { header: 'Referans', value: (p) => p.reference },
          { header: 'Not', value: (p) => p.note },
          {
            header: 'İptal',
            value: (p) => (p.cancelledAt ? `İptal: ${p.cancelReason ?? ''}` : null),
          },
        ],
      }),
      workbookSheet('Kasa hesapları', {
        title: `${site.name} · Kasa ve banka hesapları`,
        rows: accounts,
        columns: [
          { header: 'Hesap', value: (a) => a.name },
          { header: 'Tür', value: (a) => cashAccountKindLabels[a.kind] },
          { header: 'Açılış bakiyesi', value: (a) => a.openingBalanceKurus, money: true },
          {
            header: 'Güncel bakiye',
            value: (a) => balances.get(a.id) ?? a.openingBalanceKurus,
            money: true,
          },
          { header: 'Durum', value: (a) => (a.isActive ? 'Aktif' : 'Pasif') },
        ],
      }),
      workbookSheet('Gelir-gider', {
        title: `${site.name} · Gelir, gider ve transferler`,
        rows: transactions,
        columns: [
          { header: 'Tarih', value: (t) => trDate(t.date) },
          { header: 'Tür', value: (t) => transactionTypeLabels[t.type] },
          { header: 'Hesap', value: (t) => t.account.name },
          { header: 'Hedef hesap', value: (t) => t.toAccount?.name ?? null },
          { header: 'Kategori', value: (t) => t.category?.name ?? null },
          { header: 'Tutar', value: (t) => t.amountKurus, money: true },
          { header: 'Açıklama', value: (t) => t.description },
          { header: 'Firma', value: (t) => t.vendor?.name ?? null },
          { header: 'İş', value: (t) => t.work?.title ?? null },
          { header: 'Blok', value: (t) => t.block?.name ?? null },
          { header: 'Belge no', value: (t) => t.documentNo },
          {
            header: 'İptal',
            value: (t) => (t.cancelledAt ? `İptal: ${t.cancelReason ?? ''}` : null),
          },
        ],
      }),
      workbookSheet('Yapılan işler', {
        title: `${site.name} · Yapılan işler`,
        rows: works,
        columns: [
          { header: 'İş', value: (w) => w.title },
          { header: 'Firma', value: (w) => w.vendor?.name ?? null },
          { header: 'Blok', value: (w) => w.block?.name ?? null },
          { header: 'Başlangıç', value: (w) => trDate(w.startDate) },
          { header: 'Bitiş', value: (w) => trDate(w.endDate) },
          { header: 'Anlaşılan tutar', value: (w) => w.agreedKurus, money: true },
          { header: 'Durum', value: (w) => workStatusLabels[w.status] },
          { header: 'Açıklama', value: (w) => w.description },
        ],
      }),
      workbookSheet('Firmalar', {
        title: `${site.name} · Firmalar`,
        rows: vendors,
        columns: [
          { header: 'Firma', value: (v) => v.name },
          { header: 'Telefon', value: (v) => v.phone },
          { header: 'Vergi / T.C. no', value: (v) => v.taxNumber },
          { header: 'Not', value: (v) => v.notes },
        ],
      }),
      workbookSheet('Çalışanlar', {
        title: `${site.name} · Çalışanlar`,
        rows: employees,
        columns: [
          { header: 'Ad', value: (e) => e.firstName },
          { header: 'Soyad', value: (e) => e.lastName },
          { header: 'Görev', value: (e) => employeeRoleLabels[e.role] },
          { header: 'Telefon', value: (e) => e.phone },
          { header: 'İşe başlama', value: (e) => trDate(e.startDate) },
          { header: 'Durum', value: (e) => (e.isActive ? 'Aktif' : 'Pasif') },
          { header: 'Not', value: (e) => e.notes },
        ],
      }),
      workbookSheet('Talepler', {
        title: `${site.name} · Arıza ve talepler`,
        rows: requests,
        columns: [
          { header: 'No', value: (r) => r.number },
          { header: 'Daire', value: (r) => (r.unit ? label(r.unit) : 'Görevli mesajı') },
          { header: 'Kategori', value: (r) => requestCategoryLabels[r.category] },
          { header: 'Başlık', value: (r) => r.title },
          { header: 'Açıklama', value: (r) => r.description },
          { header: 'Durum', value: (r) => requestStatusLabels[r.status] },
          { header: 'Açılış', value: (r) => trDate(r.createdAt) },
          { header: 'Çözüm', value: (r) => trDate(r.resolvedAt) },
        ],
      }),
      workbookSheet('Genel kurul kararları', {
        title: `${site.name} · Karar defteri`,
        rows: decisions,
        columns: [
          { header: 'Karar no', value: (d) => d.decisionNo },
          { header: 'Toplantı', value: (d) => meetingKindLabels[d.meeting.kind] },
          { header: 'Tarih', value: (d) => trDate(d.meeting.heldAt ?? d.meeting.startsAt) },
          { header: 'Gündem maddesi', value: (d) => d.title },
          { header: 'Sonuç', value: (d) => (d.result ? decisionResultLabels[d.result] : null) },
          { header: 'Karar', value: (d) => d.resolution },
          { header: 'Kabul', value: (d) => d.votesFor },
          { header: 'Ret', value: (d) => d.votesAgainst },
          { header: 'Çekimser', value: (d) => d.votesAbstain },
        ],
      }),
    ]);
    return { name: site.name, buffer };
  }

  private async verifyIdentity(userId: string, identifier: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const value = identifier.trim();
    const matches = value.includes('@')
      ? user.email === value.toLowerCase()
      : Boolean(user.phone) && normalizeTrPhone(value) === user.phone;
    if (!matches || !user.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
      throw new BadRequestException('Kullanıcı adı veya şifre hatalı');
    }
  }
}

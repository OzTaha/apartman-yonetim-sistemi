import {
  Controller,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Res,
  type StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { formatKurusTl, siteRoleLabels, unitLabel } from '@apartman/shared';
import type { Response } from 'express';
import type { Content } from 'pdfmake/interfaces';
import { activeOn, todayInIstanbul } from '../../common/dates';
import { formatDateTr, PDF, sendFile } from '../../common/http';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteRoles, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { AuditService } from '../audit/audit.service';
import { nextCounter } from '../finance/finance.ledger';
import { UnitAccessGuard } from '../units/units';
import { AccountService } from './account';
import { DocumentsService } from './documents.service';

@Injectable()
export class ClearanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly accounts: AccountService,
    private readonly documents: DocumentsService,
    private readonly audit: AuditService,
  ) {}

  async pdf(unitId: string): Promise<{ file: Buffer; name: string }> {
    const siteId = this.tenant.siteId;
    const today = todayInIstanbul();
    const [account, unit, issuer] = await Promise.all([
      this.accounts.account(unitId),
      this.tenant.db.unit.findUniqueOrThrow({
        where: { id: unitId },
        include: {
          block: { select: { name: true } },
          site: { select: { name: true, kind: true, address: true, city: true } },
          occupancies: {
            where: activeOn(today),
            select: { firstName: true, lastName: true, type: true },
            orderBy: { type: 'asc' },
          },
        },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: this.tenant.userId! },
        select: { firstName: true, lastName: true },
      }),
    ]);
    const role = this.tenant.role;
    const year = today.slice(0, 4);
    const number = await nextCounter(this.prisma, siteId, `clearance-${year}`);
    const open = account.charges.filter((c) => !c.cancelledAt && c.remainingKurus > 0);
    const debt = account.debtKurus;
    const label = unitLabel(unit.site.kind, unit.block.name, unit.number);
    const place = [unit.site.address, unit.site.city].filter(Boolean).join(', ');
    const occupants =
      unit.occupancies
        .map((o) => `${o.firstName} ${o.lastName} (${o.type === 'OWNER' ? 'malik' : 'kiracı'})`)
        .join(', ') || '—';
    const right = { alignment: 'right' as const };

    const content: Content[] = [
      {
        columns: [
          {
            width: '*',
            text: [
              { text: `${unit.site.name}\n`, bold: true, fontSize: 12 },
              { text: place, color: '#555555' },
            ],
          },
          {
            width: 'auto',
            text: [`Sayı: ${year}/${number}\n`, `Tarih: ${formatDateTr(today)}`],
            ...right,
          },
        ],
      },
      {
        text: debt > 0 ? 'BORÇ DURUM YAZISI' : 'BORCU YOKTUR YAZISI',
        style: 'title',
        alignment: 'center',
        margin: [0, 28, 0, 20],
      },
      { text: [{ text: 'Bağımsız bölüm: ', bold: true }, label], margin: [0, 0, 0, 4] },
      { text: [{ text: 'Kayıtlı kişiler: ', bold: true }, occupants], margin: [0, 0, 0, 16] },
      {
        text:
          debt > 0
            ? `${label} bağımsız bölümünün ${formatDateTr(today)} tarihi itibarıyla yönetimimize toplam ${formatKurusTl(debt)} borcu bulunmaktadır. Borçların dökümü aşağıdadır.`
            : `${label} bağımsız bölümünün ${formatDateTr(today)} tarihi itibarıyla yönetimimize aidat, gider payı veya başka herhangi bir borcu bulunmamaktadır.`,
        fontSize: 11,
        lineHeight: 1.4,
      },
      ...(open.length > 0
        ? ([
            {
              margin: [0, 16, 0, 0],
              table: {
                headerRows: 1,
                widths: ['*', 70, 70, 70],
                body: [
                  [
                    { text: 'Borç', style: 'th' },
                    { text: 'Son ödeme', style: 'th' },
                    { text: 'Tutar', style: 'th', ...right },
                    { text: 'Kalan', style: 'th', ...right },
                  ],
                  ...open.map((c) => [
                    c.label,
                    formatDateTr(c.dueDate),
                    { text: formatKurusTl(c.amountKurus), ...right },
                    { text: formatKurusTl(c.remainingKurus), ...right },
                  ]),
                  [
                    { text: 'Toplam', bold: true, colSpan: 3 },
                    {},
                    {},
                    { text: formatKurusTl(debt), bold: true, ...right },
                  ],
                ],
              },
              layout: 'lightHorizontalLines',
            },
            account.overdueKurus > 0
              ? {
                  text: `Bunun ${formatKurusTl(account.overdueKurus)} tutarındaki kısmının son ödeme tarihi geçmiştir.`,
                  margin: [0, 8, 0, 0],
                }
              : { text: '' },
          ] as Content[])
        : []),
      {
        text: 'Bu yazı ilgilinin talebi üzerine düzenlenmiştir.',
        margin: [0, 24, 0, 0],
        color: '#555555',
      },
      {
        margin: [0, 40, 0, 0],
        columns: [
          { width: '*', text: '' },
          {
            width: 200,
            alignment: 'center',
            text: [
              { text: `${issuer.firstName} ${issuer.lastName}\n`, bold: true },
              `${role === 'BLOCK_MANAGER' ? siteRoleLabels.BLOCK_MANAGER : role === 'PLATFORM_ADMIN' ? 'Sistem yöneticisi' : 'Yönetici'}\n\n\n`,
              { text: 'İmza / Kaşe', color: '#777777' },
            ],
          },
        ],
      },
    ];

    const file = await this.documents.render(content);
    await this.audit.record({
      action: 'ISSUE',
      entityType: 'Clearance',
      entityId: unitId,
      after: { number: `${year}/${number}`, debtKurus: debt },
    });
    const short = unitLabel(unit.site.kind, unit.block.name, unit.number, 'short');
    return { file, name: `borc-durum-${short}-${today}.pdf` };
  }
}

@ApiTags('Aidat ve borçlar')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('units')
export class ClearanceController {
  constructor(private readonly clearance: ClearanceService) {}

  @SiteRoles('SITE_MANAGER', 'BLOCK_MANAGER')
  @UseGuards(UnitAccessGuard)
  @Get(':id/clearance.pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, name } = await this.clearance.pdf(id);
    return sendFile(res, name, PDF, file);
  }
}

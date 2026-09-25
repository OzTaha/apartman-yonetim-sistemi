import { BadRequestException, Injectable } from '@nestjs/common';
import {
  formatKurus,
  renderTemplate,
  unitLabel,
  type RecipientFilter,
  type TemplateVariable,
} from '@apartman/shared';
import { activeOn } from '../../common/dates';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../tenancy/tenancy';
import { AccountService } from '../dues/account';
import { compareUnits } from '../residents/occupancy.mapper';

export interface RecipientQuery {
  filter: RecipientFilter;
  blockIds: string[];
  unitIds: string[];
  duesOnly: boolean;
  onlyUnitIds?: string[];
}

export interface Recipient {
  occupancyId: string;
  name: string;
  blockName: string;
  unitNumber: string;
  phone: string | null;
  values: Record<TemplateVariable, string>;
  skipReason: string | null;
}

@Injectable()
export class RecipientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly accounts: AccountService,
  ) {}

  async resolve(query: RecipientQuery): Promise<Recipient[]> {
    await this.assertTargets(query);
    const [site, debts, units] = await Promise.all([
      this.prisma.site.findUniqueOrThrow({
        where: { id: this.tenant.siteId },
        select: { name: true, kind: true },
      }),
      this.accounts.debtReport(),
      this.tenant.db.unit.findMany({
        where: {
          archivedAt: null,
          ...(query.filter === 'BLOCKS' ? { blockId: { in: query.blockIds } } : {}),
          ...(query.filter === 'UNITS' ? { id: { in: query.unitIds } } : {}),
          ...(query.onlyUnitIds ? { AND: [{ id: { in: query.onlyUnitIds } }] } : {}),
        },
        include: {
          block: { select: { name: true } },
          occupancies: {
            where: { ...activeOn(), ...(query.duesOnly ? { isResponsibleForDues: true } : {}) },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      }),
    ]);
    const debtOf = new Map(debts.map((d) => [d.unitId, d]));
    const selected = units
      .filter((u) => {
        const debt = debtOf.get(u.id);
        if (query.filter === 'DEBTORS') return (debt?.debtKurus ?? 0) > 0;
        if (query.filter === 'OVERDUE') return (debt?.overdueKurus ?? 0) > 0;
        return true;
      })
      .map((u) => ({ ...u, blockName: u.block.name }))
      .sort(compareUnits);

    const phones = new Set<string>();
    const recipients: Recipient[] = [];
    for (const unit of selected) {
      const daire = unitLabel(site.kind, unit.blockName, unit.number).replace(' · ', ' ');
      const borc = formatKurus(debtOf.get(unit.id)?.debtKurus ?? 0);
      for (const o of unit.occupancies) {
        const name = `${o.firstName} ${o.lastName}`;
        let skipReason: string | null = null;
        if (!o.phone) skipReason = 'Telefon numarası yok';
        else if (!o.contactConsent) skipReason = 'İletişim onayı yok';
        else if (phones.has(o.phone)) continue;
        if (o.phone && !skipReason) phones.add(o.phone);
        recipients.push({
          occupancyId: o.id,
          name,
          blockName: unit.blockName,
          unitNumber: unit.number,
          phone: o.phone,
          values: { ad: name, daire, borc, site: site.name },
          skipReason,
        });
      }
    }
    return recipients;
  }

  render(body: string, recipient: Recipient): string {
    return renderTemplate(body, recipient.values);
  }

  private async assertTargets(query: RecipientQuery) {
    if (query.filter === 'BLOCKS') {
      const count = await this.tenant.db.block.count({ where: { id: { in: query.blockIds } } });
      if (count !== new Set(query.blockIds).size) throw new BadRequestException('Blok bulunamadı');
    }
    if (query.filter === 'UNITS') {
      const count = await this.tenant.db.unit.count({ where: { id: { in: query.unitIds } } });
      if (count !== new Set(query.unitIds).size) throw new BadRequestException('Daire bulunamadı');
    }
  }
}

import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { periodRange, type TransparencyDto } from '@apartman/shared';
import { dateOnly, toDateString, todayInIstanbul } from '../../common/dates';
import { TransparencyQueryDto } from '../../common/finance.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteRoles, SiteScoped, TenantContext } from '../../tenancy/tenancy';
import { currentPeriod } from '../dues/site-settings';
import { accountBalances, monthlyTotals } from './finance.ledger';
import { attachmentSelect, toAttachmentDto } from './finance.mapper';
import { WorksService } from './works';

@Injectable()
export class TransparencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly works: WorksService,
  ) {}

  async get(year = Number(todayInIstanbul().slice(0, 4))): Promise<TransparencyDto> {
    const siteId = this.tenant.siteId;
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const now = currentPeriod();
    const lastPeriod = `${year}-12` < now ? `${year}-12` : now;

    const [accounts, balances, months, expenses, works, workAttachments] = await Promise.all([
      this.tenant.db.cashAccount.findMany({ select: { id: true } }),
      accountBalances(this.prisma, siteId),
      monthlyTotals(this.prisma, siteId, from, to),
      this.tenant.db.transaction.findMany({
        where: {
          type: 'EXPENSE',
          cancelledAt: null,
          visibleToResidents: true,
          date: { gte: dateOnly(from), lte: dateOnly(to) },
        },
        include: {
          category: { select: { name: true } },
          vendor: { select: { name: true } },
          work: { select: { title: true, visibleToResidents: true } },
          attachments: { select: attachmentSelect, orderBy: { createdAt: 'asc' } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      this.works.list(true),
      this.tenant.db.attachment.findMany({
        where: { work: { visibleToResidents: true } },
        select: { ...attachmentSelect, workId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      year,
      balanceKurus: accounts.reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0),
      months:
        `${year}-01` > now
          ? []
          : periodRange(`${year}-01`, lastPeriod).map(
              (period) => months.get(period) ?? { period, incomeKurus: 0, expenseKurus: 0 },
            ),
      expenses: expenses.map((t) => ({
        id: t.id,
        date: toDateString(t.date),
        amountKurus: t.amountKurus,
        categoryName: t.category?.name ?? null,
        vendorName: t.vendor?.name ?? null,
        workId: t.work?.visibleToResidents ? t.workId : null,
        workTitle: t.work?.visibleToResidents ? t.work.title : null,
        description: t.description,
        attachments: t.attachments.map(toAttachmentDto),
      })),
      works: works.map((w) => ({
        ...w,
        attachments: workAttachments.filter((a) => a.workId === w.id).map(toAttachmentDto),
      })),
    };
  }
}

@ApiTags('Gelir-gider')
@ApiBearerAuth()
@SiteScoped('SITE_MANAGER')
@Controller('transparency')
export class TransparencyController {
  constructor(private readonly transparency: TransparencyService) {}

  @SiteRoles('SITE_MANAGER', 'RESIDENT')
  @Get()
  get(@Query() query: TransparencyQueryDto): Promise<TransparencyDto> {
    return this.transparency.get(query.year);
  }
}

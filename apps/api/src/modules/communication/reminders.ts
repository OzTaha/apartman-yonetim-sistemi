import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { addDays, chargeState } from '@apartman/shared';
import { ClsService } from 'nestjs-cls';
import { dateOnly, todayInIstanbul } from '../../common/dates';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext, type AppClsStore } from '../../tenancy/tenancy';
import { CampaignsService } from './campaigns';
import { readReminder } from './templates';

const REMINDER_HOUR = 10;

const istanbulHour = () =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Europe/Istanbul',
    }).format(new Date()),
  );

@Injectable()
export class RemindersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly campaigns: CampaignsService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async run(today: string): Promise<number> {
    const site = await this.prisma.site.findUniqueOrThrow({
      where: { id: this.tenant.siteId },
      select: { settings: true },
    });
    const settings = readReminder(site.settings);
    if (!settings.enabled) return 0;
    const dueDate = addDays(today, -settings.daysAfterDue);
    const charges = await this.tenant.db.charge.findMany({
      where: { cancelledAt: null, dueDate: dateOnly(dueDate), unit: { archivedAt: null } },
      select: {
        unitId: true,
        amountKurus: true,
        allocations: { select: { amountKurus: true } },
      },
    });
    const unitIds = [
      ...new Set(
        charges
          .filter(
            (c) =>
              chargeState(
                c.amountKurus,
                c.allocations.reduce((sum, a) => sum + a.amountKurus, 0),
                dueDate,
                today,
              ).remainingKurus > 0,
          )
          .map((c) => c.unitId),
      ),
    ];
    if (unitIds.length === 0) return 0;
    const autoKey = `reminder:${today}`;
    if (await this.tenant.db.messageCampaign.findFirst({ where: { autoKey } })) return 0;
    const campaign = await this.campaigns.send(
      {
        kind: 'DUES_REMINDER',
        channel: settings.channel,
        filter: 'OVERDUE',
        blockIds: [],
        unitIds: [],
        body: settings.body,
      },
      { autoKey, onlyUnitIds: unitIds },
    );
    return campaign?.counts.queued ?? 0;
  }

  @Cron(`0 0 ${REMINDER_HOUR} * * *`, { name: 'dues-reminder', timeZone: 'Europe/Istanbul' })
  async daily(): Promise<void> {
    await this.runAllSites(todayInIstanbul());
  }

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    if (istanbulHour() < REMINDER_HOUR) return;
    void this.runAllSites(todayInIstanbul()).catch((error: unknown) =>
      this.logger.error(`Otomatik hatırlatma çalışmadı: ${(error as Error).message}`),
    );
  }

  async runAllSites(today: string): Promise<void> {
    const sites = await this.prisma.site.findMany({
      where: { settings: { path: ['reminder', 'enabled'], equals: true } },
      select: { id: true, name: true },
    });
    for (const site of sites) {
      await this.cls.run(async () => {
        this.cls.set('siteId', site.id);
        try {
          const sent = await this.run(today);
          if (sent > 0) this.logger.log(`${site.name}: ${sent} borç hatırlatması sıraya alındı`);
        } catch (error) {
          this.logger.warn(`${site.name}: hatırlatma gönderilemedi: ${(error as Error).message}`);
        }
      });
    }
  }
}

import { formatKurus, periodLabel, type TransactionDto } from '@apartman/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, HandCoins, Minus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentDialog } from '@/features/dues/payment-dialog';
import { transactionTitle } from '@/features/finance/files';
import { MonthChart } from '@/features/finance/month-chart';
import { TransactionDialog } from '@/features/finance/transaction-dialog';
import { formatDate } from '@/lib/format';
import { useDashboard } from '@/lib/queries';
import { labelUnit } from '@/lib/unit-label';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/panel')({
  component: () => (
    <ManagerOnly>
      <DashboardPage />
    </ManagerOnly>
  ),
});

function Stat({
  label,
  value,
  hint,
  tone,
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad';
  to?: '/daireler' | '/aidat' | '/borclar' | '/tahsilatlar' | '/kasa';
}) {
  const body = (
    <Card className={cn('h-full py-4', to && 'transition-colors hover:bg-muted/50')}>
      <CardContent className="grid gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            'text-xl font-semibold tabular-nums',
            tone === 'good' && 'text-emerald-700 dark:text-emerald-400',
            tone === 'bad' && 'text-red-700 dark:text-red-400',
          )}
        >
          {value}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function ListCard({
  title,
  to,
  empty,
  children,
}: {
  title: string;
  to: '/kasa' | '/borclar' | '/raporlar' | '/duyurular';
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to={to}>
            Tümü
            <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {empty ? <p className="text-sm text-muted-foreground">Kayıt yok.</p> : children}
      </CardContent>
    </Card>
  );
}

function TransactionLine({ t }: { t: TransactionDto }) {
  const sign = t.type === 'INCOME' ? '+' : t.type === 'EXPENSE' ? '−' : '';
  return (
    <li className="flex items-center justify-between gap-2 py-2 text-sm">
      <span className="grid min-w-0">
        <span className="truncate font-medium">{transactionTitle(t)}</span>
        <span className="text-xs text-muted-foreground">
          {formatDate(t.date)} · {t.accountName}
        </span>
      </span>
      <span
        className={cn(
          'shrink-0 font-medium tabular-nums',
          t.type === 'INCOME' && 'text-emerald-700 dark:text-emerald-400',
          t.type === 'EXPENSE' && 'text-red-700 dark:text-red-400',
        )}
      >
        {sign}
        {formatKurus(t.amountKurus)}
      </span>
    </li>
  );
}

function DashboardPage() {
  const dashboard = useDashboard();
  const [dialog, setDialog] = useState<'pay' | 'expense' | null>(null);
  const d = dashboard.data;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Panel"
        description={d ? `${periodLabel(d.period)} özeti` : undefined}
        actions={
          <>
            <Button onClick={() => setDialog('pay')}>
              <HandCoins />
              Ödeme al
            </Button>
            <Button variant="outline" onClick={() => setDialog('expense')}>
              <Minus />
              Gider ekle
            </Button>
          </>
        }
      />

      {dashboard.isPending ? (
        <LoadingRows />
      ) : dashboard.isError ? (
        <ErrorState error={dashboard.error} />
      ) : d ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label="Toplam daire" value={String(d.unitCount)} to="/daireler" />
            <Stat
              label="Bu ay aidatını ödeyen"
              value={d.duesUnitCount ? `${d.paidUnitCount} / ${d.duesUnitCount}` : '—'}
              hint={d.duesUnitCount ? undefined : 'Bu ayın aidatı henüz yazılmadı'}
              tone={d.duesUnitCount && d.paidUnitCount === d.duesUnitCount ? 'good' : undefined}
              to="/aidat"
            />
            <Stat
              label="Gecikmiş borçlu daire"
              value={String(d.debtorUnitCount)}
              tone={d.debtorUnitCount > 0 ? 'bad' : 'good'}
              to="/borclar"
            />
            <Stat
              label="Bu ay tahsilat"
              value={formatKurus(d.collectedKurus)}
              tone="good"
              to="/tahsilatlar"
            />
            <Stat
              label="Bekleyen toplam borç"
              value={formatKurus(d.openDebtKurus)}
              hint={d.overdueDebtKurus ? `${formatKurus(d.overdueDebtKurus)} gecikmiş` : undefined}
              tone={d.overdueDebtKurus > 0 ? 'bad' : undefined}
              to="/borclar"
            />
            <Stat label="Kasa bakiyesi" value={formatKurus(d.cashBalanceKurus)} to="/kasa" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Son 6 ay gelir ve gider</CardTitle>
            </CardHeader>
            <CardContent>
              <MonthChart months={d.months} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <ListCard title="Geciken ödemeler" to="/raporlar" empty={d.topDebtors.length === 0}>
              <ul className="divide-y">
                {d.topDebtors.map((r) => (
                  <li key={r.unitId}>
                    <Link
                      to="/daireler/$unitId"
                      params={{ unitId: r.unitId }}
                      className="flex items-center justify-between gap-2 py-2 text-sm hover:underline"
                    >
                      <span className="grid min-w-0">
                        <span className="truncate font-medium">
                          {labelUnit(r.blockName, r.unitNumber)}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[
                            r.responsible,
                            r.oldestUnpaidPeriod && `en eski ${periodLabel(r.oldestUnpaidPeriod)}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium text-red-700 tabular-nums dark:text-red-400">
                        {formatKurus(r.overdueKurus)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </ListCard>

            <ListCard
              title="Yaklaşan ödemeler"
              to="/borclar"
              empty={d.upcomingCharges.length === 0}
            >
              <ul className="divide-y">
                {d.upcomingCharges.map((c) => (
                  <li key={c.chargeId}>
                    <Link
                      to="/daireler/$unitId"
                      params={{ unitId: c.unitId }}
                      className="flex items-center justify-between gap-2 py-2 text-sm hover:underline"
                    >
                      <span className="grid min-w-0">
                        <span className="truncate font-medium">
                          {labelUnit(c.blockName, c.unitNumber, 'short')} · {c.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Vade {formatDate(c.dueDate)}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatKurus(c.remainingKurus)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </ListCard>
          </div>

          <ListCard title="Son duyurular" to="/duyurular" empty={d.announcements.length === 0}>
            <ul className="divide-y">
              {d.announcements.map((a) => (
                <li key={a.id}>
                  <Link
                    to="/duyurular/$announcementId"
                    params={{ announcementId: a.id }}
                    className="flex items-center justify-between gap-2 py-2 text-sm hover:underline"
                  >
                    <span className="grid min-w-0">
                      <span className="truncate font-medium">{a.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(a.publishedAt)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {a.audienceCount > 0
                        ? `${a.readCount}/${a.audienceCount} okudu`
                        : 'Portal kullanıcısı yok'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </ListCard>

          <ListCard
            title="Son gelir ve giderler"
            to="/kasa"
            empty={d.recentTransactions.length === 0}
          >
            <ul className="divide-y">
              {d.recentTransactions.map((t) => (
                <TransactionLine key={t.id} t={t} />
              ))}
            </ul>
          </ListCard>
        </>
      ) : null}

      <PaymentDialog open={dialog === 'pay'} onOpenChange={(o) => setDialog(o ? 'pay' : null)} />
      <TransactionDialog
        type="EXPENSE"
        open={dialog === 'expense'}
        onOpenChange={(o) => setDialog(o ? 'expense' : null)}
      />
    </div>
  );
}

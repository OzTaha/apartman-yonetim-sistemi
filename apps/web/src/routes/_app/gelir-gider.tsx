import {
  addMonths,
  formatKurus,
  periodLabel,
  periodOfDate,
  type FinanceCategoryTotalDto,
  type MonthClosingDto,
} from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FileDown, Lock, LockOpen } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MonthChart } from '@/features/finance/month-chart';
import { apiFetch, downloadFile, errorMessage } from '@/lib/api';
import { formatDate, todayIso } from '@/lib/format';
import { useApiMutation, useClosings, useFinanceSummary } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/gelir-gider')({
  validateSearch: (s: Record<string, unknown>): { bas?: string; bit?: string } => ({
    bas: typeof s['bas'] === 'string' ? s['bas'] : undefined,
    bit: typeof s['bit'] === 'string' ? s['bit'] : undefined,
  }),
  component: () => (
    <ManagerOnly>
      <FinanceReportPage />
    </ManagerOnly>
  ),
});

function lastDay(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

function CategoryBars({ items, tone }: { items: FinanceCategoryTotalDto[]; tone: 'in' | 'out' }) {
  const max = Math.max(1, ...items.map((i) => i.amountKurus));
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Kayıt yok.</p>;
  return (
    <ul className="grid gap-2">
      {items.map((c) => (
        <li key={c.categoryId} className="grid gap-1 text-sm">
          <div className="flex justify-between gap-2">
            <span>{c.name}</span>
            <span className="font-medium tabular-nums">{formatKurus(c.amountKurus)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', tone === 'in' ? 'bg-emerald-600' : 'bg-red-600')}
              style={{ width: `${(c.amountKurus / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ClosingRow({ closing }: { closing: MonthClosingDto }) {
  const [busy, setBusy] = useState(false);
  const from = `${closing.period}-01`;
  const to = lastDay(closing.period);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="grid">
        <span className="font-medium">{periodLabel(closing.period)}</span>
        <span className="text-xs text-muted-foreground">
          {formatDate(closing.closedAt)}
          {closing.closedByName ? ` · ${closing.closedByName}` : ''} · gelir{' '}
          {formatKurus(closing.incomeKurus)} · gider {formatKurus(closing.expenseKurus)}
        </span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await downloadFile(
              `/finance/report.pdf?from=${from}&to=${to}`,
              `kapanis-${closing.period}.pdf`,
            );
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <FileDown />
        Kapanış raporu
      </Button>
    </li>
  );
}

function ClosingsCard() {
  const closings = useClosings();
  const current = periodOfDate(todayIso());
  const locked = closings.data?.lockedThrough ?? null;
  const candidates = Array.from({ length: 12 }, (_, i) => addMonths(current, -(i + 1))).filter(
    (p) => !locked || p > locked,
  );
  const [period, setPeriod] = useState<string>('');
  const selected = period && candidates.includes(period) ? period : (candidates[0] ?? '');
  const oldestOpen = locked ? addMonths(locked, 1) : null;
  const close = useApiMutation(
    (p: string) =>
      apiFetch<MonthClosingDto>('/finance/closings', { method: 'POST', body: { period: p } }),
    { success: (c) => `${periodLabel(c.period)} kapatıldı` },
  );
  const reopen = useApiMutation(
    () => apiFetch<void>('/finance/closings/latest', { method: 'DELETE' }),
    { success: 'Son kapanış geri alındı' },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ay kapanışı</CardTitle>
        <CardDescription>
          Kapatılan ay ve öncesindeki gelir, gider, tahsilat ve belgeler değiştirilemez. Kapanışta
          hesap bakiyeleri kaydedilir.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {closings.isPending ? (
          <LoadingRows rows={2} />
        ) : closings.isError ? (
          <ErrorState error={closings.error} />
        ) : (
          <>
            <Alert>
              {locked ? <Lock /> : <LockOpen />}
              <AlertDescription>
                {locked ? `${periodLabel(locked)} ve öncesi kapalı.` : 'Henüz kapatılmış ay yok.'}
              </AlertDescription>
            </Alert>
            {candidates.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="grid gap-1">
                  <Label htmlFor="close-period" className="text-xs text-muted-foreground">
                    Kapatılacak ay
                  </Label>
                  <Select value={selected} onValueChange={setPeriod}>
                    <SelectTrigger id="close-period" className="w-full sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((p) => (
                        <SelectItem key={p} value={p}>
                          {periodLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={!selected || close.isPending}
                  onClick={() => {
                    const note =
                      oldestOpen && selected > oldestOpen
                        ? ` ${periodLabel(oldestOpen)} ile ${periodLabel(selected)} arasındaki tüm aylar kapanacak.`
                        : '';
                    if (window.confirm(`${periodLabel(selected)} kapatılsın mı?${note}`))
                      close.mutate(selected);
                  }}
                >
                  <Lock />
                  Ayı kapat
                </Button>
              </div>
            )}
            {closings.data.closings.length > 0 && (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Kapanışlar</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={reopen.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `${periodLabel(closings.data.lockedThrough!)} kapanışı geri alınsın mı? Bu ayın kayıtları yeniden değiştirilebilir olur.`,
                        )
                      )
                        reopen.mutate(undefined);
                    }}
                  >
                    <LockOpen />
                    Son kapanışı geri al
                  </Button>
                </div>
                <ul className="divide-y rounded-md border">
                  {closings.data.closings.map((c) => (
                    <ClosingRow key={c.id} closing={c} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FinanceReportPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const today = todayIso();
  const from = search.bas ?? `${today.slice(0, 4)}-01-01`;
  const to = search.bit ?? today;
  const summary = useFinanceSummary(from, to);
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);
  const setFilter = (patch: Record<string, string | undefined>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  async function download(format: 'pdf' | 'xlsx') {
    setBusy(format);
    try {
      await downloadFile(
        `/finance/report.${format}?from=${from}&to=${to}`,
        `gelir-gider.${format}`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const s = summary.data;
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Gelir-gider raporu"
        actions={
          <>
            <Button
              variant="outline"
              disabled={busy !== null || from > to}
              onClick={() => void download('pdf')}
            >
              <FileDown />
              PDF
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null || from > to}
              onClick={() => void download('xlsx')}
            >
              <FileDown />
              Excel
            </Button>
          </>
        }
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:w-1/2">
        <div className="grid gap-1">
          <Label htmlFor="fin-from" className="text-xs text-muted-foreground">
            Başlangıç
          </Label>
          <Input
            id="fin-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFilter({ bas: e.target.value || undefined })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="fin-to" className="text-xs text-muted-foreground">
            Bitiş
          </Label>
          <Input
            id="fin-to"
            type="date"
            value={to}
            onChange={(e) => setFilter({ bit: e.target.value || undefined })}
          />
        </div>
      </div>

      {summary.isPending ? (
        <LoadingRows />
      ) : summary.isError ? (
        <ErrorState error={summary.error} />
      ) : s ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Gelir', s.incomeKurus, 'text-emerald-700 dark:text-emerald-400'],
              ['Gider', s.expenseKurus, 'text-red-700 dark:text-red-400'],
              ['Fark', s.netKurus, s.netKurus < 0 ? 'text-red-700 dark:text-red-400' : ''],
            ].map(([label, value, tone]) => (
              <Card key={label as string} className="py-4">
                <CardContent className="grid gap-1">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className={cn('text-xl font-semibold tabular-nums', tone as string)}>
                    {formatKurus(value as number)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Aylara göre</CardTitle>
            </CardHeader>
            <CardContent>
              <MonthChart months={s.byMonth} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Giderler</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryBars items={s.byCategory.filter((c) => c.kind === 'EXPENSE')} tone="out" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Gelirler</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryBars items={s.byCategory.filter((c) => c.kind === 'INCOME')} tone="in" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Hesap bakiyeleri</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y rounded-md border text-sm">
                {s.accounts.map((a) => (
                  <li key={a.accountId} className="grid grid-cols-3 gap-2 px-3 py-2">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-right text-muted-foreground tabular-nums">
                      {formatDate(from)}: {formatKurus(a.openingKurus)}
                    </span>
                    <span className="text-right font-medium tabular-nums">
                      {formatDate(to)}: {formatKurus(a.closingKurus)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}

      <ClosingsCard />
    </div>
  );
}

import { formatKurus } from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AttachmentList } from '@/features/finance/attachments';
import { MonthChart } from '@/features/finance/month-chart';
import { WorkProgress, WorkStatusBadge } from '@/features/finance/work-parts';
import { formatDate, todayIso } from '@/lib/format';
import { useTransparency } from '@/lib/queries';

export const Route = createFileRoute('/_app/giderler')({
  validateSearch: (s: Record<string, unknown>): { yil?: number } => ({
    yil: typeof s['yil'] === 'number' ? s['yil'] : undefined,
  }),
  component: TransparencyPage,
});

function TransparencyPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const thisYear = Number(todayIso().slice(0, 4));
  const year = search.yil ?? thisYear;
  const data = useTransparency(year);
  const years = Array.from({ length: 5 }, (_, i) => thisYear - i);

  const d = data.data;
  const income = d?.months.reduce((sum, m) => sum + m.incomeKurus, 0) ?? 0;
  const expense = d?.months.reduce((sum, m) => sum + m.expenseKurus, 0) ?? 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Giderler ve işler"
        description="Aidatların nereye harcandığı, yapılan işler, ödenen firmalar ve faturalar."
        actions={
          <Select
            value={String(year)}
            onValueChange={(v) =>
              void navigate({ search: { yil: Number(v) === thisYear ? undefined : Number(v) } })
            }
          >
            <SelectTrigger className="w-28" aria-label="Yıl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {data.isPending ? (
        <LoadingRows />
      ) : data.isError ? (
        <ErrorState error={data.error} />
      ) : d ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['Kasadaki toplam', d.balanceKurus],
                [`${year} geliri`, income],
                [`${year} gideri`, expense],
              ] as const
            ).map(([label, value]) => (
              <Card key={label} className="py-4">
                <CardContent className="grid gap-1">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-xl font-semibold tabular-nums">{formatKurus(value)}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          {d.months.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Aylara göre</CardTitle>
              </CardHeader>
              <CardContent>
                <MonthChart months={d.months} />
              </CardContent>
            </Card>
          )}

          <section className="grid gap-3">
            <h2 className="text-lg font-semibold">Yapılan işler</h2>
            {d.works.length === 0 ? (
              <EmptyState title="Paylaşılan iş kaydı yok" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {d.works.map((w) => (
                  <Card key={w.id} className="min-w-0 py-4">
                    <CardContent className="grid min-w-0 grid-cols-1 gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="grid gap-0.5">
                          <span className="font-medium">{w.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {[
                              w.vendorName,
                              w.startDate &&
                                `${formatDate(w.startDate)}${w.endDate ? ` – ${formatDate(w.endDate)}` : ''}`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                        <WorkStatusBadge status={w.status} />
                      </div>
                      {w.description && (
                        <p className="text-sm whitespace-pre-line text-muted-foreground">
                          {w.description}
                        </p>
                      )}
                      <WorkProgress work={w} />
                      <AttachmentList attachments={w.attachments} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Giderler</CardTitle>
              <CardDescription>
                Kişisel bilgi içeren bazı giderlerin ayrıntısı gizlenmiş olabilir; tutarları
                yukarıdaki toplamlara dahildir.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {d.expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">{year} için paylaşılan gider yok.</p>
              ) : (
                <ul className="divide-y">
                  {d.expenses.map((e) => (
                    <li key={e.id} className="grid grid-cols-1 gap-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2 text-sm">
                        <span className="grid min-w-0">
                          <span className="font-medium">{e.description || e.categoryName}</span>
                          <span className="text-xs text-muted-foreground">
                            {[formatDate(e.date), e.categoryName, e.vendorName, e.workTitle]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">
                          {formatKurus(e.amountKurus)}
                        </span>
                      </div>
                      <AttachmentList attachments={e.attachments} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

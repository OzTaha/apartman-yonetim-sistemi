import {
  formatKurus,
  periodLabel,
  type BudgetComparisonRowDto,
  type BudgetDetailDto,
  type BudgetUnitDto,
} from '@apartman/shared';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, CalendarCheck, FileDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { advanceLabel, usagePercent } from '@/features/budget/format';
import { LinesEditor } from '@/features/budget/lines-editor';
import { UsageBar } from '@/features/budget/parts';
import { apiFetch, downloadFile, errorMessage } from '@/lib/api';
import { useApiMutation, useBudget } from '@/lib/queries';
import { canManage, useRole } from '@/lib/session';
import { labelUnit } from '@/lib/unit-label';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/butce/$budgetId')({
  component: () => (
    <ManagerOnly allow={['AUDITOR']}>
      <BudgetPage />
    </ManagerOnly>
  ),
});

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="py-4">
      <CardContent className="grid gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
}

function ReadOnlyLines({ budget }: { budget: BudgetDetailDto }) {
  if (budget.lines.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz gider kalemi girilmedi.</p>;
  }
  return (
    <ul className="grid gap-2 text-sm">
      {budget.lines.map((l) => (
        <li key={l.categoryId} className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="font-medium">{l.categoryName}</span>
            {l.note && <span className="block text-muted-foreground">{l.note}</span>}
          </span>
          <span className="shrink-0 tabular-nums">{formatKurus(l.amountKurus)}</span>
        </li>
      ))}
    </ul>
  );
}

function ApplyPanel({ budget, manager }: { budget: BudgetDetailDto; manager: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const apply = useApiMutation(
    () => apiFetch<BudgetDetailDto>(`/budgets/${budget.id}/apply`, { method: 'POST' }),
    { success: 'Avans aidat, aidat planına eklendi', onSuccess: () => setConfirming(false) },
  );

  if (budget.applied && budget.appliedPlan) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <CalendarCheck className="size-4 shrink-0 text-emerald-600" />
        Aidat planına uygulandı: {periodLabel(budget.appliedPlan.validFrom)} döneminden itibaren
        geçerli.
      </p>
    );
  }
  if (!manager || budget.advanceKurus === 0 || budget.distributionError) return null;
  return (
    <div className="grid gap-2">
      {budget.appliedPlan && (
        <p className="text-sm text-muted-foreground">
          Bütçe, aidat planına uygulandıktan sonra değişti. Yeni tutarı uygulamak için tekrar
          uygulayın.
        </p>
      )}
      <Button className="w-fit" onClick={() => setConfirming(true)}>
        <CalendarCheck />
        Aidat planı olarak uygula
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avans aidat uygulansın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              {periodLabel(budget.applyFrom)} döneminden itibaren aylık aidat{' '}
              {budget.method === 'EQUAL'
                ? `daire başı ${formatKurus(budget.advanceKurus)}`
                : `toplam ${formatKurus(budget.advanceKurus)} olarak dağıtılarak`}{' '}
              tahakkuk eder. Önceki aylarda yazılmış aidatlar değişmez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              disabled={apply.isPending}
              onClick={(e) => {
                e.preventDefault();
                apply.mutate(undefined);
              }}
            >
              Uygula
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ComparisonCard({ budget }: { budget: BudgetDetailDto }) {
  const c = budget.comparison;
  const expectedToDate = Math.round((c.plannedKurus * c.elapsedMonths) / 12);
  const balance = c.duesCollectedKurus - c.actualKurus;
  const summary: [string, string][] = [
    ['Planlanan yıllık gider', formatKurus(c.plannedKurus)],
    [`Geçen ${c.elapsedMonths} ay için planlanan`, formatKurus(expectedToDate)],
    ['Gerçekleşen gider', formatKurus(c.actualKurus)],
    ['Tahakkuk eden avans aidat', formatKurus(c.duesAccruedKurus)],
    ['Tahsil edilen avans aidat', formatKurus(c.duesCollectedKurus)],
  ];
  const columns: ColumnDef<BudgetComparisonRowDto>[] = [
    {
      accessorKey: 'categoryName',
      header: 'Kalem',
      cell: ({ row }) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {row.original.categoryName}
          {row.original.plannedKurus === 0 && <Badge variant="outline">Bütçe dışı</Badge>}
        </span>
      ),
    },
    {
      accessorKey: 'plannedKurus',
      header: 'Planlanan',
      cell: ({ row }) => formatKurus(row.original.plannedKurus),
    },
    {
      accessorKey: 'actualKurus',
      header: 'Gerçekleşen',
      cell: ({ row }) => formatKurus(row.original.actualKurus),
    },
    {
      id: 'remaining',
      header: 'Kalan',
      accessorFn: (r) => r.plannedKurus - r.actualKurus,
      cell: ({ getValue }) => {
        const v = getValue<number>();
        return (
          <span className={cn(v < 0 && 'text-red-700 dark:text-red-400')}>{formatKurus(v)}</span>
        );
      },
    },
    {
      id: 'usage',
      header: 'Kullanım',
      enableSorting: false,
      cell: ({ row }) => {
        const p = usagePercent(row.original.plannedKurus, row.original.actualKurus);
        return p === null ? null : (
          <div className="grid w-24 gap-1">
            <span className="text-xs tabular-nums">%{p}</span>
            <UsageBar percent={p} />
          </div>
        );
      },
    },
  ];

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Bütçe ve gerçekleşen</CardTitle>
        <CardDescription>
          Dönem içindeki iptal edilmemiş giderler ve avans aidat tahakkuk ve tahsilatları.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {summary.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b pb-1.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-b pb-1.5">
            <dt className="text-muted-foreground">Tahsilat − gerçekleşen gider</dt>
            <dd
              className={cn(
                'font-semibold tabular-nums',
                balance < 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400',
              )}
            >
              {formatKurus(balance)}
            </dd>
          </div>
        </dl>
        <DataTable
          columns={columns}
          data={c.rows}
          getRowId={(r) => r.categoryId ?? 'none'}
          mobileCard={(r) => {
            const p = usagePercent(r.plannedKurus, r.actualKurus);
            return (
              <div className="grid gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{r.categoryName}</span>
                  {r.plannedKurus === 0 && <Badge variant="outline">Bütçe dışı</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  Planlanan {formatKurus(r.plannedKurus)} · Gerçekleşen {formatKurus(r.actualKurus)}
                  {p !== null && ` · %${p}`}
                </span>
                <UsageBar percent={p} />
              </div>
            );
          }}
          empty={<p className="p-4 text-sm text-muted-foreground">Bu dönemde gider yok.</p>}
        />
      </CardContent>
    </Card>
  );
}

function BudgetPage() {
  const { budgetId } = Route.useParams();
  const budget = useBudget(budgetId);
  const manager = canManage(useRole());
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const remove = useApiMutation(
    () => apiFetch<void>(`/budgets/${budgetId}`, { method: 'DELETE' }),
    { success: 'Bütçe silindi', onSuccess: () => void navigate({ to: '/butce' }) },
  );

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/butce">
        <ArrowLeft />
        İşletme projesi
      </Link>
    </Button>
  );

  if (budget.isPending) return <LoadingRows />;
  if (budget.isError)
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState error={budget.error} />
      </div>
    );

  const b = budget.data;
  const proportional = b.method !== 'EQUAL';
  const c = b.comparison;
  const actualShare = usagePercent(c.plannedKurus, c.actualKurus);
  const unitColumns: ColumnDef<BudgetUnitDto>[] = [
    {
      id: 'unit',
      header: 'Daire',
      accessorFn: (u) => labelUnit(u.blockName, u.unitNumber, 'short'),
    },
    ...(proportional
      ? ([
          {
            id: 'basis',
            header: b.method === 'AREA' ? 'm²' : 'Arsa payı',
            accessorFn: (u) => (b.method === 'AREA' ? u.areaM2 : u.landShare) ?? '—',
          },
        ] as ColumnDef<BudgetUnitDto>[])
      : []),
    {
      accessorKey: 'monthlyKurus',
      header: 'Aylık',
      cell: ({ row }) => formatKurus(row.original.monthlyKurus),
    },
    {
      id: 'yearly',
      header: 'Yıllık',
      accessorFn: (u) => u.monthlyKurus * 12,
      cell: ({ getValue }) => formatKurus(getValue<number>()),
    },
  ];

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={`${periodLabel(b.startPeriod)} – ${periodLabel(b.endPeriod)}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            İşletme projesi
            {b.isCurrent && <Badge>Güncel dönem</Badge>}
            {b.applied && <Badge variant="secondary">Aidata uygulandı</Badge>}
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                void downloadFile(
                  `/budgets/${b.id}/pdf`,
                  `isletme-projesi-${b.startPeriod}.pdf`,
                ).catch((e: unknown) => toast.error(errorMessage(e)))
              }
            >
              <FileDown />
              PDF indir
            </Button>
            {manager && (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setDeleting(true)}
              >
                <Trash2 />
                Sil
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Yıllık tahmini gider" value={formatKurus(b.totalKurus)} />
        <Stat
          label="Aylık avans aidat"
          value={formatKurus(b.advanceKurus)}
          hint={b.method === 'EQUAL' ? 'Daire başı' : 'Aylık toplam, oranlı dağıtılır'}
        />
        <Stat
          label="Gerçekleşen gider"
          value={formatKurus(c.actualKurus)}
          hint={`${c.elapsedMonths} / 12 ay${actualShare !== null ? ` · bütçenin %${actualShare}'i` : ''}`}
        />
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Gider kalemleri</CardTitle>
          <CardDescription>
            Önümüzdeki 12 ayın tahmini giderlerini kalem kalem yıllık tutar olarak girin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {manager ? (
            <LinesEditor
              key={`${b.method}:${b.lines.map((l) => `${l.categoryId}=${l.amountKurus}=${l.note ?? ''}`).join('|')}`}
              budget={b}
            />
          ) : (
            <ReadOnlyLines budget={b} />
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Aylık avans aidat</CardTitle>
          <CardDescription>
            {b.advanceKurus === 0
              ? 'Gider kalemleri girildiğinde daire başına düşen aylık avans burada hesaplanır.'
              : `${advanceLabel(b)}. Yıllık toplam 12 aya ${proportional ? 'bölünüp dairelere oranlı dağıtılır' : 've dairelere eşit bölünür'}; tutar tam liraya yukarı yuvarlanır.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {b.distributionError && (
            <Alert variant="destructive">
              <AlertDescription>{b.distributionError}</AlertDescription>
            </Alert>
          )}
          <ApplyPanel budget={b} manager={manager} />
          {b.advanceKurus > 0 && !b.distributionError && (
            <DataTable
              columns={unitColumns}
              data={b.units}
              getRowId={(u) => u.unitId}
              mobileCard={(u) => (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {labelUnit(u.blockName, u.unitNumber, 'short')}
                  </span>
                  <span className="text-sm tabular-nums">{formatKurus(u.monthlyKurus)} / ay</span>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <ComparisonCard budget={b} />

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bütçe silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Bütçe ve gider kalemleri silinir. Daha önce uygulanan aidat planı ve yazılmış aidatlar
              değişmez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate(undefined);
              }}
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

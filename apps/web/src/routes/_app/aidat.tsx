import {
  formatKurus,
  MONTH_NAMES_TR,
  periodLabel,
  type MatrixCellDto,
  type MatrixDto,
} from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { HandCoins } from 'lucide-react';
import { useState } from 'react';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MissingUnitDataAlert } from '@/features/dues/missing-unit-data';
import { PaymentDialog } from '@/features/dues/payment-dialog';
import { StatusLegend } from '@/features/dues/status';
import { toneClasses, toneLabels, toneOf } from '@/features/dues/tones';
import { todayIso } from '@/lib/format';
import { useBlocks, useMatrix } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { labelUnit, useIsApartment } from '@/lib/unit-label';

export const Route = createFileRoute('/_app/aidat')({
  validateSearch: (search: Record<string, unknown>): { yil?: number; blok?: string } => ({
    yil: typeof search['yil'] === 'number' ? search['yil'] : undefined,
    blok: typeof search['blok'] === 'string' ? search['blok'] : undefined,
  }),
  component: () => (
    <ManagerOnly>
      <DuesMatrixPage />
    </ManagerOnly>
  ),
});

const SHORT_MONTHS = MONTH_NAMES_TR.map((m) => m.slice(0, 3));

function Cell({ cell, period }: { cell: MatrixCellDto | null; period: string }) {
  if (!cell)
    return (
      <span
        className="block size-7 rounded-md border border-dashed"
        aria-label={`${periodLabel(period)}: borç yok`}
      />
    );
  const tone = toneOf(cell.status, cell.overdue);
  const detail =
    cell.status === 'PARTIAL'
      ? `${formatKurus(cell.paidKurus)} / ${formatKurus(cell.amountKurus)}`
      : formatKurus(cell.amountKurus);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={`${periodLabel(period)}: ${toneLabels[tone]}, ${detail}`}
          className={cn('block size-7 rounded-md', toneClasses[tone])}
        />
      </TooltipTrigger>
      <TooltipContent>
        {periodLabel(period)} · {toneLabels[tone]} · {detail}
      </TooltipContent>
    </Tooltip>
  );
}

function Summary({ matrix }: { matrix: MatrixDto }) {
  const index = matrix.periods.indexOf(todayIso().slice(0, 7));
  const cells = index >= 0 ? matrix.rows.map((r) => r.cells[index]) : [];
  const withCharge = cells.filter(Boolean) as MatrixCellDto[];
  const paid = withCharge.filter((c) => c.status === 'PAID').length;
  const debtors = matrix.rows.filter((r) => r.debtKurus > 0).length;
  const totalDebt = matrix.rows.reduce((sum, r) => sum + r.debtKurus, 0);
  const overdue = matrix.rows.reduce((sum, r) => sum + r.overdueKurus, 0);
  const items = [
    { label: 'Bu ay ödeyen', value: withCharge.length ? `${paid} / ${withCharge.length}` : '—' },
    { label: 'Borçlu daire', value: String(debtors) },
    { label: 'Toplam borç', value: formatKurus(totalDebt) },
    { label: 'Gecikmiş borç', value: formatKurus(overdue), danger: overdue > 0 },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={cn('text-lg font-semibold tabular-nums', item.danger && 'text-red-600')}>
              {item.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DuesMatrixPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const isApartment = useIsApartment();
  const thisYear = Number(todayIso().slice(0, 4));
  const year = search.yil ?? thisYear;
  const blocks = useBlocks();
  const matrix = useMatrix(year, search.blok);
  const [paying, setPaying] = useState(false);
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Aidat tablosu"
        description="Her dairenin her ayki durumu. Bir satıra tıklayarak dairenin hesabını açın."
        actions={
          <Button onClick={() => setPaying(true)}>
            <HandCoins />
            Ödeme al
          </Button>
        }
      />

      <MissingUnitDataAlert />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value={String(year)}
          onValueChange={(v) =>
            void navigate({ search: (prev) => ({ ...prev, yil: Number(v) }), replace: true })
          }
        >
          <SelectTrigger className="w-full sm:w-32" aria-label="Yıl">
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
        {!isApartment && (
          <Select
            value={search.blok ?? 'all'}
            onValueChange={(v) =>
              void navigate({
                search: (prev) => ({ ...prev, blok: v === 'all' ? undefined : v }),
                replace: true,
              })
            }
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Blok filtresi">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm bloklar</SelectItem>
              {(blocks.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} Blok
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="sm:ml-auto">
          <StatusLegend />
        </div>
      </div>

      {matrix.isPending ? (
        <LoadingRows />
      ) : matrix.isError ? (
        <ErrorState error={matrix.error} />
      ) : matrix.data.rows.length === 0 ? (
        <EmptyState title="Daire yok" description="Önce “Daireler” sayfasından daire ekleyin." />
      ) : (
        <>
          {year === thisYear && <Summary matrix={matrix.data} />}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium"
                  >
                    Daire
                  </th>
                  {SHORT_MONTHS.map((m, i) => (
                    <th
                      key={m}
                      scope="col"
                      className="px-1 py-2 text-center text-xs font-medium"
                      title={periodLabel(matrix.data.periods[i]!)}
                    >
                      {m}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    Toplam borç
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrix.data.rows.map((row) => (
                  <tr
                    key={row.unitId}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                    onClick={() =>
                      void navigate({ to: '/daireler/$unitId', params: { unitId: row.unitId } })
                    }
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-background px-3 py-1.5 text-left font-medium whitespace-nowrap"
                    >
                      {labelUnit(row.blockName, row.unitNumber, 'short')}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td key={matrix.data.periods[i]} className="px-1 py-1.5">
                        <div className="flex justify-center">
                          <Cell cell={cell} period={matrix.data.periods[i]!} />
                        </div>
                      </td>
                    ))}
                    <td
                      className={cn(
                        'px-3 py-1.5 text-right tabular-nums whitespace-nowrap',
                        row.overdueKurus > 0 && 'font-medium text-red-600',
                      )}
                    >
                      {row.debtKurus > 0 ? formatKurus(row.debtKurus) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <PaymentDialog open={paying} onOpenChange={setPaying} />
    </div>
  );
}

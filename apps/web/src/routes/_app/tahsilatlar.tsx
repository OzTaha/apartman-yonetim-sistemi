import {
  formatKurus,
  paymentMethodLabels,
  type PaymentDto,
  type PaymentMethod,
} from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { HandCoins } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PaymentDialog } from '@/features/dues/payment-dialog';
import { PaymentActions } from '@/features/dues/row-actions';
import { formatDate, todayIso } from '@/lib/format';
import { usePayments } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { labelUnit } from '@/lib/unit-label';

export const Route = createFileRoute('/_app/tahsilatlar')({
  validateSearch: (
    s: Record<string, unknown>,
  ): { bas?: string; bit?: string; yontem?: PaymentMethod } => ({
    bas: typeof s['bas'] === 'string' ? s['bas'] : undefined,
    bit: typeof s['bit'] === 'string' ? s['bit'] : undefined,
    yontem:
      s['yontem'] === 'CASH' || s['yontem'] === 'BANK_TRANSFER' || s['yontem'] === 'ONLINE'
        ? s['yontem']
        : undefined,
  }),
  component: () => (
    <ManagerOnly>
      <PaymentsPage />
    </ManagerOnly>
  ),
});

const columns: ColumnDef<PaymentDto>[] = [
  {
    accessorKey: 'paidAt',
    header: 'Tarih',
    cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.paidAt)}</span>,
  },
  {
    id: 'unit',
    header: 'Daire',
    accessorFn: (p) => `${p.blockName}-${p.unitNumber}`,
    cell: ({ row }) => (
      <span className="font-medium">
        {labelUnit(row.original.blockName, row.original.unitNumber, 'short')}
      </span>
    ),
  },
  {
    accessorKey: 'method',
    header: 'Yöntem',
    cell: ({ row }) => paymentMethodLabels[row.original.method],
  },
  {
    id: 'allocations',
    header: 'Kapatılan borçlar',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.cancelledAt ? (
        <span className="text-xs text-red-600">İptal: {row.original.cancelReason}</span>
      ) : (
        <span className="text-xs text-muted-foreground">
          {row.original.allocations.map((a) => a.label).join(', ')}
        </span>
      ),
  },
  {
    accessorKey: 'reference',
    header: 'Referans',
    enableSorting: false,
    cell: ({ row }) => row.original.reference ?? '—',
  },
  {
    accessorKey: 'amountKurus',
    header: 'Tutar',
    cell: ({ row }) => (
      <span
        className={cn(
          'font-medium tabular-nums',
          row.original.cancelledAt && 'line-through opacity-50',
        )}
      >
        {formatKurus(row.original.amountKurus)}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row }) => <PaymentActions payment={row.original} />,
  },
];

function PaymentCard({ payment }: { payment: PaymentDto }) {
  return (
    <div
      className={cn('flex items-start justify-between gap-2', payment.cancelledAt && 'opacity-60')}
    >
      <div className="grid gap-0.5">
        <span className="font-medium">
          {labelUnit(payment.blockName, payment.unitNumber, 'short')} ·{' '}
          {formatKurus(payment.amountKurus)}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDate(payment.paidAt)} · {paymentMethodLabels[payment.method]}
          {payment.cancelledAt ? ` · İptal: ${payment.cancelReason}` : ''}
        </span>
        <span className="text-xs text-muted-foreground">
          {payment.allocations.map((a) => a.label).join(', ')}
        </span>
      </div>
      <PaymentActions payment={payment} />
    </div>
  );
}

function PaymentsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const today = todayIso();
  const from = search.bas ?? `${today.slice(0, 7)}-01`;
  const to = search.bit ?? today;
  const [paying, setPaying] = useState(false);
  const payments = usePayments({ from, to, method: search.yontem });
  const active = (payments.data ?? []).filter((p) => !p.cancelledAt);
  const total = active.reduce((sum, p) => sum + p.amountKurus, 0);

  const setFilter = (patch: Record<string, string | undefined>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Tahsilatlar"
        description={
          payments.data ? `${active.length} ödeme · toplam ${formatKurus(total)}` : undefined
        }
        actions={
          <Button onClick={() => setPaying(true)}>
            <HandCoins />
            Ödeme al
          </Button>
        }
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="pay-from" className="text-xs text-muted-foreground">
            Başlangıç
          </Label>
          <Input
            id="pay-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFilter({ bas: e.target.value || undefined })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="pay-to" className="text-xs text-muted-foreground">
            Bitiş
          </Label>
          <Input
            id="pay-to"
            type="date"
            value={to}
            onChange={(e) => setFilter({ bit: e.target.value || undefined })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="pay-method-filter" className="text-xs text-muted-foreground">
            Yöntem
          </Label>
          <Select
            value={search.yontem ?? 'all'}
            onValueChange={(v) => setFilter({ yontem: v === 'all' ? undefined : v })}
          >
            <SelectTrigger id="pay-method-filter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm yöntemler</SelectItem>
              {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {paymentMethodLabels[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {payments.isPending ? (
        <LoadingRows />
      ) : payments.isError ? (
        <ErrorState error={payments.error} />
      ) : (
        <DataTable
          columns={columns}
          data={payments.data}
          getRowId={(p) => p.id}
          onRowClick={(p) =>
            void navigate({ to: '/daireler/$unitId', params: { unitId: p.unitId } })
          }
          mobileCard={(p) => <PaymentCard payment={p} />}
          empty={
            <EmptyState
              title="Bu aralıkta ödeme yok"
              description="Tarih aralığını değiştirmeyi deneyin."
            />
          }
        />
      )}
      <PaymentDialog open={paying} onOpenChange={setPaying} />
    </div>
  );
}

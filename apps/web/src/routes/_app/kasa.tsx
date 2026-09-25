import {
  cashAccountKindLabels,
  formatKurus,
  transactionTypeLabels,
  type TransactionDto,
  type TransactionType,
} from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, Lock, Minus, Paperclip, Plus } from 'lucide-react';
import { useState } from 'react';
import { BulkCancelBar } from '@/components/bulk-cancel-bar';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TransactionDialog } from '@/features/finance/transaction-dialog';
import { transactionTitle } from '@/features/finance/files';
import { TransactionDetailsDialog } from '@/features/finance/transaction-details';
import { formatDate, todayIso } from '@/lib/format';
import { useCashAccounts, useTransactions } from '@/lib/queries';
import { useSelection } from '@/lib/selection';
import { cn } from '@/lib/utils';

const TYPES = ['INCOME', 'EXPENSE', 'TRANSFER'] as const;

export const Route = createFileRoute('/_app/kasa')({
  validateSearch: (
    s: Record<string, unknown>,
  ): { hesap?: string; tur?: TransactionType; bas?: string; bit?: string } => ({
    hesap: typeof s['hesap'] === 'string' ? s['hesap'] : undefined,
    tur: TYPES.includes(s['tur'] as TransactionType) ? (s['tur'] as TransactionType) : undefined,
    bas: typeof s['bas'] === 'string' ? s['bas'] : undefined,
    bit: typeof s['bit'] === 'string' ? s['bit'] : undefined,
  }),
  component: () => (
    <ManagerOnly>
      <CashPage />
    </ManagerOnly>
  ),
});

function Amount({ t, accountId }: { t: TransactionDto; accountId?: string }) {
  const incoming = t.type === 'INCOME' || (t.type === 'TRANSFER' && accountId === t.toAccountId);
  const neutral = t.type === 'TRANSFER' && !accountId;
  return (
    <span
      className={cn(
        'font-medium whitespace-nowrap tabular-nums',
        neutral
          ? ''
          : incoming
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-red-700 dark:text-red-400',
        t.cancelledAt && 'line-through opacity-50',
      )}
    >
      {neutral ? '' : incoming ? '+' : '−'}
      {formatKurus(t.amountKurus)}
    </span>
  );
}

function detailOf(t: TransactionDto): string {
  if (t.type === 'TRANSFER') return transactionTypeLabels.TRANSFER;
  return [t.categoryName, t.vendorName, t.workTitle].filter(Boolean).join(' · ');
}

function Marks({ t }: { t: TransactionDto }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      {t.attachments.length > 0 && (
        <span className="inline-flex items-center gap-0.5 text-xs" title="Belge var">
          <Paperclip className="size-3.5" />
          {t.attachments.length}
        </span>
      )}
      {t.locked && <Lock className="size-3.5" aria-label="Kapanmış ay" />}
    </span>
  );
}

function CashPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const today = todayIso();
  const from = search.bas ?? `${today.slice(0, 4)}-01-01`;
  const to = search.bit ?? today;
  const [creating, setCreating] = useState<TransactionType | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const accounts = useCashAccounts();
  const transactions = useTransactions({ accountId: search.hesap, type: search.tur, from, to });
  const selected = transactions.data?.find((t) => t.id === selectedId);
  const selection = useSelection(transactions.data, (t) => t.id);
  const activeAccounts = (accounts.data ?? []).filter((a) => a.isActive || a.balanceKurus !== 0);
  const total = activeAccounts.reduce((sum, a) => sum + a.balanceKurus, 0);

  const setFilter = (patch: Record<string, string | undefined>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const columns: ColumnDef<TransactionDto>[] = [
    {
      accessorKey: 'date',
      header: 'Tarih',
      cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span>,
    },
    {
      id: 'title',
      header: 'Açıklama',
      accessorFn: (t) => transactionTitle(t),
      cell: ({ row }) => (
        <div className="grid min-w-0">
          <span className="truncate font-medium">{transactionTitle(row.original)}</span>
          <span className="truncate text-xs text-muted-foreground">{detailOf(row.original)}</span>
        </div>
      ),
    },
    {
      id: 'account',
      header: 'Hesap',
      accessorFn: (t) => t.accountName,
      cell: ({ row }) =>
        row.original.type === 'TRANSFER'
          ? `${row.original.accountName} → ${row.original.toAccountName}`
          : row.original.accountName,
    },
    {
      id: 'marks',
      header: '',
      enableSorting: false,
      cell: ({ row }) => <Marks t={row.original} />,
    },
    {
      accessorKey: 'amountKurus',
      header: 'Tutar',
      cell: ({ row }) => <Amount t={row.original} accountId={search.hesap} />,
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Kasa"
        description={accounts.data ? `Toplam bakiye ${formatKurus(total)}` : undefined}
        actions={
          <>
            <Button onClick={() => setCreating('EXPENSE')}>
              <Minus />
              Gider ekle
            </Button>
            <Button variant="outline" onClick={() => setCreating('INCOME')}>
              <Plus />
              Gelir ekle
            </Button>
            <Button variant="outline" onClick={() => setCreating('TRANSFER')}>
              <ArrowLeftRight />
              Transfer
            </Button>
          </>
        }
      />

      {accounts.isPending ? (
        <LoadingRows rows={1} />
      ) : accounts.isError ? (
        <ErrorState error={accounts.error} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeAccounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className="text-left"
              onClick={() => setFilter({ hesap: search.hesap === a.id ? undefined : a.id })}
            >
              <Card
                className={cn(
                  'py-4 transition-colors hover:bg-muted/50',
                  search.hesap === a.id && 'border-primary',
                )}
              >
                <CardContent className="grid gap-1">
                  <span className="text-sm text-muted-foreground">
                    {a.name}
                    {!a.isActive && ' (pasif)'}
                  </span>
                  <span
                    className={cn(
                      'text-xl font-semibold tabular-nums',
                      a.balanceKurus < 0 && 'text-red-700 dark:text-red-400',
                    )}
                  >
                    {formatKurus(a.balanceKurus)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {cashAccountKindLabels[a.kind]}
                  </span>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="grid gap-1">
          <Label htmlFor="tx-filter-account" className="text-xs text-muted-foreground">
            Hesap
          </Label>
          <Select
            value={search.hesap ?? 'all'}
            onValueChange={(v) => setFilter({ hesap: v === 'all' ? undefined : v })}
          >
            <SelectTrigger id="tx-filter-account" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm hesaplar</SelectItem>
              {(accounts.data ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tx-filter-type" className="text-xs text-muted-foreground">
            Tür
          </Label>
          <Select
            value={search.tur ?? 'all'}
            onValueChange={(v) => setFilter({ tur: v === 'all' ? undefined : v })}
          >
            <SelectTrigger id="tx-filter-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {transactionTypeLabels[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tx-from" className="text-xs text-muted-foreground">
            Başlangıç
          </Label>
          <Input
            id="tx-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFilter({ bas: e.target.value || undefined })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tx-to" className="text-xs text-muted-foreground">
            Bitiş
          </Label>
          <Input
            id="tx-to"
            type="date"
            value={to}
            onChange={(e) => setFilter({ bit: e.target.value || undefined })}
          />
        </div>
      </div>

      {transactions.isPending ? (
        <LoadingRows />
      ) : transactions.isError ? (
        <ErrorState error={transactions.error} />
      ) : (
        <DataTable
          columns={columns}
          data={transactions.data}
          getRowId={(t) => t.id}
          onRowClick={(t) => setSelectedId(t.id)}
          selection={{
            selected: selection.selected,
            onChange: selection.setSelected,
            canSelect: (t) => !t.cancelledAt && !t.paymentId && !t.locked,
            label: (t) => transactionTitle(t),
          }}
          mobileCard={(t) => (
            <div className="flex items-start justify-between gap-2">
              <div className="grid min-w-0 gap-0.5">
                <span className="truncate font-medium">{transactionTitle(t)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {formatDate(t.date)} · {detailOf(t) || t.accountName}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <Amount t={t} accountId={search.hesap} />
                <Marks t={t} />
              </div>
            </div>
          )}
          empty={
            <EmptyState
              title="Bu aralıkta hareket yok"
              description="Filtreleri değiştirin veya yeni bir gelir ya da gider ekleyin."
            />
          }
        />
      )}

      <BulkCancelBar
        ids={selection.ids}
        endpoint="/transactions/bulk-cancel"
        noun="kayıt"
        description="Seçilen gelir, gider ve transferler iptal edilir ve bakiyelerden düşülür; kayıtlar silinmez. Aidat tahsilatları buradan seçilemez, Tahsilatlar ekranından iptal edilir."
        onClear={selection.clear}
      />
      {TYPES.map((type) => (
        <TransactionDialog
          key={type}
          type={type}
          open={creating === type}
          onOpenChange={(o) => setCreating(o ? type : null)}
        />
      ))}
      <TransactionDetailsDialog
        transaction={selected}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
    </div>
  );
}

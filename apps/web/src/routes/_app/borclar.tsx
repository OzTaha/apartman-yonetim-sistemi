import { formatKurus, type ChargeDto } from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChargeCreateDialog } from '@/features/dues/charge-dialogs';
import { ChargeActions } from '@/features/dues/row-actions';
import { ChargeStatusBadge } from '@/features/dues/status';
import { formatDate } from '@/lib/format';
import { type ChargeFilters, useBlocks, useChargeTypes, useCharges } from '@/lib/queries';
import { labelUnit, useIsApartment } from '@/lib/unit-label';

type Status = ChargeFilters['status'];
const statusLabels: Record<Status, string> = {
  open: 'Açık borçlar',
  overdue: 'Gecikmiş',
  paid: 'Ödenmiş',
  all: 'Tümü',
};

export const Route = createFileRoute('/_app/borclar')({
  validateSearch: (
    s: Record<string, unknown>,
  ): { durum?: Status; tur?: string; blok?: string; donem?: string } => ({
    durum:
      s['durum'] === 'overdue' || s['durum'] === 'paid' || s['durum'] === 'all'
        ? s['durum']
        : undefined,
    tur: typeof s['tur'] === 'string' ? s['tur'] : undefined,
    blok: typeof s['blok'] === 'string' ? s['blok'] : undefined,
    donem: typeof s['donem'] === 'string' ? s['donem'] : undefined,
  }),
  component: () => (
    <ManagerOnly>
      <ChargesPage />
    </ManagerOnly>
  ),
});

const columns: ColumnDef<ChargeDto>[] = [
  {
    id: 'unit',
    header: 'Daire',
    accessorFn: (c) => `${c.blockName}-${c.unitNumber}`,
    sortingFn: (a, b) =>
      a.original.blockName.localeCompare(b.original.blockName, 'tr', { numeric: true }) ||
      a.original.unitNumber.localeCompare(b.original.unitNumber, 'tr', { numeric: true }),
    cell: ({ row }) => (
      <span className="font-medium whitespace-nowrap">
        {labelUnit(row.original.blockName, row.original.unitNumber, 'short')}
      </span>
    ),
  },
  { accessorKey: 'label', header: 'Borç', cell: ({ row }) => row.original.label },
  {
    accessorKey: 'dueDate',
    header: 'Vade',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{formatDate(row.original.dueDate)}</span>
    ),
  },
  {
    accessorKey: 'amountKurus',
    header: 'Tutar',
    cell: ({ row }) => (
      <span className="tabular-nums">{formatKurus(row.original.amountKurus)}</span>
    ),
  },
  {
    accessorKey: 'remainingKurus',
    header: 'Kalan',
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">{formatKurus(row.original.remainingKurus)}</span>
    ),
  },
  {
    id: 'status',
    header: 'Durum',
    enableSorting: false,
    cell: ({ row }) => (
      <ChargeStatusBadge status={row.original.status} overdue={row.original.overdue} />
    ),
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row }) => <ChargeActions charge={row.original} />,
  },
];

function ChargeCard({ charge }: { charge: ChargeDto }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="grid gap-1">
        <span className="font-medium">
          {labelUnit(charge.blockName, charge.unitNumber, 'short')} · {charge.label}
        </span>
        <span className="text-xs text-muted-foreground">
          Vade {formatDate(charge.dueDate)} · kalan {formatKurus(charge.remainingKurus)}
        </span>
        <ChargeStatusBadge status={charge.status} overdue={charge.overdue} />
      </div>
      <ChargeActions charge={charge} />
    </div>
  );
}

function ChargesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const isApartment = useIsApartment();
  const status: Status = search.durum ?? 'open';
  const [adding, setAdding] = useState(false);
  const blocks = useBlocks();
  const types = useChargeTypes();
  const charges = useCharges({
    status,
    chargeTypeId: search.tur,
    blockId: search.blok,
    period: search.donem,
  });
  const total = (charges.data ?? []).reduce((sum, c) => sum + c.remainingKurus, 0);

  const setFilter = (patch: Record<string, string | undefined>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Borçlar"
        description={
          charges.data
            ? `${charges.data.length} kayıt · kalan toplam ${formatKurus(total)}`
            : undefined
        }
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus />
            Borç ekle
          </Button>
        }
      />
      <div className="grid gap-2 sm:grid-cols-4">
        <Select
          value={status}
          onValueChange={(v) => setFilter({ durum: v === 'open' ? undefined : v })}
        >
          <SelectTrigger className="w-full" aria-label="Durum filtresi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(statusLabels) as Status[]).map((k) => (
              <SelectItem key={k} value={k}>
                {statusLabels[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.tur ?? 'all'}
          onValueChange={(v) => setFilter({ tur: v === 'all' ? undefined : v })}
        >
          <SelectTrigger className="w-full" aria-label="Borç türü filtresi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm türler</SelectItem>
            {(types.data ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isApartment && (
          <Select
            value={search.blok ?? 'all'}
            onValueChange={(v) => setFilter({ blok: v === 'all' ? undefined : v })}
          >
            <SelectTrigger className="w-full" aria-label="Blok filtresi">
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
        <Input
          type="month"
          aria-label="Dönem filtresi"
          value={search.donem ?? ''}
          onChange={(e) => setFilter({ donem: e.target.value || undefined })}
        />
      </div>

      {charges.isPending ? (
        <LoadingRows />
      ) : charges.isError ? (
        <ErrorState error={charges.error} />
      ) : (
        <DataTable
          columns={columns}
          data={charges.data}
          getRowId={(c) => c.id}
          onRowClick={(c) =>
            void navigate({ to: '/daireler/$unitId', params: { unitId: c.unitId } })
          }
          mobileCard={(c) => <ChargeCard charge={c} />}
          empty={
            <EmptyState title="Kayıt yok" description="Seçili filtrelere uygun borç bulunamadı." />
          }
        />
      )}
      <ChargeCreateDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}

import type { OccupancyDto } from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Minus, Search, UserPlus } from 'lucide-react';
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
import { OccupancyActions, OccupancyTypeBadge } from '@/features/residents/occupancy-actions';
import { OccupancyFormDialog } from '@/features/residents/resident-dialogs';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatDate, formatPhone, fullName } from '@/lib/format';
import { type ResidentFilters, useBlocks, useResidents } from '@/lib/queries';

type Status = ResidentFilters['status'];

export const Route = createFileRoute('/_app/sakinler')({
  validateSearch: (search: Record<string, unknown>): { durum?: Status; blok?: string } => ({
    durum: search['durum'] === 'past' || search['durum'] === 'all' ? search['durum'] : undefined,
    blok: typeof search['blok'] === 'string' ? search['blok'] : undefined,
  }),
  component: () => (
    <ManagerOnly>
      <ResidentsPage />
    </ManagerOnly>
  ),
});

const YesNo = ({ value, label }: { value: boolean; label: string }) =>
  value ? (
    <Check className="size-4 text-emerald-600" aria-label={`${label}: evet`} />
  ) : (
    <Minus className="size-4 text-muted-foreground" aria-label={`${label}: hayır`} />
  );

const columns: ColumnDef<OccupancyDto>[] = [
  {
    id: 'name',
    header: 'Ad Soyad',
    accessorFn: (o) => `${o.lastName} ${o.firstName}`,
    sortingFn: (a, b) => a.original.lastName.localeCompare(b.original.lastName, 'tr'),
    cell: ({ row }) => (
      <div className="grid">
        <span className="font-medium">{fullName(row.original)}</span>
        {row.original.endDate && (
          <span className="text-xs text-muted-foreground">
            Taşındı: {formatDate(row.original.endDate)}
          </span>
        )}
      </div>
    ),
  },
  {
    id: 'unit',
    header: 'Daire',
    accessorFn: (o) => `${o.blockName}-${o.unitNumber}`,
    sortingFn: (a, b) =>
      a.original.blockName.localeCompare(b.original.blockName, 'tr', { numeric: true }) ||
      a.original.unitNumber.localeCompare(b.original.unitNumber, 'tr', { numeric: true }),
    cell: ({ row }) => `${row.original.blockName} · ${row.original.unitNumber}`,
  },
  {
    accessorKey: 'type',
    header: 'Tip',
    cell: ({ row }) => <OccupancyTypeBadge type={row.original.type} />,
  },
  {
    accessorKey: 'phone',
    header: 'Telefon',
    enableSorting: false,
    cell: ({ row }) => <span className="whitespace-nowrap">{formatPhone(row.original.phone)}</span>,
  },
  {
    accessorKey: 'isResponsibleForDues',
    header: 'Aidat',
    cell: ({ row }) => <YesNo value={row.original.isResponsibleForDues} label="Aidattan sorumlu" />,
  },
  {
    accessorKey: 'contactConsent',
    header: 'İletişim izni',
    cell: ({ row }) => <YesNo value={row.original.contactConsent} label="İletişim izni" />,
  },
  {
    accessorKey: 'hasAccount',
    header: 'Hesap',
    cell: ({ row }) => <YesNo value={row.original.hasAccount} label="Hesap" />,
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row }) => <OccupancyActions occupancy={row.original} />,
  },
];

function ResidentCard({ occupancy }: { occupancy: OccupancyDto }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{fullName(occupancy)}</span>
          <OccupancyTypeBadge type={occupancy.type} />
        </div>
        <span className="text-sm text-muted-foreground">
          {occupancy.blockName} Blok · Daire {occupancy.unitNumber}
          {occupancy.phone ? ` · ${formatPhone(occupancy.phone)}` : ''}
        </span>
        {occupancy.endDate && (
          <span className="text-xs text-muted-foreground">
            Taşındı: {formatDate(occupancy.endDate)}
          </span>
        )}
      </div>
      <OccupancyActions occupancy={occupancy} />
    </div>
  );
}

const statusLabels: Record<Status, string> = {
  active: 'Oturanlar',
  past: 'Taşınanlar',
  all: 'Tümü',
};

function ResidentsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const status: Status = search.durum ?? 'active';
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebouncedValue(searchText.trim());
  const [adding, setAdding] = useState(false);

  const blocks = useBlocks();
  const residents = useResidents({
    status,
    blockId: search.blok,
    search: debouncedSearch || undefined,
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Sakinler"
        description={residents.data ? `${residents.data.length} kayıt` : undefined}
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus />
            Sakin ekle
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Ad, soyad veya telefonla ara"
            placeholder="Ad, soyad veya telefonla ara"
            className="pl-8"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) =>
            void navigate({
              search: (prev) => ({
                ...prev,
                durum: value === 'active' ? undefined : (value as Status),
              }),
              replace: true,
            })
          }
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Durum filtresi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(statusLabels) as Status[]).map((key) => (
              <SelectItem key={key} value={key}>
                {statusLabels[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.blok ?? 'all'}
          onValueChange={(value) =>
            void navigate({
              search: (prev) => ({ ...prev, blok: value === 'all' ? undefined : value }),
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
      </div>

      {residents.isPending ? (
        <LoadingRows />
      ) : residents.isError ? (
        <ErrorState error={residents.error} />
      ) : (
        <DataTable
          columns={columns}
          data={residents.data}
          getRowId={(o) => o.id}
          onRowClick={(o) =>
            void navigate({ to: '/daireler/$unitId', params: { unitId: o.unitId } })
          }
          mobileCard={(o) => <ResidentCard occupancy={o} />}
          empty={
            <EmptyState
              title="Kayıt bulunamadı"
              description={
                debouncedSearch || search.blok || status !== 'active'
                  ? 'Filtreleri değiştirmeyi deneyin.'
                  : 'Sakin eklemek için “Sakin ekle” butonunu kullanın.'
              }
            />
          }
        />
      )}

      <OccupancyFormDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}

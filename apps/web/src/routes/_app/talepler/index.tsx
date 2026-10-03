import {
  REQUEST_CATEGORIES,
  REQUEST_VIEWS,
  requestCategoryLabels,
  type RequestCategory,
  type RequestView,
  type ServiceRequestDto,
} from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Camera } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  formatDateTime,
  requestCategoryText,
  requestPlace,
  requestSubtitle,
} from '@/features/requests/format';
import { RequestSourceBadges, RequestStatusBadge } from '@/features/requests/parts';
import { useScopeBlocks, useServiceRequests } from '@/lib/queries';

const viewLabels: Record<RequestView, string> = {
  open: 'Açık talepler',
  NEW: 'Yeni',
  IN_PROGRESS: 'İşlemde',
  RESOLVED: 'Çözülen',
  REJECTED: 'Reddedilen',
  all: 'Tümü',
};

export const Route = createFileRoute('/_app/talepler/')({
  validateSearch: (
    s: Record<string, unknown>,
  ): { durum?: RequestView; kategori?: RequestCategory; blok?: string } => ({
    durum: REQUEST_VIEWS.includes(s['durum'] as RequestView)
      ? (s['durum'] as RequestView)
      : undefined,
    kategori: REQUEST_CATEGORIES.includes(s['kategori'] as RequestCategory)
      ? (s['kategori'] as RequestCategory)
      : undefined,
    blok: typeof s['blok'] === 'string' ? s['blok'] : undefined,
  }),
  component: () => (
    <ManagerOnly allow={['BLOCK_MANAGER']}>
      <RequestsPage />
    </ManagerOnly>
  ),
});

function Title({ r }: { r: ServiceRequestDto }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
      <span className="truncate">{r.title}</span>
      <RequestSourceBadges r={r} />
      {r.photoCount > 0 && (
        <Camera
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-label={`${r.photoCount} fotoğraf`}
        />
      )}
    </span>
  );
}

function RequestsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const view = search.durum ?? 'open';
  const blocks = useScopeBlocks();
  const requests = useServiceRequests({ view, category: search.kategori, blockId: search.blok });

  const setFilter = (patch: Record<string, string | undefined>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const open = (r: ServiceRequestDto) =>
    void navigate({ to: '/talepler/$requestId', params: { requestId: r.id } });

  const columns: ColumnDef<ServiceRequestDto>[] = [
    { accessorKey: 'number', header: 'No', cell: ({ row }) => `#${row.original.number}` },
    { accessorKey: 'title', header: 'Talep', cell: ({ row }) => <Title r={row.original} /> },
    {
      id: 'unit',
      header: 'Daire',
      accessorFn: (r) => requestPlace(r, 'short'),
    },
    {
      accessorKey: 'category',
      header: 'Kategori',
      cell: ({ row }) => requestCategoryText(row.original),
    },
    { accessorKey: 'requesterName', header: 'Bildiren' },
    {
      accessorKey: 'createdAt',
      header: 'Tarih',
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      accessorKey: 'status',
      header: 'Durum',
      enableSorting: false,
      cell: ({ row }) => <RequestStatusBadge status={row.original.status} />,
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Arıza ve talepler"
        description={
          requests.data
            ? `${requests.data.length} talep`
            : 'Sakinlerin ve görevlilerin bildirdiği arıza ve talepler'
        }
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Select
          value={view}
          onValueChange={(v) => setFilter({ durum: v === 'open' ? undefined : v })}
        >
          <SelectTrigger className="w-full" aria-label="Durum filtresi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REQUEST_VIEWS.map((v) => (
              <SelectItem key={v} value={v}>
                {viewLabels[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.kategori ?? 'all'}
          onValueChange={(v) => setFilter({ kategori: v === 'all' ? undefined : v })}
        >
          <SelectTrigger className="w-full" aria-label="Kategori filtresi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm kategoriler</SelectItem>
            {REQUEST_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {requestCategoryLabels[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {blocks.length > 1 && (
          <Select
            value={search.blok ?? 'all'}
            onValueChange={(v) => setFilter({ blok: v === 'all' ? undefined : v })}
          >
            <SelectTrigger className="w-full" aria-label="Blok filtresi">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm bloklar</SelectItem>
              {blocks.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} Blok
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {requests.isPending ? (
        <LoadingRows />
      ) : requests.isError ? (
        <ErrorState error={requests.error} />
      ) : (
        <DataTable
          columns={columns}
          data={requests.data}
          getRowId={(r) => r.id}
          onRowClick={open}
          mobileCard={(r) => (
            <div className="grid gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <Title r={r} />
                <RequestStatusBadge status={r.status} />
              </div>
              <span className="text-xs text-muted-foreground">
                {[requestSubtitle(r), requestPlace(r, 'short'), r.requesterName].join(' · ')}
              </span>
              <span className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
            </div>
          )}
          empty={
            <EmptyState
              title={view === 'open' ? 'Açık talep yok' : 'Bu filtrede talep yok'}
              description="Sakinler Taleplerim sayfasından arıza ve taleplerini bildirir."
            />
          }
        />
      )}
    </div>
  );
}

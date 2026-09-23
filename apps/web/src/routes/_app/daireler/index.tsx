import type { UnitDto } from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Blocks, Layers, Plus, Search } from 'lucide-react';
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
import { OccupancyTypeBadge } from '@/features/residents/occupancy-actions';
import { BlocksDialog, BulkUnitsDialog, UnitFormDialog } from '@/features/units/unit-dialogs';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { fullName } from '@/lib/format';
import { useBlocks, useUnits } from '@/lib/queries';

interface UnitSearch {
  blok?: string;
  ara?: string;
}

export const Route = createFileRoute('/_app/daireler/')({
  validateSearch: (search: Record<string, unknown>): UnitSearch => ({
    blok: typeof search['blok'] === 'string' ? search['blok'] : undefined,
    ara: typeof search['ara'] === 'string' ? search['ara'] : undefined,
  }),
  component: () => (
    <ManagerOnly>
      <UnitsPage />
    </ManagerOnly>
  ),
});

const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });

const columns: ColumnDef<UnitDto>[] = [
  {
    id: 'unit',
    header: 'Daire',
    accessorFn: (u) => `${u.blockName}-${u.number}`,
    sortingFn: (a, b) =>
      naturalCompare(a.original.blockName, b.original.blockName) ||
      naturalCompare(a.original.number, b.original.number),
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.blockName} Blok · {row.original.number}
      </span>
    ),
  },
  { accessorKey: 'floor', header: 'Kat', cell: ({ getValue }) => getValue<number | null>() ?? '—' },
  {
    accessorKey: 'areaM2',
    header: 'm²',
    cell: ({ getValue }) => getValue<number | null>()?.toLocaleString('tr-TR') ?? '—',
  },
  {
    accessorKey: 'landShare',
    header: 'Arsa payı',
    cell: ({ getValue }) => getValue<number | null>() ?? '—',
  },
  {
    id: 'occupants',
    header: 'Sakinler',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.occupants.length === 0 ? (
        <span className="text-muted-foreground">Boş</span>
      ) : (
        <div className="flex flex-col gap-1">
          {row.original.occupants.map((o) => (
            <span key={o.id} className="flex items-center gap-2">
              {fullName(o)} <OccupancyTypeBadge type={o.type} />
            </span>
          ))}
        </div>
      ),
  },
];

function UnitCard({ unit }: { unit: UnitDto }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">
          {unit.blockName} Blok · Daire {unit.number}
        </span>
        <span className="text-xs text-muted-foreground">
          {unit.floor !== null ? `${unit.floor}. kat` : ''}
          {unit.areaM2 !== null ? ` · ${unit.areaM2.toLocaleString('tr-TR')} m²` : ''}
        </span>
      </div>
      {unit.occupants.length === 0 ? (
        <span className="text-sm text-muted-foreground">Boş</span>
      ) : (
        unit.occupants.map((o) => (
          <span key={o.id} className="flex items-center gap-2 text-sm">
            {fullName(o)} <OccupancyTypeBadge type={o.type} />
          </span>
        ))
      )}
    </div>
  );
}

function UnitsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [searchText, setSearchText] = useState(search.ara ?? '');
  const debouncedSearch = useDebouncedValue(searchText.trim());
  const [dialog, setDialog] = useState<'unit' | 'bulk' | 'blocks' | null>(null);

  const blocks = useBlocks();
  const units = useUnits({ blockId: search.blok, search: debouncedSearch || undefined });

  const hasBlocks = (blocks.data?.length ?? 0) > 0;
  const totalUnits = blocks.data?.reduce((sum, b) => sum + b.unitCount, 0) ?? 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Daireler"
        description={blocks.data ? `${blocks.data.length} blok, ${totalUnits} daire` : undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog('blocks')}>
              <Blocks />
              Bloklar
            </Button>
            <Button variant="outline" onClick={() => setDialog('bulk')} disabled={!hasBlocks}>
              <Layers />
              Toplu ekle
            </Button>
            <Button onClick={() => setDialog('unit')} disabled={!hasBlocks}>
              <Plus />
              Daire ekle
            </Button>
          </>
        }
      />

      {blocks.isSuccess && !hasBlocks ? (
        <EmptyState
          title="Henüz blok yok"
          description="Daire eklemeden önce en az bir blok oluşturun. Tek binalı apartmanlar için örneğin “A” bloğu ekleyebilirsiniz."
          action={
            <Button onClick={() => setDialog('blocks')}>
              <Plus />
              Blok ekle
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Daire no veya sakin adıyla ara"
                placeholder="Daire no veya sakin adıyla ara"
                className="pl-8"
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  void navigate({
                    search: (prev) => ({ ...prev, ara: e.target.value || undefined }),
                    replace: true,
                  });
                }}
              />
            </div>
            <Select
              value={search.blok ?? 'all'}
              onValueChange={(value) =>
                void navigate({
                  search: (prev) => ({ ...prev, blok: value === 'all' ? undefined : value }),
                  replace: true,
                })
              }
            >
              <SelectTrigger className="w-full sm:w-48" aria-label="Blok filtresi">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm bloklar</SelectItem>
                {(blocks.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} Blok ({b.unitCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {units.isPending ? (
            <LoadingRows />
          ) : units.isError ? (
            <ErrorState error={units.error} />
          ) : (
            <DataTable
              columns={columns}
              data={units.data}
              getRowId={(u) => u.id}
              onRowClick={(u) =>
                void navigate({ to: '/daireler/$unitId', params: { unitId: u.id } })
              }
              mobileCard={(u) => <UnitCard unit={u} />}
              empty={
                <EmptyState
                  title={
                    debouncedSearch || search.blok
                      ? 'Aramaya uygun daire bulunamadı'
                      : 'Henüz daire yok'
                  }
                  description={
                    debouncedSearch || search.blok
                      ? 'Arama metnini veya blok filtresini değiştirmeyi deneyin.'
                      : '“Toplu ekle” ile bir bloğun tüm dairelerini tek seferde oluşturabilirsiniz.'
                  }
                />
              }
            />
          )}
        </>
      )}

      <UnitFormDialog
        open={dialog === 'unit'}
        onOpenChange={(o) => setDialog(o ? 'unit' : null)}
        defaultBlockId={search.blok}
      />
      <BulkUnitsDialog
        open={dialog === 'bulk'}
        onOpenChange={(o) => setDialog(o ? 'bulk' : null)}
        defaultBlockId={search.blok}
      />
      <BlocksDialog
        open={dialog === 'blocks'}
        onOpenChange={(o) => setDialog(o ? 'blocks' : null)}
      />
    </div>
  );
}

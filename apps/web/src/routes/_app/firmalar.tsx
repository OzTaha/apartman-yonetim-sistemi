import { formatKurus, type VendorDto } from '@apartman/shared';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VendorDialog } from '@/features/finance/work-dialogs';
import { apiFetch } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { useApiMutation, useVendors } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/firmalar')({
  component: () => (
    <ManagerOnly>
      <VendorsPage />
    </ManagerOnly>
  ),
});

function VendorActions({ vendor, onEdit }: { vendor: VendorDto; onEdit: () => void }) {
  const toggle = useApiMutation(
    () =>
      apiFetch<VendorDto>(`/vendors/${vendor.id}`, {
        method: 'PATCH',
        body: {
          name: vendor.name,
          phone: vendor.phone ?? '',
          taxNumber: vendor.taxNumber ?? '',
          notes: vendor.notes ?? '',
          isActive: !vendor.isActive,
        },
      }),
    { success: vendor.isActive ? 'Firma pasif yapıldı' : 'Firma aktif yapıldı' },
  );
  return (
    <div className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${vendor.name} için işlemler`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Düzenle
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toggle.mutate(undefined)}>
            <Power />
            {vendor.isActive ? 'Pasif yap' : 'Aktif yap'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function VendorsPage() {
  const vendors = useVendors();
  const [editing, setEditing] = useState<VendorDto | null>(null);
  const [creating, setCreating] = useState(false);

  const columns: ColumnDef<VendorDto>[] = [
    {
      accessorKey: 'name',
      header: 'Firma',
      cell: ({ row }) => (
        <span className={cn('font-medium', !row.original.isActive && 'text-muted-foreground')}>
          {row.original.name}
          {!row.original.isActive && (
            <Badge variant="outline" className="ml-2">
              Pasif
            </Badge>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Telefon',
      enableSorting: false,
      cell: ({ row }) => formatPhone(row.original.phone),
    },
    {
      accessorKey: 'taxNumber',
      header: 'Vergi no',
      enableSorting: false,
      cell: ({ row }) => row.original.taxNumber ?? '—',
    },
    { accessorKey: 'workCount', header: 'İş' },
    {
      accessorKey: 'paidKurus',
      header: 'Ödenen toplam',
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{formatKurus(row.original.paidKurus)}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <VendorActions vendor={row.original} onEdit={() => setEditing(row.original)} />
      ),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Firmalar"
        description="İş yaptırılan ve fatura kesen firmalar; her birine ödenen toplam tutar."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Firma ekle
          </Button>
        }
      />
      {vendors.isPending ? (
        <LoadingRows />
      ) : vendors.isError ? (
        <ErrorState error={vendors.error} />
      ) : (
        <DataTable
          columns={columns}
          data={vendors.data}
          getRowId={(v) => v.id}
          onRowClick={(v) => setEditing(v)}
          mobileCard={(v) => (
            <div className="flex items-start justify-between gap-2">
              <div className="grid gap-0.5">
                <span className="font-medium">
                  {v.name}
                  {!v.isActive && ' (pasif)'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[v.phone && formatPhone(v.phone), `${v.workCount} iş`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <span className="font-medium tabular-nums">{formatKurus(v.paidKurus)}</span>
            </div>
          )}
          empty={
            <EmptyState
              title="Henüz firma yok"
              description="Gider veya iş eklerken seçebilmek için firmaları buraya kaydedin."
            />
          }
        />
      )}
      <VendorDialog open={creating} onOpenChange={setCreating} />
      <VendorDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        vendor={editing ?? undefined}
      />
    </div>
  );
}

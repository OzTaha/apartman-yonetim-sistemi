import { employeeRoleLabels, formatKurus, type EmployeeDto } from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmployeeDialog } from '@/features/staff/employee-dialog';
import { employeeName } from '@/features/staff/staff';
import { formatPhone } from '@/lib/format';
import { useEmployees } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/calisanlar/')({
  component: () => (
    <ManagerOnly>
      <EmployeesPage />
    </ManagerOnly>
  ),
});

function TaskCounts({ e }: { e: EmployeeDto }) {
  if (e.openTaskCount === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      {e.openTaskCount}
      {e.overdueTaskCount > 0 && (
        <span className="ml-1 text-red-700 dark:text-red-400">({e.overdueTaskCount} gecikmiş)</span>
      )}
    </span>
  );
}

function EmployeesPage() {
  const employees = useEmployees();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const open = (e: EmployeeDto) =>
    void navigate({ to: '/calisanlar/$employeeId', params: { employeeId: e.id } });

  const columns: ColumnDef<EmployeeDto>[] = [
    {
      id: 'name',
      accessorFn: (e) => employeeName(e),
      header: 'Ad soyad',
      cell: ({ row }) => (
        <span className={cn('font-medium', !row.original.isActive && 'text-muted-foreground')}>
          {employeeName(row.original)}
          {!row.original.isActive && (
            <Badge variant="outline" className="ml-2">
              Pasif
            </Badge>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Görevi',
      cell: ({ row }) => employeeRoleLabels[row.original.role],
    },
    {
      accessorKey: 'phone',
      header: 'Telefon',
      enableSorting: false,
      cell: ({ row }) => formatPhone(row.original.phone),
    },
    {
      accessorKey: 'openTaskCount',
      header: 'Açık görev',
      cell: ({ row }) => <TaskCounts e={row.original} />,
    },
    {
      accessorKey: 'paidKurus',
      header: 'Yapılan ödeme',
      cell: ({ row }) => (
        <span className="tabular-nums">{formatKurus(row.original.paidKurus)}</span>
      ),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Çalışanlar"
        description="Apartmanda çalışan kişiler, açık görevleri ve kendilerine yapılan ödemeler."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Çalışan ekle
          </Button>
        }
      />
      {employees.isPending ? (
        <LoadingRows />
      ) : employees.isError ? (
        <ErrorState error={employees.error} />
      ) : (
        <DataTable
          columns={columns}
          data={employees.data}
          getRowId={(e) => e.id}
          onRowClick={open}
          mobileCard={(e) => (
            <div className="flex items-start justify-between gap-2">
              <div className="grid min-w-0 gap-0.5">
                <span className={cn('font-medium', !e.isActive && 'text-muted-foreground')}>
                  {employeeName(e)}
                  {!e.isActive && ' (pasif)'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[employeeRoleLabels[e.role], e.phone && formatPhone(e.phone)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <span className="shrink-0 text-right text-sm">
                <TaskCounts e={e} />
                <span className="block text-xs text-muted-foreground">açık görev</span>
              </span>
            </div>
          )}
          empty={
            <EmptyState
              title="Henüz çalışan yok"
              description="Kapıcı, güvenlik veya temizlik görevlisi ekleyerek vardiya ve görev takibine başlayın."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus />
                  Çalışan ekle
                </Button>
              }
            />
          }
        />
      )}
      <EmployeeDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

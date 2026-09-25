import {
  employeeRoleLabels,
  formatDuration,
  formatKurus,
  type StaffReportRowDto,
} from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { todayIso } from '@/lib/format';
import { useStaffReport } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/calisan-raporu')({
  validateSearch: (s: Record<string, unknown>): { bas?: string; bit?: string } => ({
    bas: typeof s['bas'] === 'string' ? s['bas'] : undefined,
    bit: typeof s['bit'] === 'string' ? s['bit'] : undefined,
  }),
  component: () => (
    <ManagerOnly>
      <StaffReportPage />
    </ManagerOnly>
  ),
});

function Late({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted-foreground">0</span>;
  return <span className="font-medium text-red-700 tabular-nums dark:text-red-400">{value}</span>;
}

const columns: ColumnDef<StaffReportRowDto>[] = [
  {
    accessorKey: 'name',
    header: 'Çalışan',
    cell: ({ row }) => (
      <span className={cn('font-medium', !row.original.isActive && 'text-muted-foreground')}>
        {row.original.name}
        <span className="block text-xs font-normal text-muted-foreground">
          {employeeRoleLabels[row.original.role]}
          {!row.original.isActive && ' · pasif'}
        </span>
      </span>
    ),
  },
  { accessorKey: 'shiftCount', header: 'Vardiya' },
  {
    accessorKey: 'shiftMinutes',
    header: 'Çalışma süresi',
    cell: ({ row }) =>
      row.original.shiftMinutes ? formatDuration(row.original.shiftMinutes) : '—',
  },
  { accessorKey: 'tasksDone', header: 'Tamamlanan' },
  {
    accessorKey: 'tasksDoneLate',
    header: 'Geç tamamlanan',
    cell: ({ row }) => <Late value={row.original.tasksDoneLate} />,
  },
  { accessorKey: 'tasksOpen', header: 'Açık' },
  {
    accessorKey: 'tasksOverdue',
    header: 'Geciken',
    cell: ({ row }) => <Late value={row.original.tasksOverdue} />,
  },
  {
    accessorKey: 'paidKurus',
    header: 'Ödenen',
    cell: ({ row }) => <span className="tabular-nums">{formatKurus(row.original.paidKurus)}</span>,
  },
];

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <Card className="py-4">
      <CardContent className="grid gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            'text-xl font-semibold tabular-nums',
            bad && 'text-red-700 dark:text-red-400',
          )}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function StaffReportPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const today = todayIso();
  const from = search.bas ?? `${today.slice(0, 7)}-01`;
  const to = search.bit ?? today;
  const valid = from <= to;
  const report = useStaffReport(from, valid ? to : from);
  const rows = report.data?.rows ?? [];
  const sum = (pick: (r: StaffReportRowDto) => number) => rows.reduce((s, r) => s + pick(r), 0);

  const setFilter = (patch: Record<string, string | undefined>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Çalışan raporu"
        description="Seçilen dönemde vardiyalar, tamamlanan görevler ve yapılan ödemeler. Açık ve geciken görevler bugünkü durumu gösterir."
      />
      <div className="grid gap-3 sm:grid-cols-[repeat(2,minmax(0,12rem))]">
        <div className="grid gap-1.5">
          <Label htmlFor="report-from">Başlangıç</Label>
          <Input
            id="report-from"
            type="date"
            value={from}
            onChange={(e) => setFilter({ bas: e.target.value || undefined })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="report-to">Bitiş</Label>
          <Input
            id="report-to"
            type="date"
            value={to}
            onChange={(e) => setFilter({ bit: e.target.value || undefined })}
          />
        </div>
      </div>
      {!valid && <p className="text-sm text-destructive">Bitiş başlangıçtan önce olamaz.</p>}

      {report.isPending ? (
        <LoadingRows />
      ) : report.isError ? (
        <ErrorState error={report.error} />
      ) : rows.length === 0 ? (
        <EmptyState title="Çalışan yok" description="Rapor için önce çalışan ekleyin." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Toplam çalışma" value={formatDuration(sum((r) => r.shiftMinutes))} />
            <Stat label="Tamamlanan görev" value={String(sum((r) => r.tasksDone))} />
            <Stat
              label="Geciken görev"
              value={String(sum((r) => r.tasksOverdue))}
              bad={sum((r) => r.tasksOverdue) > 0}
            />
            <Stat label="Çalışanlara ödenen" value={formatKurus(sum((r) => r.paidKurus))} />
          </div>
          {report.data.unassignedOpenTasks > 0 && (
            <p className="text-sm text-muted-foreground">
              Ayrıca kimseye atanmamış {report.data.unassignedOpenTasks} açık görev var.
            </p>
          )}
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => r.employeeId}
            onRowClick={(r) =>
              void navigate({
                to: '/calisanlar/$employeeId',
                params: { employeeId: r.employeeId },
              })
            }
            mobileCard={(r) => (
              <div className="grid gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-sm tabular-nums">{formatKurus(r.paidKurus)}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {r.shiftCount} vardiya ·{' '}
                  {r.shiftMinutes ? formatDuration(r.shiftMinutes) : '0 dk'}
                </span>
                <span className="text-xs">
                  {r.tasksDone} tamamlanan
                  {r.tasksDoneLate > 0 && ` (${r.tasksDoneLate} geç)`} · {r.tasksOpen} açık
                  {r.tasksOverdue > 0 && (
                    <span className="text-red-700 dark:text-red-400">
                      {' '}
                      · {r.tasksOverdue} geciken
                    </span>
                  )}
                </span>
              </div>
            )}
          />
        </>
      )}
    </div>
  );
}

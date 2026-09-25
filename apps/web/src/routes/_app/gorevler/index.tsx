import { TASK_VIEWS, type TaskDto, type TaskView } from '@apartman/shared';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Repeat } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PriorityBadge, TaskStatusBadge } from '@/features/staff/parts';
import { employeeName } from '@/features/staff/staff';
import { TaskDialog } from '@/features/staff/task-dialogs';
import { formatDate } from '@/lib/format';
import { useEmployees, useTasks } from '@/lib/queries';
import { cn } from '@/lib/utils';

const viewLabels: Record<TaskView, string> = {
  open: 'Açık görevler',
  overdue: 'Gecikmiş',
  done: 'Tamamlanan',
  cancelled: 'İptal edilen',
  all: 'Tümü',
};

export const Route = createFileRoute('/_app/gorevler/')({
  validateSearch: (s: Record<string, unknown>): { durum?: TaskView; calisan?: string } => ({
    durum: TASK_VIEWS.includes(s['durum'] as TaskView) ? (s['durum'] as TaskView) : undefined,
    calisan: typeof s['calisan'] === 'string' ? s['calisan'] : undefined,
  }),
  component: () => (
    <ManagerOnly>
      <TasksPage />
    </ManagerOnly>
  ),
});

function TaskTitle({ task }: { task: TaskDto }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
      {task.recurringTaskId && (
        <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Tekrarlayan" />
      )}
      <span className="truncate">{task.title}</span>
    </span>
  );
}

function TasksPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const view = search.durum ?? 'open';
  const tasks = useTasks(view, search.calisan);
  const employees = useEmployees();
  const [creating, setCreating] = useState(false);

  const setFilter = (patch: Record<string, string | undefined>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const open = (t: TaskDto) => void navigate({ to: '/gorevler/$taskId', params: { taskId: t.id } });

  const columns: ColumnDef<TaskDto>[] = [
    {
      accessorKey: 'title',
      header: 'Görev',
      cell: ({ row }) => <TaskTitle task={row.original} />,
    },
    {
      accessorKey: 'employeeName',
      header: 'Çalışan',
      cell: ({ row }) =>
        row.original.employeeName ?? <span className="text-muted-foreground">Atanmadı</span>,
    },
    {
      accessorKey: 'dueDate',
      header: 'Son tarih',
      cell: ({ row }) => (
        <span className={cn(row.original.overdue && 'text-red-700 dark:text-red-400')}>
          {formatDate(row.original.dueDate)}
        </span>
      ),
    },
    {
      accessorKey: 'priority',
      header: 'Öncelik',
      enableSorting: false,
      cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
    },
    {
      accessorKey: 'status',
      header: 'Durum',
      enableSorting: false,
      cell: ({ row }) => (
        <TaskStatusBadge status={row.original.status} overdue={row.original.overdue} />
      ),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Görevler"
        description={tasks.data ? `${tasks.data.length} görev` : undefined}
        actions={
          <>
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Görev ekle
            </Button>
            <Button variant="outline" asChild>
              <Link to="/tekrarlayan-gorevler">
                <Repeat />
                Tekrarlayan görevler
              </Link>
            </Button>
          </>
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
            {TASK_VIEWS.map((v) => (
              <SelectItem key={v} value={v}>
                {viewLabels[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.calisan ?? 'all'}
          onValueChange={(v) => setFilter({ calisan: v === 'all' ? undefined : v })}
        >
          <SelectTrigger className="w-full" aria-label="Çalışan filtresi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm çalışanlar</SelectItem>
            {(employees.data ?? []).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {employeeName(e)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {tasks.isPending ? (
        <LoadingRows />
      ) : tasks.isError ? (
        <ErrorState error={tasks.error} />
      ) : (
        <DataTable
          columns={columns}
          data={tasks.data}
          getRowId={(t) => t.id}
          onRowClick={open}
          mobileCard={(t) => (
            <div className="grid gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <TaskTitle task={t} />
                <span className="flex shrink-0 gap-1">
                  <PriorityBadge priority={t.priority} />
                  <TaskStatusBadge status={t.status} overdue={t.overdue} />
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {[t.employeeName ?? 'Atanmadı', t.dueDate && `Son tarih ${formatDate(t.dueDate)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          )}
          empty={
            <EmptyState
              title={view === 'open' ? 'Açık görev yok' : 'Bu filtrede görev yok'}
              description="Çalışanlara iş vermek için görev ekleyin; durumunu buradan takip edin."
            />
          }
        />
      )}
      <TaskDialog open={creating} onOpenChange={setCreating} employeeId={search.calisan} />
    </div>
  );
}

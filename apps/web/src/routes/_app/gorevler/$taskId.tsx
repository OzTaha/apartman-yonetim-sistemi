import {
  taskPriorityLabels,
  taskStatusLabels,
  type TaskDetailDto,
  type TaskEventDto,
  type TaskStatus,
} from '@apartman/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Ban, Check, Pencil, Play, Repeat, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { PriorityBadge, TaskStatusBadge } from '@/features/staff/parts';
import { TaskDialog, TaskStatusDialog } from '@/features/staff/task-dialogs';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApiMutation, useTask } from '@/lib/queries';

export const Route = createFileRoute('/_app/gorevler/$taskId')({
  component: () => (
    <ManagerOnly>
      <TaskDetailPage />
    </ManagerOnly>
  ),
});

const dateTime = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

function eventText(e: TaskEventDto): string {
  switch (e.kind) {
    case 'CREATED':
      return e.assigneeName ? `Görev oluşturuldu, ${e.assigneeName} atandı` : 'Görev oluşturuldu';
    case 'ASSIGNED':
      return e.assigneeName ? `${e.assigneeName} atandı` : 'Atama kaldırıldı';
    case 'EDITED':
      return 'Görev bilgileri düzenlendi';
    case 'STATUS':
      return `Durum: ${taskStatusLabels[e.status!]}`;
    case 'NOTE':
      return 'Not eklendi';
  }
}

function History({ task }: { task: TaskDetailDto }) {
  const [note, setNote] = useState('');
  const add = useApiMutation(
    () =>
      apiFetch<TaskDetailDto>(`/tasks/${task.id}/notes`, {
        method: 'POST',
        body: { note: note.trim() },
      }),
    { success: 'Not eklendi', onSuccess: () => setNote('') },
  );

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Görev geçmişi</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ol className="grid gap-3 border-l pl-4">
          {task.events.map((e) => (
            <li key={e.id} className="relative grid gap-0.5 text-sm">
              <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-primary" />
              <span className="font-medium">{eventText(e)}</span>
              {e.note && (
                <span className="whitespace-pre-line break-words text-muted-foreground">
                  {e.note}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {dateTime.format(new Date(e.createdAt))}
                {e.userName && ` · ${e.userName}`}
              </span>
            </li>
          ))}
        </ol>
        <form
          className="grid gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (note.trim()) add.mutate(undefined);
          }}
        >
          <Textarea
            aria-label="Not"
            placeholder="Not ekleyin (ör. malzeme sipariş edildi)"
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="w-fit"
            disabled={!note.trim() || add.isPending}
          >
            Not ekle
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TaskDetailPage() {
  const { taskId } = Route.useParams();
  const task = useTask(taskId);
  const [editing, setEditing] = useState(false);
  const [nextStatus, setNextStatus] = useState<TaskStatus | null>(null);
  const start = useApiMutation(
    () =>
      apiFetch<TaskDetailDto>(`/tasks/${taskId}/status`, {
        method: 'POST',
        body: { status: 'IN_PROGRESS' },
      }),
    { success: 'Görev başlatıldı' },
  );

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/gorevler">
        <ArrowLeft />
        Görevler
      </Link>
    </Button>
  );

  if (task.isPending) return <LoadingRows />;
  if (task.isError)
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState error={task.error} />
      </div>
    );

  const t = task.data;
  const open = t.status === 'TODO' || t.status === 'IN_PROGRESS';
  const info: [string, string | null][] = [
    ['Çalışan', t.employeeName ?? 'Atanmadı'],
    ['Son tarih', t.dueDate ? formatDate(t.dueDate) : null],
    ['Öncelik', taskPriorityLabels[t.priority]],
    ['Tamamlanma', t.completedAt ? dateTime.format(new Date(t.completedAt)) : null],
    ['Açıklama', t.description],
  ];

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={t.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={t.status} overdue={t.overdue} />
            <PriorityBadge priority={t.priority} />
            {t.recurringTaskId && (
              <span className="inline-flex items-center gap-1">
                <Repeat className="size-3.5" />
                Tekrarlayan görev
              </span>
            )}
          </span>
        }
        actions={
          open ? (
            <>
              {t.status === 'TODO' && (
                <Button
                  variant="outline"
                  disabled={start.isPending}
                  onClick={() => start.mutate(undefined)}
                >
                  <Play />
                  Başlat
                </Button>
              )}
              <Button onClick={() => setNextStatus('DONE')}>
                <Check />
                Tamamla
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil />
                Düzenle
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setNextStatus('CANCELLED')}
              >
                <Ban />
                İptal et
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setNextStatus('TODO')}>
              <RotateCcw />
              Yeniden aç
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="min-w-0 py-4">
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {info
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium whitespace-pre-line break-words">{value}</dd>
                  </div>
                ))}
            </dl>
          </CardContent>
        </Card>
        <History task={t} />
      </div>

      <TaskDialog open={editing} onOpenChange={setEditing} task={t} />
      <TaskStatusDialog
        task={t}
        status={nextStatus}
        onOpenChange={(o) => !o && setNextStatus(null)}
      />
    </div>
  );
}

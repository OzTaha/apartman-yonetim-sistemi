import type { StaffMeDto, StaffTaskDto } from '@apartman/shared';
import { createFileRoute, Link, Navigate } from '@tanstack/react-router';
import { CalendarClock, CircleCheck, DoorClosed, ListChecks, Play } from 'lucide-react';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Tour, type TourStep } from '@/components/tour';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { formatDate, todayIso } from '@/lib/format';
import { useApiMutation, useStaffMe } from '@/lib/queries';
import { useRole } from '@/lib/session';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/islerim')({
  component: StaffGuard,
});

const tour: TourStep[] = [
  {
    target: 'staff-tasks',
    title: 'Size verilen işler',
    body: 'Yöneticinin size verdiği işler burada sıralanır. İşe başlayınca "Başladım", bitirince "Bitirdim" düğmesine basın. Yönetici bunu hemen görür.',
  },
  {
    target: 'staff-shifts',
    title: 'Çalışma saatleriniz',
    body: 'Önümüzdeki günlerde hangi saatlerde çalışacağınız burada yazar.',
  },
  {
    target: 'appearance',
    title: 'Yazıyı büyütün',
    body: 'Yazılar küçük geliyorsa bu düğmeden "Büyük" veya "Çok büyük" seçin.',
  },
];

function StaffGuard() {
  if (useRole() !== 'STAFF') return <Navigate to="/" replace />;
  return <StaffHome />;
}

const priorityLabel: Record<StaffTaskDto['priority'], string | null> = {
  LOW: null,
  NORMAL: null,
  HIGH: 'Acil',
};

function TaskItem({ task }: { task: StaffTaskDto }) {
  const change = useApiMutation(
    (status: 'IN_PROGRESS' | 'DONE') =>
      apiFetch<StaffMeDto>(`/staff/me/tasks/${task.id}/status`, {
        method: 'POST',
        body: { status },
      }),
    {
      success: 'Kaydedildi',
    },
  );
  return (
    <li className="grid gap-3 py-4">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold">{task.title}</span>
          {priorityLabel[task.priority] && <Badge variant="destructive">Acil</Badge>}
          {task.status === 'IN_PROGRESS' && <Badge>Devam ediyor</Badge>}
        </div>
        {task.description && (
          <p className="whitespace-pre-line text-muted-foreground">{task.description}</p>
        )}
        {task.dueDate && (
          <p
            className={cn(
              'text-sm',
              task.overdue ? 'font-semibold text-destructive' : 'text-muted-foreground',
            )}
          >
            {task.overdue ? 'Günü geçti: ' : 'Son gün: '}
            {formatDate(task.dueDate)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {task.status === 'TODO' && (
          <Button
            variant="outline"
            size="lg"
            disabled={change.isPending}
            onClick={() => change.mutate('IN_PROGRESS')}
          >
            <Play />
            Başladım
          </Button>
        )}
        <Button size="lg" disabled={change.isPending} onClick={() => change.mutate('DONE')}>
          <CircleCheck />
          Bitirdim
        </Button>
      </div>
    </li>
  );
}

function StaffHome() {
  const me = useStaffMe();
  const today = todayIso();

  if (me.isPending) return <LoadingRows />;
  if (me.isError) return <ErrorState error={me.error} />;
  const d = me.data;
  const todayShifts = d.shifts.filter((s) => s.date === today);

  return (
    <div className="grid gap-5">
      <PageHeader title={`Merhaba, ${d.name.split(' ')[0]}`} description={d.role} />
      {d.doorAccess && (
        <Button size="lg" asChild className="h-14 w-full text-base sm:w-fit">
          <Link to="/kapi">
            <DoorClosed />
            Kapı: kargo ve misafir
          </Link>
        </Button>
      )}
      <Card data-tour="staff-tasks">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="size-5 text-primary" />
            İşlerim
          </CardTitle>
        </CardHeader>
        <CardContent>
          {d.tasks.length === 0 ? (
            <EmptyState
              icon={CircleCheck}
              title="Bekleyen işiniz yok"
              description="Yönetici size bir iş verdiğinde burada görünür."
            />
          ) : (
            <ul className="divide-y">
              {d.tasks.map((t) => (
                <TaskItem key={t.id} task={t} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card data-tour="staff-shifts">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" />
            Çalışma saatlerim
          </CardTitle>
        </CardHeader>
        <CardContent>
          {d.shifts.length === 0 ? (
            <p className="text-muted-foreground">Önümüzdeki 7 gün için yazılmış vardiya yok.</p>
          ) : (
            <ul className="divide-y">
              {d.shifts.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="font-semibold">
                    {s.date === today ? 'Bugün' : formatDate(s.date)}
                  </span>
                  <span className="tabular-nums">
                    {s.startTime} – {s.endTime}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {todayShifts.length === 0 && d.shifts.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">Bugün vardiyanız yok.</p>
          )}
        </CardContent>
      </Card>
      <Tour id="staff-home" steps={tour} ready />
    </div>
  );
}

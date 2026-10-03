import type { MyRequestDto, StaffMeDto, StaffTaskDto } from '@apartman/shared';
import { createFileRoute, Link, Navigate } from '@tanstack/react-router';
import {
  CalendarClock,
  ChevronRight,
  CircleCheck,
  DoorClosed,
  ListChecks,
  MessageSquareText,
  Play,
} from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Tour, type TourStep } from '@/components/tour';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { formatDate, todayIso } from '@/lib/format';
import { StaffMessageDialog } from '@/features/requests/dialogs';
import { formatDateTime, requestCategoryText } from '@/features/requests/format';
import { RequestStatusBadge } from '@/features/requests/parts';
import { useApiMutation, useMyRequests, useStaffMe } from '@/lib/queries';
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
    target: 'staff-message',
    title: 'Yöneticiye yazın',
    body: 'Şüpheli birini gördüğünüzde ya da bir şey bozulduğunda bu düğmeye basın, ne olduğunu yazın. İsterseniz fotoğraf da ekleyin. Mesaj yöneticinin telefonuna hemen düşer, yanıtı da burada görürsünüz.',
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

function MessageItem({ r }: { r: MyRequestDto }) {
  return (
    <li>
      <Link
        to="/taleplerim/$requestId"
        params={{ requestId: r.id }}
        className="flex items-center gap-3 py-3 hover:bg-muted/50"
      >
        <span className="grid min-w-0 flex-1 gap-1">
          <span className={cn('break-words', r.unseen ? 'font-semibold' : 'font-medium')}>
            {r.title}
          </span>
          <span className="text-sm text-muted-foreground">
            {requestCategoryText(r)} · {formatDateTime(r.createdAt)}
            {r.unseen && <span className="ml-2 font-medium text-primary">Yeni yanıt var</span>}
          </span>
        </span>
        <RequestStatusBadge status={r.status} />
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function MessagesCard() {
  const [writing, setWriting] = useState(false);
  const messages = useMyRequests();
  const recent = (messages.data ?? []).slice(0, 5);
  return (
    <Card data-tour="staff-message">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="size-5 text-primary" />
          Yöneticiye mesaj
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-muted-foreground">
          Şüpheli birini gördünüz ya da bir şey bozuldu mu? Yöneticiye buradan yazın.
        </p>
        <Button
          size="lg"
          className="h-12 w-full text-base sm:w-fit"
          onClick={() => setWriting(true)}
        >
          <MessageSquareText />
          Yöneticiye yaz
        </Button>
        {recent.length > 0 && (
          <ul className="divide-y" aria-label="Gönderdiğim mesajlar">
            {recent.map((r) => (
              <MessageItem key={r.id} r={r} />
            ))}
          </ul>
        )}
      </CardContent>
      <StaffMessageDialog open={writing} onOpenChange={setWriting} />
    </Card>
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
      <MessagesCard />
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

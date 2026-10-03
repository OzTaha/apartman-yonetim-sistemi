import {
  OPEN_REQUEST_STATUSES,
  requestLocationLabels,
  taskStatusLabels,
  type RequestStatus,
} from '@apartman/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Ban, Check, ListChecks, Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CommentForm, RequestStatusDialog, RequestTaskDialog } from '@/features/requests/dialogs';
import { formatDateTime, requestPlace, requestSubtitle } from '@/features/requests/format';
import {
  PhotoGallery,
  RequestSourceBadges,
  RequestStatusBadge,
  RequestTimeline,
} from '@/features/requests/parts';
import { formatPhone } from '@/lib/format';
import { useServiceRequest } from '@/lib/queries';
import { canManage, useRole } from '@/lib/session';

export const Route = createFileRoute('/_app/talepler/$requestId')({
  component: () => (
    <ManagerOnly allow={['BLOCK_MANAGER']}>
      <RequestDetailPage />
    </ManagerOnly>
  ),
});

function RequestDetailPage() {
  const { requestId } = Route.useParams();
  const request = useServiceRequest(requestId);
  const manager = canManage(useRole());
  const [nextStatus, setNextStatus] = useState<RequestStatus | null>(null);
  const [tasking, setTasking] = useState(false);

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/talepler">
        <ArrowLeft />
        Arıza ve talepler
      </Link>
    </Button>
  );

  if (request.isPending) return <LoadingRows />;
  if (request.isError)
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState error={request.error} />
      </div>
    );

  const r = request.data;
  const open = OPEN_REQUEST_STATUSES.includes(r.status);
  const canCreateTask = manager && open && (!r.task || r.task.status === 'CANCELLED');
  const info: [string, string | null][] = [
    ['Daire', r.fromStaff ? null : requestPlace(r)],
    ['Yer', r.fromStaff ? null : requestLocationLabels[r.location]],
    [r.fromStaff ? 'Görevli' : 'Sakin', r.requesterName],
    ['Telefon', r.requesterPhone ? formatPhone(r.requesterPhone) : null],
    ['Açılış', formatDateTime(r.createdAt)],
    ['Çözülme', r.resolvedAt ? formatDateTime(r.resolvedAt) : null],
  ];

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={r.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <RequestStatusBadge status={r.status} />
            <RequestSourceBadges r={r} />
            {requestSubtitle(r)}
          </span>
        }
        actions={
          open ? (
            <>
              {r.status === 'NEW' && (
                <Button variant="outline" onClick={() => setNextStatus('IN_PROGRESS')}>
                  <Play />
                  İşleme al
                </Button>
              )}
              {canCreateTask && (
                <Button variant="outline" onClick={() => setTasking(true)}>
                  <ListChecks />
                  Görev oluştur
                </Button>
              )}
              <Button onClick={() => setNextStatus('RESOLVED')}>
                <Check />
                Çözüldü
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setNextStatus('REJECTED')}
              >
                <Ban />
                Reddet
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setNextStatus('IN_PROGRESS')}>
              <RotateCcw />
              Yeniden aç
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="grid min-w-0 content-start gap-6">
          <Card className="min-w-0 py-4">
            <CardContent className="grid gap-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {info
                  .filter(([, v]) => v)
                  .map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium break-words">{value}</dd>
                    </div>
                  ))}
              </dl>
              <p className="text-sm whitespace-pre-line break-words">{r.description}</p>
              <PhotoGallery photos={r.photos} />
            </CardContent>
          </Card>
          {r.task && (
            <Card className="min-w-0 py-4">
              <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  Görev: <span className="font-medium">{taskStatusLabels[r.task.status]}</span>
                  {r.task.employeeName && ` · ${r.task.employeeName}`}
                </span>
                {manager && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/gorevler/$taskId" params={{ taskId: r.task.id }}>
                      <ListChecks />
                      Göreve git
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Talep geçmişi</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <RequestTimeline events={r.events} />
            <CommentForm
              path={`/requests/${r.id}/comments`}
              label="Sakine yanıt"
              placeholder="Sakine iletmek istediğiniz bilgi (ör. teknik servis yarın gelecek)"
              button="Yanıt gönder"
            />
          </CardContent>
        </Card>
      </div>

      <RequestStatusDialog
        request={r}
        status={nextStatus}
        onOpenChange={(o) => !o && setNextStatus(null)}
      />
      {canCreateTask && <RequestTaskDialog request={r} open={tasking} onOpenChange={setTasking} />}
    </div>
  );
}

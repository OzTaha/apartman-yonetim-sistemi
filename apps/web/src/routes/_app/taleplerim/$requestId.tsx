import { OPEN_REQUEST_STATUSES } from '@apartman/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, Navigate, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CommentForm } from '@/features/requests/dialogs';
import { formatDateTime, requestSubtitle } from '@/features/requests/format';
import { PhotoGallery, RequestStatusBadge, RequestTimeline } from '@/features/requests/parts';
import { apiFetch } from '@/lib/api';
import { useApiMutation, useMyRequest } from '@/lib/queries';
import { useHasUnitInSite } from '@/lib/session';
import { labelUnit } from '@/lib/unit-label';

export const Route = createFileRoute('/_app/taleplerim/$requestId')({
  component: MyRequestGuard,
});

function MyRequestGuard() {
  if (!useHasUnitInSite()) return <Navigate to="/" replace />;
  return <MyRequestPage />;
}

function MyRequestPage() {
  const { requestId } = Route.useParams();
  const navigate = useNavigate();
  const request = useMyRequest(requestId);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (request.dataUpdatedAt) void queryClient.invalidateQueries({ queryKey: ['my-requests'] });
  }, [request.dataUpdatedAt, queryClient]);
  const withdraw = useApiMutation(
    () => apiFetch<void>(`/requests/mine/${requestId}`, { method: 'DELETE' }),
    { success: 'Talep geri çekildi', onSuccess: () => void navigate({ to: '/taleplerim' }) },
  );

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/taleplerim">
        <ArrowLeft />
        Taleplerim
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
  const canWithdraw = r.status === 'NEW' && r.events.every((e) => e.byResident);

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={r.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <RequestStatusBadge status={r.status} />
            {requestSubtitle(r)}
          </span>
        }
        actions={
          canWithdraw && (
            <Button
              variant="outline"
              className="text-destructive"
              disabled={withdraw.isPending}
              onClick={() => {
                if (window.confirm('Talep geri çekilsin mi? Bu işlem geri alınamaz.')) {
                  withdraw.mutate(undefined);
                }
              }}
            >
              <Trash2 />
              Talebi geri çek
            </Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="min-w-0 py-4">
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Daire</dt>
              <dd className="font-medium">{labelUnit(r.blockName, r.unitNumber)}</dd>
              <dt className="text-muted-foreground">Açılış</dt>
              <dd className="font-medium">{formatDateTime(r.createdAt)}</dd>
              {r.resolvedAt && (
                <>
                  <dt className="text-muted-foreground">Çözülme</dt>
                  <dd className="font-medium">{formatDateTime(r.resolvedAt)}</dd>
                </>
              )}
            </dl>
            <p className="text-sm whitespace-pre-line break-words">{r.description}</p>
            <PhotoGallery photos={r.photos} />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Talep geçmişi</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <RequestTimeline events={r.events} />
            {open ? (
              <CommentForm
                path={`/requests/mine/${r.id}/comments`}
                label="Yönetime mesaj"
                placeholder="Eklemek istediğiniz bir bilgi varsa yazın"
                button="Mesaj gönder"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Talep kapandı. Sorun devam ediyorsa yeni talep açabilirsiniz.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

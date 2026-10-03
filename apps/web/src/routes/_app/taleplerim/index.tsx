import type { MyRequestDto } from '@apartman/shared';
import { createFileRoute, Link, Navigate, useNavigate } from '@tanstack/react-router';
import { Plus, Wrench } from 'lucide-react';
import { useState } from 'react';
import { InfoTip } from '@/components/info-tip';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NewRequestDialog } from '@/features/requests/dialogs';
import { formatDateTime, requestPlace, requestSubtitle } from '@/features/requests/format';
import { RequestStatusBadge } from '@/features/requests/parts';
import { useMyRequests } from '@/lib/queries';
import { useHasUnitInSite } from '@/lib/session';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/taleplerim/')({
  validateSearch: (s: Record<string, unknown>): { yeni?: boolean } => ({
    yeni: s['yeni'] === true || s['yeni'] === 'true' || s['yeni'] === 1 ? true : undefined,
  }),
  component: MyRequestsGuard,
});

function MyRequestsGuard() {
  if (!useHasUnitInSite()) return <Navigate to="/" replace />;
  return <MyRequestsPage />;
}

function RequestCard({ r }: { r: MyRequestDto }) {
  return (
    <Link to="/taleplerim/$requestId" params={{ requestId: r.id }} className="block">
      <Card
        className={cn('py-4 transition-colors hover:bg-muted/50', r.unseen && 'border-primary')}
      >
        <CardContent className="grid gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className={cn('min-w-0 break-words', r.unseen ? 'font-semibold' : 'font-medium')}>
              {r.title}
            </span>
            <RequestStatusBadge status={r.status} />
          </div>
          <span className="text-xs text-muted-foreground">
            {[requestSubtitle(r), requestPlace(r, 'short')].join(' · ')}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(r.createdAt)}
            {r.unseen && <span className="ml-2 font-medium text-primary">Yeni yanıt var</span>}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

function MyRequestsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const requests = useMyRequests();
  const [creating, setCreating] = useState(Boolean(search.yeni));

  const setOpen = (open: boolean) => {
    setCreating(open);
    if (!open && search.yeni) void navigate({ search: {}, replace: true });
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Taleplerim"
        info={
          <InfoTip title="Taleplerim">
            <p>
              Arıza, temizlik, güvenlik veya öneri gibi konuları yönetime buradan iletirsiniz.
              İsterseniz fotoğraf da ekleyebilirsiniz.
            </p>
            <p>
              Talebin durumu Yeni, İşlemde, Çözüldü veya Reddedildi olarak görünür. Yönetim yanıt
              yazdığında talebin yanında işaret çıkar.
            </p>
            <p>Yönetim henüz işlem yapmadıysa talebinizi geri çekebilirsiniz.</p>
          </InfoTip>
        }
        description="Arıza, temizlik, güvenlik gibi konuları yönetime bildirin ve durumunu takip edin."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Talep bildir
          </Button>
        }
      />
      {requests.isPending ? (
        <LoadingRows />
      ) : requests.isError ? (
        <ErrorState error={requests.error} />
      ) : requests.data.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Henüz talebiniz yok"
          description="Bir arıza veya sorun gördüğünüzde fotoğrafıyla birlikte yönetime bildirebilirsiniz. Durumunu buradan takip edersiniz."
          action={
            <Button size="lg" onClick={() => setCreating(true)}>
              <Plus />
              İlk talebimi bildir
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {requests.data.map((r) => (
            <RequestCard key={r.id} r={r} />
          ))}
        </div>
      )}
      <NewRequestDialog
        open={creating}
        onOpenChange={setOpen}
        onCreated={(r) =>
          void navigate({ to: '/taleplerim/$requestId', params: { requestId: r.id } })
        }
      />
    </div>
  );
}

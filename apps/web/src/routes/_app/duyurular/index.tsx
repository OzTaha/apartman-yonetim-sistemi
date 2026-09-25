import type { AnnouncementDto, ResidentAnnouncementDto } from '@apartman/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { EyeOff, Megaphone, Paperclip, Pin, Plus } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AnnouncementDialog } from '@/features/communication/announcement-dialog';
import { AttachmentList } from '@/features/finance/attachments';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAnnouncements, useMyAnnouncements } from '@/lib/queries';
import { activeRole, canManage, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/duyurular/')({
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const s = useSession();
  return canManage(activeRole(s)) ? <ManagerAnnouncements /> : <ResidentAnnouncements />;
}

function ReadRatio({ a }: { a: AnnouncementDto }) {
  if (a.audienceCount === 0) return <span>Portal kullanan sakin yok</span>;
  return (
    <span>
      {a.readCount}/{a.audienceCount} okudu
    </span>
  );
}

function ManagerAnnouncements() {
  const announcements = useAnnouncements();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Duyurular"
        description="Sakin portalında görünen duyurular; kimlerin okuduğunu buradan izleyebilirsiniz."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Duyuru yayınla
          </Button>
        }
      />
      {announcements.isPending ? (
        <LoadingRows />
      ) : announcements.isError ? (
        <ErrorState error={announcements.error} />
      ) : announcements.data.length === 0 ? (
        <EmptyState
          title="Henüz duyuru yok"
          description="Toplantı, kesinti veya bakım gibi bilgileri sakinlerle paylaşın."
        />
      ) : (
        <div className="grid gap-3">
          {announcements.data.map((a) => (
            <Link
              key={a.id}
              to="/duyurular/$announcementId"
              params={{ announcementId: a.id }}
              className="block"
            >
              <Card
                className={cn(
                  'py-4 transition-colors hover:bg-muted/50',
                  a.expired && 'opacity-60',
                )}
              >
                <CardContent className="grid gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 font-medium">
                      {a.pinned && <Pin className="size-4 shrink-0" aria-label="Sabitlendi" />}
                      <span className="break-words">{a.title}</span>
                    </span>
                    {a.expired && (
                      <Badge variant="outline" className="shrink-0">
                        <EyeOff />
                        Süresi doldu
                      </Badge>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm break-words text-muted-foreground">{a.body}</p>
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatDate(a.publishedAt)}</span>
                    <span>{a.targetLabel}</span>
                    <ReadRatio a={a} />
                    {a.attachments.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="size-3.5" />
                        {a.attachments.length}
                      </span>
                    )}
                    {a.campaignId && <span>SMS/WhatsApp gönderildi</span>}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <AnnouncementDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(a) =>
          void navigate({ to: '/duyurular/$announcementId', params: { announcementId: a.id } })
        }
      />
    </div>
  );
}

function ResidentAnnouncement({ a }: { a: ResidentAnnouncementDto }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  function toggle() {
    setOpen((v) => !v);
    if (!a.read) {
      void apiFetch<void>(`/announcements/${a.id}/read`, { method: 'POST' }).then(() =>
        queryClient.invalidateQueries({ queryKey: ['my-announcements'] }),
      );
    }
  }

  return (
    <Card className={cn('py-4', !a.read && 'border-primary')}>
      <CardContent className="grid gap-2">
        <button
          type="button"
          className="flex items-start justify-between gap-2 text-left"
          aria-expanded={open}
          onClick={toggle}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {a.pinned && <Pin className="size-4 shrink-0" aria-label="Sabitlendi" />}
            <span className={cn('break-words', !a.read ? 'font-semibold' : 'font-medium')}>
              {a.title}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {!a.read && <Badge>Yeni</Badge>}
            {formatDate(a.publishedAt)}
          </span>
        </button>
        <p
          className={cn(
            'text-sm break-words whitespace-pre-line text-muted-foreground',
            !open && 'line-clamp-2',
          )}
        >
          {a.body}
        </p>
        {open && <AttachmentList attachments={a.attachments} />}
        {!open && a.attachments.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Paperclip className="size-3.5" />
            {a.attachments.length} belge
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function ResidentAnnouncements() {
  const announcements = useMyAnnouncements();
  const unread = (announcements.data ?? []).filter((a) => !a.read).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Duyurular"
        description={unread > 0 ? `${unread} okunmamış duyuru` : 'Yönetimden gelen duyurular'}
      />
      {announcements.isPending ? (
        <LoadingRows />
      ) : announcements.isError ? (
        <ErrorState error={announcements.error} />
      ) : announcements.data.length === 0 ? (
        <EmptyState
          title="Duyuru yok"
          description="Yönetim duyuru yayınladığında burada görünür."
        />
      ) : (
        <div className="grid gap-3">
          {announcements.data.map((a) => (
            <ResidentAnnouncement key={a.id} a={a} />
          ))}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Megaphone className="size-3.5" />
        Duyuruyu açtığınızda yönetim okuduğunuzu görür.
      </p>
    </div>
  );
}

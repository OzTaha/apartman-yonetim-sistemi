import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Check, MessageSquare, Pencil, Pin, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnnouncementDialog } from '@/features/communication/announcement-dialog';
import { AttachmentList, AttachmentUploadButton } from '@/features/finance/attachments';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAnnouncement, useApiMutation } from '@/lib/queries';
import { labelUnit } from '@/lib/unit-label';

export const Route = createFileRoute('/_app/duyurular/$announcementId')({
  component: () => (
    <ManagerOnly>
      <AnnouncementDetailPage />
    </ManagerOnly>
  ),
});

const dateTime = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

function AnnouncementDetailPage() {
  const { announcementId } = Route.useParams();
  const navigate = useNavigate();
  const announcement = useAnnouncement(announcementId);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const remove = useApiMutation(
    () => apiFetch<void>(`/announcements/${announcementId}`, { method: 'DELETE' }),
    { success: 'Duyuru silindi', onSuccess: () => void navigate({ to: '/duyurular' }) },
  );

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/duyurular">
        <ArrowLeft />
        Duyurular
      </Link>
    </Button>
  );

  if (announcement.isPending) return <LoadingRows />;
  if (announcement.isError)
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState error={announcement.error} />
      </div>
    );

  const a = announcement.data;

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={a.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {a.pinned && (
              <span className="inline-flex items-center gap-1">
                <Pin className="size-3.5" />
                Sabitlendi
              </span>
            )}
            <span>{formatDate(a.publishedAt)}</span>
            <span>{a.targetLabel}</span>
            {a.expiresAt && (
              <span>
                {a.expired ? 'Süresi doldu' : `${formatDate(a.expiresAt)} tarihine kadar`}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil />
              Düzenle
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => setRemoving(true)}
            >
              <Trash2 />
              Sil
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="min-w-0">
          <CardContent className="grid gap-4">
            <p className="text-sm break-words whitespace-pre-line">{a.body}</p>
            <AttachmentList attachments={a.attachments} deletable />
            <div>
              <AttachmentUploadButton target="announcement" targetId={a.id} />
            </div>
            {a.campaignId && (
              <Button variant="outline" size="sm" asChild className="w-fit">
                <Link to="/mesajlar/$campaignId" params={{ campaignId: a.campaignId }}>
                  <MessageSquare />
                  Gönderilen mesajlar
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              Okuyanlar ({a.readCount}/{a.audienceCount})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {a.readers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Bu duyurunun hedefinde portal hesabı olan sakin yok.
              </p>
            ) : (
              <ul className="divide-y">
                {a.readers.map((r) => (
                  <li
                    key={`${r.name}-${r.blockName}-${r.unitNumber}`}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="grid min-w-0">
                      <span className="truncate font-medium">{r.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {labelUnit(r.blockName, r.unitNumber)}
                      </span>
                    </span>
                    {r.readAt ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                        <Check className="size-3.5" />
                        {dateTime.format(new Date(r.readAt))}
                      </span>
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        Okumadı
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {editing && <AnnouncementDialog open onOpenChange={setEditing} announcement={a} />}
      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duyuru silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Duyuru ve ekleri sakin portalından kaldırılır. Daha önce gönderilen SMS/WhatsApp
              kayıtları mesaj geçmişinde kalır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate(undefined)}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

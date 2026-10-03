import {
  requestStatusLabels,
  type AttachmentDto,
  type RequestEventDto,
  type RequestStatus,
} from '@apartman/shared';
import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { errorMessage, fetchBlob, openFile } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime } from './format';

const statusClasses: Record<RequestStatus, string> = {
  NEW: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  RESOLVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  REJECTED: 'bg-muted text-muted-foreground',
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return (
    <Badge variant="secondary" className={statusClasses[status]}>
      {requestStatusLabels[status]}
    </Badge>
  );
}

export function RequestSourceBadges({ r }: { r: { fromStaff: boolean; urgent: boolean } }) {
  if (!r.fromStaff && !r.urgent) return null;
  return (
    <>
      {r.urgent && (
        <Badge variant="secondary" className="bg-destructive/10 text-destructive">
          Acil
        </Badge>
      )}
      {r.fromStaff && <Badge variant="outline">Görevliden</Badge>}
    </>
  );
}

function Thumbnail({ photo }: { photo: AttachmentDto }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchBlob(`/attachments/${photo.id}`)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id]);

  return (
    <button
      type="button"
      className="flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-muted"
      aria-label={`${photo.fileName} fotoğrafını aç`}
      onClick={() =>
        void openFile(`/attachments/${photo.id}`, photo.fileName).catch((e: unknown) =>
          toast.error(errorMessage(e)),
        )
      }
    >
      {url ? (
        <img src={url} alt={photo.fileName} className="size-full object-cover" />
      ) : failed ? (
        <ImageOff className="size-5 text-muted-foreground" />
      ) : null}
    </button>
  );
}

export function PhotoGallery({ photos }: { photos: AttachmentDto[] }) {
  if (photos.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2 sm:max-w-md">
      {photos.map((p) => (
        <Thumbnail key={p.id} photo={p} />
      ))}
    </div>
  );
}

function eventText(e: RequestEventDto): string {
  switch (e.kind) {
    case 'CREATED':
      return 'Talep açıldı';
    case 'STATUS':
      return `Durum: ${requestStatusLabels[e.status!]}`;
    case 'COMMENT':
      return e.byResident ? 'Sakin mesajı' : 'Yönetimin yanıtı';
    case 'TASK':
      return 'Çalışana görev olarak verildi';
  }
}

export function RequestTimeline({ events }: { events: RequestEventDto[] }) {
  return (
    <ol className="grid gap-3 border-l pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative grid gap-0.5 text-sm">
          <span
            className={cn(
              'absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background',
              e.byResident ? 'bg-muted-foreground' : 'bg-primary',
            )}
          />
          <span className="font-medium">{eventText(e)}</span>
          {e.note && (
            <span className="whitespace-pre-line break-words text-muted-foreground">{e.note}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDateTime(e.createdAt)}
            {e.userName && ` · ${e.userName}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

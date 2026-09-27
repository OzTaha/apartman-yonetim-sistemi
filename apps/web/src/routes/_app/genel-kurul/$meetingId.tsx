import {
  CALL_NOTICE_DAYS,
  attendanceStatusLabels,
  meetingKindLabels,
  meetingSessionLabels,
} from '@apartman/shared';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  Ban,
  CalendarCheck2,
  FileDown,
  Megaphone,
  Pencil,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CallDialog, CancelDialog, CompleteDialog } from '@/features/meetings/action-dialogs';
import {
  AttendanceEditor,
  DecisionEditor,
  DecisionView,
  QuorumSummary,
} from '@/features/meetings/editors';
import { formatLocalDateTime } from '@/features/meetings/format';
import { MeetingDialog } from '@/features/meetings/meeting-dialog';
import { MeetingStatusBadge } from '@/features/meetings/parts';
import { apiFetch, downloadFile, errorMessage } from '@/lib/api';
import { useApiMutation, useMeeting } from '@/lib/queries';
import { canManage, useRole } from '@/lib/session';
import { labelUnit } from '@/lib/unit-label';

export const Route = createFileRoute('/_app/genel-kurul/$meetingId')({
  component: () => (
    <ManagerOnly allow={['AUDITOR']}>
      <MeetingPage />
    </ManagerOnly>
  ),
});

type DialogName = 'edit' | 'call' | 'complete' | 'cancel' | null;

const dateTime = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

const download = (path: string, name: string) =>
  void downloadFile(path, name).catch((e: unknown) => toast.error(errorMessage(e)));

function MeetingPage() {
  const { meetingId } = Route.useParams();
  const meeting = useMeeting(meetingId);
  const manager = canManage(useRole());
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<DialogName>(null);
  const close = (open: boolean) => !open && setDialog(null);
  const remove = useApiMutation(
    () => apiFetch<void>(`/meetings/${meetingId}`, { method: 'DELETE' }),
    { success: 'Toplantı silindi', onSuccess: () => void navigate({ to: '/genel-kurul' }) },
  );

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/genel-kurul">
        <ArrowLeft />
        Genel kurul
      </Link>
    </Button>
  );

  if (meeting.isPending) return <LoadingRows />;
  if (meeting.isError)
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState error={meeting.error} />
      </div>
    );

  const m = meeting.data;
  const planned = m.status === 'PLANNED';
  const editable = manager && planned;
  const date = m.startsAt.slice(0, 10);
  const info: [string, string | null][] = [
    ['Tarih ve saat', formatLocalDateTime(m.startsAt)],
    ['İkinci toplantı', m.secondStartsAt ? formatLocalDateTime(m.secondStartsAt) : null],
    ['Yer', m.location],
    [
      'Çağrı',
      m.calledAt ? `${dateTime.format(new Date(m.calledAt))} tarihinde yayınlandı` : 'Yapılmadı',
    ],
    ['Yapılan toplantı', m.heldSession ? meetingSessionLabels[m.heldSession] : null],
    ['İptal nedeni', m.cancelReason],
    ['Not', m.notes],
  ];

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={meetingKindLabels[m.kind]}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <MeetingStatusBadge status={m.status} />
            {formatLocalDateTime(m.startsAt)}
          </span>
        }
        actions={
          <>
            {editable && !m.calledAt && (
              <Button onClick={() => setDialog('call')}>
                <Megaphone />
                Çağrıyı yayınla
              </Button>
            )}
            {editable && (
              <Button
                onClick={() => setDialog('complete')}
                variant={m.calledAt ? 'default' : 'outline'}
              >
                <CalendarCheck2 />
                Toplantıyı tamamla
              </Button>
            )}
            {m.status === 'HELD' && (
              <Button
                variant="outline"
                onClick={() =>
                  download(`/meetings/${m.id}/minutes.pdf`, `genel-kurul-tutanagi-${date}.pdf`)
                }
              >
                <FileDown />
                Tutanak
              </Button>
            )}
            {m.status !== 'CANCELLED' && (
              <Button
                variant="outline"
                onClick={() =>
                  download(`/meetings/${m.id}/attendance.pdf`, `hazirun-cetveli-${date}.pdf`)
                }
              >
                <FileDown />
                Hazirun cetveli
              </Button>
            )}
            {editable && (
              <Button variant="outline" onClick={() => setDialog('edit')}>
                <Pencil />
                Düzenle
              </Button>
            )}
            {editable &&
              (m.calledAt ? (
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setDialog('cancel')}
                >
                  <Ban />
                  İptal et
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm('Toplantı silinsin mi?')) remove.mutate(undefined);
                  }}
                >
                  <Trash2 />
                  Sil
                </Button>
              ))}
          </>
        }
      />

      {planned && !m.calledAt && m.noticeDays < CALL_NOTICE_DAYS && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            Toplantıya {Math.max(m.noticeDays, 0)} gün kaldı; çağrı en az {CALL_NOTICE_DAYS} gün
            önce yapılmalıdır. Tarihi ileri almayı düşünün.
          </AlertDescription>
        </Alert>
      )}

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

      {m.status !== 'CANCELLED' && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Hazirun</CardTitle>
            <CardDescription>
              Toplantıya katılan veya vekil gönderen bağımsız bölümleri işaretleyin; yeter sayı
              kendiliğinden hesaplanır.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {editable ? (
              <AttendanceEditor
                key={m.attendance.map((a) => `${a.unitId}:${a.status}:${a.name ?? ''}`).join('|')}
                meeting={m}
              />
            ) : (
              <div className="grid gap-4">
                <QuorumSummary quorum={m.quorum} />
                <ul className="grid gap-1 text-sm">
                  {m.attendance
                    .filter((a) => a.status !== 'ABSENT')
                    .map((a) => (
                      <li key={a.unitId} className="flex flex-wrap justify-between gap-2">
                        <span>
                          <span className="font-medium">
                            {labelUnit(a.blockName, a.unitNumber, 'short')}
                          </span>{' '}
                          {a.name || a.owners}
                        </span>
                        <Badge variant="outline">{attendanceStatusLabels[a.status]}</Badge>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Gündem ve kararlar</CardTitle>
          {editable && (
            <CardDescription>
              Toplantıda alınan kararları madde madde yazın. Toplantı tamamlanınca kararlar karar
              defterine işlenir.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <ol className="grid gap-5">
            {m.items.map((item) => (
              <li key={item.id} className="grid gap-2 border-b pb-5 last:border-0 last:pb-0">
                <span className="font-medium">
                  {item.position}. {item.title}
                </span>
                {item.budgetLabel && item.budgetId && (
                  <Link
                    to="/butce/$budgetId"
                    params={{ budgetId: item.budgetId }}
                    className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Bağlı bütçe: {item.budgetLabel}
                  </Link>
                )}
                {editable ? (
                  <DecisionEditor
                    key={`${item.id}:${item.result ?? ''}:${item.resolution ?? ''}`}
                    meetingId={m.id}
                    item={item}
                  />
                ) : (
                  <DecisionView item={item} />
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {dialog === 'edit' && <MeetingDialog meeting={m} onOpenChange={close} />}
      {dialog === 'call' && <CallDialog meeting={m} onOpenChange={close} />}
      {dialog === 'complete' && <CompleteDialog meeting={m} onOpenChange={close} />}
      {dialog === 'cancel' && <CancelDialog meeting={m} onOpenChange={close} />}
    </div>
  );
}

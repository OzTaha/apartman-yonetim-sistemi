import {
  CALL_NOTICE_DAYS,
  meetingSessionLabels,
  type MeetingDetailDto,
  type MeetingSession,
} from '@apartman/shared';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Field } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { useApiMutation } from '@/lib/queries';
import { formatLocalDateTime } from './format';

export function CallDialog({
  meeting,
  onOpenChange,
}: {
  meeting: MeetingDetailDto;
  onOpenChange: (open: boolean) => void;
}) {
  const [sms, setSms] = useState(false);
  const [body, setBody] = useState(
    `Genel kurul toplantımız ${formatLocalDateTime(meeting.startsAt)} tarihinde ${meeting.location} adresinde yapılacaktır. Gündem ve ayrıntılar duyurular sayfasındadır.`,
  );
  const call = useApiMutation(
    () =>
      apiFetch<MeetingDetailDto>(`/meetings/${meeting.id}/call`, {
        method: 'POST',
        body: { notify: sms ? { channel: 'SMS', body: body.trim() } : null },
      }),
    { success: 'Çağrı yayınlandı', onSuccess: () => onOpenChange(false) },
  );
  const late = meeting.noticeDays < CALL_NOTICE_DAYS;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Toplantı çağrısını yayınla</DialogTitle>
          <DialogDescription>
            Tarih, yer, ikinci toplantı ve gündem tüm sakinlere sabitlenmiş duyuru olarak
            yayınlanır. Çağrıdan sonra toplantı silinemez, yalnızca iptal edilebilir.
          </DialogDescription>
        </DialogHeader>
        {late && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>
              Toplantıya {Math.max(meeting.noticeDays, 0)} gün kaldı. Kat Mülkiyeti Kanunu'na göre
              çağrı en az {CALL_NOTICE_DAYS} gün önce yapılmalıdır.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3">
          <div className="flex items-start gap-2">
            <Checkbox id="call-sms" checked={sms} onCheckedChange={(v) => setSms(v === true)} />
            <Label htmlFor="call-sms" className="leading-snug font-normal">
              SMS ile de bildir (iletişim onayı olan sakinlere)
            </Label>
          </div>
          {sms && (
            <Field label="SMS metni" htmlFor="call-sms-body">
              <Textarea
                id="call-sms-body"
                rows={4}
                maxLength={1000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            disabled={call.isPending || (sms && !body.trim())}
            onClick={() => call.mutate(undefined)}
          >
            Yayınla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DECISIONS_SMS = 'Genel kurul toplantımızda alınan kararlar duyurular sayfasında yayınlandı.';

function SmsFields({
  id,
  sms,
  onSmsChange,
  body,
  onBodyChange,
}: {
  id: string;
  sms: boolean;
  onSmsChange: (value: boolean) => void;
  body: string;
  onBodyChange: (value: string) => void;
}) {
  return (
    <>
      <div className="flex items-start gap-2">
        <Checkbox id={id} checked={sms} onCheckedChange={(v) => onSmsChange(v === true)} />
        <Label htmlFor={id} className="leading-snug font-normal">
          SMS ile de bildir (iletişim onayı olan sakinlere)
        </Label>
      </div>
      {sms && (
        <Field label="SMS metni" htmlFor={`${id}-body`}>
          <Textarea
            id={`${id}-body`}
            rows={3}
            maxLength={1000}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
          />
        </Field>
      )}
    </>
  );
}

export function ShareDecisionsDialog({
  meeting,
  onOpenChange,
}: {
  meeting: MeetingDetailDto;
  onOpenChange: (open: boolean) => void;
}) {
  const [sms, setSms] = useState(false);
  const [body, setBody] = useState(DECISIONS_SMS);
  const share = useApiMutation(
    () =>
      apiFetch<MeetingDetailDto>(`/meetings/${meeting.id}/share-decisions`, {
        method: 'POST',
        body: { notify: sms ? { channel: 'SMS', body: body.trim() } : null },
      }),
    { success: 'Kararlar duyuru olarak paylaşıldı', onSuccess: () => onOpenChange(false) },
  );
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kararları duyuru olarak paylaş</DialogTitle>
          <DialogDescription>
            Gündem maddeleri, sonuçları, karar numaraları ve karar metinleri tüm sakinlere duyuru
            olarak yayınlanır. Hazirun bilgisi paylaşılmaz.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <SmsFields
            id="share-sms"
            sms={sms}
            onSmsChange={setSms}
            body={body}
            onBodyChange={setBody}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            disabled={share.isPending || (sms && !body.trim())}
            onClick={() => share.mutate(undefined)}
          >
            Paylaş
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteDialog({
  meeting,
  onOpenChange,
}: {
  meeting: MeetingDetailDto;
  onOpenChange: (open: boolean) => void;
}) {
  const [session, setSession] = useState<MeetingSession>(
    meeting.quorum.reached ? 'FIRST' : 'SECOND',
  );
  const [shareDecisions, setShareDecisions] = useState(true);
  const [sms, setSms] = useState(false);
  const [body, setBody] = useState(DECISIONS_SMS);
  const withSms = shareDecisions && sms;
  const complete = useApiMutation(
    () =>
      apiFetch<MeetingDetailDto>(`/meetings/${meeting.id}/complete`, {
        method: 'POST',
        body: {
          session,
          shareDecisions,
          notify: withSms ? { channel: 'SMS', body: body.trim() } : null,
        },
      }),
    {
      success: shareDecisions
        ? 'Toplantı tamamlandı, kararlar deftere işlendi ve duyuru olarak paylaşıldı'
        : 'Toplantı tamamlandı, kararlar deftere işlendi',
      onSuccess: () => onOpenChange(false),
    },
  );
  const missing = meeting.items.filter((i) => !i.result).map((i) => i.position);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Toplantıyı tamamla</DialogTitle>
          <DialogDescription>
            Kararlar karar defterine sıra numarasıyla işlenir; bundan sonra hazirun ve kararlar
            değiştirilemez.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Toplantı" htmlFor="complete-session">
            <Select value={session} onValueChange={(v) => setSession(v as MeetingSession)}>
              <SelectTrigger id="complete-session" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['FIRST', 'SECOND'] as MeetingSession[]).map((s) => (
                  <SelectItem key={s} value={s} disabled={s === 'FIRST' && !meeting.quorum.reached}>
                    {meetingSessionLabels[s]}
                    {s === 'SECOND' && meeting.secondStartsAt
                      ? ` (${formatLocalDateTime(meeting.secondStartsAt)})`
                      : s === 'FIRST'
                        ? ` (${formatLocalDateTime(meeting.startsAt)})`
                        : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!meeting.quorum.reached && (
            <p className="text-sm text-muted-foreground">
              Birinci toplantı için yeter sayı sağlanmadı; toplantı ikinci toplantı olarak
              tamamlanabilir.
            </p>
          )}
          {missing.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                Karar yazılmamış gündem maddeleri: {missing.join(', ')}
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-3 rounded-md border p-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="complete-share"
                checked={shareDecisions}
                onCheckedChange={(v) => setShareDecisions(v === true)}
              />
              <Label htmlFor="complete-share" className="grid gap-0.5 font-normal">
                <span className="font-medium">Kararları duyuru olarak paylaş</span>
                <span className="text-xs text-muted-foreground">
                  Sakinler kararları Duyurular sayfasında görür. Hazirun bilgisi paylaşılmaz.
                </span>
              </Label>
            </div>
            {shareDecisions && (
              <SmsFields
                id="complete-sms"
                sms={sms}
                onSmsChange={setSms}
                body={body}
                onBodyChange={setBody}
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            disabled={complete.isPending || missing.length > 0 || (withSms && !body.trim())}
            onClick={() => complete.mutate(undefined)}
          >
            Tamamla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelDialog({
  meeting,
  onOpenChange,
}: {
  meeting: MeetingDetailDto;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancel = useApiMutation(
    () =>
      apiFetch<MeetingDetailDto>(`/meetings/${meeting.id}/cancel`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    { success: 'Toplantı iptal edildi', onSuccess: () => onOpenChange(false) },
  );
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Toplantıyı iptal et</DialogTitle>
          <DialogDescription>
            İptal edilen toplantı sakinlerin listesinden kalkar. Sakinleri ayrıca duyuruyla
            bilgilendirmeyi unutmayın.
          </DialogDescription>
        </DialogHeader>
        <Field label="İptal nedeni" htmlFor="cancel-reason" required error={error ?? undefined}>
          <Textarea
            id="cancel-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => {
              if (reason.trim().length < 3) {
                setError('İptal nedenini yazın');
                return;
              }
              cancel.mutate(undefined);
            }}
          >
            İptal et
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

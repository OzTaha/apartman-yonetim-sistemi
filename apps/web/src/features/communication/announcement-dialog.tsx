import {
  announcementAudienceLabels,
  announcementCreateSchema,
  announcementUpdateSchema,
  DEFAULT_TEMPLATES,
  messageChannelLabels,
  type AnnouncementDto,
  type MessageChannel,
} from '@apartman/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/form-field';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FilePicker } from '@/features/finance/attachments';
import { uploadAll } from '@/features/finance/files';
import { apiFetch, errorMessage } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { useMessageTemplates, useRefreshSiteData } from '@/lib/queries';
import { SmsCounter } from './parts';
import { TargetPicker, type TargetValue } from './target-picker';

const audienceOptions = Object.entries(announcementAudienceLabels).map(([value, label]) => ({
  value,
  label,
}));

const defaultNotifyBody = DEFAULT_TEMPLATES.find((t) => t.kind === 'ANNOUNCEMENT')!.body;

type Errors = Partial<Record<string, string>>;

export function AnnouncementDialog({
  open,
  onOpenChange,
  announcement,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement?: AnnouncementDto;
  onSaved?: (saved: AnnouncementDto) => void;
}) {
  const templates = useMessageTemplates();
  const refresh = useRefreshSiteData();
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [body, setBody] = useState(announcement?.body ?? '');
  const [target, setTarget] = useState<TargetValue>({
    target: announcement?.audience ?? 'ALL',
    blockIds: announcement?.blockIds ?? [],
    unitIds: announcement?.unitIds ?? [],
  });
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [expiresAt, setExpiresAt] = useState(announcement?.expiresAt ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [notify, setNotify] = useState(false);
  const [channel, setChannel] = useState<MessageChannel>('SMS');
  const [notifyBody, setNotifyBody] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const smsText =
    notifyBody ?? templates.data?.find((t) => t.kind === 'ANNOUNCEMENT')?.body ?? defaultNotifyBody;

  function reset() {
    setFiles([]);
    setNotify(false);
    setNotifyBody(null);
    setErrors({});
    if (!announcement) {
      setTitle('');
      setBody('');
      setTarget({ target: 'ALL', blockIds: [], unitIds: [] });
      setPinned(false);
      setExpiresAt('');
    }
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function submit() {
    const payload = {
      title,
      body,
      audience: target.target,
      blockIds: target.blockIds,
      unitIds: target.unitIds,
      pinned,
      expiresAt: expiresAt || null,
      ...(announcement ? {} : { notify: notify ? { channel, body: smsText } : null }),
    };
    const parsed = (announcement ? announcementUpdateSchema : announcementCreateSchema).safeParse(
      payload,
    );
    const next: Errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= issue.message;
    }
    if (expiresAt && expiresAt < todayIso() && expiresAt !== announcement?.expiresAt) {
      next['expiresAt'] = 'Bitiş tarihi geçmiş bir gün olamaz';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const saved = announcement
        ? await apiFetch<AnnouncementDto>(`/announcements/${announcement.id}`, {
            method: 'PUT',
            body: payload,
          })
        : await apiFetch<AnnouncementDto>('/announcements', { method: 'POST', body: payload });
      if (files.length > 0) await uploadAll('announcement', saved.id, files);
      await refresh();
      toast.success(
        announcement
          ? 'Duyuru güncellendi'
          : saved.campaignId
            ? 'Duyuru yayınlandı, mesajlar gönderiliyor'
            : notify
              ? 'Duyuru yayınlandı. Mesaj gönderilecek iletişim onaylı sakin bulunamadı.'
              : 'Duyuru yayınlandı',
      );
      close();
      onSaved?.(saved);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{announcement ? 'Duyuruyu düzenle' : 'Duyuru yayınla'}</DialogTitle>
          <DialogDescription>
            Duyuru, seçilen dairelerde oturan sakinlerin portalında görünür.
          </DialogDescription>
        </DialogHeader>
        <form
          id="announcement-form"
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Başlık" htmlFor="ann-title" required error={errors['title']}>
            <Input
              id="ann-title"
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Duyuru metni" htmlFor="ann-body" required error={errors['body']}>
            <Textarea
              id="ann-body"
              rows={5}
              maxLength={5000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <TargetPicker
            idPrefix="ann"
            label="Kimler görsün"
            options={audienceOptions}
            value={target}
            onChange={setTarget}
            error={errors['blockIds'] ?? errors['unitIds']}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Bitiş tarihi"
              htmlFor="ann-expires"
              error={errors['expiresAt']}
              hint="Bu tarihten sonra sakinlerden gizlenir."
            >
              <Input
                id="ann-expires"
                type="date"
                min={todayIso()}
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </Field>
            <div className="flex items-center gap-2 sm:mt-6">
              <Checkbox
                id="ann-pinned"
                checked={pinned}
                onCheckedChange={(v) => setPinned(v === true)}
              />
              <Label htmlFor="ann-pinned" className="font-normal">
                Üste sabitle
              </Label>
            </div>
          </div>
          {!announcement && (
            <>
              <FilePicker files={files} onChange={setFiles} />
              <div className="grid gap-3 rounded-md border p-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="ann-notify"
                    checked={notify}
                    onCheckedChange={(v) => setNotify(v === true)}
                  />
                  <Label htmlFor="ann-notify" className="grid gap-0.5 font-normal">
                    <span className="font-medium">SMS veya WhatsApp ile de bildir</span>
                    <span className="text-xs text-muted-foreground">
                      Yalnızca iletişim onayı ve telefonu olan sakinlere gönderilir.
                    </span>
                  </Label>
                </div>
                {notify && (
                  <>
                    <Field label="Kanal" htmlFor="ann-channel">
                      <Select
                        value={channel}
                        onValueChange={(v) => setChannel(v as MessageChannel)}
                      >
                        <SelectTrigger id="ann-channel" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(messageChannelLabels) as MessageChannel[]).map((c) => (
                            <SelectItem key={c} value={c}>
                              {messageChannelLabels[c]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field
                      label="Mesaj"
                      htmlFor="ann-sms"
                      error={errors['notify.body']}
                      hint="{ad} ve {site} alanları her sakin için doldurulur."
                    >
                      <Textarea
                        id="ann-sms"
                        rows={3}
                        value={smsText}
                        onChange={(e) => setNotifyBody(e.target.value)}
                      />
                    </Field>
                    <SmsCounter text={smsText} channel={channel} />
                  </>
                )}
              </div>
            </>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Vazgeç
          </Button>
          <Button type="submit" form="announcement-form" disabled={saving}>
            {saving ? 'Kaydediliyor…' : announcement ? 'Kaydet' : 'Yayınla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

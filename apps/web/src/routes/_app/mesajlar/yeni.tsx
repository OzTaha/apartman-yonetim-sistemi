import {
  campaignKindLabels,
  campaignSchema,
  DEFAULT_TEMPLATES,
  messageChannelLabels,
  recipientFilterLabels,
  type CampaignDto,
  type CampaignKind,
  type CampaignPreviewDto,
  type MessageChannel,
} from '@apartman/shared';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/form-field';
import { ManagerOnly } from '@/components/manager-only';
import { PageHeader } from '@/components/page';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SmsCounter, VariableButtons } from '@/features/communication/parts';
import { TargetPicker, type TargetValue } from '@/features/communication/target-picker';
import { apiFetch, errorMessage } from '@/lib/api';
import { useApiMutation, useMessageTemplates } from '@/lib/queries';
import { labelUnit } from '@/lib/unit-label';

const KINDS = Object.keys(campaignKindLabels) as CampaignKind[];

export const Route = createFileRoute('/_app/mesajlar/yeni')({
  validateSearch: (s: Record<string, unknown>): { tur?: CampaignKind } => ({
    tur: KINDS.includes(s['tur'] as CampaignKind) ? (s['tur'] as CampaignKind) : undefined,
  }),
  component: () => (
    <ManagerOnly>
      <ComposePage />
    </ManagerOnly>
  ),
});

const filterOptions = Object.entries(recipientFilterLabels).map(([value, label]) => ({
  value,
  label,
}));

function ComposePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const templates = useMessageTemplates();
  const initialKind = search.tur ?? 'DUES_REMINDER';
  const [kind, setKind] = useState<CampaignKind>(initialKind);
  const [channel, setChannel] = useState<MessageChannel>('SMS');
  const [target, setTarget] = useState<TargetValue>({
    target: initialKind === 'DUES_REMINDER' ? 'OVERDUE' : 'ALL',
    blockIds: [],
    unitIds: [],
  });
  const [body, setBody] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<CampaignPreviewDto | null>(null);
  const [checking, setChecking] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<[number, number] | null>(null);

  const kindTemplates = (templates.data ?? []).filter((t) => t.kind === kind);
  const text =
    body ?? kindTemplates[0]?.body ?? DEFAULT_TEMPLATES.find((t) => t.kind === kind)!.body;

  const payload = {
    kind,
    channel,
    filter: target.target,
    blockIds: target.blockIds,
    unitIds: target.unitIds,
    body: text,
  };

  const send = useApiMutation(
    () => apiFetch<CampaignDto>('/messages', { method: 'POST', body: payload }),
    {
      success: (c) => `${c.counts.queued + c.counts.sent} mesaj gönderiliyor`,
      onSuccess: (c) =>
        void navigate({ to: '/mesajlar/$campaignId', params: { campaignId: c.id } }),
    },
  );

  function insert(variable: string) {
    const el = bodyRef.current;
    const caret = caretRef.current;
    const start = caret?.[0] ?? text.length;
    const end = caret?.[1] ?? text.length;
    setBody(`${text.slice(0, start)}${variable}${text.slice(end)}`);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + variable.length, start + variable.length);
      caretRef.current = [start + variable.length, start + variable.length];
    });
  }

  async function review() {
    const parsed = campaignSchema.safeParse(payload);
    const next: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= issue.message;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setChecking(true);
    try {
      setPreview(
        await apiFetch<CampaignPreviewDto>('/messages/preview', { method: 'POST', body: payload }),
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link to="/mesajlar">
          <ArrowLeft />
          Mesajlar
        </Link>
      </Button>
      <PageHeader
        title="Mesaj gönder"
        description="Mesaj yalnızca iletişim onayı ve telefonu olan sakinlere gönderilir."
      />
      <Card className="max-w-2xl">
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mesaj türü" htmlFor="msg-kind" required>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v as CampaignKind);
                  setBody(null);
                  if (v === 'DUES_REMINDER' && target.target === 'ALL') {
                    setTarget({ ...target, target: 'OVERDUE' });
                  }
                }}
              >
                <SelectTrigger id="msg-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {campaignKindLabels[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Kanal" htmlFor="msg-channel" required>
              <Select value={channel} onValueChange={(v) => setChannel(v as MessageChannel)}>
                <SelectTrigger id="msg-channel" className="w-full">
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
          </div>
          <TargetPicker
            idPrefix="msg"
            label="Alıcılar"
            options={filterOptions}
            value={target}
            onChange={setTarget}
            error={errors['blockIds'] ?? errors['unitIds']}
          />
          {kind === 'DUES_REMINDER' && (
            <p className="text-xs text-muted-foreground">
              Aidat hatırlatması dairelerin yalnızca borçtan sorumlu sakinlerine gönderilir.
            </p>
          )}
          {kindTemplates.length > 1 && (
            <Field label="Şablon" htmlFor="msg-template">
              <Select onValueChange={(id) => setBody(kindTemplates.find((t) => t.id === id)!.body)}>
                <SelectTrigger id="msg-template" className="w-full">
                  <SelectValue placeholder="Şablon seçin" />
                </SelectTrigger>
                <SelectContent>
                  {kindTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Mesaj" htmlFor="msg-body" required error={errors['body']}>
            <Textarea
              id="msg-body"
              ref={bodyRef}
              rows={5}
              value={text}
              onChange={(e) => setBody(e.target.value)}
              onSelect={(e) => {
                caretRef.current = [e.currentTarget.selectionStart, e.currentTarget.selectionEnd];
              }}
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <VariableButtons onInsert={insert} />
            <SmsCounter text={text} channel={channel} />
          </div>
          <Button className="w-fit" disabled={checking} onClick={() => void review()}>
            <Send />
            {checking ? 'Alıcılar hesaplanıyor…' : 'Devam'}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {preview?.recipients
                ? `${preview.recipients} kişiye ${messageChannelLabels[channel]} gönderilsin mi?`
                : 'Mesaj gönderilecek kimse yok'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="grid gap-2">
                {preview && (preview.skippedNoConsent > 0 || preview.skippedNoPhone > 0) && (
                  <p>
                    {[
                      preview.skippedNoConsent &&
                        `${preview.skippedNoConsent} kişinin iletişim onayı yok`,
                      preview.skippedNoPhone && `${preview.skippedNoPhone} kişinin telefonu yok`,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    ; bu kişilere gönderilmez.
                  </p>
                )}
                {preview?.sample && (
                  <div className="rounded-md bg-muted p-3 text-foreground">
                    <p className="mb-1 text-xs text-muted-foreground">
                      Örnek: {preview.sample.name} ·{' '}
                      {labelUnit(preview.sample.blockName, preview.sample.unitNumber)}
                    </p>
                    <p className="text-sm break-words whitespace-pre-line">{preview.sample.text}</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            {preview?.recipients ? (
              <AlertDialogAction disabled={send.isPending} onClick={() => send.mutate(undefined)}>
                Gönder
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

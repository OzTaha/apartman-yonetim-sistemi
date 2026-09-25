import {
  campaignKindLabels,
  messageChannelLabels,
  reminderSettingsSchema,
  type MessageChannel,
  type MessageTemplateDto,
  type ReminderSettingsDto,
} from '@apartman/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Field } from '@/components/form-field';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { SmsCounter, VariableButtons } from '@/features/communication/parts';
import { TemplateDialog } from '@/features/communication/template-dialog';
import { apiFetch } from '@/lib/api';
import { useApiMutation, useMessageTemplates, useReminderSettings } from '@/lib/queries';

export const Route = createFileRoute('/_app/mesaj-ayarlari')({
  component: () => (
    <ManagerOnly>
      <MessageSettingsPage />
    </ManagerOnly>
  ),
});

function ReminderForm({ settings }: { settings: ReminderSettingsDto }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [days, setDays] = useState(String(settings.daysAfterDue));
  const [channel, setChannel] = useState<MessageChannel>(settings.channel);
  const [body, setBody] = useState(settings.body);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useApiMutation(
    (value: ReminderSettingsDto) =>
      apiFetch<ReminderSettingsDto>('/reminder-settings', { method: 'PUT', body: value }),
    { success: 'Otomatik hatırlatma ayarı kaydedildi' },
  );

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = reminderSettingsSchema.safeParse({
          enabled,
          daysAfterDue: Number(days),
          channel,
          body,
        });
        if (!parsed.success) {
          const next: Record<string, string> = {};
          for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= issue.message;
          setErrors(next);
          return;
        }
        setErrors({});
        save.mutate(parsed.data);
      }}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          id="rem-enabled"
          checked={enabled}
          onCheckedChange={(v) => setEnabled(v === true)}
        />
        <Label htmlFor="rem-enabled" className="grid gap-0.5 font-normal">
          <span className="font-medium">Otomatik hatırlatma gönder</span>
          <span className="text-xs text-muted-foreground">
            Son ödeme gününden belirtilen gün sonra hâlâ ödenmemiş borcu olan dairelerin borçtan
            sorumlu sakinlerine her sabah 10:00'da gönderilir. Mesaj ücreti sağlayıcı hesabınızdan
            düşülür.
          </span>
        </Label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Son ödeme gününden kaç gün sonra"
          htmlFor="rem-days"
          required
          error={errors['daysAfterDue']}
        >
          <Input
            id="rem-days"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </Field>
        <Field label="Kanal" htmlFor="rem-channel" required>
          <Select value={channel} onValueChange={(v) => setChannel(v as MessageChannel)}>
            <SelectTrigger id="rem-channel" className="w-full">
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
      <Field label="Mesaj" htmlFor="rem-body" required error={errors['body']}>
        <Textarea id="rem-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VariableButtons onInsert={(v) => setBody((b) => `${b}${v}`)} />
        <SmsCounter text={body} channel={channel} />
      </div>
      <Button type="submit" className="w-fit" disabled={save.isPending}>
        Kaydet
      </Button>
    </form>
  );
}

function MessageSettingsPage() {
  const reminder = useReminderSettings();
  const templates = useMessageTemplates();
  const [editing, setEditing] = useState<MessageTemplateDto | null>(null);
  const [creating, setCreating] = useState(false);
  const remove = useApiMutation(
    (id: string) => apiFetch<void>(`/message-templates/${id}`, { method: 'DELETE' }),
    { success: 'Şablon silindi' },
  );

  return (
    <div className="grid gap-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link to="/mesajlar">
          <ArrowLeft />
          Mesajlar
        </Link>
      </Button>
      <PageHeader title="Şablonlar ve hatırlatma" />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Otomatik borç hatırlatması</CardTitle>
          <CardDescription>Varsayılan olarak kapalıdır.</CardDescription>
        </CardHeader>
        <CardContent>
          {reminder.isPending ? (
            <LoadingRows rows={2} />
          ) : reminder.isError ? (
            <ErrorState error={reminder.error} />
          ) : (
            <ReminderForm key={JSON.stringify(reminder.data)} settings={reminder.data} />
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="grid gap-1.5">
            <CardTitle>Mesaj şablonları</CardTitle>
            <CardDescription>Mesaj gönderirken hazır metin olarak seçilir.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus />
            Şablon ekle
          </Button>
        </CardHeader>
        <CardContent>
          {templates.isPending ? (
            <LoadingRows rows={3} />
          ) : templates.isError ? (
            <ErrorState error={templates.error} />
          ) : (
            <ul className="divide-y">
              {templates.data.map((t) => (
                <li key={t.id} className="grid gap-1 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid min-w-0">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {campaignKindLabels[t.kind]}
                      </span>
                    </span>
                    <span className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t.name} düzenle`}
                        onClick={() => setEditing(t)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t.name} sil`}
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`${t.name} şablonu silinsin mi?`)) remove.mutate(t.id);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </div>
                  <p className="text-sm break-words text-muted-foreground">{t.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <TemplateDialog open={creating} onOpenChange={setCreating} />
      <TemplateDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        template={editing ?? undefined}
      />
    </div>
  );
}

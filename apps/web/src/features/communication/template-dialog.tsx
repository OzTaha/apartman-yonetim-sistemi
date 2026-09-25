import {
  campaignKindLabels,
  messageTemplateSchema,
  type CampaignKind,
  type MessageTemplateDto,
  type MessageTemplateInput,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { Field } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import { SmsCounter, VariableButtons } from './parts';

type FormOutput = z.output<typeof messageTemplateSchema>;

export function TemplateDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: MessageTemplateDto;
}) {
  const form = useForm<MessageTemplateInput, unknown, FormOutput>({
    resolver: zodResolver(messageTemplateSchema),
    values: {
      name: template?.name ?? '',
      kind: template?.kind ?? 'INFO',
      body: template?.body ?? '',
    },
  });
  const errors = form.formState.errors;
  const body = useWatch({ control: form.control, name: 'body' });

  const mutation = useApiMutation(
    (v: FormOutput) =>
      template
        ? apiFetch<MessageTemplateDto>(`/message-templates/${template.id}`, {
            method: 'PATCH',
            body: v,
          })
        : apiFetch<MessageTemplateDto>('/message-templates', { method: 'POST', body: v }),
    {
      success: template ? 'Şablon güncellendi' : 'Şablon eklendi',
      onSuccess: () => {
        if (!template) form.reset();
        onOpenChange(false);
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{template ? 'Şablonu düzenle' : 'Şablon ekle'}</DialogTitle>
          <DialogDescription>
            Süslü parantez içindeki alanlar her alıcı için doldurulur.
          </DialogDescription>
        </DialogHeader>
        <form
          id="template-form"
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Şablon adı" htmlFor="tpl-name" required error={errors.name?.message}>
              <Input id="tpl-name" {...form.register('name')} />
            </Field>
            <Field label="Tür" htmlFor="tpl-kind" required>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="tpl-kind" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(campaignKindLabels) as CampaignKind[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {campaignKindLabels[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
          <Field label="Mesaj" htmlFor="tpl-body" required error={errors.body?.message}>
            <Textarea id="tpl-body" rows={4} {...form.register('body')} />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <VariableButtons
              onInsert={(v) => form.setValue('body', `${body}${v}`, { shouldDirty: true })}
            />
            <SmsCounter text={body} channel="SMS" />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="template-form" disabled={mutation.isPending}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

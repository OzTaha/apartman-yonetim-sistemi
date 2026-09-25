import {
  dateSchema,
  describeRecurrence,
  optionalText,
  recurrenceFrequencyLabels,
  recurrenceFrequencySchema,
  taskPrioritySchema,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  type RecurrenceFrequency,
  type RecurringTaskDto,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
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
import { apiFetch } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { useApiMutation } from '@/lib/queries';
import { EmployeeSelect, PrioritySelect } from './task-dialogs';

const formSchema = z
  .object({
    title: z.string().trim().min(2, 'En az 2 karakter olmalıdır').max(120),
    description: optionalText(2000),
    employeeId: z.string(),
    priority: taskPrioritySchema,
    frequency: recurrenceFrequencySchema,
    weekdays: z.array(z.number()),
    dayOfMonth: z.string(),
    startDate: dateSchema,
    endDate: z.string(),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.frequency === 'WEEKLY' && v.weekdays.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'En az bir gün seçin', path: ['weekdays'] });
    }
    if (v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({
        code: 'custom',
        message: 'Bitiş başlangıçtan önce olamaz',
        path: ['endDate'],
      });
    }
  });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

const DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1));

export function RecurringTaskDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: RecurringTaskDto;
}) {
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    values: {
      title: template?.title ?? '',
      description: template?.description ?? '',
      employeeId: template?.employeeId ?? '',
      priority: template?.priority ?? 'NORMAL',
      frequency: template?.frequency ?? 'WEEKLY',
      weekdays: template?.weekdays ?? [],
      dayOfMonth: String(template?.dayOfMonth ?? 1),
      startDate: template?.startDate ?? todayIso(),
      endDate: template?.endDate ?? '',
      isActive: template?.isActive ?? true,
    },
  });
  const errors = form.formState.errors;
  const [frequency, weekdays, dayOfMonth] = useWatch({
    control: form.control,
    name: ['frequency', 'weekdays', 'dayOfMonth'],
  });

  const mutation = useApiMutation(
    (v: FormOutput) => {
      const body = {
        ...v,
        employeeId: v.employeeId || null,
        dayOfMonth: v.frequency === 'MONTHLY' ? Number(v.dayOfMonth) : null,
        weekdays: v.frequency === 'WEEKLY' ? v.weekdays : [],
        endDate: v.endDate || null,
      };
      return template
        ? apiFetch<RecurringTaskDto>(`/recurring-tasks/${template.id}`, {
            method: 'PATCH',
            body,
          })
        : apiFetch<RecurringTaskDto>('/recurring-tasks', { method: 'POST', body });
    },
    {
      success: (t) =>
        template
          ? 'Tekrarlayan görev güncellendi'
          : t.taskCount > 0
            ? 'Tekrarlayan görev eklendi, bugünün görevi oluşturuldu'
            : 'Tekrarlayan görev eklendi',
      onSuccess: () => {
        if (!template) form.reset();
        onOpenChange(false);
      },
    },
  );

  const preview =
    frequency === 'WEEKLY' && weekdays.length === 0
      ? null
      : describeRecurrence({ frequency, weekdays, dayOfMonth: Number(dayOfMonth) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {template ? 'Tekrarlayan görevi düzenle' : 'Tekrarlayan görev ekle'}
          </DialogTitle>
          <DialogDescription>
            Seçilen günlerde görev her sabah kendiliğinden oluşur ve o günün son tarihini alır.
          </DialogDescription>
        </DialogHeader>
        <form
          id="recurring-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <Field
            label="Görev"
            htmlFor="rec-title"
            required
            error={errors.title?.message}
            className="sm:col-span-2"
          >
            <Input id="rec-title" placeholder="Merdiven temizliği" {...form.register('title')} />
          </Field>
          <Field label="Çalışan" htmlFor="rec-employee">
            <Controller
              control={form.control}
              name="employeeId"
              render={({ field }) => (
                <EmployeeSelect
                  id="rec-employee"
                  value={field.value}
                  onChange={field.onChange}
                  keepId={template?.employeeId}
                />
              )}
            />
          </Field>
          <Field label="Öncelik" htmlFor="rec-priority">
            <Controller
              control={form.control}
              name="priority"
              render={({ field }) => (
                <PrioritySelect id="rec-priority" value={field.value} onChange={field.onChange} />
              )}
            />
          </Field>
          <Field label="Tekrar" htmlFor="rec-frequency" required>
            <Controller
              control={form.control}
              name="frequency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="rec-frequency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(recurrenceFrequencyLabels) as RecurrenceFrequency[]).map((f) => (
                      <SelectItem key={f} value={f}>
                        {recurrenceFrequencyLabels[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          {frequency === 'MONTHLY' && (
            <Field label="Ayın günü" htmlFor="rec-day" required>
              <Controller
                control={form.control}
                name="dayOfMonth"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="rec-day" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}
          {frequency === 'WEEKLY' && (
            <Controller
              control={form.control}
              name="weekdays"
              render={({ field }) => (
                <fieldset className="grid gap-2 sm:col-span-2">
                  <legend className="mb-2 text-sm font-medium">Günler</legend>
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAY_SHORT.map((label, i) => {
                      const day = i + 1;
                      const on = field.value.includes(day);
                      return (
                        <Button
                          key={label}
                          type="button"
                          size="sm"
                          variant={on ? 'default' : 'outline'}
                          className="px-0"
                          aria-pressed={on}
                          aria-label={WEEKDAY_NAMES[i]}
                          onClick={() =>
                            field.onChange(
                              on
                                ? field.value.filter((d) => d !== day)
                                : [...field.value, day].sort((a, b) => a - b),
                            )
                          }
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                  {errors.weekdays && (
                    <p className="text-sm text-destructive">{errors.weekdays.message}</p>
                  )}
                </fieldset>
              )}
            />
          )}
          <Field label="Başlangıç" htmlFor="rec-start" required error={errors.startDate?.message}>
            <Input id="rec-start" type="date" {...form.register('startDate')} />
          </Field>
          <Field
            label="Bitiş"
            htmlFor="rec-end"
            error={errors.endDate?.message}
            hint="Boş bırakılırsa süresiz devam eder."
          >
            <Input id="rec-end" type="date" {...form.register('endDate')} />
          </Field>
          <Field
            label="Açıklama"
            htmlFor="rec-desc"
            error={errors.description?.message}
            className="sm:col-span-2"
          >
            <Textarea id="rec-desc" rows={2} {...form.register('description')} />
          </Field>
          {template && (
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Checkbox
                    id="rec-active"
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                  <Label htmlFor="rec-active" className="font-normal">
                    Etkin (kapatılırsa yeni görev oluşmaz)
                  </Label>
                </div>
              )}
            />
          )}
          {preview && (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Özet: <span className="font-medium text-foreground">{preview}</span>
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="recurring-form" disabled={mutation.isPending}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

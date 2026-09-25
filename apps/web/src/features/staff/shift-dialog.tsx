import {
  dateSchema,
  formatDuration,
  isOvernight,
  optionalText,
  shiftMinutes,
  TIME_PATTERN,
  type ShiftDto,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
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
import { apiFetch } from '@/lib/api';
import { useApiMutation, useEmployees } from '@/lib/queries';
import { employeeName } from './staff';

const time = z.string().regex(TIME_PATTERN, 'Saat seçin');
const formSchema = z
  .object({
    employeeId: z.string().min(1, 'Çalışan seçin'),
    date: dateSchema,
    startTime: time,
    endTime: time,
    note: optionalText(200),
  })
  .refine((v) => v.startTime !== v.endTime, {
    message: 'Başlangıç ve bitiş aynı olamaz',
    path: ['endTime'],
  });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export interface ShiftDefaults {
  employeeId?: string;
  date: string;
}

export function ShiftDialog({
  open,
  onOpenChange,
  shift,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift?: ShiftDto;
  defaults?: ShiftDefaults;
}) {
  const employees = useEmployees();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    values: {
      employeeId: shift?.employeeId ?? defaults?.employeeId ?? '',
      date: shift?.date ?? defaults?.date ?? '',
      startTime: shift?.startTime ?? '08:00',
      endTime: shift?.endTime ?? '17:00',
      note: shift?.note ?? '',
    },
  });
  const errors = form.formState.errors;
  const [start, end] = useWatch({ control: form.control, name: ['startTime', 'endTime'] });
  const valid = TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && start !== end;

  const save = useApiMutation(
    (v: FormOutput) =>
      shift
        ? apiFetch<ShiftDto>(`/shifts/${shift.id}`, { method: 'PATCH', body: v })
        : apiFetch<ShiftDto>('/shifts', { method: 'POST', body: v }),
    {
      success: shift ? 'Vardiya güncellendi' : 'Vardiya eklendi',
      onSuccess: () => onOpenChange(false),
    },
  );
  const remove = useApiMutation(
    () => apiFetch<void>(`/shifts/${shift?.id}`, { method: 'DELETE' }),
    { success: 'Vardiya silindi', onSuccess: () => onOpenChange(false) },
  );

  const options = (employees.data ?? []).filter((e) => e.isActive || e.id === shift?.employeeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{shift ? 'Vardiyayı düzenle' : 'Vardiya ekle'}</DialogTitle>
          <DialogDescription>
            Bitiş saati başlangıçtan küçükse vardiya ertesi güne taşar (ör. 20:00 – 08:00).
          </DialogDescription>
        </DialogHeader>
        <form
          id="shift-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
        >
          <Field
            label="Çalışan"
            htmlFor="shift-employee"
            required
            error={errors.employeeId?.message}
            className="sm:col-span-2"
          >
            <Controller
              control={form.control}
              name="employeeId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="shift-employee" className="w-full">
                    <SelectValue placeholder="Çalışan seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {employeeName(e)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field
            label="Tarih"
            htmlFor="shift-date"
            required
            error={errors.date?.message}
            className="sm:col-span-2"
          >
            <Input id="shift-date" type="date" {...form.register('date')} />
          </Field>
          <Field label="Başlangıç" htmlFor="shift-start" required error={errors.startTime?.message}>
            <Input id="shift-start" type="time" step={900} {...form.register('startTime')} />
          </Field>
          <Field
            label="Bitiş"
            htmlFor="shift-end"
            required
            error={errors.endTime?.message}
            hint={
              valid
                ? `${formatDuration(shiftMinutes(start, end))}${isOvernight(start, end) ? ' · ertesi gün biter' : ''}`
                : undefined
            }
          >
            <Input id="shift-end" type="time" step={900} {...form.register('endTime')} />
          </Field>
          <Field
            label="Not"
            htmlFor="shift-note"
            error={errors.note?.message}
            className="sm:col-span-2"
          >
            <Input id="shift-note" maxLength={200} {...form.register('note')} />
          </Field>
        </form>
        <DialogFooter className="gap-2 sm:justify-between">
          {shift ? (
            <Button
              variant="outline"
              className="text-destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined)}
            >
              <Trash2 />
              Sil
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="submit" form="shift-form" disabled={save.isPending}>
              Kaydet
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

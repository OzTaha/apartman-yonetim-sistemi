import {
  optionalText,
  taskPriorityLabels,
  taskPrioritySchema,
  taskStatusLabels,
  type TaskDetailDto,
  type TaskDto,
  type TaskPriority,
  type TaskStatus,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { useApiMutation, useEmployees } from '@/lib/queries';
import { employeeName } from './staff';

const NONE = 'none';

export function EmployeeSelect({
  id,
  value,
  onChange,
  keepId,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  keepId?: string | null;
}) {
  const employees = useEmployees();
  const options = (employees.data ?? []).filter((e) => e.isActive || e.id === keepId);
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Atanmadı</SelectItem>
        {options.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {employeeName(e)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PrioritySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TaskPriority)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(taskPriorityLabels) as TaskPriority[]).map((p) => (
          <SelectItem key={p} value={p}>
            {taskPriorityLabels[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const taskFormSchema = z.object({
  title: z.string().trim().min(2, 'En az 2 karakter olmalıdır').max(120),
  description: optionalText(2000),
  employeeId: z.string(),
  dueDate: z.string(),
  priority: taskPrioritySchema,
});
type TaskFormInput = z.input<typeof taskFormSchema>;
type TaskFormOutput = z.output<typeof taskFormSchema>;

export function TaskDialog({
  open,
  onOpenChange,
  task,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskDto;
  employeeId?: string;
}) {
  const form = useForm<TaskFormInput, unknown, TaskFormOutput>({
    resolver: zodResolver(taskFormSchema),
    values: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      employeeId: task?.employeeId ?? employeeId ?? '',
      dueDate: task?.dueDate ?? '',
      priority: task?.priority ?? 'NORMAL',
    },
  });
  const errors = form.formState.errors;

  const mutation = useApiMutation(
    (v: TaskFormOutput) => {
      const body = { ...v, employeeId: v.employeeId || null, dueDate: v.dueDate || null };
      return task
        ? apiFetch<TaskDetailDto>(`/tasks/${task.id}`, { method: 'PATCH', body })
        : apiFetch<TaskDetailDto>('/tasks', { method: 'POST', body });
    },
    {
      success: task ? 'Görev güncellendi' : 'Görev eklendi',
      onSuccess: () => {
        if (!task) form.reset();
        onOpenChange(false);
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? 'Görevi düzenle' : 'Görev ekle'}</DialogTitle>
          <DialogDescription>
            Örneğin çatı oluğunun temizlenmesi veya bozuk lambanın değiştirilmesi.
          </DialogDescription>
        </DialogHeader>
        <form
          id="task-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <Field
            label="Görev"
            htmlFor="task-title"
            required
            error={errors.title?.message}
            className="sm:col-span-2"
          >
            <Input id="task-title" {...form.register('title')} />
          </Field>
          <Field label="Çalışan" htmlFor="task-employee">
            <Controller
              control={form.control}
              name="employeeId"
              render={({ field }) => (
                <EmployeeSelect
                  id="task-employee"
                  value={field.value}
                  onChange={field.onChange}
                  keepId={task?.employeeId}
                />
              )}
            />
          </Field>
          <Field label="Son tarih" htmlFor="task-due">
            <Input id="task-due" type="date" {...form.register('dueDate')} />
          </Field>
          <Field label="Öncelik" htmlFor="task-priority">
            <Controller
              control={form.control}
              name="priority"
              render={({ field }) => (
                <PrioritySelect id="task-priority" value={field.value} onChange={field.onChange} />
              )}
            />
          </Field>
          <Field
            label="Açıklama"
            htmlFor="task-desc"
            error={errors.description?.message}
            className="sm:col-span-2"
          >
            <Textarea id="task-desc" rows={3} {...form.register('description')} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="task-form" disabled={mutation.isPending}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const statusTitles: Record<TaskStatus, string> = {
  TODO: 'Görevi yeniden aç',
  IN_PROGRESS: 'Görevi başlat',
  DONE: 'Görevi tamamla',
  CANCELLED: 'Görevi iptal et',
};

export function TaskStatusDialog({
  task,
  status,
  onOpenChange,
}: {
  task: TaskDto;
  status: TaskStatus | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useApiMutation(
    (next: TaskStatus) =>
      apiFetch<TaskDetailDto>(`/tasks/${task.id}/status`, {
        method: 'POST',
        body: { status: next, note: note.trim() || undefined },
      }),
    {
      success: (t) => `Görev: ${taskStatusLabels[t.status]}`,
      onSuccess: () => {
        setNote('');
        onOpenChange(false);
      },
    },
  );
  if (!status) return null;
  const cancelling = status === 'CANCELLED';

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{statusTitles[status]}</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>
        <form
          id="task-status-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (cancelling && note.trim().length < 3) {
              setError('İptal nedenini yazın');
              return;
            }
            mutation.mutate(status);
          }}
        >
          <Field
            label={cancelling ? 'İptal nedeni' : 'Not'}
            htmlFor="task-status-note"
            required={cancelling}
            error={error ?? undefined}
            hint={cancelling ? undefined : 'İsteğe bağlı; görev geçmişine yazılır.'}
          >
            <Textarea
              id="task-status-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            form="task-status-form"
            variant={cancelling ? 'destructive' : 'default'}
            disabled={mutation.isPending}
          >
            {statusTitles[status]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import {
  employeeCreateSchema,
  employeeRoleLabels,
  type EmployeeDetailDto,
  type EmployeeDto,
  type EmployeeRole,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
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
import { useApiMutation } from '@/lib/queries';

const formSchema = employeeCreateSchema.extend({ startDate: z.string() });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export function EmployeeDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: EmployeeDto;
}) {
  const navigate = useNavigate();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    values: {
      firstName: employee?.firstName ?? '',
      lastName: employee?.lastName ?? '',
      role: employee?.role ?? 'CLEANING',
      phone: employee?.phone ?? '',
      startDate: employee?.startDate ?? '',
      notes: employee?.notes ?? '',
    },
  });
  const errors = form.formState.errors;

  const mutation = useApiMutation(
    (v: FormOutput) => {
      const body = { ...v, startDate: v.startDate || null };
      return employee
        ? apiFetch<EmployeeDetailDto>(`/employees/${employee.id}`, {
            method: 'PATCH',
            body: { ...body, isActive: employee.isActive },
          })
        : apiFetch<EmployeeDetailDto>('/employees', { method: 'POST', body });
    },
    {
      success: employee ? 'Çalışan güncellendi' : 'Çalışan eklendi',
      onSuccess: (saved) => {
        onOpenChange(false);
        if (!employee) {
          form.reset();
          void navigate({ to: '/calisanlar/$employeeId', params: { employeeId: saved.id } });
        }
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee ? 'Çalışanı düzenle' : 'Çalışan ekle'}</DialogTitle>
          <DialogDescription>
            Kapıcı, güvenlik, temizlik görevlisi veya bahçıvan gibi apartmanda çalışan kişiler.
          </DialogDescription>
        </DialogHeader>
        <form
          id="employee-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <Field label="Ad" htmlFor="emp-first" required error={errors.firstName?.message}>
            <Input id="emp-first" autoComplete="off" {...form.register('firstName')} />
          </Field>
          <Field label="Soyad" htmlFor="emp-last" required error={errors.lastName?.message}>
            <Input id="emp-last" autoComplete="off" {...form.register('lastName')} />
          </Field>
          <Field label="Görevi" htmlFor="emp-role" required>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="emp-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(employeeRoleLabels) as EmployeeRole[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {employeeRoleLabels[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Telefon" htmlFor="emp-phone" error={errors.phone?.message}>
            <Input id="emp-phone" inputMode="tel" {...form.register('phone')} />
          </Field>
          <Field label="İşe başlama" htmlFor="emp-start" error={errors.startDate?.message}>
            <Input id="emp-start" type="date" {...form.register('startDate')} />
          </Field>
          <Field
            label="Not"
            htmlFor="emp-notes"
            error={errors.notes?.message}
            className="sm:col-span-2"
          >
            <Textarea id="emp-notes" rows={2} {...form.register('notes')} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="employee-form" disabled={mutation.isPending}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

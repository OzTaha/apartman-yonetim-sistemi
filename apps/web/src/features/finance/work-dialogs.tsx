import {
  kurusToInput,
  optionalText,
  parseTlToKurus,
  vendorCreateSchema,
  workStatusLabels,
  workStatusSchema,
  type VendorDto,
  type VendorInput,
  type WorkDetailDto,
  type WorkDto,
  type WorkStatus,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
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
import { useApiMutation, useVendors } from '@/lib/queries';

const NONE = 'none';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const toKurus = (value: string) => {
  try {
    return parseTlToKurus(value);
  } catch {
    return null;
  }
};

const workFormSchema = z
  .object({
    title: z.string().trim().min(2, 'En az 2 karakter olmalıdır').max(120),
    description: optionalText(2000),
    vendorId: z.string(),
    status: workStatusSchema,
    startDate: z.string(),
    endDate: z.string(),
    agreed: z.string().transform((value, ctx) => {
      if (!value.trim()) return null;
      const kurus = toKurus(value);
      if (kurus !== null && kurus > 0) return kurus;
      ctx.addIssue({ code: 'custom', message: 'Geçerli bir tutar girin (ör. 30.000)' });
      return z.NEVER;
    }),
    visibleToResidents: z.boolean(),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    message: 'Bitiş tarihi başlangıçtan önce olamaz',
    path: ['endDate'],
  });
type WorkFormInput = z.input<typeof workFormSchema>;
type WorkFormOutput = z.output<typeof workFormSchema>;

export function WorkDialog({ open, onOpenChange, work }: DialogProps & { work?: WorkDto }) {
  const vendors = useVendors();
  const navigate = useNavigate();
  const form = useForm<WorkFormInput, unknown, WorkFormOutput>({
    resolver: zodResolver(workFormSchema),
    values: {
      title: work?.title ?? '',
      description: work?.description ?? '',
      vendorId: work?.vendorId ?? '',
      status: work?.status ?? 'PLANNED',
      startDate: work?.startDate ?? '',
      endDate: work?.endDate ?? '',
      agreed: work?.agreedKurus ? kurusToInput(work.agreedKurus) : '',
      visibleToResidents: work?.visibleToResidents ?? true,
    },
  });
  const errors = form.formState.errors;

  const mutation = useApiMutation(
    (v: WorkFormOutput) => {
      const body = {
        title: v.title,
        description: v.description,
        vendorId: v.vendorId || null,
        status: v.status,
        startDate: v.startDate || null,
        endDate: v.endDate || null,
        agreedKurus: v.agreed,
        visibleToResidents: v.visibleToResidents,
      };
      return work
        ? apiFetch<WorkDetailDto>(`/works/${work.id}`, { method: 'PATCH', body })
        : apiFetch<WorkDetailDto>('/works', { method: 'POST', body });
    },
    {
      success: work ? 'İş güncellendi' : 'İş eklendi',
      onSuccess: (saved) => {
        onOpenChange(false);
        if (!work) void navigate({ to: '/isler/$workId', params: { workId: saved.id } });
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{work ? 'İşi düzenle' : 'Yapılan iş ekle'}</DialogTitle>
          <DialogDescription>
            Örneğin dış cephe boyası, çatı onarımı veya asansör revizyonu. Ödemeleri ve faturaları
            işin sayfasından eklersiniz.
          </DialogDescription>
        </DialogHeader>
        <form
          id="work-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <Field
            label="İşin adı"
            htmlFor="work-title"
            required
            error={errors.title?.message}
            className="sm:col-span-2"
          >
            <Input id="work-title" placeholder="Dış cephe boyası" {...form.register('title')} />
          </Field>
          <Field label="Firma" htmlFor="work-vendor">
            <Controller
              control={form.control}
              name="vendorId"
              render={({ field }) => (
                <Select
                  value={field.value || NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? '' : v)}
                >
                  <SelectTrigger id="work-vendor" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Firma seçilmedi</SelectItem>
                    {(vendors.data ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Durum" htmlFor="work-status" required>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="work-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(workStatusLabels) as WorkStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {workStatusLabels[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Başlangıç" htmlFor="work-start">
            <Input id="work-start" type="date" {...form.register('startDate')} />
          </Field>
          <Field label="Bitiş" htmlFor="work-end" error={errors.endDate?.message}>
            <Input id="work-end" type="date" {...form.register('endDate')} />
          </Field>
          <Field
            label="Anlaşılan tutar (TL)"
            htmlFor="work-agreed"
            error={errors.agreed?.message}
            hint="Girilirse kalan ödeme hesaplanır."
          >
            <Input id="work-agreed" inputMode="decimal" {...form.register('agreed')} />
          </Field>
          <Field
            label="Açıklama"
            htmlFor="work-desc"
            error={errors.description?.message}
            className="sm:col-span-2"
          >
            <Textarea id="work-desc" rows={3} {...form.register('description')} />
          </Field>
          <Controller
            control={form.control}
            name="visibleToResidents"
            render={({ field }) => (
              <div className="flex items-start gap-2 sm:col-span-2">
                <Checkbox
                  id="work-visible"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
                <Label htmlFor="work-visible" className="grid gap-0.5 font-normal">
                  <span className="font-medium">Sakinler görebilir</span>
                  <span className="text-xs text-muted-foreground">
                    İş, firma, tutarlar ve eklenen belgeler sakinlerin "Giderler ve işler"
                    sayfasında görünür.
                  </span>
                </Label>
              </div>
            )}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="work-form" disabled={mutation.isPending}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VendorDialog({ open, onOpenChange, vendor }: DialogProps & { vendor?: VendorDto }) {
  const form = useForm<VendorInput, unknown, z.output<typeof vendorCreateSchema>>({
    resolver: zodResolver(vendorCreateSchema),
    values: {
      name: vendor?.name ?? '',
      phone: vendor?.phone ?? '',
      taxNumber: vendor?.taxNumber ?? '',
      notes: vendor?.notes ?? '',
    },
  });
  const errors = form.formState.errors;
  const mutation = useApiMutation(
    (v: z.output<typeof vendorCreateSchema>) =>
      vendor
        ? apiFetch<VendorDto>(`/vendors/${vendor.id}`, {
            method: 'PATCH',
            body: { ...v, isActive: vendor.isActive },
          })
        : apiFetch<VendorDto>('/vendors', { method: 'POST', body: v }),
    {
      success: vendor ? 'Firma güncellendi' : 'Firma eklendi',
      onSuccess: () => {
        form.reset();
        onOpenChange(false);
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vendor ? `${vendor.name} düzenle` : 'Firma ekle'}</DialogTitle>
          <DialogDescription>İş yaptırılan veya fatura kesen firma ya da kişi.</DialogDescription>
        </DialogHeader>
        <form
          id="vendor-form"
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <Field label="Firma adı" htmlFor="vendor-name" required error={errors.name?.message}>
            <Input id="vendor-name" {...form.register('name')} />
          </Field>
          <Field label="Telefon" htmlFor="vendor-phone" error={errors.phone?.message}>
            <Input id="vendor-phone" inputMode="tel" {...form.register('phone')} />
          </Field>
          <Field
            label="Vergi / T.C. kimlik no"
            htmlFor="vendor-tax"
            error={errors.taxNumber?.message}
          >
            <Input id="vendor-tax" inputMode="numeric" {...form.register('taxNumber')} />
          </Field>
          <Field label="Not" htmlFor="vendor-notes" error={errors.notes?.message}>
            <Textarea id="vendor-notes" rows={2} {...form.register('notes')} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="vendor-form" disabled={mutation.isPending}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

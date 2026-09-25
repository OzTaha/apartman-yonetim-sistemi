import {
  siteCreateSchema,
  siteManagerAssignSchema,
  type SiteCreateInput,
  type SiteDto,
  type SiteManagerAssignInput,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
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
import { apiFetch } from '@/lib/api';
import { useApiMutation } from '@/lib/queries';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SiteOutput = z.output<typeof siteCreateSchema>;

export function SiteFormDialog({ open, onOpenChange, site }: DialogProps & { site?: SiteDto }) {
  const form = useForm<SiteCreateInput, unknown, SiteOutput>({
    resolver: zodResolver(siteCreateSchema),
    values: {
      name: site?.name ?? '',
      kind: site?.kind ?? 'APARTMENT',
      address: site?.address ?? '',
      city: site?.city ?? '',
      proportionalDues: site?.proportionalDues ?? false,
    },
  });
  const mutation = useApiMutation(
    (values: SiteOutput) =>
      site
        ? apiFetch<SiteDto>(`/sites/${site.id}`, { method: 'PATCH', body: values })
        : apiFetch<SiteDto>('/sites', { method: 'POST', body: values }),
    {
      success: site ? 'Site güncellendi' : 'Site oluşturuldu',
      onSuccess: () => {
        form.reset();
        onOpenChange(false);
      },
    },
  );
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{site ? `${site.name} düzenle` : 'Apartman veya site ekle'}</DialogTitle>
          <DialogDescription>Site veya apartmanın temel bilgileri.</DialogDescription>
        </DialogHeader>
        <form
          id="site-form"
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <Field label="Tür" htmlFor="site-kind" error={errors.kind?.message} required>
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="site-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APARTMENT">Apartman (tek bina)</SelectItem>
                    <SelectItem value="SITE">Site (birden çok blok)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Ad" htmlFor="site-name" error={errors.name?.message} required>
            <Input id="site-name" {...form.register('name')} />
          </Field>
          <Field label="Adres" htmlFor="site-address" error={errors.address?.message}>
            <Input id="site-address" {...form.register('address')} />
          </Field>
          <Field label="Şehir" htmlFor="site-city" error={errors.city?.message}>
            <Input id="site-city" {...form.register('city')} />
          </Field>
          <Controller
            control={form.control}
            name="proportionalDues"
            render={({ field }) => (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="site-proportional"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
                <Label htmlFor="site-proportional" className="grid gap-0.5 font-normal">
                  <span className="font-medium">Oranlı aidat dağıtımı (m² ve arsa payı)</span>
                  <span className="text-xs text-muted-foreground">
                    Kapalıyken aidat her daireye eşit yazılır; daire formunda m² ve arsa payı
                    alanları görünmez.
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
          <Button type="submit" form="site-form" disabled={mutation.isPending}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ManagerOutput = z.output<typeof siteManagerAssignSchema>;

export function ManagerAssignDialog({ open, onOpenChange, site }: DialogProps & { site: SiteDto }) {
  const form = useForm<SiteManagerAssignInput, unknown, ManagerOutput>({
    resolver: zodResolver(siteManagerAssignSchema),
    defaultValues: { firstName: '', lastName: '', email: '', phone: '', password: '' },
  });
  const mutation = useApiMutation(
    (values: ManagerOutput) =>
      apiFetch<SiteDto>(`/sites/${site.id}/managers`, { method: 'POST', body: values }),
    {
      success: 'Yönetici atandı',
      onSuccess: () => {
        form.reset();
        onOpenChange(false);
      },
    },
  );
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yönetici ata · {site.name}</DialogTitle>
          <DialogDescription>
            Bu e-posta veya telefonla kayıtlı bir kullanıcı varsa yönetici yapılır. Yoksa yeni hesap
            oluşturulur; bu durumda ilk şifre zorunludur ve kişiye sizin iletmeniz gerekir.
          </DialogDescription>
        </DialogHeader>
        <form
          id="manager-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <Field label="Ad" htmlFor="mgr-first" error={errors.firstName?.message} required>
            <Input id="mgr-first" {...form.register('firstName')} />
          </Field>
          <Field label="Soyad" htmlFor="mgr-last" error={errors.lastName?.message} required>
            <Input id="mgr-last" {...form.register('lastName')} />
          </Field>
          <Field label="E-posta" htmlFor="mgr-email" error={errors.email?.message}>
            <Input id="mgr-email" type="email" {...form.register('email')} />
          </Field>
          <Field label="Telefon" htmlFor="mgr-phone" error={errors.phone?.message}>
            <Input
              id="mgr-phone"
              type="tel"
              placeholder="0532 123 45 67"
              {...form.register('phone')}
            />
          </Field>
          <Field
            label="İlk şifre"
            htmlFor="mgr-password"
            error={errors.password?.message}
            hint="Yalnızca yeni hesap oluşturulacaksa gerekir (en az 8 karakter)"
            className="sm:col-span-2"
          >
            <Input
              id="mgr-password"
              type="password"
              autoComplete="new-password"
              {...form.register('password')}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="manager-form" disabled={mutation.isPending}>
            Yönetici ata
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import {
  moveOutSchema,
  occupancyCreateSchema,
  type InvitationDto,
  type MoveOutInput,
  type OccupancyDto,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, Link2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { formatDate, formatPhone, fullName, todayIso } from '@/lib/format';
import { useApiMutation, useUnits } from '@/lib/queries';
import { labelUnit } from '@/lib/unit-label';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type OccupancyForm = z.input<typeof occupancyCreateSchema>;
type OccupancyOutput = z.output<typeof occupancyCreateSchema>;

export function OccupancyFormDialog({
  open,
  onOpenChange,
  occupancy,
  unitId,
}: DialogProps & { occupancy?: OccupancyDto; unitId?: string }) {
  const fixedUnitId = occupancy?.unitId ?? unitId;
  const units = useUnits({});
  const form = useForm<OccupancyForm, unknown, OccupancyOutput>({
    resolver: zodResolver(occupancyCreateSchema),
    values: {
      unitId: fixedUnitId ?? '',
      firstName: occupancy?.firstName ?? '',
      lastName: occupancy?.lastName ?? '',
      phone: occupancy?.phone ? formatPhone(occupancy.phone) : '',
      email: occupancy?.email ?? '',
      type: occupancy?.type ?? 'OWNER',
      startDate: occupancy?.startDate ?? todayIso(),
      isResponsibleForDues: occupancy?.isResponsibleForDues ?? true,
      contactConsent: occupancy?.contactConsent ?? false,
      notes: occupancy?.notes ?? '',
    },
    resetOptions: { keepDirtyValues: true },
  });

  const mutation = useApiMutation(
    ({ unitId: selectedUnit, ...rest }: OccupancyOutput) => {
      const body = {
        ...rest,
        phone: rest.phone ?? '',
        email: rest.email ?? '',
        notes: rest.notes ?? '',
      };
      return occupancy
        ? apiFetch<OccupancyDto>(`/residents/${occupancy.id}`, { method: 'PATCH', body })
        : apiFetch<OccupancyDto>('/residents', {
            method: 'POST',
            body: { ...rest, unitId: selectedUnit },
          });
    },
    {
      success: occupancy ? 'Sakin bilgileri güncellendi' : 'Sakin eklendi',
      onSuccess: () => {
        form.reset();
        onOpenChange(false);
      },
    },
  );

  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{occupancy ? 'Sakin bilgilerini düzenle' : 'Sakin ekle'}</DialogTitle>
          <DialogDescription>
            Telefon numarası; giriş, davet ve ileride SMS/WhatsApp bildirimleri için kullanılır.
          </DialogDescription>
        </DialogHeader>
        <form
          id="occupancy-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          {!fixedUnitId && (
            <Field
              label="Daire"
              htmlFor="occ-unit"
              error={errors.unitId?.message}
              required
              className="sm:col-span-2"
            >
              <Controller
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="occ-unit" className="w-full">
                      <SelectValue placeholder="Daire seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {(units.data ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {labelUnit(u.blockName, u.number)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}
          <Field label="Ad" htmlFor="occ-first" error={errors.firstName?.message} required>
            <Input id="occ-first" autoComplete="off" {...form.register('firstName')} />
          </Field>
          <Field label="Soyad" htmlFor="occ-last" error={errors.lastName?.message} required>
            <Input id="occ-last" autoComplete="off" {...form.register('lastName')} />
          </Field>
          <Field label="Telefon" htmlFor="occ-phone" error={errors.phone?.message}>
            <Input
              id="occ-phone"
              type="tel"
              inputMode="tel"
              placeholder="0532 123 45 67"
              {...form.register('phone')}
            />
          </Field>
          <Field label="E-posta" htmlFor="occ-email" error={errors.email?.message}>
            <Input id="occ-email" type="email" inputMode="email" {...form.register('email')} />
          </Field>
          <Field label="Tip" htmlFor="occ-type" error={errors.type?.message} required>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="occ-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OWNER">Malik</SelectItem>
                    <SelectItem value="TENANT">Kiracı</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field
            label="Başlangıç tarihi"
            htmlFor="occ-start"
            error={errors.startDate?.message}
            required
          >
            <Input id="occ-start" type="date" {...form.register('startDate')} />
          </Field>

          <div className="grid gap-3 sm:col-span-2">
            <Controller
              control={form.control}
              name="isResponsibleForDues"
              render={({ field }) => (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="occ-dues"
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                  <Label htmlFor="occ-dues" className="grid gap-0.5 font-normal">
                    <span className="font-medium">Aidattan sorumlu</span>
                    <span className="text-xs text-muted-foreground">
                      Kiracı varsa genellikle kiracı sorumludur.
                    </span>
                  </Label>
                </div>
              )}
            />
            <Controller
              control={form.control}
              name="contactConsent"
              render={({ field }) => (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="occ-consent"
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                  <Label htmlFor="occ-consent" className="grid gap-0.5 font-normal">
                    <span className="font-medium">SMS / WhatsApp ile bilgilendirme izni var</span>
                    <span className="text-xs text-muted-foreground">
                      KVKK gereği izni olmayan sakinlere toplu mesaj gönderilmez. Onay tarihi
                      kaydedilir.
                    </span>
                  </Label>
                </div>
              )}
            />
          </div>

          <Field
            label="Notlar"
            htmlFor="occ-notes"
            error={errors.notes?.message}
            className="sm:col-span-2"
          >
            <Textarea id="occ-notes" rows={2} {...form.register('notes')} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="occupancy-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MoveOutDialog({
  open,
  onOpenChange,
  occupancy,
}: DialogProps & { occupancy: OccupancyDto }) {
  const form = useForm<MoveOutInput>({
    resolver: zodResolver(moveOutSchema),
    defaultValues: { endDate: todayIso() },
  });
  const mutation = useApiMutation(
    (values: MoveOutInput) =>
      apiFetch<OccupancyDto>(`/residents/${occupancy.id}/move-out`, {
        method: 'POST',
        body: values,
      }),
    { success: 'Taşınma kaydedildi', onSuccess: () => onOpenChange(false) },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Taşınma kaydı</DialogTitle>
          <DialogDescription>
            {fullName(occupancy)} ({labelUnit(occupancy.blockName, occupancy.unitNumber)}) için
            taşınma tarihini girin. Kayıt silinmez, daire geçmişinde görünmeye devam eder.
          </DialogDescription>
        </DialogHeader>
        <form id="move-out-form" noValidate onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <Field
            label="Taşınma tarihi"
            htmlFor="move-out-date"
            error={form.formState.errors.endDate?.message}
            required
          >
            <Input
              id="move-out-date"
              type="date"
              min={occupancy.startDate}
              {...form.register('endDate')}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            form="move-out-form"
            variant="destructive"
            disabled={mutation.isPending}
          >
            Taşındı olarak kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InvitationDialog({
  open,
  onOpenChange,
  occupancy,
}: DialogProps & { occupancy: OccupancyDto }) {
  const [invitation, setInvitation] = useState<InvitationDto | null>(null);
  const [copied, setCopied] = useState(false);
  const mutation = useApiMutation(
    () => apiFetch<InvitationDto>(`/residents/${occupancy.id}/invitations`, { method: 'POST' }),
    { onSuccess: setInvitation },
  );

  async function copy() {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.url);
      setCopied(true);
      toast.success('Bağlantı kopyalandı');
    } catch {
      toast.error('Kopyalanamadı. Bağlantıyı elle seçip kopyalayın.');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setInvitation(null);
          setCopied(false);
        }
        onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Davet bağlantısı</DialogTitle>
          <DialogDescription>
            {fullName(occupancy)} bu bağlantıyla şifresini belirleyip sisteme giriş yapabilir.
            Bağlantı tek kullanımlıktır ve 7 gün geçerlidir. Yeni bağlantı oluşturulursa eskisi
            geçersiz olur.
          </DialogDescription>
        </DialogHeader>

        {invitation ? (
          <div className="grid gap-3">
            <div className="flex gap-2">
              <Input
                readOnly
                value={invitation.url}
                aria-label="Davet bağlantısı"
                onFocus={(e) => e.target.select()}
              />
              <Button type="button" variant="outline" onClick={() => void copy()}>
                {copied ? <Check /> : <Copy />}
                Kopyala
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Son geçerlilik: {formatDate(invitation.expiresAt)}. Bağlantıyı sakine{' '}
              {occupancy.phone ? `${formatPhone(occupancy.phone)} numarasından` : 'e-posta ile'}{' '}
              iletebilirsiniz.
            </p>
          </div>
        ) : (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button onClick={() => mutation.mutate(undefined)} disabled={mutation.isPending}>
              <Link2 />
              {mutation.isPending ? 'Oluşturuluyor…' : 'Bağlantı oluştur'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

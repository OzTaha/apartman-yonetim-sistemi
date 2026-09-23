import {
  allocatePayment,
  AllocationError,
  dateSchema,
  formatKurus,
  kurusToInput,
  optionalText,
  paymentMethodLabels,
  paymentMethodSchema,
  tlAmountSchema,
  type ChargeDto,
  type PaymentDto,
  type PaymentMethod,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Field } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { formatDate, todayIso } from '@/lib/format';
import { useApiMutation, useUnitAccount, useUnits } from '@/lib/queries';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  amount: z.string(),
  method: paymentMethodSchema,
  paidAt: dateSchema,
  reference: optionalText(100),
  note: optionalText(300),
});
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId?: string;
}

export function PaymentDialog({ open, onOpenChange, unitId: fixedUnitId }: Props) {
  const [selectedUnit, setSelectedUnit] = useState<string | undefined>(fixedUnitId);
  const unitId = fixedUnitId ?? selectedUnit;
  const units = useUnits({});
  const account = useUnitAccount(open ? unitId : undefined);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const openCharges: ChargeDto[] = useMemo(
    () =>
      (account.data?.charges ?? [])
        .filter((c) => !c.cancelledAt && c.remainingKurus > 0)
        .sort(
          (a, b) => a.dueDate.localeCompare(b.dueDate) || a.issueDate.localeCompare(b.issueDate),
        ),
    [account.data],
  );
  const totalOpen = openCharges.reduce((sum, c) => sum + c.remainingKurus, 0);

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: '',
      method: 'BANK_TRANSFER',
      paidAt: todayIso(),
      reference: '',
      note: '',
    },
  });
  const amountText = useWatch({ control: form.control, name: 'amount' });

  const manualTotal = openCharges
    .filter((c) => picked.has(c.id))
    .reduce((sum, c) => sum + c.remainingKurus, 0);
  const parsed = tlAmountSchema.safeParse(amountText ?? '');
  const amountKurus = mode === 'manual' ? manualTotal : parsed.success ? parsed.data : null;

  const preview = useMemo(() => {
    if (mode !== 'auto' || amountKurus === null) return null;
    try {
      const allocations = allocatePayment(amountKurus, openCharges);
      return { allocations, error: null as string | null };
    } catch (e) {
      return {
        allocations: [],
        error: e instanceof AllocationError ? e.message : 'Geçersiz tutar',
      };
    }
  }, [mode, amountKurus, openCharges]);

  function reset() {
    form.reset({
      amount: '',
      method: 'BANK_TRANSFER',
      paidAt: todayIso(),
      reference: '',
      note: '',
    });
    setPicked(new Set());
    setMode('auto');
    if (!fixedUnitId) setSelectedUnit(undefined);
  }

  const mutation = useApiMutation(
    (values: FormOutput) =>
      apiFetch<PaymentDto>('/payments', {
        method: 'POST',
        body: {
          unitId,
          amountKurus,
          method: values.method,
          paidAt: values.paidAt,
          reference: values.reference,
          note: values.note,
          allocations:
            mode === 'manual'
              ? openCharges
                  .filter((c) => picked.has(c.id))
                  .map((c) => ({ chargeId: c.id, amountKurus: c.remainingKurus }))
              : undefined,
        },
      }),
    {
      success: (p) => `${formatKurus(p.amountKurus)} ödeme kaydedildi`,
      onSuccess: () => {
        reset();
        onOpenChange(false);
      },
    },
  );

  const canSubmit =
    Boolean(unitId) &&
    amountKurus !== null &&
    amountKurus > 0 &&
    (mode === 'manual' || !preview?.error);
  const labelOf = (id: string) => openCharges.find((c) => c.id === id)?.label ?? '';

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ödeme al</DialogTitle>
          <DialogDescription>
            Elden veya havale ile alınan ödemeyi kaydedin. Borçtan fazla ödeme kabul edilmez.
          </DialogDescription>
        </DialogHeader>

        <form
          id="payment-form"
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((values) => {
            if (canSubmit) mutation.mutate(values);
          })}
        >
          {!fixedUnitId && (
            <Field label="Daire" htmlFor="pay-unit" required>
              <Select
                value={selectedUnit ?? ''}
                onValueChange={(v) => {
                  setSelectedUnit(v);
                  setPicked(new Set());
                }}
              >
                <SelectTrigger id="pay-unit" className="w-full">
                  <SelectValue placeholder="Daire seçin" />
                </SelectTrigger>
                <SelectContent>
                  {(units.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.blockName} Blok · Daire {u.number}
                      {u.occupants[0]
                        ? ` · ${u.occupants[0].firstName} ${u.occupants[0].lastName}`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {unitId && (
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Açık borç</span>
              <span className="font-semibold">
                {account.isPending ? '…' : formatKurus(totalOpen)}
              </span>
            </div>
          )}

          {unitId && totalOpen > 0 && (
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Dağıtım şekli">
              {(['auto', 'manual'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    mode === m ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted',
                  )}
                >
                  {m === 'auto' ? 'En eski borçtan başla' : 'Ödenen ayları seç'}
                </button>
              ))}
            </div>
          )}

          {mode === 'manual' && (
            <fieldset className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-2">
              <legend className="sr-only">Ödenen borçlar</legend>
              {openCharges.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50"
                >
                  <Checkbox
                    id={`pick-${c.id}`}
                    checked={picked.has(c.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(picked);
                      if (checked === true) next.add(c.id);
                      else next.delete(c.id);
                      setPicked(next);
                    }}
                  />
                  <Label
                    htmlFor={`pick-${c.id}`}
                    className="flex flex-1 justify-between gap-2 font-normal"
                  >
                    <span>
                      {c.label}
                      {c.overdue && <span className="ml-1 text-xs text-red-600">(gecikmiş)</span>}
                    </span>
                    <span className="tabular-nums">{formatKurus(c.remainingKurus)}</span>
                  </Label>
                </div>
              ))}
            </fieldset>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Tutar (TL)"
              htmlFor="pay-amount"
              required
              error={
                mode === 'auto' && amountText && !parsed.success
                  ? parsed.error.issues[0]?.message
                  : undefined
              }
            >
              {mode === 'manual' ? (
                <Input id="pay-amount" readOnly value={kurusToInput(manualTotal)} />
              ) : (
                <div className="flex gap-2">
                  <Input
                    id="pay-amount"
                    inputMode="decimal"
                    placeholder="1.500,00"
                    {...form.register('amount')}
                  />
                  {totalOpen > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => form.setValue('amount', kurusToInput(totalOpen))}
                    >
                      Tümü
                    </Button>
                  )}
                </div>
              )}
            </Field>
            <Field
              label="Ödeme tarihi"
              htmlFor="pay-date"
              required
              error={form.formState.errors.paidAt?.message}
            >
              <Input id="pay-date" type="date" max={todayIso()} {...form.register('paidAt')} />
            </Field>
            <Field label="Yöntem" htmlFor="pay-method" required>
              <Controller
                control={form.control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="pay-method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['BANK_TRANSFER', 'CASH'] as PaymentMethod[]).map((m) => (
                        <SelectItem key={m} value={m}>
                          {paymentMethodLabels[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Referans / dekont no" htmlFor="pay-ref">
              <Input id="pay-ref" {...form.register('reference')} />
            </Field>
          </div>
          <Field label="Not" htmlFor="pay-note">
            <Input id="pay-note" {...form.register('note')} />
          </Field>

          {preview?.error && (
            <Alert variant="destructive">
              <AlertDescription>{preview.error}</AlertDescription>
            </Alert>
          )}
          {preview && !preview.error && preview.allocations.length > 0 && (
            <div className="rounded-md border p-3 text-sm">
              <p className="mb-1 font-medium">Bu ödeme şu borçları kapatır:</p>
              <ul className="grid gap-0.5 text-muted-foreground">
                {preview.allocations.map((a) => {
                  const charge = openCharges.find((c) => c.id === a.chargeId);
                  const full = charge && a.amountKurus === charge.remainingKurus;
                  return (
                    <li key={a.chargeId} className="flex justify-between gap-2">
                      <span>
                        {labelOf(a.chargeId)} {full ? '' : '(kısmi)'}
                        {charge ? (
                          <span className="text-xs"> · vade {formatDate(charge.dueDate)}</span>
                        ) : null}
                      </span>
                      <span className="tabular-nums">{formatKurus(a.amountKurus)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="payment-form" disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending
              ? 'Kaydediliyor…'
              : amountKurus
                ? `${formatKurus(amountKurus)} kaydet`
                : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

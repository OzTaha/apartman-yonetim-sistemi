import {
  computeUnitAmounts,
  dateSchema,
  distributionMethodLabels,
  distributionMethodSchema,
  DistributionError,
  formatKurus,
  kurusToInput,
  optionalText,
  tlAmountSchema,
  type ChargeCreateResultDto,
  type ChargeDto,
  type DistributionMethod,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Field } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { todayIso } from '@/lib/format';
import { useApiMutation, useChargeTypes, useUnits } from '@/lib/queries';
import { labelUnit } from '@/lib/unit-label';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const createSchema = z
  .object({
    chargeTypeId: z.uuid('Borç türü seçin'),
    scope: z.enum(['ALL', 'SELECTED']),
    unitId: z.string().optional(),
    amountMode: z.enum(['PER_UNIT', 'DISTRIBUTE']),
    method: distributionMethodSchema,
    amount: tlAmountSchema,
    period: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}$/, 'Ay seçin')]).optional(),
    issueDate: dateSchema,
    dueDate: dateSchema,
    description: optionalText(200),
  })
  .refine((v) => v.scope === 'ALL' || Boolean(v.unitId), {
    message: 'Daire seçin',
    path: ['unitId'],
  })
  .refine((v) => v.dueDate >= v.issueDate, {
    message: 'Son ödeme tarihi borç tarihinden önce olamaz',
    path: ['dueDate'],
  });
type CreateInput = z.input<typeof createSchema>;
type CreateOutput = z.output<typeof createSchema>;

export function ChargeCreateDialog({
  open,
  onOpenChange,
  unitId,
}: DialogProps & { unitId?: string }) {
  const types = useChargeTypes();
  const units = useUnits({});
  const activeTypes = (types.data ?? []).filter((t) => t.isActive);
  const defaultType = activeTypes.find((t) => t.code === 'FIXTURE') ?? activeTypes[0];

  const defaults: CreateInput = {
    chargeTypeId: defaultType?.id ?? '',
    scope: unitId ? 'SELECTED' : 'ALL',
    unitId: unitId ?? '',
    amountMode: 'PER_UNIT',
    method: 'EQUAL',
    amount: '',
    period: '',
    issueDate: todayIso(),
    dueDate: todayIso(),
    description: '',
  };
  const form = useForm<CreateInput, unknown, CreateOutput>({
    resolver: zodResolver(createSchema),
    values: defaults,
    resetOptions: { keepDirtyValues: true },
  });
  const w = useWatch({ control: form.control });
  const parsedAmount = tlAmountSchema.safeParse(w.amount ?? '');

  const distribution = useMemo(() => {
    if (w.scope !== 'ALL' || w.amountMode !== 'DISTRIBUTE' || !parsedAmount.success || !units.data)
      return null;
    const list = units.data.map((u) => ({
      id: u.id,
      label: labelUnit(u.blockName, u.number, 'short'),
      areaM2: u.areaM2,
      landShare: u.landShare,
    }));
    try {
      const amounts = computeUnitAmounts(
        { method: w.method as DistributionMethod, amountKurus: parsedAmount.data },
        list,
      );
      return {
        rows: list.map((u, i) => ({ label: u.label, amount: amounts[i]! })),
        error: null as string | null,
      };
    } catch (e) {
      return { rows: [], error: e instanceof DistributionError ? e.message : 'Dağıtım yapılamadı' };
    }
  }, [w.scope, w.amountMode, w.method, parsedAmount.success, parsedAmount.data, units.data]);

  const mutation = useApiMutation(
    (v: CreateOutput) =>
      apiFetch<ChargeCreateResultDto>('/charges', {
        method: 'POST',
        body: {
          chargeTypeId: v.chargeTypeId,
          scope: v.scope,
          unitIds: v.scope === 'SELECTED' && v.unitId ? [v.unitId] : [],
          amountMode: v.scope === 'SELECTED' ? 'PER_UNIT' : v.amountMode,
          method: v.method,
          amountKurus: v.amount,
          period: v.period || undefined,
          issueDate: v.issueDate,
          dueDate: v.dueDate,
          description: v.description,
        },
      }),
    {
      success: (r) => `${r.created} daireye toplam ${formatKurus(r.totalKurus)} borç yazıldı`,
      onSuccess: () => {
        form.reset(defaults);
        onOpenChange(false);
      },
    },
  );

  const errors = form.formState.errors;
  const perUnitLabel =
    w.scope === 'ALL' && w.amountMode === 'DISTRIBUTE'
      ? 'Toplam tutar (TL)'
      : 'Daire başı tutar (TL)';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Borç ekle</DialogTitle>
          <DialogDescription>
            Demirbaş, yakıt, devreden borç gibi aidat dışındaki borçları yazın. Aylık aidat otomatik
            oluşturulur.
          </DialogDescription>
        </DialogHeader>
        <form
          id="charge-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <Field label="Borç türü" htmlFor="ch-type" required error={errors.chargeTypeId?.message}>
            <Controller
              control={form.control}
              name="chargeTypeId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ch-type" className="w-full">
                    <SelectValue placeholder="Seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {!unitId && (
            <Field label="Kime" htmlFor="ch-scope" required>
              <Controller
                control={form.control}
                name="scope"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ch-scope" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tüm daireler</SelectItem>
                      <SelectItem value="SELECTED">Tek daire</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}

          {!unitId && w.scope === 'SELECTED' && (
            <Field
              label="Daire"
              htmlFor="ch-unit"
              required
              error={errors.unitId?.message}
              className="sm:col-span-2"
            >
              <Controller
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="ch-unit" className="w-full">
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

          {w.scope === 'ALL' && (
            <>
              <Field label="Tutar nasıl girilecek" htmlFor="ch-mode">
                <Controller
                  control={form.control}
                  name="amountMode"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="ch-mode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PER_UNIT">Her daireye aynı tutar</SelectItem>
                        <SelectItem value="DISTRIBUTE">Toplamı dairelere dağıt</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              {w.amountMode === 'DISTRIBUTE' && (
                <Field label="Dağıtım yöntemi" htmlFor="ch-method">
                  <Controller
                    control={form.control}
                    name="method"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="ch-method" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(distributionMethodLabels) as DistributionMethod[]).map(
                            (m) => (
                              <SelectItem key={m} value={m}>
                                {distributionMethodLabels[m]}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              )}
            </>
          )}

          <Field label={perUnitLabel} htmlFor="ch-amount" required error={errors.amount?.message}>
            <Input
              id="ch-amount"
              inputMode="decimal"
              placeholder="1.500,00"
              {...form.register('amount')}
            />
          </Field>
          <Field
            label="Dönem (isteğe bağlı)"
            htmlFor="ch-period"
            error={errors.period?.message}
            hint="Aidat tablosunda bu ayda görünür"
          >
            <Input id="ch-period" type="month" {...form.register('period')} />
          </Field>
          <Field label="Borç tarihi" htmlFor="ch-issue" required error={errors.issueDate?.message}>
            <Input id="ch-issue" type="date" {...form.register('issueDate')} />
          </Field>
          <Field label="Son ödeme tarihi" htmlFor="ch-due" required error={errors.dueDate?.message}>
            <Input id="ch-due" type="date" {...form.register('dueDate')} />
          </Field>
          <Field
            label="Açıklama"
            htmlFor="ch-desc"
            className="sm:col-span-2"
            error={errors.description?.message}
          >
            <Input
              id="ch-desc"
              placeholder="Örn. Asansör revizyonu"
              {...form.register('description')}
            />
          </Field>
        </form>

        {distribution?.error && (
          <Alert variant="destructive">
            <AlertDescription>{distribution.error}</AlertDescription>
          </Alert>
        )}
        {distribution && !distribution.error && distribution.rows.length > 0 && (
          <div className="rounded-md border p-3 text-sm">
            <p className="mb-1 font-medium">
              Dağıtım önizlemesi ({distribution.rows.length} daire)
            </p>
            <ul className="grid max-h-40 grid-cols-2 gap-x-4 gap-y-0.5 overflow-y-auto text-muted-foreground">
              {distribution.rows.map((r) => (
                <li key={r.label} className="flex justify-between gap-2">
                  <span>{r.label}</span>
                  <span className="tabular-nums">{formatKurus(r.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            form="charge-form"
            disabled={mutation.isPending || Boolean(distribution?.error)}
          >
            {mutation.isPending ? 'Kaydediliyor…' : 'Borcu yaz'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const editSchema = z.object({
  amount: tlAmountSchema,
  dueDate: dateSchema,
  description: optionalText(200),
});
type EditInput = z.input<typeof editSchema>;
type EditOutput = z.output<typeof editSchema>;

export function ChargeEditDialog({
  open,
  onOpenChange,
  charge,
}: DialogProps & { charge: ChargeDto }) {
  const form = useForm<EditInput, unknown, EditOutput>({
    resolver: zodResolver(editSchema),
    values: {
      amount: kurusToInput(charge.amountKurus),
      dueDate: charge.dueDate,
      description: charge.description ?? '',
    },
  });
  const mutation = useApiMutation(
    (v: EditOutput) =>
      apiFetch<ChargeDto>(`/charges/${charge.id}`, {
        method: 'PATCH',
        body: { amountKurus: v.amount, dueDate: v.dueDate, description: v.description ?? '' },
      }),
    { success: 'Borç güncellendi', onSuccess: () => onOpenChange(false) },
  );
  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Borcu düzelt</DialogTitle>
          <DialogDescription>
            {labelUnit(charge.blockName, charge.unitNumber)} · {charge.label}
            {charge.paidKurus > 0
              ? `. Bu borca ${formatKurus(charge.paidKurus)} ödeme yapılmış; tutar bundan az olamaz.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <form
          id="charge-edit-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        >
          <Field label="Tutar (TL)" htmlFor="ce-amount" required error={errors.amount?.message}>
            <Input id="ce-amount" inputMode="decimal" {...form.register('amount')} />
          </Field>
          <Field label="Son ödeme tarihi" htmlFor="ce-due" required error={errors.dueDate?.message}>
            <Input id="ce-due" type="date" min={charge.issueDate} {...form.register('dueDate')} />
          </Field>
          <Field
            label="Açıklama"
            htmlFor="ce-desc"
            className="sm:col-span-2"
            error={errors.description?.message}
          >
            <Input id="ce-desc" {...form.register('description')} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="charge-edit-form" disabled={mutation.isPending}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import {
  computeUnitAmounts,
  distributionMethodLabels,
  distributionMethodSchema,
  DistributionError,
  formatKurus,
  periodLabel,
  tlAmountSchema,
  type AccrualResultDto,
  type ChargeTypeDto,
  type DistributionMethod,
  type DuesPlanDto,
  type DuesSettingsDto,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import { CalendarPlus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Field } from '@/components/form-field';
import { ManagerOnly } from '@/components/manager-only';
import { LoadingRows, PageHeader } from '@/components/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  useApiMutation,
  useChargeTypes,
  useDuesPlans,
  useDuesSettings,
  useProportionalDues,
  useUnits,
} from '@/lib/queries';
import { MissingUnitDataAlert } from '@/features/dues/missing-unit-data';
import { labelUnit } from '@/lib/unit-label';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/aidat-ayarlari')({
  component: () => (
    <ManagerOnly>
      <DuesSettingsPage />
    </ManagerOnly>
  ),
});

const currentPeriod = () => todayIso().slice(0, 7);

const planSchema = z.object({
  method: distributionMethodSchema,
  amount: tlAmountSchema,
  validFrom: z.string().regex(/^\d{4}-\d{2}$/, 'Ay seçin'),
});
type PlanInput = z.input<typeof planSchema>;
type PlanOutput = z.output<typeof planSchema>;

function planAmountText(p: Pick<DuesPlanDto, 'method' | 'amountKurus'>) {
  return p.method === 'EQUAL'
    ? `Daire başı ${formatKurus(p.amountKurus)}`
    : `Toplam ${formatKurus(p.amountKurus)} · ${distributionMethodLabels[p.method].toLocaleLowerCase('tr')} dağıtılır`;
}

function PlanCard() {
  const plans = useDuesPlans();
  const proportional = useProportionalDues();
  const units = useUnits({});
  const form = useForm<PlanInput, unknown, PlanOutput>({
    resolver: zodResolver(planSchema),
    defaultValues: { method: 'EQUAL', amount: '', validFrom: currentPeriod() },
  });
  const w = useWatch({ control: form.control });
  const amount = tlAmountSchema.safeParse(w.amount ?? '');

  const preview = useMemo(() => {
    if (!amount.success || !units.data?.length) return null;
    const list = units.data.map((u) => ({
      id: u.id,
      label: labelUnit(u.blockName, u.number, 'short'),
      areaM2: u.areaM2,
      landShare: u.landShare,
    }));
    try {
      const amounts = computeUnitAmounts(
        { method: w.method as DistributionMethod, amountKurus: amount.data },
        list,
      );
      return {
        count: amounts.length,
        total: amounts.reduce((a, b) => a + b, 0),
        min: Math.min(...amounts),
        max: Math.max(...amounts),
        error: null as string | null,
      };
    } catch (e) {
      return {
        count: 0,
        total: 0,
        min: 0,
        max: 0,
        error: e instanceof DistributionError ? e.message : 'Hesaplanamadı',
      };
    }
  }, [amount.success, amount.data, units.data, w.method]);

  const create = useApiMutation(
    (v: PlanOutput) =>
      apiFetch<DuesPlanDto>('/dues/plans', {
        method: 'POST',
        body: { method: v.method, amountKurus: v.amount, validFrom: v.validFrom },
      }),
    {
      success: (p) => `Yeni aidat ${periodLabel(p.validFrom)} itibarıyla geçerli`,
      onSuccess: () => form.reset({ method: 'EQUAL', amount: '', validFrom: currentPeriod() }),
    },
  );

  const current = plans.data?.find((p) => p.isCurrent);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aylık aidat</CardTitle>
        <CardDescription>
          Aidat her ayın 1'inde tüm dairelere otomatik yazılır. Tutarı değiştirmek için yeni bir
          tanım ekleyin; eski aylar etkilenmez.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {plans.isPending ? (
          <LoadingRows rows={2} />
        ) : current ? (
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="text-muted-foreground">Şu an geçerli</p>
            <p className="text-base font-semibold">{planAmountText(current)}</p>
            <p className="text-xs text-muted-foreground">
              {periodLabel(current.validFrom)} itibarıyla
            </p>
          </div>
        ) : (
          <Alert>
            <AlertDescription>
              Henüz aidat tanımlanmamış. Aşağıdan ilk aidat tutarını girin.
            </AlertDescription>
          </Alert>
        )}

        <form
          className={cn('grid gap-4', proportional ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}
          noValidate
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
        >
          {proportional && (
            <Field label="Dağıtım" htmlFor="plan-method">
              <Controller
                control={form.control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="plan-method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EQUAL">Her daireye aynı tutar</SelectItem>
                      <SelectItem value="AREA">Toplamı m²’ye göre dağıt</SelectItem>
                      <SelectItem value="LAND_SHARE">Toplamı arsa payına göre dağıt</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}
          <Field
            label={w.method === 'EQUAL' ? 'Daire başı tutar (TL)' : 'Aylık toplam tutar (TL)'}
            htmlFor="plan-amount"
            required
            error={form.formState.errors.amount?.message}
          >
            <Input
              id="plan-amount"
              inputMode="decimal"
              placeholder="1.500,00"
              {...form.register('amount')}
            />
          </Field>
          <Field
            label="Geçerlilik başlangıcı"
            htmlFor="plan-from"
            required
            error={form.formState.errors.validFrom?.message}
          >
            <Input id="plan-from" type="month" {...form.register('validFrom')} />
          </Field>

          {preview?.error && (
            <Alert variant="destructive" className="sm:col-span-full">
              <AlertDescription>{preview.error}</AlertDescription>
            </Alert>
          )}
          {preview && !preview.error && (
            <p className="text-sm text-muted-foreground sm:col-span-full">
              {preview.count} daire için aylık toplam{' '}
              <strong className="text-foreground">{formatKurus(preview.total)}</strong>
              {preview.min !== preview.max
                ? ` · daire başı ${formatKurus(preview.min)} ile ${formatKurus(preview.max)} arası`
                : ` · daire başı ${formatKurus(preview.min)}`}
            </p>
          )}
          <div className="sm:col-span-full">
            <Button type="submit" disabled={create.isPending || Boolean(preview?.error)}>
              <Plus />
              Aidatı kaydet
            </Button>
          </div>
        </form>

        {(plans.data?.length ?? 0) > 0 && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Geçmiş tanımlar</p>
            <ul className="divide-y rounded-md border text-sm">
              {plans.data!.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span>{planAmountText(p)}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {periodLabel(p.validFrom)} itibarıyla
                    {p.isCurrent && <Badge>Geçerli</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DueDayCard() {
  const settings = useDuesSettings();
  const [value, setValue] = useState<string | null>(null);
  const dueDay = value ?? String(settings.data?.dueDay ?? '');
  const save = useApiMutation(
    (day: number) =>
      apiFetch<DuesSettingsDto>('/dues/settings', { method: 'PATCH', body: { dueDay: day } }),
    {
      success: (s) => `Son ödeme günü ayın ${s.dueDay}'i olarak kaydedildi`,
      onSuccess: () => setValue(null),
    },
  );
  const n = Number(dueDay);
  const valid = Number.isInteger(n) && n >= 1 && n <= 28;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Son ödeme günü</CardTitle>
        <CardDescription>
          Bu günden sonra ödenmeyen aidat “gecikmiş” görünür. Değişiklik sonraki aylara uygulanır.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate(n);
          }}
        >
          <Field
            label="Ayın kaçı"
            htmlFor="due-day"
            error={dueDay && !valid ? '1 ile 28 arasında olmalı' : undefined}
          >
            <Input
              id="due-day"
              className="w-24"
              inputMode="numeric"
              value={dueDay}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="outline"
            disabled={!valid || save.isPending || value === null}
          >
            Kaydet
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AccrueCard() {
  const [period, setPeriod] = useState(currentPeriod());
  const accrue = useApiMutation(
    (p: string) =>
      apiFetch<AccrualResultDto>('/dues/accrue', { method: 'POST', body: { period: p } }),
    {
      success: (r) =>
        r.created > 0
          ? `${periodLabel(r.period)}: ${r.created} daireye toplam ${formatKurus(r.totalKurus)} aidat yazıldı`
          : `${periodLabel(r.period)} aidatı zaten tüm dairelere yazılmış`,
    },
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aidatı şimdi oluştur</CardTitle>
        <CardDescription>
          Otomatik oluşturma beklenmeden bir ayın aidatını yazar. Aynı daireye aynı ay iki kez
          yazılmaz; sonradan eklenen daireleri borçlandırmak için de kullanılabilir.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <Field label="Ay" htmlFor="accrue-period">
            <Input
              id="accrue-period"
              type="month"
              max={currentPeriod()}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </Field>
          <Button onClick={() => accrue.mutate(period)} disabled={!period || accrue.isPending}>
            <CalendarPlus />
            Oluştur
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ChargeTypesCard() {
  const types = useChargeTypes();
  const [name, setName] = useState('');
  const create = useApiMutation(
    (value: string) =>
      apiFetch<ChargeTypeDto>('/charge-types', { method: 'POST', body: { name: value } }),
    { success: 'Borç türü eklendi', onSuccess: () => setName('') },
  );
  const toggle = useApiMutation(
    (t: ChargeTypeDto) =>
      apiFetch<ChargeTypeDto>(`/charge-types/${t.id}`, {
        method: 'PATCH',
        body: { isActive: !t.isActive },
      }),
    {
      success: (t) =>
        t.isActive ? `${t.name} yeniden kullanıma açıldı` : `${t.name} pasif yapıldı`,
    },
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Borç türleri</CardTitle>
        <CardDescription>
          Borç eklerken seçilen türler. Pasif türler yeni borçta görünmez, eski kayıtlar korunur.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="divide-y rounded-md border text-sm">
          {(types.data ?? []).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className={t.isActive ? '' : 'text-muted-foreground line-through'}>
                {t.name}
              </span>
              {t.code === 'DUES' ? (
                <Badge variant="secondary">Sistem</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggle.mutate(t)}
                  disabled={toggle.isPending}
                >
                  {t.isActive ? 'Pasif yap' : 'Aktif yap'}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) create.mutate(name.trim());
          }}
        >
          <Input
            aria-label="Yeni borç türü"
            placeholder="Örn. Bahçe düzenlemesi"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={name.trim().length < 2 || create.isPending}
          >
            <Plus />
            Ekle
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DuesSettingsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Aidat ayarları" />
      <MissingUnitDataAlert />
      <PlanCard />
      <div className="grid gap-6 lg:grid-cols-2">
        <DueDayCard />
        <AccrueCard />
      </div>
      <ChargeTypesCard />
    </div>
  );
}

import {
  DistributionError,
  distributionMethodLabels,
  formatKurus,
  splitTotal,
  type DistributionMethod,
  type TransactionDto,
} from '@apartman/shared';
import { useState } from 'react';
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
import { useApiMutation, useChargeTypes, useProportionalDues, useUnits } from '@/lib/queries';
import {
  reflectError,
  useReflectDefaults,
  useScopeLabel,
  type ReflectValue,
} from './reflect-value';

export function ReflectFields({
  idPrefix,
  value,
  onChange,
  amountKurus,
  blockId,
}: {
  idPrefix: string;
  value: ReflectValue;
  onChange: (value: ReflectValue) => void;
  amountKurus: number | null;
  blockId: string | null;
}) {
  const types = useChargeTypes();
  const units = useUnits({});
  const proportional = useProportionalDues();
  const activeTypes = (types.data ?? []).filter((t) => t.isActive);
  const inScope = (units.data ?? []).filter((u) => !blockId || u.blockId === blockId);

  let preview: { text: string; error: boolean } | null = null;
  if (amountKurus && inScope.length > 0) {
    try {
      const amounts = splitTotal(
        value.method,
        amountKurus,
        inScope.map((u) => ({ ...u, label: `${u.blockName}-${u.number}` })),
      );
      const min = Math.min(...amounts);
      const max = Math.max(...amounts);
      preview = {
        text: `${inScope.length} daireye ${min === max ? formatKurus(min) : `${formatKurus(min)} – ${formatKurus(max)}`} borç yazılır.`,
        error: false,
      };
    } catch (e) {
      preview = {
        text: e instanceof DistributionError ? e.message : 'Dağıtım yapılamadı',
        error: true,
      };
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Borç türü" htmlFor={`${idPrefix}-type`} required>
        <Select
          value={value.chargeTypeId}
          onValueChange={(chargeTypeId) => onChange({ ...value, chargeTypeId })}
        >
          <SelectTrigger id={`${idPrefix}-type`} className="w-full">
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
      </Field>
      <Field label="Dağıtım" htmlFor={`${idPrefix}-method`}>
        <Select
          value={value.method}
          onValueChange={(method) => onChange({ ...value, method: method as DistributionMethod })}
          disabled={!proportional}
        >
          <SelectTrigger id={`${idPrefix}-method`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(distributionMethodLabels) as DistributionMethod[]).map((m) => (
              <SelectItem key={m} value={m}>
                {distributionMethodLabels[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Borç tarihi" htmlFor={`${idPrefix}-issue`} required>
        <Input
          id={`${idPrefix}-issue`}
          type="date"
          value={value.issueDate}
          onChange={(e) => onChange({ ...value, issueDate: e.target.value })}
        />
      </Field>
      <Field label="Son ödeme tarihi" htmlFor={`${idPrefix}-due`} required>
        <Input
          id={`${idPrefix}-due`}
          type="date"
          value={value.dueDate}
          onChange={(e) => onChange({ ...value, dueDate: e.target.value })}
        />
      </Field>
      {preview && (
        <p
          className={
            preview.error
              ? 'text-sm text-destructive sm:col-span-2'
              : 'text-sm text-muted-foreground sm:col-span-2'
          }
        >
          {preview.text}
        </p>
      )}
    </div>
  );
}

export function ReflectDialog({
  transaction,
  open,
  onOpenChange,
}: {
  transaction: TransactionDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const defaults = useReflectDefaults();
  const scopeLabel = useScopeLabel();
  const [value, setValue] = useState<ReflectValue | null>(null);
  const current = value ?? defaults;
  const error = reflectError(current);

  const mutation = useApiMutation(
    (v: ReflectValue) =>
      apiFetch<TransactionDto>(`/transactions/${transaction.id}/reflect`, {
        method: 'POST',
        body: v,
      }),
    {
      success: (t) =>
        `${t.reflection?.chargeCount ?? 0} daireye toplam ${formatKurus(t.reflection?.totalKurus ?? 0)} borç yazıldı`,
      onSuccess: () => {
        setValue(null);
        onOpenChange(false);
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dairelere yansıt</DialogTitle>
          <DialogDescription>
            {formatKurus(transaction.amountKurus)} tutarındaki gider{' '}
            {scopeLabel(transaction.blockName)} arasında paylaştırılıp borç olarak yazılır.
          </DialogDescription>
        </DialogHeader>
        <ReflectFields
          idPrefix="rf"
          value={current}
          onChange={setValue}
          amountKurus={transaction.amountKurus}
          blockId={transaction.blockId}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            disabled={Boolean(error) || mutation.isPending}
            onClick={() => mutation.mutate(current)}
          >
            {mutation.isPending ? 'Yazılıyor…' : 'Borç yaz'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

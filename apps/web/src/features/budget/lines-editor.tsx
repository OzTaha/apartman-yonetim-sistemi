import {
  BUDGET_MAX_LINES,
  budgetAdvanceAmount,
  formatKurus,
  kurusToInput,
  parseTlToKurus,
  type BudgetDetailDto,
  type DistributionMethod,
} from '@apartman/shared';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { useApiMutation, useFinanceCategories } from '@/lib/queries';
import { advanceLabel } from './format';
import { MethodSelect } from './parts';

interface Row {
  key: number;
  categoryId: string;
  amount: string;
  note: string;
}

let nextKey = 0;
const newRow = (r: Partial<Row> = {}): Row => ({
  key: nextKey++,
  categoryId: '',
  amount: '',
  note: '',
  ...r,
});

function parseAmount(value: string): number | null {
  try {
    const kurus = parseTlToKurus(value);
    return kurus > 0 ? kurus : null;
  } catch {
    return null;
  }
}

export function LinesEditor({ budget }: { budget: BudgetDetailDto }) {
  const categories = useFinanceCategories();
  const [method, setMethod] = useState<DistributionMethod>(budget.method);
  const [rows, setRows] = useState<Row[]>(() =>
    budget.lines.length > 0
      ? budget.lines.map((l) =>
          newRow({
            categoryId: l.categoryId,
            amount: kurusToInput(l.amountKurus),
            note: l.note ?? '',
          }),
        )
      : [newRow()],
  );
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const expense = (categories.data ?? []).filter((c) => c.kind === 'EXPENSE');
  const options = (row: Row) =>
    expense.filter(
      (c) =>
        (c.isActive || c.id === row.categoryId) &&
        (c.id === row.categoryId || !rows.some((r) => r.categoryId === c.id)),
    );
  const total = rows.reduce((sum, r) => sum + (parseAmount(r.amount) ?? 0), 0);
  const advanceKurus = budgetAdvanceAmount(total, method, budget.units.length);

  const update = (key: number, patch: Partial<Row>) => {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setErrors((e) => ({ ...e, [key]: '' }));
    setDirty(true);
  };

  const save = useApiMutation(
    (lines: { categoryId: string; amountKurus: number; note?: string }[]) =>
      apiFetch<BudgetDetailDto>(`/budgets/${budget.id}`, {
        method: 'PUT',
        body: { method, lines },
      }),
    { success: 'Bütçe kaydedildi', onSuccess: () => setDirty(false) },
  );

  const submit = () => {
    const filled = rows.filter((r) => r.categoryId || r.amount.trim() || r.note.trim());
    const found: Record<number, string> = {};
    for (const r of filled) {
      if (!r.categoryId) found[r.key] = 'Gider kalemini seçin';
      else if (parseAmount(r.amount) === null) found[r.key] = 'Geçerli bir yıllık tutar girin';
    }
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    save.mutate(
      filled.map((r) => ({
        categoryId: r.categoryId,
        amountKurus: parseAmount(r.amount)!,
        note: r.note.trim() || undefined,
      })),
    );
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="budget-edit-method">Avans aidat dağıtımı</Label>
        <MethodSelect
          id="budget-edit-method"
          value={method}
          onChange={(m) => {
            setMethod(m);
            setDirty(true);
          }}
        />
      </div>
      <div className="grid gap-3">
        {rows.map((r, i) => (
          <div
            key={r.key}
            className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1.2fr)_9rem_minmax(0,1fr)_auto] sm:items-start sm:border-0 sm:p-0"
          >
            <Select value={r.categoryId} onValueChange={(v) => update(r.key, { categoryId: v })}>
              <SelectTrigger className="w-full" aria-label={`${i + 1}. kalem`}>
                <SelectValue placeholder="Gider kalemi seçin" />
              </SelectTrigger>
              <SelectContent>
                {options(r).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              inputMode="decimal"
              placeholder="Yıllık tutar"
              aria-label={`${i + 1}. kalemin yıllık tutarı`}
              value={r.amount}
              onChange={(e) => update(r.key, { amount: e.target.value })}
            />
            <Input
              placeholder="Açıklama (isteğe bağlı)"
              aria-label={`${i + 1}. kalemin açıklaması`}
              maxLength={200}
              value={r.note}
              onChange={(e) => update(r.key, { note: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${i + 1}. kalemi kaldır`}
              onClick={() => {
                setRows((list) =>
                  list.length > 1 ? list.filter((x) => x.key !== r.key) : [newRow()],
                );
                setDirty(true);
              }}
            >
              <Trash2 />
            </Button>
            {errors[r.key] && (
              <p className="text-sm text-destructive sm:col-span-4" role="alert">
                {errors[r.key]}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length >= BUDGET_MAX_LINES}
          onClick={() => setRows((list) => [...list, newRow()])}
        >
          <Plus />
          Kalem ekle
        </Button>
        <div className="text-right text-sm">
          <p>
            Yıllık toplam: <span className="font-semibold tabular-nums">{formatKurus(total)}</span>
          </p>
          <p className="text-muted-foreground">{advanceLabel({ method, advanceKurus })}</p>
        </div>
      </div>
      <Button className="w-fit" disabled={!dirty || save.isPending} onClick={submit}>
        <Save />
        Kaydet
      </Button>
    </div>
  );
}

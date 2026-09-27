import {
  addMonths,
  budgetEndPeriod,
  periodLabel,
  type BudgetDetailDto,
  type BudgetDto,
  type DistributionMethod,
} from '@apartman/shared';
import { useState } from 'react';
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
import { apiFetch } from '@/lib/api';
import { useApiMutation } from '@/lib/queries';
import { MethodSelect } from './parts';

function thisMonth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' })
    .format(new Date())
    .slice(0, 7);
}

export function CreateBudgetDialog({
  open,
  onOpenChange,
  budgets,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgets: BudgetDto[];
  onCreated: (budget: BudgetDetailDto) => void;
}) {
  const latest = budgets[0];
  const [startPeriod, setStartPeriod] = useState(() =>
    latest ? addMonths(latest.endPeriod, 1) : thisMonth(),
  );
  const [method, setMethod] = useState<DistributionMethod>(latest?.method ?? 'EQUAL');
  const [copy, setCopy] = useState(Boolean(latest));
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation(
    () =>
      apiFetch<BudgetDetailDto>('/budgets', {
        method: 'POST',
        body: { startPeriod, method, copyFromId: copy && latest ? latest.id : undefined },
      }),
    {
      success: 'Bütçe oluşturuldu',
      onSuccess: (b) => {
        onOpenChange(false);
        onCreated(b);
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bütçe oluştur</DialogTitle>
          <DialogDescription>
            Bütçe seçtiğiniz aydan başlayarak 12 ay sürer. Gider kalemlerini sonraki adımda
            girersiniz.
          </DialogDescription>
        </DialogHeader>
        <form
          id="budget-create-form"
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{4}-\d{2}$/.test(startPeriod)) {
              setError('Başlangıç ayını seçin');
              return;
            }
            mutation.mutate(undefined);
          }}
        >
          <Field
            label="Başlangıç ayı"
            htmlFor="budget-start"
            required
            error={error ?? undefined}
            hint={
              /^\d{4}-\d{2}$/.test(startPeriod)
                ? `${periodLabel(startPeriod)} – ${periodLabel(budgetEndPeriod(startPeriod))}`
                : undefined
            }
          >
            <Input
              id="budget-start"
              type="month"
              value={startPeriod}
              onChange={(e) => setStartPeriod(e.target.value)}
            />
          </Field>
          <Field label="Avans aidat dağıtımı" htmlFor="budget-method">
            <MethodSelect id="budget-method" value={method} onChange={setMethod} />
          </Field>
          {latest && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="budget-copy"
                checked={copy}
                onCheckedChange={(v) => setCopy(v === true)}
              />
              <Label htmlFor="budget-copy" className="leading-snug font-normal">
                {periodLabel(latest.startPeriod)} bütçesindeki {latest.lineCount} gider kalemini
                kopyala
              </Label>
            </div>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="budget-create-form" disabled={mutation.isPending}>
            Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import {
  dateSchema,
  DUES_INCOME_CODE,
  formatKurus,
  optionalText,
  tlAmountSchema,
  type TransactionDto,
  type TransactionType,
} from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { toast } from 'sonner';
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
import { employeeName } from '@/features/staff/staff';
import { apiFetch, errorMessage } from '@/lib/api';
import { todayIso } from '@/lib/format';
import {
  useCashAccounts,
  useEmployees,
  useFinanceCategories,
  useRefreshSiteData,
  useVendors,
  useWorks,
} from '@/lib/queries';
import { FilePicker } from './attachments';
import { uploadAll } from './files';

const NONE = 'none';

const titles: Record<TransactionType, string> = {
  INCOME: 'Gelir ekle',
  EXPENSE: 'Gider ekle',
  TRANSFER: 'Hesaplar arası transfer',
};

const descriptions: Record<TransactionType, string> = {
  INCOME:
    'Aidat dışındaki gelirler (kira, faiz vb.). Aidat ödemeleri Tahsilatlar ekranından alınır ve kasaya kendiliğinden yazılır.',
  EXPENSE: 'Fatura veya makbuzu ekleyerek sakinlerle şeffaf şekilde paylaşabilirsiniz.',
  TRANSFER: 'Örneğin kasadaki nakdin bankaya yatırılması.',
};

function schemaFor(type: TransactionType) {
  return z
    .object({
      accountId: z.string().min(1, 'Hesap seçin'),
      toAccountId: z.string(),
      categoryId: z.string(),
      vendorId: z.string(),
      workId: z.string(),
      employeeId: z.string(),
      amount: tlAmountSchema,
      date: dateSchema,
      description: optionalText(200),
      documentNo: optionalText(50),
      visibleToResidents: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (type === 'TRANSFER') {
        if (!v.toAccountId)
          ctx.addIssue({ code: 'custom', message: 'Hedef hesabı seçin', path: ['toAccountId'] });
        else if (v.toAccountId === v.accountId)
          ctx.addIssue({
            code: 'custom',
            message: 'Kaynak ve hedef aynı olamaz',
            path: ['toAccountId'],
          });
      } else if (!v.categoryId) {
        ctx.addIssue({ code: 'custom', message: 'Kategori seçin', path: ['categoryId'] });
      }
    });
}
type FormInput = z.input<ReturnType<typeof schemaFor>>;
type FormOutput = z.output<ReturnType<typeof schemaFor>>;

function OptionSelect({
  control,
  name,
  id,
  options,
  placeholder,
  noneLabel,
  disabled,
  onSelect,
}: {
  control: Control<FormInput, unknown, FormOutput>;
  name: 'accountId' | 'toAccountId' | 'categoryId' | 'vendorId' | 'workId' | 'employeeId';
  id: string;
  options: { value: string; label: string }[];
  placeholder: string;
  noneLabel?: string;
  disabled?: boolean;
  onSelect?: (value: string) => void;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select
          value={field.value || (noneLabel ? NONE : '')}
          onValueChange={(v) => {
            const value = v === NONE ? '' : v;
            field.onChange(value);
            onSelect?.(value);
          }}
          disabled={disabled}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}

export function TransactionDialog({
  open,
  onOpenChange,
  type,
  workId,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: TransactionType;
  workId?: string;
  employeeId?: string;
}) {
  const accounts = useCashAccounts();
  const categories = useFinanceCategories();
  const vendors = useVendors();
  const works = useWorks();
  const employees = useEmployees();
  const refresh = useRefreshSiteData();
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const activeAccounts = (accounts.data ?? []).filter((a) => a.isActive);
  const activeEmployees = (employees.data ?? []).filter((e) => e.isActive || e.id === employeeId);
  const defaults: FormInput = {
    accountId: activeAccounts.find((a) => a.kind === 'BANK')?.id ?? activeAccounts[0]?.id ?? '',
    toAccountId: '',
    categoryId: employeeId
      ? ((categories.data ?? []).find((c) => c.code === 'STAFF')?.id ?? '')
      : '',
    vendorId: '',
    workId: workId ?? '',
    employeeId: employeeId ?? '',
    amount: '',
    date: todayIso(),
    description: '',
    documentNo: '',
    visibleToResidents: !employeeId,
  };
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schemaFor(type)),
    values: defaults,
    resetOptions: { keepDirtyValues: true },
  });
  const errors = form.formState.errors;

  function close() {
    form.reset(defaults);
    setFiles([]);
    onOpenChange(false);
  }

  async function submit(v: FormOutput) {
    setSaving(true);
    try {
      const created = await apiFetch<TransactionDto>('/transactions', {
        method: 'POST',
        body: {
          type,
          accountId: v.accountId,
          toAccountId: type === 'TRANSFER' ? v.toAccountId : undefined,
          categoryId: type === 'TRANSFER' ? undefined : v.categoryId,
          vendorId: type === 'TRANSFER' ? undefined : v.vendorId || undefined,
          workId: type === 'EXPENSE' ? v.workId || undefined : undefined,
          employeeId: type === 'EXPENSE' ? v.employeeId || undefined : undefined,
          amountKurus: v.amount,
          date: v.date,
          description: v.description,
          documentNo: type === 'TRANSFER' ? undefined : v.documentNo,
          visibleToResidents: type === 'EXPENSE' ? v.visibleToResidents : false,
        },
      });
      if (files.length > 0) await uploadAll('transaction', created.id, files);
      await refresh();
      toast.success(
        `${titles[type].replace(' ekle', '')} kaydedildi · ${formatKurus(created.amountKurus)}`,
      );
      close();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const categoryOptions = (categories.data ?? [])
    .filter((c) => c.isActive && c.kind === type && c.code !== DUES_INCOME_CODE)
    .map((c) => ({ value: c.id, label: c.name }));
  const accountOptions = activeAccounts.map((a) => ({ value: a.id, label: a.name }));

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titles[type]}</DialogTitle>
          <DialogDescription>{descriptions[type]}</DialogDescription>
        </DialogHeader>
        <form
          id="transaction-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((v) => void submit(v))}
        >
          <Field label="Tutar (TL)" htmlFor="tx-amount" required error={errors.amount?.message}>
            <Input
              id="tx-amount"
              inputMode="decimal"
              placeholder="1.500,00"
              {...form.register('amount')}
            />
          </Field>
          <Field label="Tarih" htmlFor="tx-date" required error={errors.date?.message}>
            <Input id="tx-date" type="date" max={todayIso()} {...form.register('date')} />
          </Field>
          <Field
            label={
              type === 'TRANSFER'
                ? 'Çıkan hesap'
                : type === 'INCOME'
                  ? 'Giren hesap'
                  : 'Ödenen hesap'
            }
            htmlFor="tx-account"
            required
            error={errors.accountId?.message}
          >
            <OptionSelect
              control={form.control}
              name="accountId"
              id="tx-account"
              options={accountOptions}
              placeholder="Hesap seçin"
            />
          </Field>
          {type === 'TRANSFER' ? (
            <Field label="Giren hesap" htmlFor="tx-to" required error={errors.toAccountId?.message}>
              <OptionSelect
                control={form.control}
                name="toAccountId"
                id="tx-to"
                options={accountOptions}
                placeholder="Hesap seçin"
              />
            </Field>
          ) : (
            <Field
              label="Kategori"
              htmlFor="tx-category"
              required
              error={errors.categoryId?.message}
            >
              <OptionSelect
                control={form.control}
                name="categoryId"
                id="tx-category"
                options={categoryOptions}
                placeholder="Kategori seçin"
              />
            </Field>
          )}
          {type !== 'TRANSFER' && (
            <Field label={type === 'EXPENSE' ? 'Firma' : 'Ödeyen firma'} htmlFor="tx-vendor">
              <OptionSelect
                control={form.control}
                name="vendorId"
                id="tx-vendor"
                options={(vendors.data ?? [])
                  .filter((v) => v.isActive)
                  .map((v) => ({ value: v.id, label: v.name }))}
                placeholder="Firma seçin"
                noneLabel="Firma yok"
                onSelect={(value) => value && form.setValue('employeeId', '')}
              />
            </Field>
          )}
          {type === 'EXPENSE' && activeEmployees.length > 0 && (
            <Field
              label="Çalışan"
              htmlFor="tx-employee"
              hint="Maaş gibi çalışana yapılan ödemeler."
            >
              <OptionSelect
                control={form.control}
                name="employeeId"
                id="tx-employee"
                options={activeEmployees.map((e) => ({ value: e.id, label: employeeName(e) }))}
                placeholder="Çalışan seçin"
                noneLabel="Çalışana ödeme değil"
                disabled={Boolean(employeeId)}
                onSelect={(value) => {
                  if (!value) return;
                  form.setValue('vendorId', '');
                  form.setValue('visibleToResidents', false);
                }}
              />
            </Field>
          )}
          {type === 'EXPENSE' && (
            <Field label="Yapılan iş" htmlFor="tx-work" hint="Taksit ödemeleri işe bağlanır.">
              <OptionSelect
                control={form.control}
                name="workId"
                id="tx-work"
                options={(works.data ?? []).map((w) => ({ value: w.id, label: w.title }))}
                placeholder="İş seçin"
                noneLabel="İşe bağlı değil"
                disabled={Boolean(workId)}
              />
            </Field>
          )}
          {type !== 'TRANSFER' && (
            <Field label="Fatura / belge no" htmlFor="tx-doc" error={errors.documentNo?.message}>
              <Input id="tx-doc" {...form.register('documentNo')} />
            </Field>
          )}
          <Field
            label="Açıklama"
            htmlFor="tx-desc"
            error={errors.description?.message}
            className="sm:col-span-2"
          >
            <Textarea id="tx-desc" rows={2} {...form.register('description')} />
          </Field>
          {type !== 'TRANSFER' && (
            <div className="sm:col-span-2">
              <FilePicker files={files} onChange={setFiles} />
            </div>
          )}
          {type === 'EXPENSE' && (
            <Controller
              control={form.control}
              name="visibleToResidents"
              render={({ field }) => (
                <div className="flex items-start gap-2 sm:col-span-2">
                  <Checkbox
                    id="tx-visible"
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                  <Label htmlFor="tx-visible" className="grid gap-0.5 font-normal">
                    <span className="font-medium">Sakinler görebilir</span>
                    <span className="text-xs text-muted-foreground">
                      Kişisel bilgi içeren giderleri (ör. personel maaşı) gizleyebilirsiniz; tutar
                      toplamlara yine dahil olur.
                    </span>
                  </Label>
                </div>
              )}
            />
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Vazgeç
          </Button>
          <Button type="submit" form="transaction-form" disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

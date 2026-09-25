import {
  cashAccountKindLabels,
  DUES_INCOME_CODE,
  financeKindLabels,
  formatKurus,
  kurusToInput,
  parseTlToKurus,
  type CashAccountDto,
  type CashAccountKind,
  type FinanceCategoryDto,
  type FinanceKind,
} from '@apartman/shared';
import { createFileRoute } from '@tanstack/react-router';
import { Check, Pencil, Plus, Power, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
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
import { useApiMutation, useCashAccounts, useClosings, useFinanceCategories } from '@/lib/queries';

export const Route = createFileRoute('/_app/kasa-ayarlari')({
  component: () => (
    <ManagerOnly>
      <FinanceSettingsPage />
    </ManagerOnly>
  ),
});

function parseAmount(value: string): number | null {
  if (!value.trim()) return 0;
  try {
    return parseTlToKurus(value);
  } catch {
    return null;
  }
}

function AccountRow({
  account,
  openingLocked,
}: {
  account: CashAccountDto;
  openingLocked: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [opening, setOpening] = useState(kurusToInput(account.openingBalanceKurus));
  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      apiFetch<CashAccountDto>(`/cash-accounts/${account.id}`, { method: 'PATCH', body }),
    { success: 'Hesap güncellendi', onSuccess: () => setEditing(false) },
  );

  if (editing) {
    return (
      <li className="grid gap-2 px-3 py-2 sm:grid-cols-[1fr_10rem_auto]">
        <Input aria-label="Hesap adı" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          aria-label="Açılış bakiyesi"
          inputMode="decimal"
          value={opening}
          disabled={openingLocked}
          onChange={(e) => setOpening(e.target.value)}
        />
        <div className="flex gap-1">
          <Button
            size="icon"
            aria-label="Kaydet"
            disabled={save.isPending}
            onClick={() => {
              const amount = parseAmount(opening);
              if (amount === null) {
                toast.error('Geçerli bir açılış bakiyesi girin');
                return;
              }
              save.mutate({
                name,
                ...(openingLocked ? {} : { openingBalanceKurus: amount }),
              });
            }}
          >
            <Check />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Vazgeç"
            onClick={() => setEditing(false)}
          >
            <X />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="grid">
        <span className="font-medium">
          {account.name}
          {!account.isActive && (
            <Badge variant="outline" className="ml-2">
              Pasif
            </Badge>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {cashAccountKindLabels[account.kind]} · açılış {formatKurus(account.openingBalanceKurus)}{' '}
          · güncel {formatKurus(account.balanceKurus)}
        </span>
      </span>
      <span className="flex gap-1">
        <Button
          size="icon"
          variant="ghost"
          aria-label={`${account.name} düzenle`}
          onClick={() => {
            setName(account.name);
            setOpening(kurusToInput(account.openingBalanceKurus));
            setEditing(true);
          }}
        >
          <Pencil />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={account.isActive ? `${account.name} pasif yap` : `${account.name} aktif yap`}
          onClick={() => save.mutate({ isActive: !account.isActive })}
        >
          <Power />
        </Button>
      </span>
    </li>
  );
}

function AccountsCard() {
  const accounts = useCashAccounts();
  const closings = useClosings();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CashAccountKind>('BANK');
  const [opening, setOpening] = useState('');
  const openingLocked = Boolean(closings.data?.lockedThrough);
  const create = useApiMutation(
    (body: { name: string; kind: CashAccountKind; openingBalanceKurus: number }) =>
      apiFetch<CashAccountDto>('/cash-accounts', { method: 'POST', body }),
    {
      success: 'Hesap eklendi',
      onSuccess: () => {
        setName('');
        setOpening('');
      },
    },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kasa ve banka hesapları</CardTitle>
        <CardDescription>
          Açılış bakiyesi, sistemi kullanmaya başladığınız gündeki paradır.
          {openingLocked && ' Kapatılmış ay olduğu için açılış bakiyeleri değiştirilemez.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {accounts.isPending ? (
          <LoadingRows rows={2} />
        ) : accounts.isError ? (
          <ErrorState error={accounts.error} />
        ) : (
          <ul className="divide-y rounded-md border">
            {accounts.data.map((a) => (
              <AccountRow key={a.id} account={a} openingLocked={openingLocked} />
            ))}
          </ul>
        )}
        <form
          className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            const amount = parseAmount(opening);
            if (name.trim().length < 2) {
              toast.error('Hesap adı en az 2 karakter olmalıdır');
              return;
            }
            if (amount === null) {
              toast.error('Geçerli bir açılış bakiyesi girin');
              return;
            }
            create.mutate({ name: name.trim(), kind, openingBalanceKurus: amount });
          }}
        >
          <Input
            aria-label="Yeni hesap adı"
            placeholder="Ör. Ziraat Bankası"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select value={kind} onValueChange={(v) => setKind(v as CashAccountKind)}>
            <SelectTrigger aria-label="Hesap türü" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(cashAccountKindLabels) as CashAccountKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {cashAccountKindLabels[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label="Açılış bakiyesi"
            inputMode="decimal"
            placeholder="Açılış (TL)"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
          />
          <Button type="submit" disabled={create.isPending}>
            <Plus />
            Ekle
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CategoryRow({ category }: { category: FinanceCategoryDto }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const system = category.code === DUES_INCOME_CODE;
  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      apiFetch<FinanceCategoryDto>(`/finance-categories/${category.id}`, { method: 'PATCH', body }),
    { success: 'Kategori güncellendi', onSuccess: () => setEditing(false) },
  );
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
      {editing ? (
        <form
          className="flex flex-1 gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ name });
          }}
        >
          <Input aria-label="Kategori adı" value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="icon" type="submit" aria-label="Kaydet" disabled={save.isPending}>
            <Check />
          </Button>
          <Button
            size="icon"
            type="button"
            variant="outline"
            aria-label="Vazgeç"
            onClick={() => setEditing(false)}
          >
            <X />
          </Button>
        </form>
      ) : (
        <>
          <span className={category.isActive ? '' : 'text-muted-foreground line-through'}>
            {category.name}
          </span>
          <span className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={`${category.name} düzenle`}
              onClick={() => {
                setName(category.name);
                setEditing(true);
              }}
            >
              <Pencil />
            </Button>
            {!system && (
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={
                  category.isActive ? `${category.name} pasif yap` : `${category.name} aktif yap`
                }
                onClick={() => save.mutate({ isActive: !category.isActive })}
              >
                <Power />
              </Button>
            )}
          </span>
        </>
      )}
    </li>
  );
}

function CategoriesCard({ kind }: { kind: FinanceKind }) {
  const categories = useFinanceCategories();
  const [name, setName] = useState('');
  const create = useApiMutation(
    (value: string) =>
      apiFetch<FinanceCategoryDto>('/finance-categories', {
        method: 'POST',
        body: { kind, name: value },
      }),
    { success: 'Kategori eklendi', onSuccess: () => setName('') },
  );
  const items = (categories.data ?? []).filter((c) => c.kind === kind);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{financeKindLabels[kind]} kategorileri</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {categories.isPending ? (
          <LoadingRows rows={3} />
        ) : (
          <ul className="divide-y rounded-md border">
            {items.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) create.mutate(name.trim());
          }}
        >
          <Input
            aria-label={`Yeni ${financeKindLabels[kind].toLocaleLowerCase('tr')} kategorisi`}
            placeholder="Yeni kategori"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={create.isPending || name.trim().length < 2}
          >
            <Plus />
            Ekle
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FinanceSettingsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Kasa ayarları" />
      <AccountsCard />
      <div className="grid gap-6 lg:grid-cols-2">
        <CategoriesCard kind="EXPENSE" />
        <CategoriesCard kind="INCOME" />
      </div>
    </div>
  );
}

import {
  formatKurus,
  parseTrAmount,
  parseTrDate,
  type BankColumnMapping,
  type BankCommitResultDto,
  type BankMatchResultDto,
  type BankMatchRowDto,
  type BankParseResultDto,
} from '@apartman/shared';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, FileUp, HandCoins, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { PageHeader } from '@/components/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch, errorMessage, uploadFile } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useCashAccounts, useRefreshSiteData } from '@/lib/queries';

export const Route = createFileRoute('/_app/banka-hareketleri')({
  component: () => (
    <ManagerOnly>
      <BankImportPage />
    </ManagerOnly>
  ),
});

const NONE = 'none';

type Row = { date: string; description: string; amountKurus: number };

function mapRows(parsed: BankParseResultDto, mapping: BankColumnMapping) {
  const col = (name: string) => parsed.headers.indexOf(name);
  const [d, t, a] = [col(mapping.date), col(mapping.description), col(mapping.amount)];
  const rows: Row[] = [];
  let skipped = 0;
  for (const cells of parsed.rows) {
    const date = parseTrDate(cells[d] ?? '');
    const amount = parseTrAmount(cells[a] ?? '');
    if (!date || amount === null || amount <= 0) {
      skipped += 1;
      continue;
    }
    rows.push({ date, description: (cells[t] ?? '').slice(0, 500), amountKurus: amount });
  }
  return { rows, skipped };
}

function ColumnSelect({
  id,
  label,
  headers,
  value,
  onChange,
}: {
  id: string;
  label: string;
  headers: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Sütun seçin" />
        </SelectTrigger>
        <SelectContent>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BankImportPage() {
  const accounts = useCashAccounts();
  const refresh = useRefreshSiteData();
  const [parsed, setParsed] = useState<BankParseResultDto | null>(null);
  const [mapping, setMapping] = useState<Partial<BankColumnMapping>>({});
  const [match, setMatch] = useState<BankMatchResultDto | null>(null);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [accountId, setAccountId] = useState('');
  const [result, setResult] = useState<BankCommitResultDto | null>(null);
  const [busy, setBusy] = useState(false);

  const activeAccounts = (accounts.data ?? []).filter((a) => a.isActive);
  const account =
    accountId || (activeAccounts.find((a) => a.kind === 'BANK') ?? activeAccounts[0])?.id || '';
  const complete =
    mapping.date && mapping.description && mapping.amount ? (mapping as BankColumnMapping) : null;
  const mapped = useMemo(
    () => (parsed && complete ? mapRows(parsed, complete) : null),
    [parsed, complete],
  );
  const debtOf = new Map((match?.units ?? []).map((u) => [u.unitId, u.debtKurus]));
  const unitOf = (r: BankMatchRowDto) => choices[r.index] ?? r.unitId ?? '';
  const tooMuch = (r: BankMatchRowDto) => {
    const unit = unitOf(r);
    return Boolean(unit) && r.amountKurus > (debtOf.get(unit) ?? 0);
  };
  const selectable = (r: BankMatchRowDto) => r.status === 'NEW';

  function reset() {
    setParsed(null);
    setMapping({});
    setMatch(null);
    setChoices({});
    setSelected(new Set());
    setResult(null);
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      const res = await uploadFile<BankParseResultDto>('/bank-imports/parse', file);
      setParsed(res);
      setMapping(res.mapping ?? {});
      setMatch(null);
      setResult(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function runMatch() {
    if (!mapped || mapped.rows.length === 0) return;
    setBusy(true);
    try {
      const res = await apiFetch<BankMatchResultDto>('/bank-imports/match', {
        method: 'POST',
        body: { rows: mapped.rows },
      });
      const debts = new Map(res.units.map((u) => [u.unitId, u.debtKurus]));
      setMatch(res);
      setChoices({});
      setSelected(
        new Set(
          res.rows
            .filter(
              (r) =>
                r.status === 'NEW' &&
                r.confidence === 'HIGH' &&
                r.unitId &&
                r.amountKurus <= (debts.get(r.unitId) ?? 0),
            )
            .map((r) => String(r.index)),
        ),
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function commit(kind: 'payments' | 'ignore') {
    if (!match) return;
    const rows = match.rows.filter((r) => selected.has(String(r.index)) && selectable(r));
    if (kind === 'payments' && rows.some((r) => !unitOf(r))) {
      toast.error('Seçilen her hareket için daire seçin');
      return;
    }
    const item = (r: BankMatchRowDto) => ({
      date: r.date,
      description: r.description,
      amountKurus: r.amountKurus,
      occurrence: r.occurrence,
    });
    setBusy(true);
    try {
      const res = await apiFetch<BankCommitResultDto>('/bank-imports/commit', {
        method: 'POST',
        body: {
          accountId: account,
          mapping: complete ?? undefined,
          payments: kind === 'payments' ? rows.map((r) => ({ ...item(r), unitId: unitOf(r) })) : [],
          ignore: kind === 'ignore' ? rows.map(item) : [],
        },
      });
      setResult(res);
      if (res.imported > 0) {
        toast.success(`${res.imported} tahsilat kaydedildi · ${formatKurus(res.totalKurus)}`);
      }
      if (res.ignored > 0) toast.success(`${res.ignored} hareket yoksayıldı`);
      await refresh();
      await runMatch();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const statusBadge = (r: BankMatchRowDto) => {
    if (r.status === 'IMPORTED') return <Badge variant="secondary">Aktarıldı</Badge>;
    if (r.status === 'IGNORED') return <Badge variant="outline">Yoksayıldı</Badge>;
    if (tooMuch(r)) return <Badge variant="destructive">Borçtan fazla</Badge>;
    if (!unitOf(r)) return <Badge variant="outline">Daire seçin</Badge>;
    if (choices[r.index] || r.confidence === 'HIGH') return <Badge>Eşleşti</Badge>;
    return (
      <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
        Kontrol edin
      </Badge>
    );
  };

  const unitSelect = (r: BankMatchRowDto) => (
    <Select
      value={unitOf(r) || NONE}
      disabled={r.status !== 'NEW'}
      onValueChange={(v) => {
        setChoices((prev) => ({ ...prev, [r.index]: v === NONE ? '' : v }));
        if (v !== NONE) setSelected((prev) => new Set(prev).add(String(r.index)));
      }}
    >
      <SelectTrigger className="w-full min-w-44" aria-label={`${r.description} için daire`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Daire seçin</SelectItem>
        {(match?.units ?? []).map((u) => (
          <SelectItem key={u.unitId} value={u.unitId}>
            {u.label} · borç {formatKurus(u.debtKurus)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const columns: ColumnDef<BankMatchRowDto>[] = [
    {
      accessorKey: 'date',
      header: 'Tarih',
      cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Açıklama',
      cell: ({ row }) => (
        <div className="grid max-w-80 min-w-0">
          <span className="break-words">{row.original.description || '—'}</span>
          {row.original.reason && (
            <span className="text-xs text-muted-foreground">{row.original.reason}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'amountKurus',
      header: 'Tutar',
      cell: ({ row }) => (
        <span className="font-medium whitespace-nowrap tabular-nums">
          {formatKurus(row.original.amountKurus)}
        </span>
      ),
    },
    {
      id: 'unit',
      header: 'Daire',
      enableSorting: false,
      cell: ({ row }) => unitSelect(row.original),
    },
    {
      id: 'status',
      header: 'Durum',
      enableSorting: false,
      cell: ({ row }) => statusBadge(row.original),
    },
  ];

  const chosen = match?.rows.filter((r) => selected.has(String(r.index)) && selectable(r)) ?? [];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Banka hareketleri"
        description="Bankadan indirdiğiniz hesap hareketlerini yükleyin; gelen havaleler dairelere eşleştirilip tahsilat olarak kaydedilir."
        actions={
          parsed && (
            <Button variant="outline" onClick={reset}>
              <RotateCcw />
              Yeni dosya
            </Button>
          )
        }
      />

      {!parsed ? (
        <Card>
          <CardHeader>
            <CardTitle>Dosya yükle</CardTitle>
            <CardDescription>
              İnternet bankacılığından hesap hareketlerini Excel (.xlsx) veya CSV olarak indirin.
              Yalnızca hesaba gelen tutarlar alınır; aynı hareket ikinci kez aktarılmaz.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild disabled={busy}>
              <label className="cursor-pointer">
                <FileUp />
                {busy ? 'Okunuyor…' : 'Dosya seç'}
                <input
                  id="bank-file"
                  type="file"
                  accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void upload(file);
                  }}
                />
              </label>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Sütunlar</CardTitle>
            <CardDescription>
              Hangi sütunun tarih, açıklama ve tutar olduğunu seçin. Seçiminiz bir sonraki dosya
              için hatırlanır.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <ColumnSelect
                id="bank-col-date"
                label="Tarih"
                headers={parsed.headers}
                value={mapping.date ?? ''}
                onChange={(date) => setMapping((m) => ({ ...m, date }))}
              />
              <ColumnSelect
                id="bank-col-desc"
                label="Açıklama"
                headers={parsed.headers}
                value={mapping.description ?? ''}
                onChange={(description) => setMapping((m) => ({ ...m, description }))}
              />
              <ColumnSelect
                id="bank-col-amount"
                label="Tutar"
                headers={parsed.headers}
                value={mapping.amount ?? ''}
                onChange={(amount) => setMapping((m) => ({ ...m, amount }))}
              />
            </div>
            {mapped && (
              <p className="text-sm text-muted-foreground">
                {mapped.rows.length} gelen hareket bulundu
                {mapped.skipped > 0 &&
                  ` · ${mapped.skipped} satır (giden para veya okunamayan) atlandı`}
              </p>
            )}
            <div>
              <Button
                onClick={() => void runMatch()}
                disabled={busy || !mapped || mapped.rows.length === 0}
              >
                Dairelerle eşleştir
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && result.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>{result.errors.length} hareket kaydedilemedi</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {result.errors.map((e, i) => (
                <li key={i}>
                  {formatDate(e.date)} · {formatKurus(e.amountKurus)} · {e.description}: {e.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {match && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1">
              <Label htmlFor="bank-account">Paranın girdiği hesap</Label>
              <Select value={account} onValueChange={setAccountId}>
                <SelectTrigger id="bank-account" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy || chosen.length === 0}
                onClick={() => void commit('ignore')}
              >
                <Ban />
                Seçilenleri yoksay
              </Button>
              <Button
                disabled={busy || chosen.length === 0 || !account}
                onClick={() => void commit('payments')}
              >
                <HandCoins />
                Tahsilat olarak kaydet ({chosen.length})
              </Button>
            </div>
          </div>
          <DataTable
            columns={columns}
            data={match.rows}
            getRowId={(r) => String(r.index)}
            selection={{
              selected,
              onChange: setSelected,
              canSelect: selectable,
              label: (r) => `${formatDate(r.date)} ${formatKurus(r.amountKurus)}`,
            }}
            rowClassName={(r) => (r.status === 'NEW' ? undefined : 'opacity-60')}
            mobileCard={(r) => (
              <div className="grid gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid min-w-0 gap-0.5">
                    <span className="font-medium tabular-nums">{formatKurus(r.amountKurus)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(r.date)} · {r.description || '—'}
                    </span>
                    {r.reason && <span className="text-xs text-muted-foreground">{r.reason}</span>}
                  </div>
                  {statusBadge(r)}
                </div>
                {unitSelect(r)}
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}

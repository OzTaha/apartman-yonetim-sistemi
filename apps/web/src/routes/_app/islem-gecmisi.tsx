import {
  auditActionLabels,
  auditEntityLabels,
  auditLabel,
  type AuditLogDto,
} from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { DataTable } from '@/components/data-table';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { todayIso } from '@/lib/format';
import { useAuditLogs } from '@/lib/queries';

export const Route = createFileRoute('/_app/islem-gecmisi')({
  validateSearch: (
    s: Record<string, unknown>,
  ): { bas?: string; bit?: string; tur?: string; islem?: string; kisi?: string } => ({
    bas: typeof s['bas'] === 'string' ? s['bas'] : undefined,
    bit: typeof s['bit'] === 'string' ? s['bit'] : undefined,
    tur: typeof s['tur'] === 'string' ? s['tur'] : undefined,
    islem: typeof s['islem'] === 'string' ? s['islem'] : undefined,
    kisi: typeof s['kisi'] === 'string' ? s['kisi'] : undefined,
  }),
  component: () => (
    <ManagerOnly allow={['AUDITOR']}>
      <AuditPage />
    </ManagerOnly>
  ),
});

const dateTime = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  dateStyle: 'short',
  timeStyle: 'short',
});

function monthAgo(): string {
  const d = new Date(`${todayIso()}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Changes({ log }: { log: AuditLogDto }) {
  const before = (log.before ?? {}) as Record<string, unknown>;
  const after = (log.after ?? {}) as Record<string, unknown>;
  const flat = typeof log.before !== 'object' || typeof log.after !== 'object';
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) => log.before === null || log.after === null || show(before[k]) !== show(after[k]),
  );
  if (flat || keys.length === 0) {
    return <p className="text-sm text-muted-foreground">Ayrıntı kaydedilmemiş.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Alan</th>
            {log.before !== null && <th className="px-3 py-2 font-medium">Önce</th>}
            {log.after !== null && <th className="px-3 py-2 font-medium">Sonra</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {keys.map((k) => (
            <tr key={k} className="align-top">
              <td className="px-3 py-2 font-medium whitespace-nowrap">{k}</td>
              {log.before !== null && (
                <td className="px-3 py-2 break-all text-muted-foreground">{show(before[k])}</td>
              )}
              {log.after !== null && <td className="px-3 py-2 break-all">{show(after[k])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ALL = 'all';

function AuditPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const from = search.bas ?? monthAgo();
  const to = search.bit ?? todayIso();
  const logs = useAuditLogs({
    from,
    to,
    entityType: search.tur,
    action: search.islem,
    userId: search.kisi,
  });
  const [selected, setSelected] = useState<AuditLogDto | null>(null);
  const setFilter = (patch: Record<string, string | undefined>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const columns: ColumnDef<AuditLogDto>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Zaman',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {dateTime.format(new Date(row.original.createdAt))}
        </span>
      ),
    },
    {
      id: 'user',
      header: 'Kişi',
      accessorFn: (l) => l.userName ?? 'Sistem',
    },
    {
      id: 'entity',
      header: 'Kayıt',
      accessorFn: (l) => auditLabel(auditEntityLabels, l.entityType),
    },
    {
      id: 'action',
      header: 'İşlem',
      accessorFn: (l) => auditLabel(auditActionLabels, l.action),
      cell: ({ row }) => (
        <Badge variant={row.original.action === 'DELETE' ? 'destructive' : 'secondary'}>
          {auditLabel(auditActionLabels, row.original.action)}
        </Badge>
      ),
    },
  ];

  const filter = (
    id: string,
    label: string,
    value: string | undefined,
    key: string,
    options: { value: string; label: string }[],
  ) => (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select
        value={value ?? ALL}
        onValueChange={(v) => setFilter({ [key]: v === ALL ? undefined : v })}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tümü</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const sorted = (labels: Record<string, string>) =>
    Object.entries(labels)
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr'));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="İşlem geçmişi"
        description="Kim, hangi kaydı, ne zaman ekledi, değiştirdi, iptal etti veya sildi."
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="grid gap-1">
          <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
            Başlangıç
          </Label>
          <Input
            id="audit-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFilter({ bas: e.target.value || undefined })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
            Bitiş
          </Label>
          <Input
            id="audit-to"
            type="date"
            value={to}
            onChange={(e) => setFilter({ bit: e.target.value || undefined })}
          />
        </div>
        {filter('audit-entity', 'Kayıt türü', search.tur, 'tur', sorted(auditEntityLabels))}
        {filter('audit-action', 'İşlem', search.islem, 'islem', sorted(auditActionLabels))}
        {filter(
          'audit-user',
          'Kişi',
          search.kisi,
          'kisi',
          (logs.data?.users ?? []).map((u) => ({ value: u.id, label: u.name })),
        )}
      </div>

      {logs.data?.truncated && (
        <Alert>
          <AlertDescription>
            Çok fazla kayıt var; en yeni 1000 kayıt gösteriliyor. Tarih aralığını daraltın.
          </AlertDescription>
        </Alert>
      )}

      {logs.isPending ? (
        <LoadingRows />
      ) : logs.isError ? (
        <ErrorState error={logs.error} />
      ) : (
        <DataTable
          columns={columns}
          data={logs.data.items}
          getRowId={(l) => l.id}
          onRowClick={setSelected}
          mobileCard={(l) => (
            <div className="flex items-start justify-between gap-2">
              <div className="grid min-w-0 gap-0.5">
                <span className="font-medium">
                  {auditLabel(auditEntityLabels, l.entityType)} ·{' '}
                  {auditLabel(auditActionLabels, l.action)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {dateTime.format(new Date(l.createdAt))} · {l.userName ?? 'Sistem'}
                </span>
              </div>
            </div>
          )}
          empty={<EmptyState title="Kayıt yok" description="Filtreleri değiştirmeyi deneyin." />}
        />
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {auditLabel(auditEntityLabels, selected.entityType)} ·{' '}
                  {auditLabel(auditActionLabels, selected.action)}
                </DialogTitle>
                <DialogDescription>
                  {dateTime.format(new Date(selected.createdAt))} · {selected.userName ?? 'Sistem'}
                </DialogDescription>
              </DialogHeader>
              <Changes log={selected} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { formatKurus, periodLabel } from '@apartman/shared';
import { createFileRoute } from '@tanstack/react-router';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/form-field';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { downloadFile, errorMessage } from '@/lib/api';
import { formatDate, todayIso } from '@/lib/format';
import { useDebtReport } from '@/lib/queries';
import { labelUnit } from '@/lib/unit-label';

export const Route = createFileRoute('/_app/raporlar')({
  component: () => (
    <ManagerOnly>
      <ReportsPage />
    </ManagerOnly>
  ),
});

function DownloadButtons({ path, name }: { path: string; name: string }) {
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);
  async function download(format: 'pdf' | 'xlsx') {
    setBusy(format);
    try {
      const [base, query] = path.split('?');
      await downloadFile(`${base}.${format}${query ? `?${query}` : ''}`, `${name}.${format}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => void download('xlsx')} disabled={busy !== null}>
        <FileSpreadsheet />
        {busy === 'xlsx' ? 'Hazırlanıyor…' : 'Excel'}
      </Button>
      <Button variant="outline" onClick={() => void download('pdf')} disabled={busy !== null}>
        <FileText />
        {busy === 'pdf' ? 'Hazırlanıyor…' : 'PDF'}
      </Button>
    </div>
  );
}

function ReportsPage() {
  const report = useDebtReport();
  const today = todayIso();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);

  const debtors = (report.data ?? [])
    .filter((r) => r.debtKurus > 0)
    .sort((a, b) => b.debtKurus - a.debtKurus);
  const total = debtors.reduce((sum, r) => sum + r.debtKurus, 0);
  const overdue = debtors.reduce((sum, r) => sum + r.overdueKurus, 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Raporlar"
        description="Borç ve tahsilat raporlarını görüntüleyin, Excel veya PDF olarak indirin."
      />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <CardTitle>Borç durum raporu</CardTitle>
            <CardDescription>{formatDate(today)} itibarıyla borcu olan daireler</CardDescription>
          </div>
          <DownloadButtons path="/reports/debts" name={`borc-raporu-${today}`} />
        </CardHeader>
        <CardContent className="grid gap-4">
          {report.isPending ? (
            <LoadingRows rows={3} />
          ) : report.isError ? (
            <ErrorState error={report.error} />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Borçlu daire</p>
                  <p className="text-lg font-semibold">{debtors.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Toplam borç</p>
                  <p className="text-lg font-semibold tabular-nums">{formatKurus(total)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Gecikmiş</p>
                  <p className="text-lg font-semibold text-red-600 tabular-nums">
                    {formatKurus(overdue)}
                  </p>
                </div>
              </div>
              {debtors.length > 0 && (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Daire</TableHead>
                        <TableHead>Aidattan sorumlu</TableHead>
                        <TableHead className="text-right">Borç</TableHead>
                        <TableHead>En eski borç</TableHead>
                        <TableHead>Son ödeme</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {debtors.slice(0, 10).map((r) => (
                        <TableRow key={r.unitId}>
                          <TableCell className="font-medium">
                            {labelUnit(r.blockName, r.unitNumber, 'short')}
                          </TableCell>
                          <TableCell>{r.responsible || '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatKurus(r.debtKurus)}
                          </TableCell>
                          <TableCell>
                            {r.oldestUnpaidPeriod ? periodLabel(r.oldestUnpaidPeriod) : '—'}
                          </TableCell>
                          <TableCell>{formatDate(r.lastPaymentDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {debtors.length > 10 && (
                <p className="text-xs text-muted-foreground">
                  En yüksek borçlu 10 daire gösteriliyor. Tam liste için Excel veya PDF indirin.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <CardTitle>Tahsilat raporu</CardTitle>
            <CardDescription>
              Seçilen tarihler arasındaki ödemeler ve yönteme göre toplamlar
            </CardDescription>
          </div>
          <DownloadButtons
            path={`/reports/payments?from=${from}&to=${to}`}
            name={`tahsilat-raporu-${from}-${to}`}
          />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Başlangıç" htmlFor="rep-from">
            <Input
              id="rep-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Bitiş" htmlFor="rep-to">
            <Input
              id="rep-to"
              type="date"
              value={to}
              max={today}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

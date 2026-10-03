import {
  formatKurus,
  IMPORT_MAX_BYTES,
  IMPORT_SHEETS,
  type ImportIssueDto,
  type ImportPreviewDto,
  type ImportResultDto,
} from '@apartman/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CircleCheck, CircleX, FileDown, FileUp, Info } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ManagerOnly } from '@/components/manager-only';
import { PageHeader } from '@/components/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch, downloadFile, errorMessage, uploadFile } from '@/lib/api';
import { useApiMutation } from '@/lib/queries';

export const Route = createFileRoute('/_app/excel-aktarma')({
  component: () => (
    <ManagerOnly>
      <ImportPage />
    </ManagerOnly>
  ),
});

function IssueList({ items, tone }: { items: ImportIssueDto[]; tone: 'error' | 'skip' }) {
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((i) => (
        <li key={`${i.sheet}-${i.row}-${i.message}`} className="flex gap-3 px-3 py-2.5 text-sm">
          {tone === 'error' ? (
            <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0">
            <span className="font-semibold">
              {IMPORT_SHEETS[i.sheet]}, {i.row}. satır:
            </span>{' '}
            {i.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl bg-muted p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-heading text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ImportPage() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [result, setResult] = useState<ImportResultDto | null>(null);

  const commit = useApiMutation(
    (p: ImportPreviewDto) =>
      apiFetch<ImportResultDto>('/imports/commit', {
        method: 'POST',
        body: { units: p.units, residents: p.residents, debts: p.debts },
      }),
    {
      success: 'Aktarma tamamlandı',
      onSuccess: (r) => {
        setResult(r);
        setPreview(null);
        setFileName(null);
      },
    },
  );

  async function choose(file: File | undefined) {
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) return toast.error('Dosya en fazla 5 MB olabilir');
    setBusy(true);
    setResult(null);
    try {
      setPreview(await uploadFile<ImportPreviewDto>('/imports/preview', file));
      setFileName(file.name);
    } catch (e) {
      setPreview(null);
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const total = preview
    ? preview.units.length + preview.residents.length + preview.debts.length
    : 0;
  const debtTotal = preview?.debts.reduce((sum, d) => sum + d.amountKurus, 0) ?? 0;

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title="Excel'den aktar"
        description="Daireleri, sakinleri ve geçmişten kalan borçları tek seferde sisteme ekleyin."
      />

      <Card>
        <CardHeader>
          <CardTitle>1. Şablonu indirin</CardTitle>
          <CardDescription>
            Şablon, sütunları hazır bir Excel dosyasıdır. İlk sayfasında nasıl doldurulacağı adım
            adım yazar. Kullanmadığınız sayfayı boş bırakabilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() =>
              void downloadFile('/imports/template.xlsx', 'toplu-aktarma-sablonu.xlsx').catch(
                (e: unknown) => toast.error(errorMessage(e)),
              )
            }
          >
            <FileDown />
            Şablonu indir
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Doldurduğunuz dosyayı yükleyin</CardTitle>
          <CardDescription>
            Dosyayı yükleyince hiçbir şey hemen kaydedilmez. Önce neyin ekleneceğini ve varsa
            hataları görürsünüz.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            id="import-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            aria-label="Excel dosyası"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button disabled={busy} onClick={() => input.current?.click()}>
            <FileUp />
            {busy ? 'Okunuyor…' : 'Dosya seç'}
          </Button>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>3. Kontrol edin ve aktarın</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Count label="Eklenecek daire" value={String(preview.units.length)} />
              <Count label="Eklenecek sakin" value={String(preview.residents.length)} />
              <Count label="Eklenecek borç" value={String(preview.debts.length)} />
              <Count label="Borç toplamı" value={formatKurus(debtTotal)} />
            </div>

            {preview.errors.length > 0 && (
              <div className="grid gap-2">
                <Alert variant="destructive">
                  <CircleX />
                  <AlertTitle>{preview.errors.length} satırda sorun var</AlertTitle>
                  <AlertDescription>
                    Bu satırları Excel'de düzeltip dosyayı yeniden yükleyin. Sorun varken hiçbir şey
                    kaydedilmez.
                  </AlertDescription>
                </Alert>
                <IssueList items={preview.errors} tone="error" />
              </div>
            )}

            {preview.skipped.length > 0 && (
              <div className="grid gap-2">
                <p className="text-sm font-semibold">
                  Atlanacaklar ({preview.skipped.length}) — sistemde zaten var, değiştirilmez
                </p>
                <IssueList items={preview.skipped} tone="skip" />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                disabled={preview.errors.length > 0 || total === 0 || commit.isPending}
                onClick={() => commit.mutate(preview)}
              >
                <CircleCheck />
                {total === 0 ? 'Eklenecek kayıt yok' : `${total} kaydı aktar`}
              </Button>
              <Button variant="ghost" size="lg" onClick={() => setPreview(null)}>
                Vazgeç
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Alert>
          <CircleCheck />
          <AlertTitle>Aktarma tamamlandı</AlertTitle>
          <AlertDescription>
            <p>
              {result.units} daire, {result.residents} sakin ve {result.debts} borç (
              {formatKurus(result.debtKurus)}) eklendi.
            </p>
            <p className="mt-2 flex flex-wrap gap-3">
              <Link to="/daireler" className="font-semibold text-primary underline">
                Dairelere git
              </Link>
              <Link to="/sakinler" className="font-semibold text-primary underline">
                Sakinlere git
              </Link>
              <Link to="/borclar" className="font-semibold text-primary underline">
                Borçlara git
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

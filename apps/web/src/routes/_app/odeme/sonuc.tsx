import { formatKurus, paymentIntentStatusLabels } from '@apartman/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CircleCheck, CircleX, Clock, Receipt, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorState, LoadingRows } from '@/components/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { downloadFile, errorMessage } from '@/lib/api';
import { usePaymentIntent } from '@/lib/queries';
import { useSession } from '@/lib/session';

export const Route = createFileRoute('/_app/odeme/sonuc')({
  validateSearch: (s: Record<string, unknown>): { odeme?: string; site?: string } => ({
    odeme: typeof s['odeme'] === 'string' ? s['odeme'] : undefined,
    site: typeof s['site'] === 'string' ? s['site'] : undefined,
  }),
  component: PaymentResultPage,
});

function PaymentResultPage() {
  const search = Route.useSearch();
  const { siteId } = useSession();
  const intent = usePaymentIntent(search.odeme ?? '', search.site ?? siteId ?? undefined);
  const [busy, setBusy] = useState(false);

  if (!search.odeme) {
    return <ErrorState error={new Error('Ödeme bilgisi bulunamadı')} />;
  }
  if (intent.isPending) return <LoadingRows rows={2} />;
  if (intent.isError) return <ErrorState error={intent.error} />;

  const i = intent.data;
  const success = i.status === 'SUCCEEDED';
  const Icon = success ? CircleCheck : i.status === 'PENDING' ? Clock : CircleX;

  async function receipt() {
    setBusy(true);
    try {
      await downloadFile(
        `/payments/${i.paymentId}/receipt.pdf`,
        `makbuz-${i.receiptNo ?? i.paymentId}.pdf`,
        search.site,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-md gap-6 pt-6">
      <Card>
        <CardHeader className="justify-items-center text-center">
          <Icon
            className={
              success
                ? 'size-12 text-emerald-600'
                : i.status === 'PENDING'
                  ? 'size-12 text-muted-foreground'
                  : 'size-12 text-red-600'
            }
          />
          <CardTitle className="text-xl">{paymentIntentStatusLabels[i.status]}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-center">
          <p className="text-3xl font-semibold tabular-nums">
            {formatKurus(success ? i.appliedKurus : i.amountKurus)}
          </p>
          {i.status === 'PENDING' && (
            <p className="text-sm text-muted-foreground">
              Ödeme kuruluşundan sonuç bekleniyor, sayfa kendiliğinden yenilenecek.
            </p>
          )}
          {i.failureReason && i.status === 'FAILED' && (
            <p className="text-sm text-muted-foreground">{i.failureReason}</p>
          )}
          {i.refundedKurus > 0 && (
            <Alert>
              <AlertDescription>
                {i.appliedKurus > 0
                  ? 'Seçtiğiniz borçların bir kısmı ödeme sırasında kapandığı için '
                  : 'Seçtiğiniz borçlar ödeme sırasında kapandığı için '}
                {formatKurus(i.refundedKurus)} kartınıza iade edildi.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-2">
            {success && i.paymentId && (
              <Button disabled={busy} onClick={() => void receipt()}>
                <Receipt />
                Makbuzu indir
              </Button>
            )}
            {(i.status === 'FAILED' || i.status === 'EXPIRED') && (
              <Button asChild>
                <Link to="/dairem">
                  <RotateCcw />
                  Tekrar dene
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to="/dairem">Dairem'e dön</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

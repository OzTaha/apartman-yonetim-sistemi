import {
  formatKurus,
  paymentMethodLabels,
  unitLabel,
  type MyOccupancyDto,
  type PaymentDto,
} from '@apartman/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FileDown, Receipt, Scale } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatementDialog } from '@/features/dues/small-dialogs';
import { ChargeStatusBadge } from '@/features/dues/status';
import { OccupancyTypeBadge } from '@/features/residents/occupancy-actions';
import { downloadFile, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUnitAccount } from '@/lib/queries';
import { session, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/dairem')({
  component: MyUnitsPage,
});

function ReceiptButton({ payment, siteId }: { payment: PaymentDto; siteId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      aria-label={`${formatDate(payment.paidAt)} ödemesinin makbuzu`}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadFile(
            `/payments/${payment.id}/receipt.pdf`,
            `makbuz-${payment.receiptNo ?? payment.id}.pdf`,
            siteId,
          );
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Receipt />
      Makbuz
    </Button>
  );
}

function MyUnit({ occupancy }: { occupancy: MyOccupancyDto }) {
  const navigate = useNavigate();
  const account = useUnitAccount(occupancy.unitId, occupancy.siteId);
  const [statement, setStatement] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const label = unitLabel(occupancy.siteKind, occupancy.blockName, occupancy.unitNumber);
  const short = unitLabel(occupancy.siteKind, occupancy.blockName, occupancy.unitNumber, 'short');

  const charges = (account.data?.charges ?? []).filter((c) => !c.cancelledAt);
  const open = charges.filter((c) => c.remainingKurus > 0);
  const past = charges.filter((c) => c.remainingKurus === 0);
  const payments = (account.data?.payments ?? []).filter((p) => !p.cancelledAt);

  return (
    <section className="grid gap-4" aria-label={label}>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{label}</CardTitle>
            <OccupancyTypeBadge type={occupancy.type} />
          </div>
          <CardDescription>{occupancy.siteName}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {account.isPending ? (
            <LoadingRows rows={1} />
          ) : account.isError ? (
            <ErrorState error={account.error} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground">Güncel borç</p>
                <p className="text-xl font-semibold tabular-nums">
                  {formatKurus(account.data.debtKurus)}
                </p>
              </div>
              <div
                className={cn(
                  'rounded-md p-3',
                  account.data.overdueKurus > 0 ? 'bg-red-50 dark:bg-red-950/40' : 'bg-muted',
                )}
              >
                <p className="text-xs text-muted-foreground">Gecikmiş</p>
                <p
                  className={cn(
                    'text-xl font-semibold tabular-nums',
                    account.data.overdueKurus > 0 && 'text-red-700 dark:text-red-400',
                  )}
                >
                  {formatKurus(account.data.overdueKurus)}
                </p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setStatement(true)}>
              <FileDown />
              Hesap ekstresi
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                session.setSite(occupancy.siteId);
                void navigate({ to: '/giderler' });
              }}
            >
              <Scale />
              Giderler ve işler
            </Button>
          </div>
        </CardContent>
      </Card>

      {account.data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ödenecek borçlar</CardTitle>
            </CardHeader>
            <CardContent>
              {open.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ödenmemiş borcunuz yok.</p>
              ) : (
                <ul className="divide-y">
                  {open.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate text-sm font-medium">{c.label}</span>
                        <span className="text-xs text-muted-foreground">
                          Son ödeme {formatDate(c.dueDate)}
                          {c.paidKurus > 0 && ` · ödenen ${formatKurus(c.paidKurus)}`}
                        </span>
                      </span>
                      <span className="grid shrink-0 justify-items-end gap-1">
                        <span className="text-sm font-medium tabular-nums">
                          {formatKurus(c.remainingKurus)}
                        </span>
                        <ChargeStatusBadge status={c.status} overdue={c.overdue} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ödemelerim</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz ödeme kaydı yok.</p>
              ) : (
                <ul className="divide-y">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="grid min-w-0 gap-0.5">
                        <span className="text-sm font-medium">
                          {formatDate(p.paidAt)} · {formatKurus(p.amountKurus)}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {paymentMethodLabels[p.method]}
                          {p.allocations.length > 0 &&
                            ` · ${p.allocations.map((a) => a.label).join(', ')}`}
                        </span>
                      </span>
                      <ReceiptButton payment={p} siteId={occupancy.siteId} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {past.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">Ödenmiş borçlar ({past.length})</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowPast((v) => !v)}>
                  {showPast ? 'Gizle' : 'Göster'}
                </Button>
              </CardHeader>
              {showPast && (
                <CardContent>
                  <ul className="divide-y">
                    {past.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="grid min-w-0">
                          <span className="truncate text-sm">{c.label}</span>
                          <span className="text-xs text-muted-foreground">
                            Son ödeme {formatDate(c.dueDate)}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm tabular-nums">
                          {formatKurus(c.amountKurus)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              )}
            </Card>
          )}
        </>
      )}

      <StatementDialog
        open={statement}
        onOpenChange={setStatement}
        unitId={occupancy.unitId}
        unitLabel={short}
        siteId={occupancy.siteId}
      />
    </section>
  );
}

function MyUnitsPage() {
  const { user } = useSession();
  const occupancies = user?.occupancies ?? [];

  return (
    <div className="grid gap-6">
      <PageHeader title="Dairem" description={`Hoş geldiniz, ${user?.firstName ?? ''}`} />
      {occupancies.length === 0 ? (
        <EmptyState
          title="Hesabınıza bağlı daire yok"
          description="Site yönetiminizle iletişime geçin."
        />
      ) : (
        occupancies.map((o) => <MyUnit key={o.occupancyId} occupancy={o} />)
      )}
    </div>
  );
}

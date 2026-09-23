import { formatKurus, paymentMethodLabels, type ChargeDto } from '@apartman/shared';
import { FileDown, HandCoins, Plus } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingRows } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { useUnitAccount } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { ChargeCreateDialog } from './charge-dialogs';
import { PaymentDialog } from './payment-dialog';
import { ChargeActions, PaymentActions } from './row-actions';
import { StatementDialog } from './small-dialogs';
import { ChargeStatusBadge } from './status';

function ChargeRow({ charge }: { charge: ChargeDto }) {
  return (
    <li className={cn('flex items-center gap-3 py-2', charge.cancelledAt && 'opacity-50')}>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-sm font-medium">{charge.label}</span>
        <span className="text-xs text-muted-foreground">
          Vade {formatDate(charge.dueDate)}
          {charge.paidKurus > 0 &&
            charge.remainingKurus > 0 &&
            ` · ödenen ${formatKurus(charge.paidKurus)}`}
          {charge.cancelReason && ` · iptal: ${charge.cancelReason}`}
        </span>
      </div>
      <div className="grid justify-items-end gap-1">
        <span className="text-sm tabular-nums">
          {charge.remainingKurus > 0 && !charge.cancelledAt
            ? formatKurus(charge.remainingKurus)
            : formatKurus(charge.amountKurus)}
        </span>
        <ChargeStatusBadge
          status={charge.status}
          overdue={charge.overdue}
          cancelled={Boolean(charge.cancelledAt)}
        />
      </div>
      <ChargeActions charge={charge} />
    </li>
  );
}

export function UnitAccountSection({ unitId, unitLabel }: { unitId: string; unitLabel: string }) {
  const account = useUnitAccount(unitId);
  const [dialog, setDialog] = useState<'pay' | 'charge' | 'statement' | null>(null);
  const [showAll, setShowAll] = useState(false);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Hesap</h2>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setDialog('statement')}>
          <FileDown />
          Ekstre
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDialog('charge')}>
          <Plus />
          Borç ekle
        </Button>
        <Button size="sm" onClick={() => setDialog('pay')}>
          <HandCoins />
          Ödeme al
        </Button>
      </div>
    </div>
  );

  const dialogs = (
    <>
      <PaymentDialog
        open={dialog === 'pay'}
        onOpenChange={(o) => setDialog(o ? 'pay' : null)}
        unitId={unitId}
      />
      <ChargeCreateDialog
        open={dialog === 'charge'}
        onOpenChange={(o) => setDialog(o ? 'charge' : null)}
        unitId={unitId}
      />
      <StatementDialog
        open={dialog === 'statement'}
        onOpenChange={(o) => setDialog(o ? 'statement' : null)}
        unitId={unitId}
        unitLabel={unitLabel}
      />
    </>
  );

  if (account.isPending) {
    return (
      <section className="grid gap-3">
        {header}
        <LoadingRows rows={3} />
      </section>
    );
  }
  if (account.isError) {
    return (
      <section className="grid gap-3">
        {header}
        <ErrorState error={account.error} />
      </section>
    );
  }

  const data = account.data;
  const open = data.charges.filter((c) => !c.cancelledAt && c.remainingKurus > 0);
  const history = data.charges.filter((c) => c.cancelledAt || c.remainingKurus === 0);

  return (
    <section className="grid gap-3">
      {header}
      <div className="grid grid-cols-2 gap-3">
        <Card className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">Toplam borç</p>
            <p className="text-xl font-semibold tabular-nums">{formatKurus(data.debtKurus)}</p>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">Gecikmiş</p>
            <p
              className={cn(
                'text-xl font-semibold tabular-nums',
                data.overdueKurus > 0 && 'text-red-600',
              )}
            >
              {formatKurus(data.overdueKurus)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Açık borçlar ({open.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bu dairenin açık borcu yok.</p>
          ) : (
            <ul className="divide-y">
              {open.map((c) => (
                <ChargeRow key={c.id} charge={c} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Geçmiş dönem borçları ({history.length})</CardTitle>
          {history.length > 6 && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Daha az göster' : 'Tümünü göster'}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz kapanmış borç yok.</p>
          ) : (
            <ul className="divide-y">
              {(showAll ? history : history.slice(0, 6)).map((c) => (
                <ChargeRow key={c.id} charge={c} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ödemeler ({data.payments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz ödeme yok.</p>
          ) : (
            <ul className="divide-y">
              {data.payments.slice(0, showAll ? undefined : 8).map((p) => (
                <li
                  key={p.id}
                  className={cn('flex items-center gap-3 py-2', p.cancelledAt && 'opacity-50')}
                >
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-sm font-medium">
                      {formatDate(p.paidAt)} · {paymentMethodLabels[p.method]}
                      {p.cancelledAt && (
                        <span className="ml-2 text-xs text-red-600">İptal: {p.cancelReason}</span>
                      )}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {p.allocations.map((a) => a.label).join(', ') || '—'}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </span>
                  </div>
                  <span className={cn('text-sm tabular-nums', p.cancelledAt && 'line-through')}>
                    {formatKurus(p.amountKurus)}
                  </span>
                  <PaymentActions payment={p} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {dialogs}
    </section>
  );
}

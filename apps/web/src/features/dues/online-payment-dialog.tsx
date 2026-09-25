import { formatKurus, type ChargeDto, type CheckoutResultDto } from '@apartman/shared';
import { CreditCard } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Label } from '@/components/ui/label';
import { apiFetch, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';

export function OnlinePaymentDialog({
  open,
  onOpenChange,
  unitId,
  siteId,
  charges,
  testMode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  siteId: string;
  charges: ChargeDto[];
  testMode: boolean;
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const selected = charges.filter((c) => !excluded.has(c.id));
  const total = selected.reduce((sum, c) => sum + c.remainingKurus, 0);

  function toggle(id: string, on: boolean) {
    const next = new Set(excluded);
    if (on) next.delete(id);
    else next.add(id);
    setExcluded(next);
  }

  async function pay() {
    setBusy(true);
    try {
      const result = await apiFetch<CheckoutResultDto>('/online-payments/checkout', {
        method: 'POST',
        siteId,
        body: { unitId, chargeIds: selected.map((c) => c.id) },
      });
      window.location.assign(result.redirectUrl);
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setExcluded(new Set());
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Online ödeme</DialogTitle>
          <DialogDescription>
            Ödemek istediğiniz borçları seçin. Kart bilgileriniz ödeme kuruluşunun güvenli
            sayfasında girilir, bu sistemde saklanmaz.
          </DialogDescription>
        </DialogHeader>
        {testMode && (
          <Alert>
            <AlertDescription>Test modu: gerçek ödeme alınmaz.</AlertDescription>
          </Alert>
        )}
        <ul className="divide-y rounded-md border">
          {charges.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2">
              <Checkbox
                id={`pay-${c.id}`}
                checked={!excluded.has(c.id)}
                onCheckedChange={(v) => toggle(c.id, v === true)}
              />
              <Label htmlFor={`pay-${c.id}`} className="grid min-w-0 flex-1 gap-0.5 font-normal">
                <span className="truncate font-medium">{c.label}</span>
                <span className="text-xs text-muted-foreground">
                  Son ödeme {formatDate(c.dueDate)}
                </span>
              </Label>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {formatKurus(c.remainingKurus)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Ödenecek tutar</span>
          <span className="text-lg font-semibold tabular-nums">{formatKurus(total)}</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button disabled={busy || selected.length === 0} onClick={() => void pay()}>
            <CreditCard />
            {busy ? 'Ödeme sayfası açılıyor…' : 'Ödemeye geç'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

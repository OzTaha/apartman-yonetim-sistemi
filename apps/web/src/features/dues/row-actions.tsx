import { formatKurus, type ChargeDto, type PaymentDto } from '@apartman/shared';
import { Ban, MoreHorizontal, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApiMutation } from '@/lib/queries';
import { ChargeEditDialog } from './charge-dialogs';
import { CancelDialog } from './small-dialogs';
import { labelUnit } from '@/lib/unit-label';

export function ChargeActions({ charge }: { charge: ChargeDto }) {
  const [dialog, setDialog] = useState<'edit' | 'cancel' | null>(null);
  const cancel = useApiMutation(
    (reason: string) =>
      apiFetch<ChargeDto>(`/charges/${charge.id}/cancel`, { method: 'POST', body: { reason } }),
    { success: 'Borç iptal edildi', onSuccess: () => setDialog(null) },
  );
  if (charge.cancelledAt) return null;
  return (
    <div className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${charge.label} için işlemler`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog('edit')}>
            <Pencil />
            Düzelt
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={charge.paidKurus > 0}
            onSelect={() => setDialog('cancel')}
          >
            <Ban />
            {charge.paidKurus > 0 ? 'İptal (önce ödemeyi iptal edin)' : 'İptal et'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChargeEditDialog
        open={dialog === 'edit'}
        onOpenChange={(o) => setDialog(o ? 'edit' : null)}
        charge={charge}
      />
      <CancelDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => setDialog(o ? 'cancel' : null)}
        title="Borç iptal edilsin mi?"
        description={`${labelUnit(charge.blockName, charge.unitNumber)} · ${charge.label} (${formatKurus(
          charge.amountKurus,
        )}). Kayıt silinmez, iptal edildi olarak işaretlenir.`}
        pending={cancel.isPending}
        onConfirm={(reason) => cancel.mutate(reason)}
      />
    </div>
  );
}

export function PaymentActions({ payment }: { payment: PaymentDto }) {
  const [open, setOpen] = useState(false);
  const cancel = useApiMutation(
    (reason: string) =>
      apiFetch<PaymentDto>(`/payments/${payment.id}/cancel`, { method: 'POST', body: { reason } }),
    { success: 'Ödeme iptal edildi', onSuccess: () => setOpen(false) },
  );
  if (payment.cancelledAt) return null;
  return (
    <div className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Ödeme işlemleri">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setOpen(true)}>
            <Ban />
            Ödemeyi iptal et
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CancelDialog
        open={open}
        onOpenChange={setOpen}
        title="Ödeme iptal edilsin mi?"
        description={`${formatDate(payment.paidAt)} tarihli ${formatKurus(
          payment.amountKurus,
        )} ödeme iptal edilecek ve kapattığı borçlar yeniden açık hale gelecek.`}
        pending={cancel.isPending}
        onConfirm={(reason) => cancel.mutate(reason)}
      />
    </div>
  );
}

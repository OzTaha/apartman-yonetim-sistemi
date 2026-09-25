import { cancelSchema } from '@apartman/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileDown } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Field } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { downloadFile, errorMessage } from '@/lib/api';
import { todayIso } from '@/lib/format';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CancelForm = z.input<typeof cancelSchema>;

export function CancelDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  onConfirm,
}: DialogProps & {
  title: string;
  description: string;
  pending?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const form = useForm<CancelForm>({
    resolver: zodResolver(cancelSchema),
    defaultValues: { reason: '' },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) form.reset();
        onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form id="cancel-form" noValidate onSubmit={form.handleSubmit((v) => onConfirm(v.reason))}>
          <Field
            label="İptal nedeni"
            htmlFor="cancel-reason"
            error={form.formState.errors.reason?.message}
            required
          >
            <Input id="cancel-reason" autoFocus {...form.register('reason')} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="cancel-form" variant="destructive" disabled={pending}>
            İptal et
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StatementDialog({
  open,
  onOpenChange,
  unitId,
  unitLabel,
  siteId,
}: DialogProps & { unitId: string; unitLabel: string; siteId?: string }) {
  const today = todayIso();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (from > to) {
      toast.error('Başlangıç tarihi bitiş tarihinden sonra olamaz');
      return;
    }
    setBusy(true);
    try {
      await downloadFile(
        `/units/${unitId}/statement.pdf?from=${from}&to=${to}`,
        `ekstre-${unitLabel}.pdf`,
        siteId,
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hesap ekstresi · {unitLabel}</DialogTitle>
          <DialogDescription>
            Seçilen tarihler arasındaki borç ve ödemeler yürüyen bakiyeyle listelenir. Önceki
            hareketler devreden bakiye olarak eklenir.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Başlangıç" htmlFor="st-from">
            <Input
              id="st-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Bitiş" htmlFor="st-to">
            <Input
              id="st-to"
              type="date"
              value={to}
              max={today}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={() => void download()} disabled={busy}>
            <FileDown />
            {busy ? 'Hazırlanıyor…' : 'PDF indir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

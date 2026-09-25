import {
  DUES_INCOME_CODE,
  formatKurus,
  transactionTypeLabels,
  type TransactionDto,
} from '@apartman/shared';
import { Ban, Lock } from 'lucide-react';
import { useState } from 'react';
import { Field } from '@/components/form-field';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CancelDialog } from '@/features/dues/small-dialogs';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApiMutation, useFinanceCategories, useVendors, useWorks } from '@/lib/queries';
import { AttachmentList, AttachmentUploadButton } from './attachments';
import { transactionTitle } from './files';

const NONE = 'none';

function EditForm({ t, onDone }: { t: TransactionDto; onDone: () => void }) {
  const categories = useFinanceCategories();
  const vendors = useVendors();
  const works = useWorks();
  const [categoryId, setCategoryId] = useState(t.categoryId ?? '');
  const [vendorId, setVendorId] = useState(t.vendorId ?? '');
  const [workId, setWorkId] = useState(t.workId ?? '');
  const [description, setDescription] = useState(t.description ?? '');
  const [documentNo, setDocumentNo] = useState(t.documentNo ?? '');
  const [visible, setVisible] = useState(t.visibleToResidents);

  const save = useApiMutation(
    () =>
      apiFetch<TransactionDto>(`/transactions/${t.id}`, {
        method: 'PATCH',
        body: {
          ...(t.type === 'TRANSFER'
            ? {}
            : {
                categoryId,
                vendorId: vendorId || null,
                documentNo: documentNo.trim() || null,
                ...(t.type === 'EXPENSE'
                  ? { workId: workId || null, visibleToResidents: visible }
                  : {}),
              }),
          description: description.trim() || null,
        },
      }),
    { success: 'Kayıt güncellendi', onSuccess: onDone },
  );

  return (
    <form
      id="tx-edit-form"
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      {t.type !== 'TRANSFER' && (
        <>
          <Field label="Kategori" htmlFor="edit-category">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="edit-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(categories.data ?? [])
                  .filter((c) => c.kind === t.type && c.code !== DUES_INCOME_CODE)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Firma" htmlFor="edit-vendor">
            <Select
              value={vendorId || NONE}
              onValueChange={(v) => setVendorId(v === NONE ? '' : v)}
            >
              <SelectTrigger id="edit-vendor" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Firma yok</SelectItem>
                {(vendors.data ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {t.type === 'EXPENSE' && (
            <Field label="Yapılan iş" htmlFor="edit-work">
              <Select value={workId || NONE} onValueChange={(v) => setWorkId(v === NONE ? '' : v)}>
                <SelectTrigger id="edit-work" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>İşe bağlı değil</SelectItem>
                  {(works.data ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Fatura / belge no" htmlFor="edit-doc">
            <Input
              id="edit-doc"
              value={documentNo}
              maxLength={50}
              onChange={(e) => setDocumentNo(e.target.value)}
            />
          </Field>
        </>
      )}
      <Field label="Açıklama" htmlFor="edit-desc" className="sm:col-span-2">
        <Input
          id="edit-desc"
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {t.type === 'EXPENSE' && (
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox
            id="edit-visible"
            checked={visible}
            onCheckedChange={(v) => setVisible(v === true)}
          />
          <Label htmlFor="edit-visible" className="font-normal">
            Sakinler görebilir
          </Label>
        </div>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          Kaydet
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

export function TransactionDetailsDialog({
  transaction: t,
  onOpenChange,
}: {
  transaction: TransactionDto | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancel = useApiMutation(
    (reason: string) =>
      apiFetch<TransactionDto>(`/transactions/${t?.id}/cancel`, {
        method: 'POST',
        body: { reason },
      }),
    { success: 'Kayıt iptal edildi', onSuccess: () => setCancelling(false) },
  );
  if (!t) return null;

  const readOnly = t.locked || Boolean(t.cancelledAt) || Boolean(t.paymentId);
  const rows: [string, string | null][] = [
    ['Tarih', formatDate(t.date)],
    ['Tutar', formatKurus(t.amountKurus)],
    [t.type === 'TRANSFER' ? 'Çıkan hesap' : 'Hesap', t.accountName],
    ...(t.type === 'TRANSFER' ? [['Giren hesap', t.toAccountName] as [string, string | null]] : []),
    ['Kategori', t.categoryName],
    ['Firma', t.vendorName],
    ['Yapılan iş', t.workTitle],
    ['Makbuz no', t.receiptNo ? String(t.receiptNo) : null],
    ['Belge no', t.documentNo],
    ['Açıklama', t.description],
  ];

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) setEditing(false);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{transactionTitle(t)}</DialogTitle>
          <DialogDescription>
            {transactionTypeLabels[t.type]}
            {t.type === 'EXPENSE' &&
              (t.visibleToResidents ? ' · sakinler görebilir' : ' · sakinlerden gizli')}
          </DialogDescription>
        </DialogHeader>

        {t.cancelledAt && (
          <Alert variant="destructive">
            <AlertDescription>İptal edildi: {t.cancelReason}</AlertDescription>
          </Alert>
        )}
        {t.locked && !t.cancelledAt && (
          <Alert>
            <Lock />
            <AlertDescription>Bu ay kapatıldığı için kayıt değiştirilemez.</AlertDescription>
          </Alert>
        )}
        {t.paymentId && !t.cancelledAt && (
          <Alert>
            <AlertDescription>
              Bu kayıt aidat tahsilatından oluştu. Değiştirmek için Tahsilatlar ekranından ödemeyi
              iptal edin.
            </AlertDescription>
          </Alert>
        )}

        {editing ? (
          <EditForm t={t} onDone={() => setEditing(false)} />
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {rows
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium break-words">{value}</dd>
                </div>
              ))}
          </dl>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Belgeler</p>
            {!t.cancelledAt && t.type !== 'TRANSFER' && (
              <AttachmentUploadButton target="transaction" targetId={t.id} />
            )}
          </div>
          {t.attachments.length > 0 ? (
            <AttachmentList attachments={t.attachments} deletable={!t.locked} />
          ) : (
            <p className="text-sm text-muted-foreground">Belge eklenmemiş.</p>
          )}
        </div>

        {!readOnly && !editing && (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => setCancelling(true)}
            >
              <Ban />
              İptal et
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Düzenle
            </Button>
          </DialogFooter>
        )}
        <CancelDialog
          open={cancelling}
          onOpenChange={setCancelling}
          title="Kayıt iptal edilsin mi?"
          description={`${formatDate(t.date)} tarihli ${formatKurus(t.amountKurus)} kayıt iptal edilecek ve bakiyelerden düşülecek. Kayıt silinmez.`}
          pending={cancel.isPending}
          onConfirm={(reason) => cancel.mutate(reason)}
        />
      </DialogContent>
    </Dialog>
  );
}

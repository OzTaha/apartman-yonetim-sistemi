import { formatKurus } from '@apartman/shared';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Minus, Pencil, Paperclip, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AttachmentList, AttachmentUploadButton } from '@/features/finance/attachments';
import { TransactionDialog } from '@/features/finance/transaction-dialog';
import { TransactionDetailsDialog } from '@/features/finance/transaction-details';
import { WorkDialog } from '@/features/finance/work-dialogs';
import { WorkProgress, WorkStatusBadge } from '@/features/finance/work-parts';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApiMutation, useWork } from '@/lib/queries';

export const Route = createFileRoute('/_app/isler/$workId')({
  component: () => (
    <ManagerOnly>
      <WorkDetailPage />
    </ManagerOnly>
  ),
});

function WorkDetailPage() {
  const { workId } = Route.useParams();
  const navigate = useNavigate();
  const work = useWork(workId);
  const [dialog, setDialog] = useState<'edit' | 'pay' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const remove = useApiMutation(() => apiFetch<void>(`/works/${workId}`, { method: 'DELETE' }), {
    success: 'İş silindi',
    onSuccess: () => void navigate({ to: '/isler' }),
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/isler">
        <ArrowLeft />
        Yapılan işler
      </Link>
    </Button>
  );

  if (work.isPending) return <LoadingRows />;
  if (work.isError)
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState error={work.error} />
      </div>
    );

  const w = work.data;
  const selected = w.payments.find((p) => p.id === selectedId);
  const info: [string, string | null][] = [
    ['Firma', w.vendorName],
    ['Başlangıç', w.startDate ? formatDate(w.startDate) : null],
    ['Bitiş', w.endDate ? formatDate(w.endDate) : null],
    ['Anlaşılan tutar', w.agreedKurus ? formatKurus(w.agreedKurus) : null],
    ['Sakinler', w.visibleToResidents ? 'Görebilir' : 'Gizli'],
  ];

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={w.title}
        description={<WorkStatusBadge status={w.status} />}
        actions={
          <>
            <Button onClick={() => setDialog('pay')}>
              <Minus />
              Ödeme ekle
            </Button>
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil />
              Düzenle
            </Button>
            {w.payments.length === 0 && (
              <Button
                variant="outline"
                className="text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`"${w.title}" ve belgeleri silinsin mi?`))
                    remove.mutate(undefined);
                }}
              >
                <Trash2 />
                Sil
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-4">
          <WorkProgress work={w} />
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {info
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
          </dl>
          {w.description && <p className="text-sm whitespace-pre-line">{w.description}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Ödemeler</CardTitle>
          <span className="text-sm text-muted-foreground">Toplam {formatKurus(w.paidKurus)}</span>
        </CardHeader>
        <CardContent>
          {w.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz ödeme yok. Peşinat veya taksit ödediğinizde "Ödeme ekle" ile kaydedin.
            </p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {w.payments.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50"
                    onClick={() => setSelectedId(p.id)}
                  >
                    <span className="grid min-w-0">
                      <span className="truncate font-medium">
                        {p.description || p.categoryName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(p.date)} · {p.accountName}
                        {p.documentNo ? ` · Belge ${p.documentNo}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {p.attachments.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Paperclip className="size-3.5" />
                          {p.attachments.length}
                        </span>
                      )}
                      <span className="font-medium tabular-nums">{formatKurus(p.amountKurus)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Sözleşme, fatura ve fotoğraflar</CardTitle>
          <AttachmentUploadButton target="work" targetId={w.id} />
        </CardHeader>
        <CardContent>
          {w.attachments.length > 0 ? (
            <AttachmentList attachments={w.attachments} deletable />
          ) : (
            <p className="text-sm text-muted-foreground">
              İşe ait sözleşme, teklif veya öncesi/sonrası fotoğraflarını ekleyebilirsiniz. Ödeme
              faturaları ilgili ödemenin içine eklenir.
            </p>
          )}
        </CardContent>
      </Card>

      <WorkDialog
        open={dialog === 'edit'}
        onOpenChange={(o) => setDialog(o ? 'edit' : null)}
        work={w}
      />
      <TransactionDialog
        type="EXPENSE"
        workId={w.id}
        open={dialog === 'pay'}
        onOpenChange={(o) => setDialog(o ? 'pay' : null)}
      />
      <TransactionDetailsDialog
        transaction={selected}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
    </div>
  );
}

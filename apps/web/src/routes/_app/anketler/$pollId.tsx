import type { PollDetailDto } from '@apartman/shared';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Flag, Megaphone, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResultBars } from '@/features/polls/poll-dialog';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApiMutation, usePoll } from '@/lib/queries';

export const Route = createFileRoute('/_app/anketler/$pollId')({
  component: () => (
    <ManagerOnly>
      <PollPage />
    </ManagerOnly>
  ),
});

function PollPage() {
  const { pollId } = Route.useParams();
  const poll = usePoll(pollId);
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'close' | 'delete' | null>(null);

  const close = useApiMutation(
    () => apiFetch<PollDetailDto>(`/polls/${pollId}/close`, { method: 'POST' }),
    { success: 'Anket bitirildi', onSuccess: () => setConfirm(null) },
  );
  const share = useApiMutation(
    () => apiFetch<PollDetailDto>(`/polls/${pollId}/share`, { method: 'POST' }),
    { success: 'Sonuç duyuru olarak paylaşıldı' },
  );
  const remove = useApiMutation(() => apiFetch<void>(`/polls/${pollId}`, { method: 'DELETE' }), {
    success: 'Anket silindi',
    onSuccess: () => void navigate({ to: '/anketler' }),
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/anketler">
        <ArrowLeft />
        Anketler
      </Link>
    </Button>
  );
  if (poll.isPending) return <LoadingRows />;
  if (poll.isError)
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState error={poll.error} />
      </div>
    );
  const p = poll.data;
  const open = p.status === 'OPEN';

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={p.question}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {open ? <Badge>Devam ediyor</Badge> : <Badge variant="secondary">Bitti</Badge>}
            Bitiş {formatDate(p.endsOn)}
            {p.blockNames.length > 0 && ` · ${p.blockNames.join(', ')} Blok`}
          </span>
        }
        actions={
          <>
            {open && (
              <Button variant="outline" onClick={() => setConfirm('close')}>
                <Flag />
                Anketi bitir
              </Button>
            )}
            {!open && !p.sharedAt && (
              <Button disabled={share.isPending} onClick={() => share.mutate(undefined)}>
                <Megaphone />
                Sonucu duyuru olarak paylaş
              </Button>
            )}
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => setConfirm('delete')}
            >
              <Trash2 />
              Sil
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Sonuç</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ResultBars options={p.options} />
            <p className="text-sm text-muted-foreground">
              {p.eligibleUnits} daireden {p.votedUnits} daire oy verdi.
              {p.sharedAt && ' Sonuç duyuru olarak paylaşıldı.'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Oy verenler</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p className="text-muted-foreground">
              Hangi dairenin oy verdiğini görürsünüz; kimin neye oy verdiği gizlidir.
            </p>
            <p>
              <span className="font-semibold">Oy verdi ({p.voted.length}):</span>{' '}
              {p.voted.join(', ') || '—'}
            </p>
            <p>
              <span className="font-semibold">Henüz vermedi ({p.notVoted.length}):</span>{' '}
              {p.notVoted.join(', ') || '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'close' ? 'Anket bitirilsin mi?' : 'Anket silinsin mi?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'close'
                ? 'Bitirince kimse oy veremez ve oyunu değiştiremez. Sonra sonucu duyuru olarak paylaşabilirsiniz.'
                : 'Anket ve verilen tüm oylar kalıcı olarak silinir. Paylaşılmış sonuç duyurusu silinmez.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirm === 'delete'
                  ? 'bg-destructive text-white hover:bg-destructive/90'
                  : undefined
              }
              disabled={close.isPending || remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirm === 'close') close.mutate(undefined);
                else remove.mutate(undefined);
              }}
            >
              {confirm === 'close' ? 'Evet, bitir' : 'Evet, sil'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

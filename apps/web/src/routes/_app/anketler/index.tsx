import type { ResidentPollDto } from '@apartman/shared';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CircleCheck, Plus, Vote } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PollDialog, ResultBars } from '@/features/polls/poll-dialog';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApiMutation, useMyPolls, usePolls } from '@/lib/queries';
import { canManage, useRole } from '@/lib/session';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/anketler/')({
  component: PollsPage,
});

function PollsPage() {
  return canManage(useRole()) ? <ManagerPolls /> : <ResidentPolls />;
}

function StatusBadge({ status }: { status: 'OPEN' | 'CLOSED' }) {
  return status === 'OPEN' ? <Badge>Devam ediyor</Badge> : <Badge variant="secondary">Bitti</Badge>;
}

function ManagerPolls() {
  const polls = usePolls();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Anketler"
        description="Sakinlere soru sorun, sonucu duyuru olarak paylaşın."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Yeni anket
          </Button>
        }
      />
      {polls.isPending ? (
        <LoadingRows />
      ) : polls.isError ? (
        <ErrorState error={polls.error} />
      ) : polls.data.length === 0 ? (
        <EmptyState
          icon={Vote}
          title="Henüz anket yok"
          description="Genel kurul öncesi fikir almak veya bir konuda sakinlerin görüşünü öğrenmek için anket açın."
          action={
            <Button size="lg" onClick={() => setCreating(true)}>
              <Plus />
              İlk anketi aç
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {polls.data.map((p) => (
            <Link key={p.id} to="/anketler/$pollId" params={{ pollId: p.id }} className="block">
              <Card className="py-4 transition-colors hover:bg-muted/50">
                <CardContent className="grid gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-semibold break-words">{p.question}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {p.votedUnits} / {p.eligibleUnits} daire oy verdi · Bitiş {formatDate(p.endsOn)}
                    {p.blockNames.length > 0 && ` · ${p.blockNames.join(', ')} Blok`}
                    {p.sharedAt && ' · Sonuç paylaşıldı'}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <PollDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(p) => void navigate({ to: '/anketler/$pollId', params: { pollId: p.id } })}
      />
    </div>
  );
}

function ResidentPoll({ poll }: { poll: ResidentPollDto }) {
  const [unitId, setUnitId] = useState(poll.units[0]!.unitId);
  const unit = poll.units.find((u) => u.unitId === unitId) ?? poll.units[0]!;
  const [choice, setChoice] = useState<string | null>(unit.optionId);
  const [changing, setChanging] = useState(false);
  const vote = useApiMutation(
    (optionId: string) =>
      apiFetch<ResidentPollDto>(`/polls/${poll.id}/vote`, {
        method: 'POST',
        body: { unitId: unit.unitId, optionId },
      }),
    { success: 'Oyunuz kaydedildi', onSuccess: () => setChanging(false) },
  );
  const open = poll.status === 'OPEN';
  const showResults = poll.totalVotes !== null && (!open || (unit.optionId && !changing));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="leading-snug">{poll.question}</CardTitle>
          <StatusBadge status={poll.status} />
        </div>
        <CardDescription>
          {open
            ? `Son gün ${formatDate(poll.endsOn)}`
            : `${formatDate(poll.endsOn)} tarihinde bitti`}
          {poll.totalVotes !== null && ` · ${poll.totalVotes} daire oy verdi`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {poll.units.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Daire">
            {poll.units.map((u) => (
              <Button
                key={u.unitId}
                size="sm"
                variant={u.unitId === unitId ? 'default' : 'outline'}
                onClick={() => {
                  setUnitId(u.unitId);
                  setChoice(u.optionId);
                  setChanging(false);
                }}
              >
                {u.label}
              </Button>
            ))}
          </div>
        )}
        {showResults ? (
          <>
            <ResultBars
              options={poll.options.map((o) => ({ ...o, votes: o.votes ?? 0 }))}
              highlight={unit.optionId}
            />
            {open && (
              <Button variant="outline" className="w-fit" onClick={() => setChanging(true)}>
                Oyumu değiştir
              </Button>
            )}
          </>
        ) : open ? (
          <>
            <div className="grid gap-2" role="radiogroup" aria-label="Seçenekler">
              {poll.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={choice === o.id}
                  onClick={() => setChoice(o.id)}
                  className={cn(
                    'flex min-h-12 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left font-semibold transition-colors',
                    choice === o.id ? 'border-primary bg-secondary' : 'hover:bg-accent',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                      choice === o.id ? 'border-primary' : 'border-input',
                    )}
                  >
                    {choice === o.id && <span className="size-2.5 rounded-full bg-primary" />}
                  </span>
                  {o.label}
                </button>
              ))}
            </div>
            <Button
              size="lg"
              className="w-fit"
              disabled={!choice || vote.isPending}
              onClick={() => choice && vote.mutate(choice)}
            >
              <CircleCheck />
              Oyumu ver
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Bu ankete oy verilmedi.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ResidentPolls() {
  const polls = useMyPolls();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Anketler"
        description="Yönetimin sorduğu sorulara dairenizin oyunu verin."
      />
      {polls.isPending ? (
        <LoadingRows />
      ) : polls.isError ? (
        <ErrorState error={polls.error} />
      ) : polls.data.length === 0 ? (
        <EmptyState
          icon={Vote}
          title="Şu an anket yok"
          description="Yönetim bir anket açtığında burada görürsünüz ve telefonunuza bildirim gelir."
        />
      ) : (
        <div className="grid gap-4">
          {polls.data.map((p) => (
            <ResidentPoll key={p.id} poll={p} />
          ))}
        </div>
      )}
    </div>
  );
}

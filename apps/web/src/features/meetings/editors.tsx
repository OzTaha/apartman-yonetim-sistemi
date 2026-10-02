import {
  attendanceStatusLabels,
  decisionResultLabels,
  meetingQuorum,
  type AttendanceStatus,
  type DecisionResult,
  type MeetingDetailDto,
  type MeetingItemDto,
  type QuorumDto,
} from '@apartman/shared';
import { CircleCheck, CircleX, Save } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { useApiMutation } from '@/lib/queries';
import { labelUnit } from '@/lib/unit-label';
import { cn } from '@/lib/utils';
import { DecisionBadge } from './parts';

function Check({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <li className="flex items-center gap-1.5">
      <Icon
        className={cn(
          'size-4 shrink-0',
          ok ? 'text-emerald-600' : 'text-red-600 dark:text-red-400',
        )}
      />
      {label}
    </li>
  );
}

export function QuorumSummary({ quorum }: { quorum: QuorumDto }) {
  return (
    <div className="grid gap-2 rounded-md bg-muted p-3 text-sm">
      <p>
        <span className="font-semibold tabular-nums">
          {quorum.presentUnits} / {quorum.totalUnits}
        </span>{' '}
        bağımsız bölüm temsil ediliyor
        {quorum.proxyUnits > 0 && ` (${quorum.proxyUnits} vekaleten)`}
        {quorum.totalLandShare !== null &&
          ` · arsa payı ${quorum.presentLandShare} / ${quorum.totalLandShare}`}
      </p>
      <ul className="grid gap-1">
        <Check ok={quorum.unitsMajority} label="Bağımsız bölüm sayısının yarısından fazlası" />
        {quorum.landShareMajority !== null && (
          <Check ok={quorum.landShareMajority} label="Arsa payının yarısından fazlası" />
        )}
      </ul>
      {quorum.missingLandShareUnits > 0 && quorum.missingLandShareUnits < quorum.totalUnits && (
        <p className="text-muted-foreground">
          {quorum.missingLandShareUnits} dairenin arsa payı girilmemiş. Arsa payı, sakin
          bilgilerinde ev sahibi (malik) için girilir. Hepsi girildiğinde yeter sayı arsa payına
          göre de kontrol edilir.
        </p>
      )}
      <p
        className={cn(
          'font-medium',
          quorum.reached
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-red-700 dark:text-red-400',
        )}
      >
        {quorum.reached
          ? 'Birinci toplantı için yeter sayı sağlandı.'
          : 'Birinci toplantı için yeter sayı yok; ikinci toplantıda katılanlarla karar alınabilir.'}
      </p>
    </div>
  );
}

interface Entry {
  status: AttendanceStatus;
  name: string;
}

export function AttendanceEditor({ meeting }: { meeting: MeetingDetailDto }) {
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      meeting.attendance.map((a) => [a.unitId, { status: a.status, name: a.name ?? '' }]),
    ),
  );
  const [dirty, setDirty] = useState(false);
  const quorum = meetingQuorum(
    meeting.attendance.map((a) => ({ landShare: a.landShare, status: entries[a.unitId]!.status })),
  );
  const save = useApiMutation(
    () =>
      apiFetch<MeetingDetailDto>(`/meetings/${meeting.id}/attendance`, {
        method: 'PUT',
        body: {
          entries: Object.entries(entries).map(([unitId, e]) => ({
            unitId,
            status: e.status,
            name: e.status === 'ABSENT' ? undefined : e.name.trim() || undefined,
          })),
        },
      }),
    { success: 'Hazirun kaydedildi', onSuccess: () => setDirty(false) },
  );
  const update = (unitId: string, patch: Partial<Entry>) => {
    setEntries((all) => ({ ...all, [unitId]: { ...all[unitId]!, ...patch } }));
    setDirty(true);
  };

  return (
    <div className="grid gap-4">
      <QuorumSummary quorum={quorum} />
      <ul className="grid gap-2">
        {meeting.attendance.map((a) => {
          const e = entries[a.unitId]!;
          const label = labelUnit(a.blockName, a.unitNumber, 'short');
          return (
            <li
              key={a.unitId}
              className="grid gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)] sm:items-center"
            >
              <span className="min-w-0 text-sm">
                <span className="font-medium">{label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {a.owners || 'Malik kaydı yok'}
                  {a.landShare != null && ` · arsa payı ${a.landShare}`}
                </span>
              </span>
              <Select
                value={e.status}
                onValueChange={(v) => update(a.unitId, { status: v as AttendanceStatus })}
              >
                <SelectTrigger className="w-full" aria-label={`${label} katılım`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(attendanceStatusLabels) as AttendanceStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {attendanceStatusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {e.status === 'ABSENT' ? (
                <span className="hidden sm:block" />
              ) : (
                <Input
                  aria-label={`${label} ${e.status === 'PROXY' ? 'vekilin adı' : 'katılan kişi'}`}
                  placeholder={e.status === 'PROXY' ? 'Vekilin adı' : a.owners || 'Katılan kişi'}
                  maxLength={120}
                  value={e.name}
                  onChange={(ev) => update(a.unitId, { name: ev.target.value })}
                />
              )}
            </li>
          );
        })}
      </ul>
      <Button
        className="w-fit"
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate(undefined)}
      >
        <Save />
        Hazirunu kaydet
      </Button>
    </div>
  );
}

function votesText(item: MeetingItemDto): string | null {
  if (item.votesFor == null && item.votesAgainst == null && item.votesAbstain == null) return null;
  return `Kabul ${item.votesFor ?? 0} · Ret ${item.votesAgainst ?? 0} · Çekimser ${item.votesAbstain ?? 0}`;
}

export function DecisionView({ item }: { item: MeetingItemDto }) {
  if (!item.result) {
    return <p className="text-sm text-muted-foreground">Karar yazılmadı.</p>;
  }
  const votes = votesText(item);
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="flex flex-wrap items-center gap-2">
        <DecisionBadge result={item.result} />
        {item.decisionNo && <span className="font-medium">Karar no {item.decisionNo}</span>}
      </span>
      <p className="whitespace-pre-line break-words">{item.resolution}</p>
      {votes && <p className="text-xs text-muted-foreground">{votes}</p>}
    </div>
  );
}

const toVote = (v: string) => (v.trim() === '' ? null : Number(v));

export function DecisionEditor({ meetingId, item }: { meetingId: string; item: MeetingItemDto }) {
  const [result, setResult] = useState<DecisionResult | ''>(item.result ?? '');
  const [resolution, setResolution] = useState(item.resolution ?? '');
  const [votes, setVotes] = useState({
    for: item.votesFor?.toString() ?? '',
    against: item.votesAgainst?.toString() ?? '',
    abstain: item.votesAbstain?.toString() ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const save = useApiMutation(
    () =>
      apiFetch<MeetingDetailDto>(`/meetings/${meetingId}/items/${item.id}/decision`, {
        method: 'PUT',
        body: {
          result,
          resolution: resolution.trim(),
          ...(result === 'INFO'
            ? {}
            : {
                votesFor: toVote(votes.for),
                votesAgainst: toVote(votes.against),
                votesAbstain: toVote(votes.abstain),
              }),
        },
      }),
    { success: `${item.position}. madde kaydedildi` },
  );
  const submit = () => {
    if (!result) return setError('Sonucu seçin');
    if (resolution.trim().length < 3) return setError('Karar metnini yazın');
    const bad = Object.values(votes).some((v) => v.trim() !== '' && !/^\d+$/.test(v.trim()));
    if (result !== 'INFO' && bad) return setError('Oy sayıları tam sayı olmalıdır');
    setError(null);
    save.mutate(undefined);
  };

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
        <Select value={result} onValueChange={(v) => setResult(v as DecisionResult)}>
          <SelectTrigger className="w-full" aria-label={`${item.position}. madde sonucu`}>
            <SelectValue placeholder="Sonuç seçin" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(decisionResultLabels) as DecisionResult[]).map((r) => (
              <SelectItem key={r} value={r}>
                {decisionResultLabels[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {result && result !== 'INFO' && (
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['for', 'Kabul'],
                ['against', 'Ret'],
                ['abstain', 'Çekimser'],
              ] as const
            ).map(([key, label]) => (
              <Input
                key={key}
                inputMode="numeric"
                placeholder={label}
                aria-label={`${item.position}. madde ${label.toLocaleLowerCase('tr')} oyu`}
                value={votes[key]}
                onChange={(e) => setVotes((v) => ({ ...v, [key]: e.target.value }))}
              />
            ))}
          </div>
        )}
      </div>
      <Textarea
        aria-label={`${item.position}. madde karar metni`}
        placeholder="Karar metni (ör. İşletme projesi oy birliğiyle aynen kabul edildi.)"
        rows={3}
        maxLength={5000}
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={save.isPending}
        onClick={submit}
      >
        <Save />
        Kararı kaydet
      </Button>
    </div>
  );
}

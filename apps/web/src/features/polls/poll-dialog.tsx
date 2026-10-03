import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  pollCreateSchema,
  type PollDetailDto,
} from '@apartman/shared';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Field } from '@/components/form-field';
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
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { useApiMutation, useScopeBlocks } from '@/lib/queries';

function inDays(days: number): string {
  const d = new Date(`${todayIso()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function PollDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (poll: PollDetailDto) => void;
}) {
  const blocks = useScopeBlocks();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['Evet', 'Hayır']);
  const [endsOn, setEndsOn] = useState(() => inDays(7));
  const [blockIds, setBlockIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setQuestion('');
    setOptions(['Evet', 'Hayır']);
    setEndsOn(inDays(7));
    setBlockIds([]);
    setErrors({});
  };

  const create = useApiMutation(
    (body: unknown) => apiFetch<PollDetailDto>('/polls', { method: 'POST', body }),
    {
      success: 'Anket yayınlandı',
      onSuccess: (poll) => {
        reset();
        onOpenChange(false);
        onCreated(poll);
      },
    },
  );

  const submit = () => {
    const body = {
      question,
      options: options.map((o) => o.trim()).filter(Boolean),
      endsOn,
      audience: blockIds.length > 0 ? 'BLOCKS' : 'ALL',
      blockIds,
    };
    const parsed = pollCreateSchema.safeParse(body);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        next[key] ??= issue.message;
      }
      return setErrors(next);
    }
    setErrors({});
    create.mutate(parsed.data);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Yeni anket</DialogTitle>
          <DialogDescription>
            Sakinlere bir soru sorun. Her daire bir oy verir; oyunu bitiş tarihine kadar
            değiştirebilir.
          </DialogDescription>
        </DialogHeader>
        <Field label="Soru" htmlFor="poll-question" required error={errors['question']}>
          <Textarea
            id="poll-question"
            rows={2}
            maxLength={300}
            placeholder="Örneğin: Bahçeye çocuk oyun alanı yapılsın mı?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </Field>
        <div className="grid gap-2">
          <Label>Seçenekler</Label>
          {options.map((value, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={`${i + 1}. seçenek`}
                maxLength={120}
                value={value}
                onChange={(e) =>
                  setOptions((all) => all.map((o, j) => (j === i ? e.target.value : o)))
                }
              />
              {options.length > POLL_MIN_OPTIONS && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${i + 1}. seçeneği kaldır`}
                  onClick={() => setOptions((all) => all.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              )}
            </div>
          ))}
          {errors['options'] && (
            <p className="text-sm text-destructive" role="alert">
              {errors['options']}
            </p>
          )}
          {options.length < POLL_MAX_OPTIONS && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setOptions((all) => [...all, ''])}
            >
              <Plus />
              Seçenek ekle
            </Button>
          )}
        </div>
        <Field
          label="Bitiş tarihi"
          htmlFor="poll-ends"
          required
          error={errors['endsOn']}
          hint="Bu günün sonunda oylama kapanır."
        >
          <Input
            id="poll-ends"
            type="date"
            min={todayIso()}
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </Field>
        {blocks.length > 0 && (
          <div className="grid gap-2">
            <Label>Kimler oy versin</Label>
            <p className="text-sm text-muted-foreground">
              Hiçbir blok seçmezseniz tüm site oy verir.
            </p>
            <div className="flex flex-wrap gap-3">
              {blocks.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={blockIds.includes(b.id)}
                    onCheckedChange={(v) =>
                      setBlockIds((all) =>
                        v === true ? [...all, b.id] : all.filter((id) => id !== b.id),
                      )
                    }
                  />
                  {b.name} Blok
                </label>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button disabled={create.isPending} onClick={submit}>
            Anketi yayınla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResultBars({
  options,
  highlight,
}: {
  options: { id: string; label: string; votes: number }[];
  highlight?: string | null;
}) {
  const total = options.reduce((sum, o) => sum + o.votes, 0);
  return (
    <ul className="grid gap-3">
      {options.map((o) => {
        const pct = total === 0 ? 0 : Math.round((o.votes / total) * 100);
        return (
          <li key={o.id} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={highlight === o.id ? 'font-semibold' : undefined}>
                {o.label}
                {highlight === o.id && ' (sizin oyunuz)'}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {o.votes} oy · %{pct}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

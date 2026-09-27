import {
  DEFAULT_ORDINARY_AGENDA,
  LOCAL_DATE_TIME,
  MEETING_MAX_ITEMS,
  SECOND_MEETING_GAP_DAYS,
  meetingKindLabels,
  periodLabel,
  type MeetingDetailDto,
  type MeetingKind,
} from '@apartman/shared';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { useApiMutation, useBudgets } from '@/lib/queries';
import { plusDays } from './format';

interface ItemRow {
  key: number;
  id?: string;
  title: string;
  budgetId: string;
}

let nextKey = 0;
const row = (r: Partial<ItemRow> = {}): ItemRow => ({
  key: nextKey++,
  title: '',
  budgetId: '',
  ...r,
});
const NO_BUDGET = 'none';

export function MeetingDialog({
  meeting,
  onOpenChange,
  onSaved,
}: {
  meeting?: MeetingDetailDto;
  onOpenChange: (open: boolean) => void;
  onSaved?: (meeting: MeetingDetailDto) => void;
}) {
  const budgets = useBudgets();
  const [kind, setKind] = useState<MeetingKind>(meeting?.kind ?? 'ORDINARY');
  const [startsAt, setStartsAt] = useState(meeting?.startsAt ?? '');
  const [secondStartsAt, setSecondStartsAt] = useState(meeting?.secondStartsAt ?? '');
  const [location, setLocation] = useState(meeting?.location ?? '');
  const [notes, setNotes] = useState(meeting?.notes ?? '');
  const [items, setItems] = useState<ItemRow[]>(() =>
    meeting
      ? meeting.items.map((i) => row({ id: i.id, title: i.title, budgetId: i.budgetId ?? '' }))
      : DEFAULT_ORDINARY_AGENDA.map((title) => row({ title })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useApiMutation(
    () => {
      const body = {
        kind,
        startsAt,
        secondStartsAt: secondStartsAt || null,
        location: location.trim(),
        notes: notes.trim() || undefined,
        items: items
          .filter((i) => i.title.trim())
          .map((i) => ({ id: i.id, title: i.title.trim(), budgetId: i.budgetId || null })),
      };
      return meeting
        ? apiFetch<MeetingDetailDto>(`/meetings/${meeting.id}`, { method: 'PUT', body })
        : apiFetch<MeetingDetailDto>('/meetings', { method: 'POST', body });
    },
    {
      success: meeting ? 'Toplantı güncellendi' : 'Toplantı oluşturuldu',
      onSuccess: (m) => {
        onOpenChange(false);
        onSaved?.(m);
      },
    },
  );

  const submit = () => {
    const found: Record<string, string> = {};
    if (!LOCAL_DATE_TIME.test(startsAt)) found['startsAt'] = 'Tarih ve saat seçin';
    if (secondStartsAt && secondStartsAt <= startsAt) {
      found['secondStartsAt'] = 'İkinci toplantı birinciden sonra olmalıdır';
    }
    if (location.trim().length < 2) found['location'] = 'Toplantı yerini yazın';
    if (!items.some((i) => i.title.trim())) found['items'] = 'En az bir gündem maddesi ekleyin';
    setErrors(found);
    if (Object.keys(found).length === 0) mutation.mutate(undefined);
  };

  const move = (index: number, delta: number) =>
    setItems((list) => {
      const next = [...list];
      const [moved] = next.splice(index, 1);
      next.splice(index + delta, 0, moved!);
      return next;
    });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {meeting ? 'Toplantıyı düzenle' : 'Genel kurul toplantısı planla'}
          </DialogTitle>
          <DialogDescription>
            Çağrı toplantıdan en az 15 gün önce yapılmalıdır. İlk toplantıda yeter sayı sağlanamazsa
            ikinci toplantı genellikle 7 gün sonraya konur.
          </DialogDescription>
        </DialogHeader>
        <form
          id="meeting-form"
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Toplantı türü" htmlFor="meeting-kind" className="sm:col-span-2">
            <Select
              value={kind}
              onValueChange={(v) => {
                const next = v as MeetingKind;
                const untouched =
                  !meeting &&
                  items.map((i) => i.title).join('|') === DEFAULT_ORDINARY_AGENDA.join('|');
                if (untouched && next === 'EXTRAORDINARY') {
                  setItems([row({ title: DEFAULT_ORDINARY_AGENDA[0] }), row()]);
                }
                setKind(next);
              }}
            >
              <SelectTrigger id="meeting-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(meetingKindLabels) as MeetingKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {meetingKindLabels[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tarih ve saat" htmlFor="meeting-starts" required error={errors['startsAt']}>
            <Input
              id="meeting-starts"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => {
                const value = e.target.value;
                if (!secondStartsAt && LOCAL_DATE_TIME.test(value)) {
                  setSecondStartsAt(plusDays(value, SECOND_MEETING_GAP_DAYS));
                }
                setStartsAt(value);
              }}
            />
          </Field>
          <Field
            label="İkinci toplantı"
            htmlFor="meeting-second"
            error={errors['secondStartsAt']}
            hint="Yeter sayı sağlanamazsa"
          >
            <Input
              id="meeting-second"
              type="datetime-local"
              value={secondStartsAt}
              onChange={(e) => setSecondStartsAt(e.target.value)}
            />
          </Field>
          <Field
            label="Yer"
            htmlFor="meeting-location"
            required
            error={errors['location']}
            className="sm:col-span-2"
          >
            <Input
              id="meeting-location"
              placeholder="Örn. Site sosyal tesis salonu"
              maxLength={200}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
          <div className="grid gap-2 sm:col-span-2">
            <span className="text-sm font-medium">Gündem</span>
            {items.map((item, i) => (
              <div key={item.key} className="grid gap-2 rounded-md border p-2">
                <div className="flex items-center gap-1">
                  <span className="w-6 shrink-0 text-sm text-muted-foreground tabular-nums">
                    {i + 1}.
                  </span>
                  <Input
                    aria-label={`${i + 1}. gündem maddesi`}
                    maxLength={300}
                    value={item.title}
                    onChange={(e) =>
                      setItems((list) =>
                        list.map((x) => (x.key === item.key ? { ...x, title: e.target.value } : x)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${i + 1}. maddeyi yukarı taşı`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${i + 1}. maddeyi aşağı taşı`}
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${i + 1}. maddeyi kaldır`}
                    onClick={() => setItems((list) => list.filter((x) => x.key !== item.key))}
                  >
                    <X />
                  </Button>
                </div>
                {(budgets.data?.length ?? 0) > 0 && (
                  <Select
                    value={item.budgetId || NO_BUDGET}
                    onValueChange={(v) =>
                      setItems((list) =>
                        list.map((x) =>
                          x.key === item.key ? { ...x, budgetId: v === NO_BUDGET ? '' : v } : x,
                        ),
                      )
                    }
                  >
                    <SelectTrigger
                      className="h-8 w-full text-xs"
                      aria-label={`${i + 1}. maddeye bağlı bütçe`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_BUDGET}>Bütçe bağlı değil</SelectItem>
                      {budgets.data!.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          İşletme projesi: {periodLabel(b.startPeriod)} – {periodLabel(b.endPeriod)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
            {errors['items'] && (
              <p className="text-sm text-destructive" role="alert">
                {errors['items']}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={items.length >= MEETING_MAX_ITEMS}
              onClick={() => setItems((list) => [...list, row()])}
            >
              <Plus />
              Madde ekle
            </Button>
            <p className="text-xs text-muted-foreground">
              İşletme projesinin görüşüleceği maddeyi bütçeye bağlarsanız, madde kabul edildiğinde
              bütçe "genel kurulda onaylandı" olarak işaretlenir.
            </p>
          </div>
          <Field label="Not" htmlFor="meeting-notes" className="sm:col-span-2">
            <Textarea
              id="meeting-notes"
              rows={2}
              maxLength={1000}
              placeholder="Çağrı duyurusuna eklenir (isteğe bağlı)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="submit" form="meeting-form" disabled={mutation.isPending}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import type { MyDoorDto, MyOccupancyDto } from '@apartman/shared';
import { Package, Trash2, UserPlus, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Field } from '@/components/form-field';
import { InfoTip } from '@/components/info-tip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { formatDate, todayIso } from '@/lib/format';
import { useApiMutation, useMyDoor } from '@/lib/queries';
import { unitLabel } from '@apartman/shared';

const time = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Istanbul',
});

export function MyDoorCard({ occupancies }: { occupancies: MyOccupancyDto[] }) {
  const door = useMyDoor();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [day, setDay] = useState(todayIso);
  const [unitId, setUnitId] = useState(occupancies[0]?.unitId ?? '');
  const add = useApiMutation(
    () =>
      apiFetch<MyDoorDto>('/door/mine/visitors', {
        method: 'POST',
        body: { unitId, name, expectedOn: day },
      }),
    {
      success: 'Misafiriniz kapıya bildirildi',
      onSuccess: () => {
        setAdding(false);
        setName('');
        setDay(todayIso());
      },
    },
  );
  const remove = useApiMutation(
    (id: string) => apiFetch<MyDoorDto>(`/door/mine/visitors/${id}`, { method: 'DELETE' }),
    { success: 'Misafir kaydı silindi' },
  );
  if (!door.data) return null;
  const { packages, visitors } = door.data;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CardTitle>Kargo ve misafir</CardTitle>
          <InfoTip title="Kargo ve misafir" className="text-primary">
            <p>
              Kapı görevlisi kargonuzu teslim aldığında burada görünür ve telefonunuza bildirim
              gelir.
            </p>
            <p>
              Bir misafir bekliyorsanız "Misafir bekliyorum" ile adını ve gününü yazın. Görevli
              misafirinizi tanır ve geldiğinde size haber verilir.
            </p>
          </InfoTip>
        </div>
        <Button variant="outline" onClick={() => setAdding(true)}>
          <UserPlus />
          Misafir bekliyorum
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3">
        {packages.length === 0 && visitors.length === 0 && (
          <p className="text-muted-foreground">Bekleyen kargonuz veya misafiriniz yok.</p>
        )}
        {packages.map((p) => (
          <p key={p.id} className="flex items-center gap-2">
            <Package className="size-5 shrink-0 text-primary" />
            <span>
              <span className="font-semibold">Kargonuz kapıda bekliyor</span>
              <span className="text-sm text-muted-foreground">
                {' '}
                · {[p.carrier, time.format(new Date(p.receivedAt))].filter(Boolean).join(' · ')}
              </span>
            </span>
          </p>
        ))}
        {visitors.map((v) => (
          <div key={v.id} className="flex items-center gap-2">
            <UserRound className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{v.name}</span>
              <span className="text-sm text-muted-foreground">
                {' '}
                ·{' '}
                {v.arrivedAt
                  ? `geldi ${time.format(new Date(v.arrivedAt))}`
                  : `bekleniyor ${formatDate(v.expectedOn)}`}
              </span>
            </span>
            {!v.arrivedAt && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${v.name} kaydını sil`}
                onClick={() => remove.mutate(v.id)}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Misafir bekliyorum</DialogTitle>
            <DialogDescription>
              Kapı görevlisi listede misafirinizi görür; geldiğinde telefonunuza bildirim gelir.
            </DialogDescription>
          </DialogHeader>
          <Field label="Misafirin adı" htmlFor="my-visitor-name" required>
            <Input
              id="my-visitor-name"
              maxLength={80}
              placeholder="Örneğin: Ahmet Bey"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Hangi gün" htmlFor="my-visitor-day" required>
            <Input
              id="my-visitor-day"
              type="date"
              min={todayIso()}
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </Field>
          {occupancies.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {occupancies.map((o) => (
                <Button
                  key={o.unitId}
                  size="sm"
                  variant={unitId === o.unitId ? 'default' : 'outline'}
                  onClick={() => setUnitId(o.unitId)}
                >
                  {unitLabel(o.siteKind, o.blockName, o.unitNumber)}
                </Button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Vazgeç
            </Button>
            <Button
              disabled={name.trim().length < 2 || !day || add.isPending}
              onClick={() => add.mutate(undefined)}
            >
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

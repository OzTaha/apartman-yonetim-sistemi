import type { DoorOverviewDto, PackageDto, VisitorDto } from '@apartman/shared';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { Package, PackageCheck, UserCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Field } from '@/components/form-field';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
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
import { UnitPicker } from '@/features/door/unit-picker';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApiMutation, useDoor, useDoorUnits } from '@/lib/queries';
import { canManage, useRole } from '@/lib/session';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/kapi')({
  component: DoorGuard,
});

const CARRIERS = [
  'Yurtiçi',
  'Aras',
  'MNG',
  'PTT',
  'Sürat',
  'Trendyol Express',
  'HepsiJet',
  'Diğer',
];

const time = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Istanbul',
});

function DoorGuard() {
  const role = useRole();
  if (!(canManage(role) || role === 'BLOCK_MANAGER' || role === 'STAFF')) {
    return <Navigate to="/" replace />;
  }
  return <DoorPage />;
}

function PackageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const units = useDoorUnits();
  const [unitId, setUnitId] = useState<string | null>(null);
  const [carrier, setCarrier] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const close = () => {
    setUnitId(null);
    setCarrier(null);
    setNote('');
    onOpenChange(false);
  };
  const save = useApiMutation(
    () =>
      apiFetch<DoorOverviewDto>('/door/packages', {
        method: 'POST',
        body: { unitId, carrier: carrier ?? undefined, note: note || undefined },
      }),
    { success: 'Kargo kaydedildi, sakine bildirim gönderildi', onSuccess: close },
  );
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kargo geldi</DialogTitle>
          <DialogDescription>
            Kargonun hangi daireye geldiğini seçin. Dairede oturanların telefonuna "Kargonuz geldi"
            bildirimi gider.
          </DialogDescription>
        </DialogHeader>
        <UnitPicker units={units.data ?? []} value={unitId} onChange={setUnitId} />
        <div className="grid gap-2">
          <span className="text-sm font-semibold">Kargo firması (isteğe bağlı)</span>
          <div className="flex flex-wrap gap-2">
            {CARRIERS.map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={carrier === c ? 'default' : 'outline'}
                onClick={() => setCarrier(carrier === c ? null : c)}
              >
                {c}
              </Button>
            ))}
          </div>
        </div>
        <Field label="Not (isteğe bağlı)" htmlFor="pkg-note">
          <Input
            id="pkg-note"
            maxLength={200}
            placeholder="Örneğin: büyük koli"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Vazgeç
          </Button>
          <Button
            size="lg"
            disabled={!unitId || save.isPending}
            onClick={() => save.mutate(undefined)}
          >
            <Package />
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VisitorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const units = useDoorUnits();
  const [unitId, setUnitId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const close = () => {
    setUnitId(null);
    setName('');
    setPlate('');
    onOpenChange(false);
  };
  const save = useApiMutation(
    () =>
      apiFetch<DoorOverviewDto>('/door/visitors', {
        method: 'POST',
        body: { unitId, name, plate: plate || undefined },
      }),
    { success: 'Misafir girişi kaydedildi', onSuccess: close },
  );
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Misafir geldi</DialogTitle>
          <DialogDescription>
            Misafirin adını ve hangi daireye geldiğini yazın. Dairede oturanlara bildirim gider.
          </DialogDescription>
        </DialogHeader>
        <Field label="Misafirin adı" htmlFor="visitor-name" required>
          <Input
            id="visitor-name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <UnitPicker units={units.data ?? []} value={unitId} onChange={setUnitId} />
        <Field label="Araç plakası (isteğe bağlı)" htmlFor="visitor-plate">
          <Input
            id="visitor-plate"
            maxLength={15}
            value={plate}
            onChange={(e) => setPlate(e.target.value.toLocaleUpperCase('tr'))}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Vazgeç
          </Button>
          <Button
            size="lg"
            disabled={!unitId || name.trim().length < 2 || save.isPending}
            onClick={() => save.mutate(undefined)}
          >
            <UserCheck />
            Girişi kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliverDialog({ pkg, onClose }: { pkg: PackageDto | null; onClose: () => void }) {
  const [to, setTo] = useState('');
  const deliver = useApiMutation(
    () =>
      apiFetch<DoorOverviewDto>(`/door/packages/${pkg!.id}/deliver`, {
        method: 'POST',
        body: { deliveredTo: to || undefined },
      }),
    {
      success: 'Teslim edildi',
      onSuccess: () => {
        setTo('');
        onClose();
      },
    },
  );
  return (
    <Dialog open={pkg !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kargoyu teslim et</DialogTitle>
          <DialogDescription>
            {pkg && `${pkg.unitLabel}${pkg.carrier ? ` · ${pkg.carrier}` : ''}`}
          </DialogDescription>
        </DialogHeader>
        <Field label="Kime teslim edildi? (isteğe bağlı)" htmlFor="deliver-to">
          <Input
            id="deliver-to"
            maxLength={80}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Vazgeç
          </Button>
          <Button size="lg" disabled={deliver.isPending} onClick={() => deliver.mutate(undefined)}>
            <PackageCheck />
            Teslim edildi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VisitorRow({ v, action }: { v: VisitorDto; action?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <UserRound className="size-5 shrink-0 text-primary" />
      <span className="grid min-w-0 flex-1">
        <span className="font-semibold">{v.name}</span>
        <span className="text-sm text-muted-foreground">
          {v.unitLabel}
          {v.arrivedAt
            ? ` · geldi ${time.format(new Date(v.arrivedAt))}`
            : v.expectedOn && ` · bekleniyor ${formatDate(v.expectedOn)}`}
          {v.plate && ` · ${v.plate}`}
          {v.createdByResident && !v.arrivedAt && ' · sakin bildirdi'}
        </span>
      </span>
      {action}
    </li>
  );
}

function DoorPage() {
  const door = useDoor();
  const [dialog, setDialog] = useState<'package' | 'visitor' | null>(null);
  const [delivering, setDelivering] = useState<PackageDto | null>(null);
  const arrive = useApiMutation(
    (id: string) => apiFetch<DoorOverviewDto>(`/door/visitors/${id}/arrive`, { method: 'POST' }),
    { success: 'Misafirin geldiği kaydedildi' },
  );

  return (
    <div className="grid gap-5">
      <PageHeader title="Kapı" description="Gelen kargoları ve misafirleri kaydedin." />
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setDialog('package')}
          className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-primary p-4 text-lg font-semibold text-primary-foreground active:scale-[0.98]"
        >
          <Package className="size-8" />
          Kargo geldi
        </button>
        <button
          type="button"
          onClick={() => setDialog('visitor')}
          className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-highlight p-4 text-lg font-semibold text-highlight-foreground active:scale-[0.98]"
        >
          <UserCheck className="size-8" />
          Misafir geldi
        </button>
      </div>

      {door.isPending ? (
        <LoadingRows />
      ) : door.isError ? (
        <ErrorState error={door.error} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Bekleyen kargolar ({door.data.waitingPackages.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {door.data.waitingPackages.length === 0 ? (
                <p className="text-muted-foreground">Teslim edilmeyi bekleyen kargo yok.</p>
              ) : (
                <ul className="divide-y">
                  {door.data.waitingPackages.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                      <Package className="size-5 shrink-0 text-primary" />
                      <span className="grid min-w-0 flex-1">
                        <span className="font-semibold">{p.unitLabel}</span>
                        <span className="text-sm text-muted-foreground">
                          {[p.carrier, time.format(new Date(p.receivedAt)), p.note]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <Button variant="outline" onClick={() => setDelivering(p)}>
                        <PackageCheck />
                        Teslim et
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Beklenen misafirler ({door.data.expectedVisitors.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {door.data.expectedVisitors.length === 0 ? (
                <p className="text-muted-foreground">Sakinlerin bildirdiği beklenen misafir yok.</p>
              ) : (
                <ul className="divide-y">
                  {door.data.expectedVisitors.map((v) => (
                    <VisitorRow
                      key={v.id}
                      v={v}
                      action={
                        <Button
                          variant="outline"
                          disabled={arrive.isPending}
                          onClick={() => arrive.mutate(v.id)}
                        >
                          <UserCheck />
                          Geldi
                        </Button>
                      }
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Son girişler ve teslimler</CardTitle>
            </CardHeader>
            <CardContent>
              {door.data.recentVisitors.length + door.data.recentPackages.length === 0 ? (
                <p className="text-muted-foreground">Henüz kayıt yok.</p>
              ) : (
                <ul className={cn('divide-y')}>
                  {door.data.recentVisitors.map((v) => (
                    <VisitorRow key={v.id} v={v} />
                  ))}
                  {door.data.recentPackages.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-3">
                      <PackageCheck className="size-5 shrink-0 text-muted-foreground" />
                      <span className="grid min-w-0">
                        <span className="font-semibold">{p.unitLabel} · kargo teslim edildi</span>
                        <span className="text-sm text-muted-foreground">
                          {[p.deliveredTo, p.deliveredAt && time.format(new Date(p.deliveredAt))]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Kişisel bilgi içerdiği için kapı kayıtları 6 ay sonra kendiliğinden silinir.
              </p>
            </CardContent>
          </Card>
        </>
      )}
      <PackageDialog
        open={dialog === 'package'}
        onOpenChange={(o) => setDialog(o ? 'package' : null)}
      />
      <VisitorDialog
        open={dialog === 'visitor'}
        onOpenChange={(o) => setDialog(o ? 'visitor' : null)}
      />
      <DeliverDialog pkg={delivering} onClose={() => setDelivering(null)} />
    </div>
  );
}

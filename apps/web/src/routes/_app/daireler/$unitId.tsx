import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArchiveRestore, ArrowLeft, Pencil, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UnitAccountSection } from '@/features/dues/unit-account';
import { OccupancyCard } from '@/features/residents/occupancy-card';
import { OccupancyFormDialog } from '@/features/residents/resident-dialogs';
import { RemoveUnitDialog } from '@/features/units/remove-unit-dialog';
import { UnitFormDialog } from '@/features/units/unit-dialogs';
import { apiFetch } from '@/lib/api';
import { formatDate, fullName, isActiveOccupancy } from '@/lib/format';
import { useApiMutation, useUnit } from '@/lib/queries';
import { labelUnit } from '@/lib/unit-label';

export const Route = createFileRoute('/_app/daireler/$unitId')({
  component: () => (
    <ManagerOnly>
      <UnitDetailPage />
    </ManagerOnly>
  ),
});

function UnitDetailPage() {
  const { unitId } = Route.useParams();
  const navigate = useNavigate();
  const unit = useUnit(unitId);
  const [dialog, setDialog] = useState<'edit' | 'add-resident' | 'delete' | null>(null);

  const unarchive = useApiMutation(
    () => apiFetch<void>(`/units/${unitId}/unarchive`, { method: 'POST' }),
    { success: 'Daire arşivden çıkarıldı' },
  );

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/daireler">
        <ArrowLeft />
        Daireler
      </Link>
    </Button>
  );

  if (unit.isPending) return <LoadingRows />;
  if (unit.isError) {
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState error={unit.error} />
      </div>
    );
  }

  const data = unit.data;
  const current = data.occupancies.filter(isActiveOccupancy);
  const past = data.occupancies.filter((o) => !isActiveOccupancy(o));
  const title = labelUnit(data.blockName, data.number);
  const archived = Boolean(data.archivedAt);

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        {back}
        <PageHeader
          title={title}
          actions={
            <>
              <Button variant="outline" onClick={() => setDialog('edit')}>
                <Pencil />
                Düzenle
              </Button>
              {archived ? (
                <Button
                  variant="outline"
                  onClick={() => unarchive.mutate(undefined)}
                  disabled={unarchive.isPending}
                >
                  <ArchiveRestore />
                  Arşivden çıkar
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setDialog('delete')}>
                  <Trash2 />
                  Sil
                </Button>
              )}
            </>
          }
        />
      </div>

      {archived && (
        <Alert>
          <AlertDescription>
            Bu daire arşivde. Listelerde ve aylık aidatta yer almaz; geçmiş borç ve ödemeleri
            aşağıda görünmeye devam eder.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Kat</dt>
              <dd className="text-base font-medium">{data.floor ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Alan</dt>
              <dd className="text-base font-medium">
                {data.areaM2 !== null ? `${data.areaM2.toLocaleString('tr-TR')} m²` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Arsa payı</dt>
              <dd className="text-base font-medium">{data.landShare ?? '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <UnitAccountSection
        unitId={data.id}
        unitLabel={labelUnit(data.blockName, data.number, 'short')}
      />

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Mevcut sakinler</h2>
          <Button size="sm" onClick={() => setDialog('add-resident')} disabled={archived}>
            <UserPlus />
            Sakin ekle
          </Button>
        </div>
        {current.length === 0 ? (
          <EmptyState
            title="Bu daire şu an boş"
            description="Malik veya kiracı eklemek için “Sakin ekle” butonunu kullanın."
          />
        ) : (
          current.map((o) => <OccupancyCard key={o.id} occupancy={o} />)
        )}
      </section>

      {past.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Taşınma geçmişi</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {past.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {fullName(o)}{' '}
                    <span className="text-muted-foreground">
                      ({o.type === 'OWNER' ? 'Malik' : 'Kiracı'})
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(o.startDate)} – {formatDate(o.endDate)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <UnitFormDialog
        open={dialog === 'edit'}
        onOpenChange={(o) => setDialog(o ? 'edit' : null)}
        unit={data}
      />
      <OccupancyFormDialog
        open={dialog === 'add-resident'}
        onOpenChange={(o) => setDialog(o ? 'add-resident' : null)}
        unitId={data.id}
      />
      <RemoveUnitDialog
        open={dialog === 'delete'}
        onOpenChange={(o) => setDialog(o ? 'delete' : null)}
        unitId={data.id}
        label={title}
        onDeleted={() => void navigate({ to: '/daireler' })}
      />
    </div>
  );
}

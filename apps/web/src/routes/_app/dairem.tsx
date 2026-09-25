import { unitLabel, type MyOccupancyDto } from '@apartman/shared';
import { createFileRoute } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { OccupancyTypeBadge } from '@/features/residents/occupancy-actions';
import { formatDate } from '@/lib/format';
import { useUnit } from '@/lib/queries';
import { useSession } from '@/lib/session';

export const Route = createFileRoute('/_app/dairem')({
  component: MyUnitsPage,
});

function MyUnitCard({ occupancy }: { occupancy: MyOccupancyDto }) {
  const { user } = useSession();
  const unit = useUnit(occupancy.unitId, occupancy.siteId);
  const mine = unit.data?.occupancies.find((o) => o.userId === user?.id);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>
            {unitLabel(occupancy.siteKind, occupancy.blockName, occupancy.unitNumber)}
          </CardTitle>
          <OccupancyTypeBadge type={occupancy.type} />
        </div>
        <CardDescription>{occupancy.siteName}</CardDescription>
      </CardHeader>
      <CardContent>
        {unit.isPending ? (
          <LoadingRows rows={1} />
        ) : unit.isError ? (
          <ErrorState error={unit.error} />
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Kat</dt>
              <dd className="font-medium">{unit.data.floor ?? '—'}</dd>
            </div>
            {unit.data.areaM2 !== null && (
              <div>
                <dt className="text-muted-foreground">Alan</dt>
                <dd className="font-medium">{unit.data.areaM2.toLocaleString('tr-TR')} m²</dd>
              </div>
            )}
            {unit.data.landShare !== null && (
              <div>
                <dt className="text-muted-foreground">Arsa payı</dt>
                <dd className="font-medium">{unit.data.landShare}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Başlangıç</dt>
              <dd className="font-medium">{formatDate(mine?.startDate)}</dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function MyUnitsPage() {
  const { user } = useSession();
  const occupancies = user?.occupancies ?? [];

  return (
    <div className="grid gap-6">
      <PageHeader title="Dairem" description={`Hoş geldiniz, ${user?.firstName ?? ''}`} />
      {occupancies.length === 0 ? (
        <EmptyState
          title="Hesabınıza bağlı daire yok"
          description="Site yönetiminizle iletişime geçin."
        />
      ) : (
        <div className="grid gap-4">
          {occupancies.map((o) => (
            <MyUnitCard key={o.occupancyId} occupancy={o} />
          ))}
        </div>
      )}
      <Alert>
        <Info />
        <AlertDescription>
          Aidat, borç ve ödeme bilgileriniz yakında bu sayfada görünecek.
        </AlertDescription>
      </Alert>
    </div>
  );
}

import type { OccupancyDto } from '@apartman/shared';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatPhone, fullName } from '@/lib/format';
import { OccupancyActions, OccupancyTypeBadge } from './occupancy-actions';

export function OccupancyCard({
  occupancy,
  showActions = true,
}: {
  occupancy: OccupancyDto;
  showActions?: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{fullName(occupancy)}</span>
            <OccupancyTypeBadge type={occupancy.type} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {occupancy.isResponsibleForDues && <Badge variant="outline">Aidattan sorumlu</Badge>}
            {occupancy.hasAccount ? (
              <Badge variant="outline" className="border-emerald-600/40 text-emerald-700">
                Hesabı var
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Hesabı yok
              </Badge>
            )}
            {!occupancy.contactConsent && (
              <Badge variant="outline" className="text-amber-700">
                İletişim izni yok
              </Badge>
            )}
          </div>
        </div>
        {showActions && <OccupancyActions occupancy={occupancy} />}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Telefon:</dt>
          <dd>
            {occupancy.phone ? (
              <a className="underline-offset-2 hover:underline" href={`tel:${occupancy.phone}`}>
                {formatPhone(occupancy.phone)}
              </a>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className="flex min-w-0 gap-2">
          <dt className="text-muted-foreground">E-posta:</dt>
          <dd className="truncate">{occupancy.email ?? '—'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Başlangıç:</dt>
          <dd>{formatDate(occupancy.startDate)}</dd>
        </div>
        {occupancy.endDate && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Taşınma:</dt>
            <dd>{formatDate(occupancy.endDate)}</dd>
          </div>
        )}
      </dl>
      {occupancy.notes && <p className="text-sm text-muted-foreground">{occupancy.notes}</p>}
    </div>
  );
}

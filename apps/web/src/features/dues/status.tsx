import type { ChargeStatus } from '@apartman/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type CellTone, toneClasses, toneLabels, toneOf } from './tones';

export function ChargeStatusBadge({
  status,
  overdue,
  cancelled,
}: {
  status: ChargeStatus;
  overdue: boolean;
  cancelled?: boolean;
}) {
  if (cancelled) {
    return (
      <Badge variant="outline" className="text-muted-foreground line-through">
        İptal
      </Badge>
    );
  }
  const tone = toneOf(status, overdue);
  const label = tone === 'overdue' && status === 'PARTIAL' ? 'Eksik · gecikmiş' : toneLabels[tone];
  return <Badge className={cn('border-transparent', toneClasses[tone])}>{label}</Badge>;
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(Object.keys(toneLabels) as CellTone[]).map((tone) => (
        <span key={tone} className="inline-flex items-center gap-1.5">
          <span className={cn('size-3 rounded-sm', toneClasses[tone])} aria-hidden />
          {toneLabels[tone]}
        </span>
      ))}
    </div>
  );
}

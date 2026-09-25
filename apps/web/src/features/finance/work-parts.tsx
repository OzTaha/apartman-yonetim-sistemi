import { formatKurus, workStatusLabels, type WorkDto, type WorkStatus } from '@apartman/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusClasses: Record<WorkStatus, string> = {
  PLANNED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  DONE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
};

export function WorkStatusBadge({ status }: { status: WorkStatus }) {
  return (
    <Badge variant="secondary" className={statusClasses[status]}>
      {workStatusLabels[status]}
    </Badge>
  );
}

export function WorkProgress({ work }: { work: WorkDto }) {
  if (work.agreedKurus === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Ödenen <span className="font-medium text-foreground">{formatKurus(work.paidKurus)}</span>
      </p>
    );
  }
  const ratio = Math.min(1, work.paidKurus / work.agreedKurus);
  const remaining = work.remainingKurus ?? 0;
  return (
    <div className="grid gap-1.5">
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Ödeme durumu"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div
          className={cn('h-full rounded-full', remaining < 0 ? 'bg-red-600' : 'bg-emerald-600')}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
        <span>
          Ödenen <strong className="text-foreground">{formatKurus(work.paidKurus)}</strong> /{' '}
          {formatKurus(work.agreedKurus)}
        </span>
        <span className={cn(remaining < 0 && 'text-red-700 dark:text-red-400')}>
          {remaining < 0
            ? `${formatKurus(-remaining)} fazla ödendi`
            : `Kalan ${formatKurus(remaining)}`}
        </span>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api';
import { CircleAlert, type LucideIcon } from 'lucide-react';

export function PageHeader({
  title,
  description,
  actions,
  info,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  info?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {info && <span className="text-primary">{info}</span>}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/60 px-6 py-10 text-center">
      {Icon && (
        <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Icon className="size-7" />
        </span>
      )}
      <p className="font-heading text-lg font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-2" aria-label="Yükleniyor">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>Veriler yüklenemedi</AlertTitle>
      <AlertDescription>{errorMessage(error)}</AlertDescription>
    </Alert>
  );
}

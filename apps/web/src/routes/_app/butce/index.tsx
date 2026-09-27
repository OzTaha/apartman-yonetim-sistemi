import { formatKurus, periodLabel, type BudgetDto } from '@apartman/shared';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CreateBudgetDialog } from '@/features/budget/create-dialog';
import { advanceLabel } from '@/features/budget/format';
import { useBudgets } from '@/lib/queries';
import { canManage, useRole } from '@/lib/session';

export const Route = createFileRoute('/_app/butce/')({
  component: () => (
    <ManagerOnly allow={['AUDITOR']}>
      <BudgetsPage />
    </ManagerOnly>
  ),
});

function BudgetCard({ b }: { b: BudgetDto }) {
  return (
    <Link to="/butce/$budgetId" params={{ budgetId: b.id }} className="block">
      <Card className="h-full py-4 transition-colors hover:bg-muted/50">
        <CardContent className="grid gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="font-medium">
              {periodLabel(b.startPeriod)} – {periodLabel(b.endPeriod)}
            </span>
            <span className="flex flex-wrap gap-1">
              {b.isCurrent && <Badge>Güncel dönem</Badge>}
              {b.approvedAt && <Badge variant="secondary">Genel kurulda onaylandı</Badge>}
              {b.applied && <Badge variant="secondary">Aidata uygulandı</Badge>}
            </span>
          </div>
          <span className="text-xl font-semibold tabular-nums">{formatKurus(b.totalKurus)}</span>
          <span className="text-sm text-muted-foreground">
            {b.lineCount > 0
              ? `${b.lineCount} gider kalemi · ${advanceLabel(b)}`
              : 'Henüz gider kalemi girilmedi'}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

function BudgetsPage() {
  const budgets = useBudgets();
  const manager = canManage(useRole());
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="İşletme projesi"
        description="Yıllık tahmini giderler ve bunlardan hesaplanan aylık avans aidat."
        actions={
          manager && (
            <Button onClick={() => setCreating(true)} disabled={budgets.isPending}>
              <Plus />
              Bütçe oluştur
            </Button>
          )
        }
      />
      {budgets.isPending ? (
        <LoadingRows />
      ) : budgets.isError ? (
        <ErrorState error={budgets.error} />
      ) : budgets.data.length === 0 ? (
        <EmptyState
          title="Henüz bütçe yok"
          description="Önümüzdeki 12 ayın tahmini giderlerini girin; sistem daire başına düşen aylık avans aidatı hesaplasın."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {budgets.data.map((b) => (
            <BudgetCard key={b.id} b={b} />
          ))}
        </div>
      )}
      {manager && creating && budgets.data && (
        <CreateBudgetDialog
          open={creating}
          onOpenChange={setCreating}
          budgets={budgets.data}
          onCreated={(b) => void navigate({ to: '/butce/$budgetId', params: { budgetId: b.id } })}
        />
      )}
    </div>
  );
}

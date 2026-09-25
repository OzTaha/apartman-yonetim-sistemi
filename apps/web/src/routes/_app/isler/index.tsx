import { createFileRoute, Link } from '@tanstack/react-router';
import { EyeOff, Paperclip, Plus } from 'lucide-react';
import { useState } from 'react';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WorkDialog } from '@/features/finance/work-dialogs';
import { WorkProgress, WorkStatusBadge } from '@/features/finance/work-parts';
import { formatDate } from '@/lib/format';
import { useWorks } from '@/lib/queries';

export const Route = createFileRoute('/_app/isler/')({
  component: () => (
    <ManagerOnly>
      <WorksPage />
    </ManagerOnly>
  ),
});

function WorksPage() {
  const works = useWorks();
  const [creating, setCreating] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Yapılan işler"
        description="Boya, onarım, bakım gibi işler; firma, anlaşılan tutar, ödemeler ve faturalar."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            İş ekle
          </Button>
        }
      />
      {works.isPending ? (
        <LoadingRows />
      ) : works.isError ? (
        <ErrorState error={works.error} />
      ) : works.data.length === 0 ? (
        <EmptyState
          title="Henüz iş kaydı yok"
          description="Apartman için yaptırılan işleri kaydederek ödemeleri ve faturaları sakinlerle paylaşabilirsiniz."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus />
              İş ekle
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {works.data.map((w) => (
            <Link key={w.id} to="/isler/$workId" params={{ workId: w.id }} className="block">
              <Card className="h-full py-4 transition-colors hover:bg-muted/50">
                <CardContent className="grid gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid min-w-0 gap-0.5">
                      <span className="font-medium">{w.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {[
                          w.vendorName,
                          w.startDate &&
                            `${formatDate(w.startDate)}${w.endDate ? ` – ${formatDate(w.endDate)}` : ''}`,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Firma ve tarih girilmemiş'}
                      </span>
                    </div>
                    <WorkStatusBadge status={w.status} />
                  </div>
                  <WorkProgress work={w} />
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {w.attachmentCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="size-3.5" />
                        {w.attachmentCount} belge
                      </span>
                    )}
                    {!w.visibleToResidents && (
                      <span className="inline-flex items-center gap-1">
                        <EyeOff className="size-3.5" />
                        Sakinlerden gizli
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <WorkDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

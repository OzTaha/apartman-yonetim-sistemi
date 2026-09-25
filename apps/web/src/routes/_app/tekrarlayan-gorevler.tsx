import { describeRecurrence, type RecurringTaskDto } from '@apartman/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ManagerOnly } from '@/components/manager-only';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PriorityBadge } from '@/features/staff/parts';
import { RecurringTaskDialog } from '@/features/staff/recurring-dialog';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApiMutation, useRecurringTasks } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/tekrarlayan-gorevler')({
  component: () => (
    <ManagerOnly>
      <RecurringTasksPage />
    </ManagerOnly>
  ),
});

function RecurringTasksPage() {
  const templates = useRecurringTasks();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RecurringTaskDto | null>(null);
  const [removing, setRemoving] = useState<RecurringTaskDto | null>(null);
  const remove = useApiMutation(
    (id: string) => apiFetch<void>(`/recurring-tasks/${id}`, { method: 'DELETE' }),
    { success: 'Tekrarlayan görev silindi', onSuccess: () => setRemoving(null) },
  );

  return (
    <div className="grid gap-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link to="/gorevler">
          <ArrowLeft />
          Görevler
        </Link>
      </Button>
      <PageHeader
        title="Tekrarlayan görevler"
        description="Merdiven temizliği, çöp toplama gibi düzenli işler. Görev, seçilen günlerin sabahında kendiliğinden oluşur."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Tekrarlayan görev ekle
          </Button>
        }
      />
      {templates.isPending ? (
        <LoadingRows />
      ) : templates.isError ? (
        <ErrorState error={templates.error} />
      ) : templates.data.length === 0 ? (
        <EmptyState
          title="Tekrarlayan görev yok"
          description="Her hafta veya her ay yapılan işleri bir kez tanımlayın, görevler kendiliğinden oluşsun."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.data.map((r) => (
            <Card key={r.id} className={cn('py-4', !r.isActive && 'opacity-60')}>
              <CardContent className="grid gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid min-w-0 gap-0.5">
                    <span className="font-medium break-words">{r.title}</span>
                    <span className="text-sm">{describeRecurrence(r)}</span>
                  </div>
                  <span className="flex shrink-0 gap-1">
                    <PriorityBadge priority={r.priority} />
                    {!r.isActive && <Badge variant="outline">Durduruldu</Badge>}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {[
                    r.employeeName ?? 'Atanmadı',
                    `${formatDate(r.startDate)} tarihinden${r.endDate ? ` ${formatDate(r.endDate)} tarihine kadar` : ' itibaren'}`,
                    `${r.taskCount} görev oluştu`,
                  ].join(' · ')}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                    <Pencil />
                    Düzenle
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setRemoving(r)}
                  >
                    <Trash2 />
                    Sil
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <RecurringTaskDialog open={creating} onOpenChange={setCreating} />
      <RecurringTaskDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        template={editing ?? undefined}
      />
      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removing?.title} silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Artık yeni görev oluşmaz. Daha önce oluşan görevler ve geçmişleri silinmez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove.mutate(removing.id)}>
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

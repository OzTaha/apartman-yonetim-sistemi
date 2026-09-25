import {
  addDays,
  employeeRoleLabels,
  formatDuration,
  isoWeekday,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  weekDates,
  weekStartOf,
  type ShiftCopyResultDto,
  type ShiftDto,
} from '@apartman/shared';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Copy, Plus } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShiftDialog, type ShiftDefaults } from '@/features/staff/shift-dialog';
import { employeeName } from '@/features/staff/staff';
import { apiFetch } from '@/lib/api';
import { formatDate, todayIso } from '@/lib/format';
import { useApiMutation, useEmployees, useShifts } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/vardiyalar')({
  validateSearch: (s: Record<string, unknown>): { hafta?: string } => ({
    hafta:
      typeof s['hafta'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s['hafta'])
        ? s['hafta']
        : undefined,
  }),
  component: () => (
    <ManagerOnly>
      <ShiftsPage />
    </ManagerOnly>
  ),
});

const shortDate = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;

function ShiftChip({ shift, onClick }: { shift: ShiftDto; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md bg-primary/10 px-1.5 py-1 text-left text-xs font-medium tabular-nums hover:bg-primary/20"
      aria-label={`${shift.employeeName} ${formatDate(shift.date)} ${shift.startTime}–${shift.endTime} vardiyasını düzenle`}
    >
      {shift.startTime}–{shift.endTime}
      {shift.overnight && <span className="text-muted-foreground"> +1</span>}
    </button>
  );
}

function ShiftsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const today = todayIso();
  const week = weekStartOf(search.hafta ?? today);
  const days = weekDates(week);
  const shifts = useShifts(week, days[6]!);
  const employees = useEmployees();
  const [editing, setEditing] = useState<ShiftDto | null>(null);
  const [adding, setAdding] = useState<ShiftDefaults | null>(null);
  const [copying, setCopying] = useState(false);

  const goTo = (target: string) =>
    void navigate({
      search: { hafta: target === weekStartOf(today) ? undefined : target },
      replace: true,
    });

  const copy = useApiMutation(
    () =>
      apiFetch<ShiftCopyResultDto>('/shifts/copy-week', {
        method: 'POST',
        body: { sourceWeek: addDays(week, -7), targetWeek: week },
      }),
    {
      success: (r) =>
        r.created === 0 && r.skipped === 0
          ? 'Önceki haftada vardiya yok'
          : `${r.created} vardiya kopyalandı${r.skipped ? `, ${r.skipped} çakışan atlandı` : ''}`,
    },
  );

  const list = shifts.data ?? [];
  const withShifts = new Set(list.map((s) => s.employeeId));
  const rows = (employees.data ?? []).filter((e) => e.isActive || withShifts.has(e.id));
  const cell = (employeeId: string, date: string) =>
    list.filter((s) => s.employeeId === employeeId && s.date === date);
  const totalOf = (employeeId: string) =>
    list.filter((s) => s.employeeId === employeeId).reduce((sum, s) => sum + s.minutes, 0);
  const defaultDate = days.includes(today) ? today : week;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Vardiya planı"
        description={`${formatDate(week)} – ${formatDate(days[6])}`}
        actions={
          <>
            <Button onClick={() => setAdding({ date: defaultDate })}>
              <Plus />
              Vardiya ekle
            </Button>
            <Button variant="outline" onClick={() => setCopying(true)}>
              <Copy />
              Önceki haftayı kopyala
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => goTo(addDays(week, -7))}>
          <ChevronLeft />
          Önceki hafta
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={week === weekStartOf(today)}
          onClick={() => goTo(weekStartOf(today))}
        >
          Bu hafta
        </Button>
        <Button variant="outline" size="sm" onClick={() => goTo(addDays(week, 7))}>
          Sonraki hafta
          <ChevronRight />
        </Button>
      </div>

      {shifts.isPending || employees.isPending ? (
        <LoadingRows />
      ) : shifts.isError ? (
        <ErrorState error={shifts.error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Henüz çalışan yok"
          description="Vardiya planlamak için önce çalışan ekleyin."
          action={
            <Button asChild>
              <Link to="/calisanlar">Çalışanlar</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full min-w-[760px] table-fixed text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-44 p-2 text-left font-medium">Çalışan</th>
                  {days.map((d) => (
                    <th
                      key={d}
                      className={cn('p-2 text-center font-medium', d === today && 'bg-primary/10')}
                    >
                      {WEEKDAY_SHORT[isoWeekday(d) - 1]}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {shortDate(d)}
                      </span>
                    </th>
                  ))}
                  <th className="w-20 p-2 text-right font-medium">Toplam</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="p-2 align-top">
                      <Link
                        to="/calisanlar/$employeeId"
                        params={{ employeeId: e.id }}
                        className="font-medium hover:underline"
                      >
                        {employeeName(e)}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {employeeRoleLabels[e.role]}
                      </span>
                    </td>
                    {days.map((d) => (
                      <td key={d} className={cn('p-1 align-top', d === today && 'bg-primary/5')}>
                        <div className="grid gap-1">
                          {cell(e.id, d).map((s) => (
                            <ShiftChip key={s.id} shift={s} onClick={() => setEditing(s)} />
                          ))}
                          {e.isActive && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-muted-foreground"
                              aria-label={`${employeeName(e)} ${formatDate(d)} vardiya ekle`}
                              onClick={() => setAdding({ employeeId: e.id, date: d })}
                            >
                              <Plus />
                            </Button>
                          )}
                        </div>
                      </td>
                    ))}
                    <td className="p-2 text-right align-top text-xs tabular-nums">
                      {totalOf(e.id) ? formatDuration(totalOf(e.id)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {days.map((d) => {
              const dayShifts = list.filter((s) => s.date === d);
              return (
                <Card key={d} className={cn('gap-2 py-3', d === today && 'border-primary')}>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
                    <CardTitle className="text-base">
                      {WEEKDAY_NAMES[isoWeekday(d) - 1]}{' '}
                      <span className="text-sm font-normal text-muted-foreground">
                        {formatDate(d)}
                      </span>
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${formatDate(d)} vardiya ekle`}
                      onClick={() => setAdding({ date: d })}
                    >
                      <Plus />
                    </Button>
                  </CardHeader>
                  <CardContent className="px-4">
                    {dayShifts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Vardiya yok</p>
                    ) : (
                      <ul className="divide-y">
                        {dayShifts.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm"
                              onClick={() => setEditing(s)}
                            >
                              <span className="min-w-0 truncate font-medium">{s.employeeName}</span>
                              <span className="shrink-0 tabular-nums">
                                {s.startTime}–{s.endTime}
                                {s.overnight && <span className="text-muted-foreground"> +1</span>}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <ShiftDialog
        open={adding !== null}
        onOpenChange={(o) => !o && setAdding(null)}
        defaults={adding ?? undefined}
      />
      <ShiftDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        shift={editing ?? undefined}
      />
      <AlertDialog open={copying} onOpenChange={setCopying}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Önceki hafta kopyalansın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatDate(addDays(week, -7))} haftasındaki vardiyalar bu haftanın aynı günlerine
              eklenir. Mevcut vardiyalarla çakışanlar ve pasif çalışanlarınki atlanır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => copy.mutate(undefined)}>Kopyala</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import {
  employeeRoleLabels,
  formatDuration,
  formatKurus,
  WEEKDAY_SHORT,
  isoWeekday,
} from '@apartman/shared';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ListPlus, Minus, Pencil, Power, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ManagerOnly } from '@/components/manager-only';
import { ErrorState, LoadingRows, PageHeader } from '@/components/page';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TransactionDetailsDialog } from '@/features/finance/transaction-details';
import { TransactionDialog } from '@/features/finance/transaction-dialog';
import { EmployeeDialog } from '@/features/staff/employee-dialog';
import { PriorityBadge, TaskStatusBadge } from '@/features/staff/parts';
import { employeeBody, employeeName } from '@/features/staff/staff';
import { TaskDialog } from '@/features/staff/task-dialogs';
import { apiFetch } from '@/lib/api';
import { formatDate, formatPhone, todayIso } from '@/lib/format';
import { useApiMutation, useEmployee } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/calisanlar/$employeeId')({
  component: () => (
    <ManagerOnly>
      <EmployeeDetailPage />
    </ManagerOnly>
  ),
});

function EmployeeDetailPage() {
  const { employeeId } = Route.useParams();
  const navigate = useNavigate();
  const employee = useEmployee(employeeId);
  const [dialog, setDialog] = useState<'edit' | 'task' | 'pay' | 'delete' | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const close = (o: boolean) => !o && setDialog(null);

  const toggle = useApiMutation(
    () =>
      apiFetch(`/employees/${employeeId}`, {
        method: 'PATCH',
        body: employeeBody(employee.data!, { isActive: !employee.data!.isActive }),
      }),
    { success: employee.data?.isActive ? 'Çalışan pasif yapıldı' : 'Çalışan aktif yapıldı' },
  );
  const remove = useApiMutation(
    () => apiFetch<void>(`/employees/${employeeId}`, { method: 'DELETE' }),
    { success: 'Çalışan silindi', onSuccess: () => void navigate({ to: '/calisanlar' }) },
  );

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/calisanlar">
        <ArrowLeft />
        Çalışanlar
      </Link>
    </Button>
  );

  if (employee.isPending) return <LoadingRows />;
  if (employee.isError)
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState error={employee.error} />
      </div>
    );

  const e = employee.data;
  const today = todayIso();
  const selectedPayment = e.payments.find((p) => p.id === paymentId);
  const info: [string, string | null][] = [
    ['Telefon', e.phone ? formatPhone(e.phone) : null],
    ['İşe başlama', e.startDate ? formatDate(e.startDate) : null],
    ['Not', e.notes],
  ];

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={employeeName(e)}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {employeeRoleLabels[e.role]}
            {!e.isActive && <Badge variant="outline">Pasif</Badge>}
          </span>
        }
        actions={
          <>
            {e.isActive && (
              <>
                <Button onClick={() => setDialog('task')}>
                  <ListPlus />
                  Görev ver
                </Button>
                <Button variant="outline" onClick={() => setDialog('pay')}>
                  <Minus />
                  Ödeme yap
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil />
              Düzenle
            </Button>
            <Button
              variant="outline"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate(undefined)}
            >
              <Power />
              {e.isActive ? 'Pasif yap' : 'Aktif yap'}
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => setDialog('delete')}
            >
              <Trash2 />
              Sil
            </Button>
          </>
        }
      />

      {info.some(([, v]) => v) && (
        <Card className="py-4">
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {info
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium break-words">{value}</dd>
                  </div>
                ))}
            </dl>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Açık görevler ({e.openTasks.length})</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/gorevler" search={{ calisan: e.id }}>
                Tümü
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {e.openTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Açık görev yok.</p>
            ) : (
              <ul className="divide-y">
                {e.openTasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      to="/gorevler/$taskId"
                      params={{ taskId: t.id }}
                      className="flex items-center justify-between gap-2 py-2 text-sm hover:underline"
                    >
                      <span className="grid min-w-0">
                        <span className="truncate font-medium">{t.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.dueDate ? `Son tarih ${formatDate(t.dueDate)}` : 'Son tarih yok'}
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        <PriorityBadge priority={t.priority} />
                        <TaskStatusBadge status={t.status} overdue={t.overdue} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Bu ve gelecek hafta vardiyaları</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/vardiyalar">Plan</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {e.shifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Planlanmış vardiya yok.</p>
            ) : (
              <ul className="divide-y">
                {e.shifts.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      'flex items-center justify-between gap-2 py-2 text-sm',
                      s.date < today && 'text-muted-foreground',
                    )}
                  >
                    <span>
                      {WEEKDAY_SHORT[isoWeekday(s.date) - 1]} {formatDate(s.date)}
                    </span>
                    <span className="tabular-nums">
                      {s.startTime}–{s.endTime}
                      {s.overnight && ' (+1)'}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatDuration(s.minutes)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Ödemeler · {formatKurus(e.paidKurus)}</CardTitle>
        </CardHeader>
        <CardContent>
          {e.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Bu çalışana bağlı ödeme yok. Kasadan gider girerken çalışanı seçebilirsiniz.
            </p>
          ) : (
            <ul className="divide-y">
              {e.payments.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm hover:underline"
                    onClick={() => setPaymentId(p.id)}
                  >
                    <span className="grid min-w-0">
                      <span className="truncate font-medium">
                        {p.description || p.categoryName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(p.date)} · {p.accountName}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium text-red-700 tabular-nums dark:text-red-400">
                      −{formatKurus(p.amountKurus)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <EmployeeDialog open={dialog === 'edit'} onOpenChange={close} employee={e} />
      <TaskDialog open={dialog === 'task'} onOpenChange={close} employeeId={e.id} />
      <TransactionDialog
        type="EXPENSE"
        open={dialog === 'pay'}
        onOpenChange={close}
        employeeId={e.id}
      />
      <TransactionDetailsDialog
        transaction={selectedPayment}
        onOpenChange={(o) => !o && setPaymentId(null)}
      />
      <AlertDialog open={dialog === 'delete'} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{employeeName(e)} silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Yalnızca vardiyası, görevi ve ödemesi olmayan çalışan silinebilir. Geçmişi olan
              çalışanı pasif yapabilirsiniz; kayıtları raporlarda kalır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate(undefined)}>Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import type { DashboardDto } from '@apartman/shared';
import { Link } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { InfoTip } from '@/components/info-tip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Target = '/aidat-ayarlari' | '/mesajlar/yeni' | '/talepler' | '/gorevler' | '/borclar';

interface Todo {
  key: string;
  tone: 'danger' | 'info';
  tag: string;
  text: string;
  action: string;
  to: Target;
}

function todos(d: DashboardDto, canSeeStaff: boolean): Todo[] {
  const list: Todo[] = [];
  if (d.unitCount > 0 && d.duesUnitCount === 0) {
    list.push({
      key: 'dues',
      tone: 'danger',
      tag: 'Eksik',
      text: 'Bu ayın aidatı henüz dairelere yazılmadı.',
      action: 'Aidat ayarları',
      to: '/aidat-ayarlari',
    });
  }
  if (d.debtorUnitCount > 0) {
    list.push({
      key: 'overdue',
      tone: 'danger',
      tag: 'Gecikmiş',
      text: `${d.debtorUnitCount} dairenin son ödeme günü geçmiş borcu var.`,
      action: 'Hatırlat',
      to: '/mesajlar/yeni',
    });
  }
  if (d.todo.newRequestCount > 0) {
    list.push({
      key: 'requests',
      tone: 'info',
      tag: 'Yeni',
      text: `${d.todo.newRequestCount} arıza veya talep yanıt bekliyor.`,
      action: 'Aç',
      to: '/talepler',
    });
  }
  if (canSeeStaff && d.todo.dueTaskCount > 0) {
    list.push({
      key: 'tasks',
      tone: 'info',
      tag: 'Görev',
      text: `${d.todo.dueTaskCount} görevin günü geldi veya geçti.`,
      action: 'Görevler',
      to: '/gorevler',
    });
  }
  if (d.todo.dueTodayCount > 0) {
    list.push({
      key: 'today',
      tone: 'info',
      tag: 'Bugün',
      text: `${d.todo.dueTodayCount} borcun son ödeme günü bugün.`,
      action: 'Borçlar',
      to: '/borclar',
    });
  }
  return list;
}

export function TodayCard({
  dashboard,
  canSeeStaff,
}: {
  dashboard: DashboardDto;
  canSeeStaff: boolean;
}) {
  const items = todos(dashboard, canSeeStaff);
  return (
    <Card data-tour="today">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-xl">Bugün yapılacaklar</CardTitle>
          <InfoTip title="Bugün yapılacaklar nedir?" className="text-primary">
            <p>
              Sistem, ilgilenmeniz gereken işleri sizin yerinize toplar ve burada sıralar. Her
              satırın yanındaki düğmeye basınca o işi yapacağınız sayfa açılır.
            </p>
            <p>
              Örneğin "3 dairenin son ödeme günü geçmiş borcu var" yazıyorsa "Hatırlat" düğmesiyle
              bu dairelere tek seferde hatırlatma mesajı gönderebilirsiniz.
            </p>
            <p>Liste boşsa bugün yapmanız gereken bir şey yok demektir.</p>
          </InfoTip>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-5 shrink-0" />
            Bugün bekleyen bir iş yok. Her şey yolunda.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((t) => (
              <li key={t.key} className="flex flex-wrap items-center gap-3 py-3">
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    t.tone === 'danger'
                      ? 'bg-destructive/12 text-destructive'
                      : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  {t.tag}
                </span>
                <span className="min-w-0 flex-1">{t.text}</span>
                <Button variant="outline" size="sm" asChild>
                  <Link to={t.to}>{t.action}</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

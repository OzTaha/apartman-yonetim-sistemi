import type { InvitationDto, NotificationDto, PasswordResetLinkDto } from '@apartman/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { CheckCheck, KeyRound, UserPlus, Wrench } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/page';
import { PasswordResetDialog } from '@/components/password-reset-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch, errorMessage } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import {
  notificationKeys,
  useCanReceiveNotifications,
  useNotifications,
} from '@/lib/notifications';
import { session } from '@/lib/session';
import { labelUnit } from '@/lib/unit-label';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/bildirimler')({
  component: NotificationsGuard,
});

function NotificationsGuard() {
  if (!useCanReceiveNotifications()) return <Navigate to="/" replace />;
  return <NotificationsPage />;
}

const time = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

type ResetNotification = Extract<NotificationDto, { type: 'PASSWORD_RESET_REQUEST' }>;

function requestFor(n: ResetNotification) {
  const { data } = n;
  if (data.isManager && data.userId) {
    return () =>
      apiFetch<PasswordResetLinkDto>(`/users/${data.userId}/password-reset`, {
        method: 'POST',
        siteId: null,
      });
  }
  if (!data.hasAccount) {
    return async (): Promise<PasswordResetLinkDto> => {
      const invitation = await apiFetch<InvitationDto>(
        `/residents/${data.occupancyId}/invitations`,
        { method: 'POST', siteId: n.siteId },
      );
      return { ...invitation, sentVia: null, sendError: null };
    };
  }
  return (send?: 'SMS' | 'WHATSAPP') =>
    apiFetch<PasswordResetLinkDto>(`/residents/${data.occupancyId}/password-reset`, {
      method: 'POST',
      body: { send },
      siteId: n.siteId,
    });
}

function RequestNotificationCard({
  n,
}: {
  n: Extract<NotificationDto, { type: 'SERVICE_REQUEST' }>;
}) {
  const navigate = useNavigate();
  const resolved = Boolean(n.resolvedAt);
  return (
    <Card className={cn('py-4', !n.readAt && 'border-primary')}>
      <CardContent className="grid gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <Wrench className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn('break-words', !n.readAt ? 'font-semibold' : 'font-medium')}>
              {n.title}
            </span>
          </span>
          <Badge variant={resolved ? 'secondary' : 'outline'} className="shrink-0">
            {resolved ? 'İlgilenildi' : 'Bekliyor'}
          </Badge>
        </div>
        <p className="text-sm break-words">{n.body}</p>
        <p className="text-xs text-muted-foreground">
          {[
            time.format(new Date(n.createdAt)),
            n.siteName,
            `#${n.data.number} · ${labelUnit(n.data.blockName, n.data.unitNumber, 'short')}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <Button
          size="sm"
          variant={resolved ? 'outline' : 'default'}
          className="w-fit"
          onClick={() => {
            if (n.siteId && n.siteId !== session.get().siteId) session.setSite(n.siteId);
            void navigate({ to: '/talepler/$requestId', params: { requestId: n.data.requestId } });
          }}
        >
          <Wrench />
          Talebi aç
        </Button>
      </CardContent>
    </Card>
  );
}

function NotificationCard({
  n,
  onAction,
}: {
  n: ResetNotification;
  onAction: (n: ResetNotification) => void;
}) {
  const resolved = Boolean(n.resolvedAt);
  const Icon = n.data.hasAccount ? KeyRound : UserPlus;
  return (
    <Card className={cn('py-4', !n.readAt && 'border-primary')}>
      <CardContent className="grid gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn('break-words', !n.readAt ? 'font-semibold' : 'font-medium')}>
              {n.title}
            </span>
          </span>
          <Badge variant={resolved ? 'secondary' : 'outline'} className="shrink-0">
            {resolved ? 'Tamamlandı' : 'Bekliyor'}
          </Badge>
        </div>
        <p className="text-sm break-words">{n.body}</p>
        <p className="text-xs text-muted-foreground">
          {[
            time.format(new Date(n.createdAt)),
            n.siteName,
            n.data.phone && formatPhone(n.data.phone),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {!resolved && (
          <Button size="sm" className="w-fit" onClick={() => onAction(n)}>
            <Icon />
            {n.data.hasAccount ? 'Şifre bağlantısı gönder' : 'Davet bağlantısı oluştur'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function NotificationsPage() {
  const [filter, setFilter] = useState<'unread' | 'all'>('all');
  const notifications = useNotifications(filter);
  const queryClient = useQueryClient();
  const [active, setActive] = useState<ResetNotification | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: notificationKeys.count });
  };

  async function markRead(n: NotificationDto) {
    if (n.readAt) return;
    try {
      await apiFetch<void>(`/notifications/${n.id}/read`, { method: 'POST', siteId: null });
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function readAll() {
    try {
      await apiFetch<void>('/notifications/read-all', { method: 'POST', siteId: null });
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const unread = (notifications.data ?? []).filter((n) => !n.readAt).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Bildirimler"
        description="Yeni arıza ve talepler, şifresini unutan veya hesap açmak isteyen kişilerin istekleri anında buraya düşer."
        actions={
          <Button variant="outline" disabled={unread === 0} onClick={() => void readAll()}>
            <CheckCheck />
            Tümünü okundu say
          </Button>
        }
      />
      <div className="w-full sm:w-56">
        <Select value={filter} onValueChange={(v) => setFilter(v as 'unread' | 'all')}>
          <SelectTrigger className="w-full" aria-label="Bildirim filtresi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm bildirimler</SelectItem>
            <SelectItem value="unread">Okunmamışlar</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {notifications.isPending ? (
        <LoadingRows />
      ) : notifications.isError ? (
        <ErrorState error={notifications.error} />
      ) : notifications.data.length === 0 ? (
        <EmptyState title="Bildirim yok" description="Yeni talepler geldiğinde burada görünür." />
      ) : (
        <div className="grid gap-3">
          {notifications.data.map((n) => (
            <div key={n.id} onClick={() => void markRead(n)}>
              {n.type === 'SERVICE_REQUEST' ? (
                <RequestNotificationCard n={n} />
              ) : (
                <NotificationCard n={n} onAction={setActive} />
              )}
            </div>
          ))}
        </div>
      )}
      {active && (
        <PasswordResetDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setActive(null);
              refresh();
            }
          }}
          personName={active.data.name}
          phone={active.data.hasAccount && !active.data.isManager ? active.data.phone : null}
          invite={!active.data.hasAccount}
          request={requestFor(active)}
        />
      )}
    </div>
  );
}

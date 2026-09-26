import { Link, useNavigate } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useCanReceiveNotifications,
  useNotificationCount,
  useNotifications,
  useNotificationStream,
} from '@/lib/notifications';

const time = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

export function NotificationBell() {
  const enabled = useCanReceiveNotifications();
  const navigate = useNavigate();
  const count = useNotificationCount();
  const unread = useNotifications('unread');
  useNotificationStream();
  if (!enabled) return null;

  const total = count.data?.unread ?? 0;
  const latest = (unread.data ?? []).slice(0, 5);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={total > 0 ? `Bildirimler, ${total} okunmamış` : 'Bildirimler'}
        >
          <Bell />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums">
              {total > 99 ? '99+' : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>Bildirimler</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {latest.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Okunmamış bildirim yok.</p>
        ) : (
          latest.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="grid gap-0.5"
              onSelect={() => void navigate({ to: '/bildirimler' })}
            >
              <span className="font-medium">{n.title}</span>
              <span className="text-xs whitespace-normal text-muted-foreground">{n.body}</span>
              <span className="text-xs text-muted-foreground">
                {time.format(new Date(n.createdAt))}
                {n.siteName && ` · ${n.siteName}`}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/bildirimler" className="justify-center font-medium">
            Tüm bildirimler
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

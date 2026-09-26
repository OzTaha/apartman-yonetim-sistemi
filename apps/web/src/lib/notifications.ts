import type { NotificationCountDto, NotificationDto, NotificationEventDto } from '@apartman/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { apiFetch, openStream } from './api';
import { useSession } from './session';

export const notificationKeys = {
  list: (filter: 'unread' | 'all') => ['notifications', filter] as const,
  count: ['notification-count'] as const,
};

export function useCanReceiveNotifications(): boolean {
  const { user } = useSession();
  return Boolean(
    user && (user.isPlatformAdmin || user.memberships.some((m) => m.role === 'SITE_MANAGER')),
  );
}

export function useNotifications(filter: 'unread' | 'all') {
  const enabled = useCanReceiveNotifications();
  return useQuery({
    queryKey: notificationKeys.list(filter),
    queryFn: () =>
      apiFetch<NotificationDto[]>(`/notifications${filter === 'unread' ? '?filter=unread' : ''}`, {
        siteId: null,
      }),
    enabled,
  });
}

export function useNotificationCount() {
  const enabled = useCanReceiveNotifications();
  return useQuery({
    queryKey: notificationKeys.count,
    queryFn: () => apiFetch<NotificationCountDto>('/notifications/count', { siteId: null }),
    enabled,
    refetchInterval: 5 * 60_000,
  });
}

async function readEvents(response: Response, onEvent: (event: NotificationEventDto) => void) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const lines = block.split('\n');
      const type = lines
        .find((l) => l.startsWith('event:'))
        ?.slice(6)
        .trim();
      const data = lines
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('\n');
      if (type === 'notification' && data) onEvent(JSON.parse(data) as NotificationEventDto);
      end = buffer.indexOf('\n\n');
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useNotificationStream() {
  const enabled = useCanReceiveNotifications();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.count });
    };
    const onEvent = (event: NotificationEventDto) => {
      refresh();
      if (event.kind === 'created' && event.notification) {
        toast.info(event.notification.title, {
          description: event.notification.body,
          action: { label: 'Görüntüle', onClick: () => void navigate({ to: '/bildirimler' }) },
        });
      }
    };

    void (async () => {
      let wait = 1000;
      while (!controller.signal.aborted) {
        try {
          const response = await openStream('/notifications/stream', controller.signal);
          wait = 1000;
          refresh();
          await readEvents(response, onEvent);
        } catch {
          if (controller.signal.aborted) return;
        }
        await sleep(wait);
        wait = Math.min(wait * 2, 30_000);
      }
    })();

    return () => controller.abort();
  }, [enabled, queryClient, navigate]);
}

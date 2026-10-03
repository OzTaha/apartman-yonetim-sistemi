import type { PushConfigDto } from '@apartman/shared';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on' | 'loading';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  const found = await navigator.serviceWorker.getRegistration();
  return found ?? null;
}

async function currentState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = (await registration()) ?? (await navigator.serviceWorker.ready);
  const { publicKey } = await apiFetch<PushConfigDto>('/push/config', { siteId: null });
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const json = sub.toJSON();
  await apiFetch<void>('/push/subscriptions', {
    method: 'POST',
    siteId: null,
    body: { endpoint: json.endpoint, keys: json.keys },
  });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await apiFetch<void>('/push/subscriptions', {
      method: 'DELETE',
      siteId: null,
      body: { endpoint: sub.endpoint },
    }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'off';
}

export function usePushState() {
  const [state, setState] = useState<PushState>('loading');
  const refresh = useCallback(() => {
    void currentState().then(setState, () => setState('unsupported'));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { state, setState, refresh };
}

import type { MeDto } from '@apartman/shared';
import { useEffect, useState } from 'react';
import { logout } from './auth';
import { useSession } from './session';

export const IDLE_LIMIT_MS = 3 * 60 * 60 * 1000;
export const IDLE_WARNING_MS = 5 * 60 * 1000;
const KEY = 'apartman.lastActivity';
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export function isPrivileged(user: MeDto | null): boolean {
  if (!user) return false;
  return (
    user.isPlatformAdmin ||
    user.memberships.some(
      (m) => m.role === 'SITE_MANAGER' || m.role === 'BLOCK_MANAGER' || m.role === 'AUDITOR',
    )
  );
}

export function markActive(at = Date.now()) {
  try {
    localStorage.setItem(KEY, String(at));
  } catch {
    return;
  }
}

function lastActive(): number | null {
  try {
    const value = Number(localStorage.getItem(KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

async function endSession() {
  await logout().catch(() => undefined);
  window.location.replace('/giris?neden=hareketsizlik');
}

export function useIdleLogout(): { warning: boolean; secondsLeft: number; stay: () => void } {
  const { user } = useSession();
  const privileged = isPrivileged(user);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!privileged) return;
    let written = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - written > 30_000) {
        written = now;
        markActive(now);
      }
    };
    const check = () => {
      const last = lastActive();
      if (last === null) {
        markActive();
        return setLeft(null);
      }
      const remaining = IDLE_LIMIT_MS - (Date.now() - last);
      if (remaining <= 0) {
        void endSession();
      } else {
        setLeft(remaining <= IDLE_WARNING_MS ? remaining : null);
      }
    };
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(check, 15_000);
    const first = window.setTimeout(check, 0);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, [privileged]);

  return {
    warning: privileged && left !== null,
    secondsLeft: left === null ? 0 : Math.ceil(left / 1000),
    stay: () => {
      markActive();
      setLeft(null);
    },
  };
}

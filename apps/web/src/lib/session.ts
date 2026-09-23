import type { AuthResponse, MeDto, SiteKind, SiteRole } from '@apartman/shared';
import { useSyncExternalStore } from 'react';

export interface SessionState {
  accessToken: string | null;
  user: MeDto | null;
  siteId: string | null;
  siteKinds: Record<string, SiteKind>;
}

const SITE_KEY = 'apartman.activeSiteId';

function readStoredSite(): string | null {
  try {
    return localStorage.getItem(SITE_KEY);
  } catch {
    return null;
  }
}

function storeSite(siteId: string | null) {
  try {
    if (siteId) localStorage.setItem(SITE_KEY, siteId);
    else localStorage.removeItem(SITE_KEY);
  } catch {
    return;
  }
}

let state: SessionState = {
  accessToken: null,
  user: null,
  siteId: readStoredSite(),
  siteKinds: {},
};
const listeners = new Set<() => void>();

function setState(next: Partial<SessionState>) {
  state = { ...state, ...next };
  if ('siteId' in next) storeSite(state.siteId);
  listeners.forEach((listener) => listener());
}

export const session = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setAuth(auth: AuthResponse) {
    const memberships = auth.user.memberships;
    const stored = state.siteId;
    const storedIsValid =
      stored !== null &&
      (auth.user.isPlatformAdmin || memberships.some((m) => m.siteId === stored));
    setState({
      accessToken: auth.accessToken,
      user: auth.user,
      siteId: storedIsValid ? stored : (memberships[0]?.siteId ?? null),
      siteKinds: {
        ...state.siteKinds,
        ...Object.fromEntries(memberships.map((m) => [m.siteId, m.siteKind])),
        ...Object.fromEntries(auth.user.occupancies.map((o) => [o.siteId, o.siteKind])),
      },
    });
  },
  registerSiteKinds(sites: { id: string; kind: SiteKind }[]) {
    const next = { ...state.siteKinds };
    let changed = false;
    for (const site of sites) {
      if (next[site.id] !== site.kind) {
        next[site.id] = site.kind;
        changed = true;
      }
    }
    if (changed) setState({ siteKinds: next });
  },
  setUser(user: MeDto) {
    setState({ user });
  },
  setSite(siteId: string | null) {
    setState({ siteId });
  },
  clear() {
    setState({ accessToken: null, user: null });
  },
};

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.get);
}

export type ActiveRole = SiteRole | 'PLATFORM_ADMIN' | null;

export function activeRole(s: SessionState): ActiveRole {
  if (!s.user) return null;
  if (s.user.isPlatformAdmin) return 'PLATFORM_ADMIN';
  return s.user.memberships.find((m) => m.siteId === s.siteId)?.role ?? null;
}

export function canManage(role: ActiveRole): boolean {
  return role === 'SITE_MANAGER' || role === 'PLATFORM_ADMIN';
}

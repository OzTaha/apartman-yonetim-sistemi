const key = (userId: string) => `apartman.tours.${userId}`;
const RESTART = 'apartman:tour-restart';

function seen(userId: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(userId)) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function hasSeenTour(userId: string, id: string): boolean {
  const list = seen(userId);
  return list.includes('*') || list.includes(id);
}

export function markTourSeen(userId: string, id: string) {
  try {
    localStorage.setItem(key(userId), JSON.stringify([...new Set([...seen(userId), id])]));
  } catch {
    return;
  }
}

export function restartTours(userId: string) {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(RESTART));
}

export function onTourRestart(listener: () => void): () => void {
  window.addEventListener(RESTART, listener);
  return () => window.removeEventListener(RESTART, listener);
}

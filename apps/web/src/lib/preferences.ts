import { themeColorHex, type ThemeColor } from '@apartman/shared';
import { useSyncExternalStore } from 'react';

export type TextSize = 'm' | 'l' | 'xl';
export type ColorMode = 'system' | 'light' | 'dark';

export interface Preferences {
  textSize: TextSize;
  colorMode: ColorMode;
}

const KEY = 'apartman.preferences';
const COLOR_KEY = 'apartman.themeColor';
const defaults: Preferences = { textSize: 'm', colorMode: 'system' };
const media = window.matchMedia('(prefers-color-scheme: dark)');

function store(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function load(): Preferences {
  try {
    const raw = JSON.parse(read(KEY) ?? '{}') as Partial<Preferences>;
    return {
      textSize: raw.textSize === 'l' || raw.textSize === 'xl' ? raw.textSize : 'm',
      colorMode: raw.colorMode === 'light' || raw.colorMode === 'dark' ? raw.colorMode : 'system',
    };
  } catch {
    return defaults;
  }
}

let current = load();
const listeners = new Set<() => void>();

function isDark(mode: ColorMode): boolean {
  return mode === 'dark' || (mode === 'system' && media.matches);
}

function setMetaThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  meta.setAttribute(
    'content',
    getComputedStyle(document.documentElement).getPropertyValue('--background').trim() || '#F3F1EC',
  );
}

function apply() {
  const root = document.documentElement;
  if (current.textSize === 'm') root.removeAttribute('data-text-size');
  else root.setAttribute('data-text-size', current.textSize);
  root.classList.toggle('dark', isDark(current.colorMode));
  setMetaThemeColor();
}

export function applyThemeColor(color: ThemeColor) {
  const root = document.documentElement;
  if (color === 'BLUE') root.removeAttribute('data-theme-color');
  else root.setAttribute('data-theme-color', color.toLowerCase());
  store(COLOR_KEY, color);
  setMetaThemeColor();
}

export function initPreferences() {
  const color = read(COLOR_KEY);
  if (color && color in themeColorHex) applyThemeColor(color as ThemeColor);
  apply();
  media.addEventListener('change', () => {
    if (current.colorMode === 'system') apply();
  });
}

export function setPreferences(patch: Partial<Preferences>) {
  current = { ...current, ...patch };
  store(KEY, JSON.stringify(current));
  apply();
  listeners.forEach((l) => l());
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function useIsDark(): boolean {
  const prefs = usePreferences();
  const systemDark = useSyncExternalStore(
    (l) => {
      media.addEventListener('change', l);
      return () => media.removeEventListener('change', l);
    },
    () => media.matches,
  );
  return prefs.colorMode === 'dark' || (prefs.colorMode === 'system' && systemDark);
}

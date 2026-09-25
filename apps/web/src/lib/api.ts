import type { ApiErrorBody, AuthResponse } from '@apartman/shared';
import { session } from './session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: ApiErrorBody['errors'] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshing: Promise<boolean> | null = null;

async function requestRefresh(): Promise<Response> {
  return fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
}

export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      let response = await requestRefresh();
      if (response.status === 401 && session.get().accessToken) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        response = await requestRefresh();
      }
      if (!response.ok) {
        session.clear();
        return false;
      }
      session.setAuth((await response.json()) as AuthResponse);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  siteId?: string | null;
  noRetry?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, siteId, noRetry, headers, ...init } = options;
  const { accessToken, siteId: activeSiteId } = session.get();
  const site = siteId === undefined ? activeSiteId : siteId;

  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(site ? { 'X-Site-Id': site } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && !noRetry && accessToken) {
    if (await refreshSession()) return apiFetch<T>(path, { ...options, noRetry: true });
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as Partial<ApiErrorBody>;
    const message =
      typeof payload.message === 'string'
        ? payload.message
        : `İstek başarısız oldu (${response.status})`;
    throw new ApiError(response.status, message, payload.errors);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { accessToken, siteId } = session.get();
  const request = () =>
    fetch(`/api${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        ...(session.get().accessToken
          ? { Authorization: `Bearer ${session.get().accessToken}` }
          : {}),
        ...(siteId ? { 'X-Site-Id': siteId } : {}),
      },
    });
  let response = await request();
  if (response.status === 401 && accessToken && (await refreshSession()))
    response = await request();
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Partial<ApiErrorBody>;
    const message =
      typeof body.message === 'string' ? body.message : `İstek başarısız oldu (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return response;
}

async function fetchFile(path: string, fallbackName: string) {
  const response = await authorizedFetch(path);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : fallbackName;
  return { filename, blob: await response.blob() };
}

export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const { filename, blob } = await fetchFile(path, fallbackName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError)
    return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.';
  return 'Beklenmeyen bir hata oluştu';
}

export async function openFile(path: string, fallbackName: string): Promise<void> {
  const target = window.open('', '_blank');
  try {
    const { blob } = await fetchFile(path, fallbackName);
    const url = URL.createObjectURL(blob);
    if (target) target.location.href = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    target?.close();
    throw error;
  }
}

export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append('file', file);
  const response = await authorizedFetch(path, { method: 'POST', body });
  return (await response.json()) as T;
}

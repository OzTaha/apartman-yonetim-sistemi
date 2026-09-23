import type { AuthResponse, LoginInput } from '@apartman/shared';
import { apiFetch, refreshSession } from './api';
import { queryClient } from './query-client';
import { session } from './session';

export async function login(input: LoginInput): Promise<void> {
  const auth = await apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: input,
    noRetry: true,
  });
  session.setAuth(auth);
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST', noRetry: true });
  } finally {
    session.clear();
    queryClient.clear();
  }
}

export async function ensureSession(): Promise<boolean> {
  if (session.get().accessToken) return true;
  return refreshSession();
}

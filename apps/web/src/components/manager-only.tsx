import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { activeRole, canManage, useSession } from '@/lib/session';

export function ManagerOnly({ children }: { children: ReactNode }) {
  const s = useSession();
  if (!canManage(activeRole(s)) || !s.siteId) return <Navigate to="/" replace />;
  return <>{children}</>;
}

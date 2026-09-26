import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { activeRole, canManage, useSession, type ActiveRole } from '@/lib/session';

export function ManagerOnly({
  children,
  allow = [],
}: {
  children: ReactNode;
  allow?: ActiveRole[];
}) {
  const s = useSession();
  const role = activeRole(s);
  if (!(canManage(role) || allow.includes(role)) || !s.siteId) return <Navigate to="/" replace />;
  return <>{children}</>;
}

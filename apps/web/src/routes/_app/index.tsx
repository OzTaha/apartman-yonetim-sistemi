import { Navigate, createFileRoute } from '@tanstack/react-router';
import { EmptyState } from '@/components/page';
import { activeRole, canManage, useSession } from '@/lib/session';

export const Route = createFileRoute('/_app/')({
  component: HomeRedirect,
});

function HomeRedirect() {
  const s = useSession();
  const role = activeRole(s);

  if ((canManage(role) || role === 'AUDITOR') && s.siteId) return <Navigate to="/panel" replace />;
  if (role === 'BLOCK_MANAGER' && s.siteId) return <Navigate to="/daireler" replace />;
  if (role === 'STAFF' && s.siteId) return <Navigate to="/islerim" replace />;
  if ((s.user?.occupancies.length ?? 0) > 0) return <Navigate to="/dairem" replace />;
  if (s.user?.isPlatformAdmin) return <Navigate to="/siteler" replace />;

  return (
    <EmptyState
      title="Henüz bir siteye bağlı değilsiniz"
      description="Site yönetiminizden sizi sisteme eklemesini isteyin."
    />
  );
}

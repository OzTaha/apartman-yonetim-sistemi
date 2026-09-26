import { Outlet, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { ensureSession } from '@/lib/auth';
import { useBranding } from '@/lib/branding';
import { session, useSession } from '@/lib/session';
import { useSiteOptions } from '@/lib/site-options';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    if (!(await ensureSession())) {
      throw redirect({ to: '/giris', search: { redirect: location.href } });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const s = useSession();
  const navigate = useNavigate();
  const siteOptions = useSiteOptions();

  useEffect(() => {
    if (!s.accessToken) void navigate({ to: '/giris' });
  }, [s.accessToken, navigate]);

  useEffect(() => {
    if (!s.user?.isPlatformAdmin || siteOptions.length === 0) return;
    if (!siteOptions.some((o) => o.id === s.siteId)) session.setSite(siteOptions[0]!.id);
  }, [s.user?.isPlatformAdmin, s.siteId, siteOptions]);

  useEffect(() => {
    session.registerSiteKinds(siteOptions);
  }, [siteOptions]);

  const siteName = siteOptions.find((o) => o.id === s.siteId)?.name;
  const { appName } = useBranding();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger aria-label="Menüyü aç/kapat" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
          <span className="truncate text-sm font-medium">{siteName ?? appName}</span>
        </header>
        <div className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

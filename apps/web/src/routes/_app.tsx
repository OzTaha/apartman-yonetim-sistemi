import {
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { AppearanceMenu } from '@/components/appearance-menu';
import { MobileTabBar } from '@/components/mobile-tab-bar';
import { NotificationBell } from '@/components/notification-bell';
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    content.current?.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }, [pathname]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur box-content">
          <SidebarTrigger aria-label="Menüyü aç/kapat" className="max-md:hidden" />
          <Separator
            orientation="vertical"
            className="mr-1 max-md:hidden data-[orientation=vertical]:h-5"
          />
          <span className="min-w-0 flex-1 truncate font-heading text-base font-semibold">
            {siteName ?? appName}
          </span>
          <AppearanceMenu />
          <NotificationBell />
        </header>
        <div ref={content} className="mx-auto w-full max-w-6xl flex-1 p-4 pb-28 md:p-6">
          <Outlet />
        </div>
        <MobileTabBar />
      </SidebarInset>
    </SidebarProvider>
  );
}

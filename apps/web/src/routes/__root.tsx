import type { QueryClient } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { useEffect } from 'react';
import { OfflineScreen } from '@/components/offline-screen';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useBranding } from '@/lib/branding';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => (
    <div className="flex min-h-svh items-center justify-center p-4 text-muted-foreground">
      Sayfa bulunamadı.
    </div>
  ),
});

function RootLayout() {
  const { appName } = useBranding();
  useEffect(() => {
    document.title = appName;
  }, [appName]);

  return (
    <TooltipProvider>
      <div className="min-h-svh bg-background text-foreground">
        <Outlet />
      </div>
      <Toaster position="top-center" richColors closeButton />
      <OfflineScreen />
    </TooltipProvider>
  );
}

import { useSites } from './queries';
import { useSession } from './session';

export interface SiteOption {
  id: string;
  name: string;
}

export function useSiteOptions(): SiteOption[] {
  const s = useSession();
  const sites = useSites();
  if (s.user?.isPlatformAdmin)
    return (sites.data ?? []).map((site) => ({ id: site.id, name: site.name }));
  return (s.user?.memberships ?? []).map((m) => ({ id: m.siteId, name: m.siteName }));
}

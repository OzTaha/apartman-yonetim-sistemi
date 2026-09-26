import { unitLabel, type SiteKind } from '@apartman/shared';
import { session, useSession } from './session';

export function activeSiteKind(): SiteKind {
  const { siteId, siteKinds } = session.get();
  return (siteId && siteKinds[siteId]) || 'SITE';
}

export function labelUnit(blockName: string, number: string, style: 'long' | 'short' = 'long') {
  return unitLabel(activeSiteKind(), blockName, number, style);
}

export function blockScopeLabel(blockName: string | null): string {
  return blockName ? `${blockName} Blok` : 'Site geneli';
}

export function useSiteKind(): SiteKind {
  const { siteId, siteKinds } = useSession();
  return (siteId && siteKinds[siteId]) || 'SITE';
}

export function useIsApartment(): boolean {
  return useSiteKind() === 'APARTMENT';
}

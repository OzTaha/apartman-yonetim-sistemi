import { DEFAULT_APP_NAME, type BrandingDto } from '@apartman/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

export const brandingKey = ['branding'] as const;

export function useBranding(): BrandingDto {
  const branding = useQuery({
    queryKey: brandingKey,
    queryFn: () => apiFetch<BrandingDto>('/branding', { noRetry: true }),
    staleTime: 5 * 60_000,
  });
  return branding.data ?? { appName: DEFAULT_APP_NAME, logoUrl: null };
}

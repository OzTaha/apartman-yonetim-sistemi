import { DEFAULT_APP_NAME, type BrandingDto, type ThemeColor } from '@apartman/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

function storedThemeColor(): ThemeColor {
  const value = document.documentElement.getAttribute('data-theme-color');
  return value === 'green' ? 'GREEN' : value === 'lavender' ? 'LAVENDER' : 'BLUE';
}

export const brandingKey = ['branding'] as const;

export function useBranding(): BrandingDto {
  const branding = useQuery({
    queryKey: brandingKey,
    queryFn: () => apiFetch<BrandingDto>('/branding', { noRetry: true }),
    staleTime: 5 * 60_000,
  });
  return (
    branding.data ?? {
      appName: DEFAULT_APP_NAME,
      logoUrl: null,
      themeColor: storedThemeColor(),
      loginNotice: false,
    }
  );
}

import { z } from 'zod';

export const DEFAULT_APP_NAME = 'Apartman Yönetim Sistemi';
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_MIN_SIZE = 512;
export const LOGO_MAX_SIZE = 2048;

export const brandingSchema = z.object({
  appName: z
    .string()
    .trim()
    .min(2, 'En az 2 karakter olmalıdır')
    .max(40, 'En fazla 40 karakter olabilir'),
});
export type BrandingInput = z.input<typeof brandingSchema>;

export const themeColors = ['BLUE', 'GREEN', 'LAVENDER'] as const;
export type ThemeColor = (typeof themeColors)[number];
export const DEFAULT_THEME_COLOR: ThemeColor = 'BLUE';
export const themeColorLabels: Record<ThemeColor, string> = {
  BLUE: 'Mavi',
  GREEN: 'Yeşil',
  LAVENDER: 'Lavanta',
};
export const themeColorHex: Record<ThemeColor, string> = {
  BLUE: '#0F4C81',
  GREEN: '#00775C',
  LAVENDER: '#4F5096',
};
export const themeColorSchema = z.object({ themeColor: z.enum(themeColors) });
export type ThemeColorInput = z.input<typeof themeColorSchema>;

export interface BrandingDto {
  appName: string;
  logoUrl: string | null;
  themeColor: ThemeColor;
}

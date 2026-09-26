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

export interface BrandingDto {
  appName: string;
  logoUrl: string | null;
}

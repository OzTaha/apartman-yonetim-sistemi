export const Role = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  SITE_MANAGER: 'SITE_MANAGER',
  BLOCK_MANAGER: 'BLOCK_MANAGER',
  AUDITOR: 'AUDITOR',
  RESIDENT: 'RESIDENT',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

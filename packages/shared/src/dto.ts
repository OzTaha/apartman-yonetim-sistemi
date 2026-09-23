import type { OccupancyType } from './schemas';

export type SiteRole = 'SITE_MANAGER' | 'RESIDENT';

export type SiteKind = 'APARTMENT' | 'SITE';

export const siteKindLabels: Record<SiteKind, string> = {
  APARTMENT: 'Apartman',
  SITE: 'Site',
};

export function unitLabel(
  kind: SiteKind | undefined,
  blockName: string,
  number: string,
  style: 'long' | 'short' = 'long',
): string {
  if (kind === 'APARTMENT') return style === 'long' ? `Daire ${number}` : number;
  return style === 'long' ? `${blockName} Blok · Daire ${number}` : `${blockName}-${number}`;
}

export interface MembershipDto {
  siteId: string;
  siteName: string;
  siteKind: SiteKind;
  role: SiteRole;
}

export interface MyOccupancyDto {
  occupancyId: string;
  siteId: string;
  siteName: string;
  siteKind: SiteKind;
  unitId: string;
  blockName: string;
  unitNumber: string;
  type: OccupancyType;
}

export interface MeDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isPlatformAdmin: boolean;
  memberships: MembershipDto[];
  occupancies: MyOccupancyDto[];
}

export interface AuthResponse {
  accessToken: string;
  user: MeDto;
}

export interface SiteDto {
  id: string;
  name: string;
  kind: SiteKind;
  address: string | null;
  city: string | null;
  createdAt: string;
  blockCount: number;
  unitCount: number;
  managers: { id: string; firstName: string; lastName: string }[];
}

export interface BlockDto {
  id: string;
  name: string;
  unitCount: number;
  deletable: boolean;
}

export interface OccupantSummaryDto {
  id: string;
  firstName: string;
  lastName: string;
  type: OccupancyType;
  phone: string | null;
}

export interface UnitDto {
  id: string;
  blockId: string;
  blockName: string;
  number: string;
  floor: number | null;
  areaM2: number | null;
  landShare: number | null;
  archivedAt: string | null;
  occupants: OccupantSummaryDto[];
}

export interface OccupancyDto {
  id: string;
  unitId: string;
  blockName: string;
  unitNumber: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  type: OccupancyType;
  startDate: string;
  endDate: string | null;
  isResponsibleForDues: boolean;
  contactConsent: boolean;
  contactConsentAt: string | null;
  notes: string | null;
  hasAccount: boolean;
}

export interface UnitDetailDto extends Omit<UnitDto, 'occupants'> {
  occupancies: OccupancyDto[];
}

export interface UnitRemovalDto {
  canDelete: boolean;
  canArchive: boolean;
  chargeCount: number;
  openKurus: number;
  paymentCount: number;
  occupancyCount: number;
  activeResidentCount: number;
}

export interface BulkUnitsResultDto {
  created: number;
  skipped: string[];
}

export interface InvitationDto {
  url: string;
  expiresAt: string;
}

export interface InvitationInfoDto {
  firstName: string;
  lastName: string;
  siteName: string;
  siteKind: SiteKind;
  blockName: string;
  unitNumber: string;
  hasExistingAccount: boolean;
}

export type AcceptInviteResultDto =
  ({ status: 'ACTIVATED' } & AuthResponse) | { status: 'LINKED_EXISTING' };

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  errors?: { path: string; message: string }[];
}

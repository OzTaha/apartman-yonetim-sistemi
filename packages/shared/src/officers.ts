import { z } from 'zod';
import { idSchema } from './schemas';

export type OfficerRole = 'BLOCK_MANAGER' | 'AUDITOR';
export const officerRoleSchema = z.enum(['BLOCK_MANAGER', 'AUDITOR']);

export const officerAssignSchema = z
  .object({
    userId: idSchema,
    role: officerRoleSchema,
    blockIds: z.array(idSchema).max(200).default([]),
  })
  .refine((v) => v.role !== 'BLOCK_MANAGER' || v.blockIds.length > 0, {
    message: 'En az bir blok seçin',
    path: ['blockIds'],
  });
export type OfficerAssignInput = z.input<typeof officerAssignSchema>;

export interface OfficerDto {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  role: OfficerRole;
  blocks: { id: string; name: string }[];
  units: string[];
}

export interface OfficerCandidateDto {
  userId: string;
  name: string;
  units: string[];
}

import { z } from 'zod';
import { dateSchema, idSchema } from './schemas';

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;

export const pollCreateSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(5, 'Soruyu yazın (en az 5 karakter)')
      .max(300, 'Soru en fazla 300 karakter olabilir'),
    options: z
      .array(z.string().trim().min(1, 'Seçeneği yazın').max(120, 'Seçenek en fazla 120 karakter'))
      .min(POLL_MIN_OPTIONS, `En az ${POLL_MIN_OPTIONS} seçenek girin`)
      .max(POLL_MAX_OPTIONS, `En fazla ${POLL_MAX_OPTIONS} seçenek olabilir`),
    endsOn: dateSchema,
    audience: z.enum(['ALL', 'BLOCKS']),
    blockIds: z.array(idSchema).default([]),
  })
  .refine(
    (v) => new Set(v.options.map((o) => o.toLocaleLowerCase('tr'))).size === v.options.length,
    { message: 'Aynı seçenek iki kez yazılmış', path: ['options'] },
  )
  .refine((v) => v.audience === 'ALL' || v.blockIds.length > 0, {
    message: 'En az bir blok seçin',
    path: ['blockIds'],
  });
export type PollCreateInput = z.input<typeof pollCreateSchema>;

export const pollVoteSchema = z.object({ unitId: idSchema, optionId: idSchema });
export type PollVoteInput = z.input<typeof pollVoteSchema>;

export type PollStatus = 'OPEN' | 'CLOSED';
export type PollAudience = 'ALL' | 'BLOCKS';

export interface PollOptionResultDto {
  id: string;
  label: string;
  votes: number;
}

export interface PollDto {
  id: string;
  question: string;
  endsOn: string;
  status: PollStatus;
  audience: PollAudience;
  blockNames: string[];
  votedUnits: number;
  eligibleUnits: number;
  sharedAt: string | null;
  createdAt: string;
}

export interface PollDetailDto extends PollDto {
  options: PollOptionResultDto[];
  voted: string[];
  notVoted: string[];
}

export interface ResidentPollUnitDto {
  unitId: string;
  label: string;
  optionId: string | null;
}

export interface ResidentPollDto {
  id: string;
  question: string;
  endsOn: string;
  status: PollStatus;
  options: { id: string; label: string; votes: number | null }[];
  units: ResidentPollUnitDto[];
  totalVotes: number | null;
}

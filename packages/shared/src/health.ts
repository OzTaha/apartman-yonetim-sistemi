import { z } from 'zod';

export const serviceStatusSchema = z.enum(['up', 'down']);

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  services: z.object({
    database: serviceStatusSchema,
    redis: serviceStatusSchema,
  }),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

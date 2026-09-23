import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@apartman/shared';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthController } from './health.controller';

async function createController(database: boolean, redis: boolean) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: PrismaService, useValue: { isHealthy: async () => database } },
      { provide: RedisService, useValue: { isHealthy: async () => redis } },
    ],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('tüm servisler çalışıyorsa "ok" döner', async () => {
    const result = await (await createController(true, true)).check();
    expect(healthResponseSchema.parse(result)).toBeTruthy();
    expect(result.status).toBe('ok');
    expect(result.services).toEqual({ database: 'up', redis: 'up' });
  });

  it('bir servis kapalıysa "degraded" döner', async () => {
    const result = await (await createController(false, true)).check();
    expect(result.status).toBe('degraded');
    expect(result.services.database).toBe('down');
  });
});

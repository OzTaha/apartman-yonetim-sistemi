import { PASSWORD_RESET_HOURS } from '@apartman/shared';
import { generateOpaqueToken, sha256 } from '../../common/crypto';
import type { PrismaClient } from '../../generated/prisma/client';

export async function createResetLink(
  prisma: Pick<PrismaClient, 'passwordReset' | '$transaction'>,
  options: { userId: string; createdById: string | null; webOrigin: string },
): Promise<{ url: string; expiresAt: Date }> {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_HOURS * 3_600_000);
  await prisma.$transaction([
    prisma.passwordReset.updateMany({
      where: { userId: options.userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    }),
    prisma.passwordReset.create({
      data: {
        userId: options.userId,
        tokenHash: sha256(token),
        expiresAt,
        createdById: options.createdById,
      },
    }),
  ]);
  return { url: `${options.webOrigin.replace(/\/$/, '')}/sifre-yenile/${token}`, expiresAt };
}

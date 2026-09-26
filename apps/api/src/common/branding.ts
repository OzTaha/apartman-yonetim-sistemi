import { DEFAULT_APP_NAME } from '@apartman/shared';
import type { PrismaService } from '../prisma/prisma.service';

export async function appName(prisma: PrismaService): Promise<string> {
  const branding = await prisma.branding.findUnique({ where: { id: 1 } });
  return branding?.appName ?? DEFAULT_APP_NAME;
}

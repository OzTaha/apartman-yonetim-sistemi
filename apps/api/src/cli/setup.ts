import 'reflect-metadata';
import {
  brandingSchema,
  emailSchema,
  nameSchema,
  passwordSchema,
  siteKindSchema,
} from '@apartman/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../modules/auth/password';
import { ensureFinanceDefaults } from '../modules/finance/finance.ledger';
import { APARTMENT_BLOCK_NAME } from '../modules/sites/sites.service';

const inputSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SETUP_ADMIN_FIRST_NAME: nameSchema,
  SETUP_ADMIN_LAST_NAME: nameSchema,
  SETUP_ADMIN_EMAIL: emailSchema,
  SETUP_ADMIN_PASSWORD: passwordSchema,
  SETUP_SITE_NAME: z.string().trim().min(2).max(100),
  SETUP_SITE_KIND: siteKindSchema,
  SETUP_APP_NAME: brandingSchema.shape.appName,
});

async function main() {
  const parsed = inputSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Kurulum bilgileri eksik veya hatalı:\n${details}`);
  }
  const input = parsed.data;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: input.DATABASE_URL }),
  });
  try {
    if ((await prisma.user.count()) > 0) {
      throw new Error('Kurulum daha önce yapılmış; veritabanında kullanıcı var.');
    }
    const passwordHash = await hashPassword(input.SETUP_ADMIN_PASSWORD);
    const site = await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          firstName: input.SETUP_ADMIN_FIRST_NAME,
          lastName: input.SETUP_ADMIN_LAST_NAME,
          email: input.SETUP_ADMIN_EMAIL,
          passwordHash,
          isPlatformAdmin: true,
        },
      });
      await tx.branding.upsert({
        where: { id: 1 },
        create: { id: 1, appName: input.SETUP_APP_NAME },
        update: { appName: input.SETUP_APP_NAME },
      });
      const created = await tx.site.create({
        data: {
          name: input.SETUP_SITE_NAME,
          kind: input.SETUP_SITE_KIND,
          settings: { proportionalDues: false },
        },
      });
      if (created.kind === 'APARTMENT') {
        await tx.block.create({ data: { siteId: created.id, name: APARTMENT_BLOCK_NAME } });
      }
      await ensureFinanceDefaults(tx, created.id);
      return created;
    });
    console.log(`Kurulum tamamlandı: ${site.name}`);
    console.log(`Sistem yöneticisi: ${input.SETUP_ADMIN_EMAIL}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});

import { normalizeTrPhone, PASSWORD_RESET_HOURS } from '@apartman/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { createResetLink } from '../modules/password-reset/tokens';

async function main() {
  const identifier = process.argv[2]?.trim();
  const { DATABASE_URL, WEB_ORIGIN } = process.env;
  if (!identifier) {
    throw new Error('Kullanım: node dist/cli/reset-password.js <e-posta veya telefon>');
  }
  if (!DATABASE_URL || !WEB_ORIGIN) throw new Error('DATABASE_URL ve WEB_ORIGIN tanımlı olmalı');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
  try {
    const phone = identifier.includes('@') ? null : normalizeTrPhone(identifier);
    const user = identifier.includes('@')
      ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } })
      : phone
        ? await prisma.user.findUnique({ where: { phone } })
        : null;
    if (!user) throw new Error(`Kullanıcı bulunamadı: ${identifier}`);

    const link = await createResetLink(prisma, {
      userId: user.id,
      createdById: null,
      webOrigin: WEB_ORIGIN,
    });
    await prisma.auditLog.create({
      data: { action: 'PASSWORD_RESET_LINK', entityType: 'User', entityId: user.id },
    });
    console.log(`${user.firstName} ${user.lastName} için şifre yenileme bağlantısı`);
    console.log(`(tek kullanımlık, ${PASSWORD_RESET_HOURS} saat geçerli):`);
    console.log(link.url);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});

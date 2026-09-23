import { execSync } from 'node:child_process';
import { Client } from 'pg';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL tanımlı değil');

const dbName = new URL(url).pathname.slice(1);
if (!/_e2e$/.test(dbName)) {
  throw new Error(`Bu betik yalnızca adı _e2e ile biten test veritabanlarında çalışır: ${dbName}`);
}

async function main() {
  const adminUrl = new URL(url!);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  execSync('pnpm exec prisma migrate deploy', { stdio: 'pipe', env: process.env });

  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('TRUNCATE TABLE users, sites CASCADE');
  } finally {
    await db.end();
  }

  execSync('pnpm exec tsx prisma/seed.ts', { stdio: 'inherit', env: process.env });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

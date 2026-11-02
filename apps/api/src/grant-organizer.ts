import { Prisma, PrismaClient } from '@prisma/client';
async function main() {
  const firebaseUid = process.argv.slice(2).find(arg => arg !== '--administrator');
  if (!firebaseUid) throw new Error('Provide the Firebase UID.');
  const db = new PrismaClient();
  try {
    const role = process.argv.includes('--administrator') ? 'ADMINISTRATOR' : 'ORGANIZER';
    const user = await db.user.update({ where: { firebaseUid }, data: { role } });
    console.log(`${role} access granted to profile ${user.id}.`);
  } finally { await db.$disconnect(); }
}
void main().catch((error: unknown) => {
  if (!process.argv.slice(2).some(arg => arg !== '--administrator')) {
    console.error('Provide a Firebase UID: npm run organizer:grant (or administrator:grant) --workspace @tri-city/api -- YOUR_FIREBASE_UID');
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    console.error('No application profile exists for this Firebase UID in the configured database. Sign in through the website and ensure GET /api/me succeeds, then retry. A Firebase Authentication user alone does not create a PostgreSQL profile.');
  } else {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Prisma.PrismaClientInitializationError ? error.errorCode : undefined;
    console.error(`Could not grant organizer access${code ? ` (${code})` : ''}. Check the database connection, applied migrations and generated Prisma client.`);
  }
  process.exitCode = 1;
});

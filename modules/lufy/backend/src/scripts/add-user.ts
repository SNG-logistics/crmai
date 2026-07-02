import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Add (or update) a lufy.cc user.
 *
 * Usage:
 *   npm run add-user -- <username> <password> [admin|user]
 *
 * Example:
 *   npm run add-user -- kengplsz@gmail.com MyPass123 admin
 *
 * If the username already exists, its password / admin flag are updated.
 */
async function main() {
  const username = process.argv[2];
  const password = process.argv[3];
  const role = (process.argv[4] || 'admin').toLowerCase();
  const isAdmin = role !== 'user';

  if (!username || !password) {
    console.error('❌ Usage: npm run add-user -- <username> <password> [admin|user]');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { username },
    update: { passwordHash, isAdmin },
    create: { username, passwordHash, isAdmin },
  });

  console.log(`✅ User "${user.username}" saved (admin=${user.isAdmin}).`);
  console.log(`   Login at http://localhost:3002/login  →  ${username} / ${password}`);
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

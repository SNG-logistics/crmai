import dotenv from 'dotenv';
dotenv.config();

import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'happy77' } });
  if (!tenant) { console.error('❌ Tenant happy77 not found'); return; }

  const hash = await bcrypt.hash('Happy77.', 10);

  const user = await prisma.user.upsert({
    where: { tenantId_username: { tenantId: tenant.id, username: '0925718211' } },
    create: {
      tenantId: tenant.id,
      username: '0925718211',
      email: '0925718211@happy77.com',
      passwordHash: hash,
      displayName: 'Admin 0925718211',
      role: 'admin',
      isActive: true,
    },
    update: {
      passwordHash: hash,
      isActive: true,
    },
  });

  console.log('✅ User created/updated:', user.username, '| Role:', user.role, '| ID:', user.id);
}

main().catch(console.error).finally(() => prisma.$disconnect());

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding lufy.cc database...');

  // Create admin user
  const adminExists = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!adminExists) {
    const hash = await bcrypt.hash('admin1234', 12);
    await prisma.user.create({
      data: { username: 'admin', passwordHash: hash, isAdmin: true },
    });
    console.log('✅ Created admin user: admin / admin1234');
  } else {
    console.log('ℹ️  Admin user already exists');
  }

  // Create demo user
  const demoExists = await prisma.user.findUnique({ where: { username: 'demo' } });
  if (!demoExists) {
    const hash = await bcrypt.hash('demo1234', 12);
    const user = await prisma.user.create({
      data: { username: 'demo', passwordHash: hash, isAdmin: false },
    });

    // Create sample link
    await prisma.link.create({
      data: {
        userId: user.id,
        slug: 'hello',
        type: 'simple',
        destinationUrl: 'https://example.com',
        comment: 'ลิงก์ตัวอย่าง',
        status: 'active',
      },
    });
    console.log('✅ Created demo user: demo / demo1234 with sample link /hello');
  }

  console.log('✨ Seed complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());

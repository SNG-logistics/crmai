/**
 * สร้าง Tenant ใหม่พร้อม Admin User
 * รันด้วย: npx ts-node src/scripts/create-tenant.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import * as readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>(res => rl.question(q, res));

async function main() {
  console.log('\n🚀 สร้าง Tenant ใหม่\n' + '='.repeat(50));

  // แสดง tenants ที่มีอยู่
  const existing = await prisma.tenant.findMany({ select: { slug: true, name: true, plan: true, isActive: true } });
  console.log('\n📋 Tenants ที่มีอยู่:');
  console.table(existing);

  // รับข้อมูล
  const name          = await ask('\n📛 ชื่อ Tenant (เช่น Happy Casino): ');
  const slug          = await ask('🔑 Slug (เช่น happycasino, ห้ามมีช่องว่าง/อักษรพิเศษ): ');
  const plan          = await ask('📦 Plan [starter/pro/enterprise] (Enter = starter): ') || 'starter';
  const adminEmail    = await ask('📧 Admin Email: ');
  const adminPassword = await ask('🔒 Admin Password (Enter = Admin@1234): ') || 'Admin@1234';
  const adminName     = await ask('👤 Admin Display Name: ');

  // ตรวจสอบ slug ซ้ำ
  const duplicate = await prisma.tenant.findUnique({ where: { slug: slug.trim().toLowerCase() } });
  if (duplicate) {
    console.error(`\n❌ Slug "${slug}" มีอยู่แล้ว กรุณาใช้ slug อื่น`);
    rl.close(); process.exit(1);
  }

  // สร้าง Tenant
  const tenant = await prisma.tenant.create({
    data: { name: name.trim(), slug: slug.trim().toLowerCase(), plan },
  });
  console.log(`\n✅ สร้าง Tenant: ${tenant.name} (${tenant.slug})`);

  // สร้าง Admin User
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: adminEmail.trim(),
      username: adminEmail.trim(),
      passwordHash,
      displayName: adminName.trim() || 'Admin',
      role: 'admin',
    },
  });
  console.log(`✅ สร้าง Admin: ${user.email}`);

  // สร้าง BotConfig เริ่มต้น
  await prisma.botConfig.create({
    data: {
      tenantId: tenant.id,
      name: `${name} AI Bot`,
      systemPrompt: `คุณเป็น AI Assistant ของ ${name} ที่พร้อมช่วยเหลือลูกค้าด้วยความเป็นมิตรและมืออาชีพ ตอบภาษาไทยเสมอ`,
      model: 'gpt-4o',
      temperature: 0.7,
      isActive: false, // ปิดไว้ก่อน ให้ admin ค่อยเปิดเอง
    },
  });
  console.log(`✅ สร้าง BotConfig เริ่มต้น (ปิดอยู่)`);

  console.log('\n' + '='.repeat(50));
  console.log('🎉 สร้าง Tenant สำเร็จ!');
  console.log(`\n📌 ข้อมูลเข้าระบบ:`);
  console.log(`   URL:      http://localhost:3000/login`);
  console.log(`   Tenant:   ${tenant.slug}`);
  console.log(`   Email:    ${adminEmail}`);
  console.log(`   Password: ${adminPassword}`);
  console.log(`\n⚙️  ขั้นตอนต่อไป:`);
  console.log(`   1. เข้า /settings/channels → เพิ่ม LINE / Telegram`);
  console.log(`   2. เข้า /bot → ตั้งค่า AI Bot`);
  console.log(`   3. เข้า /settings/users → เพิ่ม Agent`);

  rl.close();
}

main()
  .catch(e => { console.error('❌', e.message); rl.close(); process.exit(1); })
  .finally(() => prisma.$disconnect());

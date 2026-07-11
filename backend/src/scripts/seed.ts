import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';

async function seed() {
  console.log('🌱 Seeding database...');

  // Create Super Admin tenant
  const superAdminTenant = await prisma.tenant.upsert({
    where: { slug: 'system' },
    create: { name: 'System', slug: 'system', plan: 'enterprise' },
    update: {},
  });

  // Super Admin user
  const superHash = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD || 'Admin@1234', 12);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: superAdminTenant.id, email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@crm.local' } },
    create: { tenantId: superAdminTenant.id, email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@crm.local', username: 'superadmin', passwordHash: superHash, displayName: 'Super Admin', role: 'superadmin' },
    update: {},
  });

  // Demo Tenant
  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    create: { name: 'Happy77 Demo', slug: 'demo', plan: 'pro' },
    update: {},
  });

  // Demo Admin
  const adminHash = await bcrypt.hash('Admin@1234', 12);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: demoTenant.id, email: 'admin@demo.crm' } },
    create: { tenantId: demoTenant.id, email: 'admin@demo.crm', username: 'admin', passwordHash: adminHash, displayName: 'ผู้ดูแลระบบ', role: 'admin' },
    update: {},
  });

  // Demo Agent
  const agentHash = await bcrypt.hash('Agent@1234', 12);
  const agent = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: demoTenant.id, email: 'agent@demo.crm' } },
    create: { tenantId: demoTenant.id, email: 'agent@demo.crm', username: 'agent01', passwordHash: agentHash, displayName: 'สมชาย เจ้าหน้าที่', role: 'agent' },
    update: {},
  });

  // Bot Config (per-company now — สร้างถ้ายังไม่มีของ tenant นี้)
  const existingBot = await prisma.botConfig.findFirst({ where: { tenantId: demoTenant.id } });
  if (!existingBot) {
    await prisma.botConfig.create({
      data: {
        tenantId: demoTenant.id,
        name: 'AI Bot Happy77',
        systemPrompt: 'คุณเป็น AI Assistant ของ Happy77 พร้อมช่วยเหลือลูกค้าด้วยความเป็นมิตรและมืออาชีพ ตอบภาษาไทยเสมอ',
        model: 'gpt-4o',
        temperature: 0.7,
        isActive: true,
        knowledgeBase: {
          create: [
            { question: 'เวลาทำการ', answer: 'เราเปิดทำการวันจันทร์-ศุกร์ เวลา 9:00-18:00 น.' },
            { question: 'ติดต่อได้อย่างไร', answer: 'ติดต่อได้ผ่าน LINE @mahaheng หรือโทร 02-xxx-xxxx' },
            { question: 'มีสินค้าอะไรบ้าง', answer: 'เรามีสินค้าหลากหลาย กรุณาเยี่ยมชมเว็บไซต์ของเราหรือสอบถามเพิ่มเติมได้เลยค่ะ' },
          ],
        },
      },
    });
  }

  // Demo contacts
  const contact1 = await prisma.contact.upsert({
    where: { tenantId_lineUserId: { tenantId: demoTenant.id, lineUserId: 'U1234567890abcdef' } },
    create: { tenantId: demoTenant.id, displayName: 'สมหญิง รักสวย', lineUserId: 'U1234567890abcdef', email: 'somying@example.com', phone: '0812345678' },
    update: {},
  });

  const contact2 = await prisma.contact.upsert({
    where: { tenantId_telegramId: { tenantId: demoTenant.id, telegramId: '987654321' } },
    create: { tenantId: demoTenant.id, displayName: 'มานี ชื่นใจ', telegramId: '987654321' },
    update: {},
  });

  // Demo conversations
  const conv1 = await prisma.conversation.upsert({
    where: { tenantId_channel_channelId: { tenantId: demoTenant.id, channel: 'line', channelId: 'U1234567890abcdef' } },
    create: { tenantId: demoTenant.id, contactId: contact1.id, channel: 'line', channelId: 'U1234567890abcdef', status: 'bot', isBot: true, assignedToId: agent.id, lastMessageAt: new Date() },
    update: {},
  });

  const msgs = [
    { conversationId: conv1.id, tenantId: demoTenant.id, senderType: 'customer', type: 'text', content: 'สวัสดีค่ะ สอบถามเรื่องสินค้าหน่อยได้ไหมคะ', isRead: true },
    { conversationId: conv1.id, tenantId: demoTenant.id, senderType: 'bot', type: 'text', content: 'สวัสดีค่ะ ยินดีให้บริการนะคะ มีอะไรให้ช่วยได้บ้างคะ?', isRead: false },
    { conversationId: conv1.id, tenantId: demoTenant.id, senderType: 'customer', type: 'text', content: 'อยากทราบราคาสินค้ารุ่นใหม่ค่ะ', isRead: false },
  ];
  for (const m of msgs) { await prisma.message.create({ data: m }); }

  console.log('✅ Seed completed!');
  console.log('📌 Demo login:');
  console.log('  Super Admin: superadmin@crm.local / Admin@1234');
  console.log('  Demo Admin:  admin@demo.crm / Admin@1234  (tenant: demo)');
  console.log('  Demo Agent:  agent@demo.crm / Agent@1234  (tenant: demo)');
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });

/**
 * Backfill (เฟส 1 multi-company) — สร้าง "บริษัทเริ่มต้น" ให้ทุก tenant ที่มีอยู่
 * แล้ว stamp ข้อมูลเดิม (conversations / botConfig / whatsapp) ให้สังกัดบริษัทนั้น
 * รันครั้งเดียวหลัง prisma db push — รันซ้ำได้ (idempotent)
 *
 *   npm run backfill-company
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../lib/prisma';

async function main() {
  const tenants = await prisma.tenant.findMany();
  console.log(`🏢 Backfilling company layer for ${tenants.length} tenant(s)`);

  for (const t of tenants) {
    // 1) บริษัทเริ่มต้น (default) ต่อ tenant
    let company = await prisma.company.findFirst({ where: { tenantId: t.id } });
    if (!company) {
      company = await prisma.company.create({
        data: { tenantId: t.id, name: t.name || 'บริษัทหลัก', slug: t.slug },
      });
      console.log(`  + Company "${company.name}" (${company.id})`);
    } else {
      console.log(`  = Company "${company.name}" already exists`);
    }

    // 2) stamp conversations เดิมที่ยังไม่มี companyId
    const convRes = await prisma.conversation.updateMany({
      where: { tenantId: t.id, companyId: null },
      data: { companyId: company.id },
    });
    if (convRes.count) console.log(`    conversations → company: ${convRes.count}`);

    // 3) stamp botConfig เดิม
    const botRes = await prisma.botConfig.updateMany({
      where: { tenantId: t.id, companyId: null },
      data: { companyId: company.id },
    });
    if (botRes.count) console.log(`    botConfig → company: ${botRes.count}`);

    // 4) WhatsApp: แปลง ChannelConfig(whatsapp) เดิม → WhatsAppAccount ของบริษัทเริ่มต้น
    const waChannel = await prisma.channelConfig.findUnique({
      where: { tenantId_channel: { tenantId: t.id, channel: 'whatsapp' } },
    });
    if (waChannel) {
      let phone: string | null = null;
      try { phone = (JSON.parse(waChannel.config || '{}') || {}).phone || null; } catch { /* ignore */ }

      let account = await prisma.whatsAppAccount.findFirst({ where: { tenantId: t.id, companyId: company.id } });
      if (!account) {
        account = await prisma.whatsAppAccount.create({
          data: {
            tenantId: t.id,
            companyId: company.id,
            label: phone ? `WhatsApp ${phone}` : 'WhatsApp',
            phone,
            // ใช้ tenantId เป็น sessionId → รีใช้โฟลเดอร์ auth_whatsapp/{tenantId} เดิม (เบอร์ที่ต่ออยู่ไม่หลุด)
            sessionId: t.id,
            status: waChannel.isActive ? 'connected' : 'disconnected',
            isActive: waChannel.isActive,
          },
        });
        console.log(`    + WhatsAppAccount (${account.id}) phone=${phone ?? '-'} session=${t.id}`);
      } else if (!account.sessionId) {
        // account ถูกสร้างไว้ก่อนเพิ่มคอลัมน์ sessionId → เติมให้ชี้โฟลเดอร์เดิม
        account = await prisma.whatsAppAccount.update({ where: { id: account.id }, data: { sessionId: t.id } });
        console.log(`    ~ WhatsAppAccount (${account.id}) sessionId → ${t.id}`);
      }

      // ผูก conversations whatsapp เดิมเข้ากับ account นี้
      const waConvRes = await prisma.conversation.updateMany({
        where: { tenantId: t.id, channel: 'whatsapp', whatsAppAccountId: null },
        data: { whatsAppAccountId: account.id },
      });
      if (waConvRes.count) console.log(`    whatsapp conversations → account: ${waConvRes.count}`);
    }
  }

  console.log('✅ Backfill complete');
}

main()
  .catch((e) => { console.error('❌ Backfill failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());

/**
 * wipe-customers — ลบข้อมูล "ลูกค้า + บทสนทนา + ข้อความ" ทั้งหมด
 * เก็บค่าตั้งค่าไว้ (Tenant, Company, User, BotConfig, ChannelConfig, WhatsAppAccount, Tag definitions)
 * ลบตามลำดับ FK เพื่อไม่ให้ติด constraint
 *
 *   npm run wipe-customers
 *
 * ⚠️ ลบถาวร — backup dev.db ก่อนรันเสมอ
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../lib/prisma';

async function main() {
  // ── ก่อนลบ: นับจำนวน ──
  const before = {
    contacts:      await prisma.contact.count(),
    conversations: await prisma.conversation.count(),
    messages:      await prisma.message.count(),
    tickets:       await prisma.ticket.count(),
    callLogs:      await prisma.callLog.count(),
    financials:    await prisma.financialRecord.count(),
    slips:         await prisma.slipVerification.count(),
  };
  console.log('📊 ก่อนลบ:', JSON.stringify(before, null, 2));

  if (before.contacts + before.conversations + before.messages === 0) {
    console.log('✅ ไม่มีข้อมูลลูกค้า/ข้อความให้ลบ');
    return;
  }

  // ── ลบตามลำดับ FK (สิ่งที่อ้างถึง contact/conversation ก่อน แล้วค่อย contact) ──
  const dMsg   = await prisma.message.deleteMany();          // ข้อความทั้งหมด
  const dTk    = await prisma.ticket.deleteMany();           // tickets (อ้าง contact + conversation)
  const dCl    = await prisma.callLog.deleteMany();          // call logs (อ้าง contact)
  const dFin   = await prisma.financialRecord.deleteMany();  // การเงินรายวัน (อ้าง contact)
  const dSlip  = await prisma.slipVerification.deleteMany(); // สลิป (อ้าง contact/message ผ่าน id)
  const dConv  = await prisma.conversation.deleteMany();     // บทสนทนา (อ้าง contact) — cascade message ที่เหลือ
  const dCt    = await prisma.contactTag.deleteMany();       // tag ที่ผูกกับลูกค้า (ไม่แตะ Tag definitions)
  const dContact = await prisma.contact.deleteMany();        // ลูกค้า

  console.log('🗑️  ลบแล้ว:', JSON.stringify({
    messages:      dMsg.count,
    tickets:       dTk.count,
    callLogs:      dCl.count,
    financials:    dFin.count,
    slips:         dSlip.count,
    conversations: dConv.count,
    contactTags:   dCt.count,
    contacts:      dContact.count,
  }, null, 2));

  // ── หลังลบ: ยืนยัน 0 ──
  const after = {
    contacts:      await prisma.contact.count(),
    conversations: await prisma.conversation.count(),
    messages:      await prisma.message.count(),
  };
  console.log('📊 หลังลบ:', JSON.stringify(after, null, 2));
  console.log('✅ เสร็จสิ้น — ค่าตั้งค่า (บริษัท/เบอร์ WhatsApp/ผู้ใช้/AI/ช่องทาง) ยังอยู่ครบ');
}

main()
  .catch((e) => { console.error('❌ wipe failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());

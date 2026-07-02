/**
 * clear-whatsapp — ลบบทสนทนา + ข้อความ WhatsApp ทั้งหมดออกจากฐานข้อมูล
 * ใช้ตอนต้องการเริ่มต้นใหม่ก่อนเชื่อมต่อ WhatsApp เบอร์จริง
 *
 * รัน: npm run clear-whatsapp
 * (ลบเฉพาะ channel = 'whatsapp' — LINE / Telegram และรายชื่อ Contact ไม่ถูกแตะต้อง)
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../lib/prisma';

async function main() {
  const convs = await prisma.conversation.findMany({
    where: { channel: 'whatsapp' },
    select: { id: true },
  });
  const ids = convs.map(c => c.id);
  console.log(`🔎 พบบทสนทนา WhatsApp ${ids.length} รายการ`);

  if (ids.length === 0) {
    console.log('✅ ไม่มีข้อมูล WhatsApp ให้ลบ');
    return;
  }

  // ลบข้อความก่อน (แม้ schema จะ cascade อยู่แล้ว ก็ลบชัดเจนเพื่อความปลอดภัย)
  const delMsgs = await prisma.message.deleteMany({ where: { conversationId: { in: ids } } });
  console.log(`🗑️  ลบข้อความแล้ว ${delMsgs.count} รายการ`);

  const delConvs = await prisma.conversation.deleteMany({ where: { channel: 'whatsapp' } });
  console.log(`🗑️  ลบบทสนทนาแล้ว ${delConvs.count} รายการ`);

  console.log('🏁 ล้างข้อมูล WhatsApp เสร็จสิ้น — พร้อมเชื่อมต่อเบอร์จริง');
}

main()
  .catch(e => { console.error('❌ clear-whatsapp error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());

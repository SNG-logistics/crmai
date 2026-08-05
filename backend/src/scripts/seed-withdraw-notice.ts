/**
 * Seed "แจ้งถอน" auto-reply — ใส่ข้อความยืนยันการถอนลงในฐานความรู้ของบริษัทที่ระบุ
 *
 * ความรู้หมวด withdraw_notice จะถูกตอบ "ตรงๆ ทั้งข้อความ" โดยไม่ผ่าน LLM
 * (ดู ai.service.ts → isWithdrawalNotice) จึงไม่มีทางเพี้ยนหรือถูกเรียบเรียงใหม่
 *
 * รันซ้ำได้ (idempotent) — มีอยู่แล้วจะอัปเดตข้อความให้ตรงกับไฟล์นี้
 *
 *   npm run seed-withdraw-notice                    # บริษัท "3king auto" (ค่าเริ่มต้น)
 *   npm run seed-withdraw-notice -- "ชื่อบริษัท"      # บริษัทอื่น
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../lib/prisma';
import { WITHDRAW_NOTICE_CATEGORY } from '../services/ai.service';

const DEFAULT_COMPANY = '3king auto';

// ข้อความยืนยันการถอน (ภาษาลาว) — แก้ที่นี่แล้วรันสคริปต์ซ้ำเพื่ออัปเดต
const WITHDRAW_NOTICE_ANSWER =
  'ລະບົບໄດ້ດຳເນີນການຖອນເຄດິດໃຫ້ລູກຄ້າເປັນທີ່ຮຽບຮ້ອຍແລ້ວເຈົ້າ '
  + 'ຕິດຂັດບັນຫາໃດ ແຄັບໜ້າຈໍສົ່ງໃຫ້ແອັດມິນກວດສອບໄດ້ເລີຍເດີ້ເຈົ້າ';

// คำถามตัวอย่าง — ใช้แสดงในหน้า AI Bot ให้แอดมินรู้ว่ารายการนี้คุมเคสไหน
const WITHDRAW_NOTICE_QUESTION = 'ลูกค้าแจ้งถอน / ແຈ້ງຖອນ (ตอบยืนยันการถอนอัตโนมัติ)';

async function main() {
  const companyName = (process.argv[2] || DEFAULT_COMPANY).trim();

  const company = await prisma.company.findFirst({
    where: { name: { contains: companyName } },
    select: { id: true, name: true },
  });
  if (!company) {
    const all = await prisma.company.findMany({ select: { name: true } });
    console.error(`❌ ไม่พบบริษัทชื่อ "${companyName}"`);
    console.error(`   บริษัทที่มีในระบบ: ${all.map(c => `"${c.name}"`).join(', ') || '(ไม่มี)'}`);
    process.exit(1);
  }

  const bots = await prisma.botConfig.findMany({
    where: { companyId: company.id },
    select: { id: true, name: true, channel: true },
  });
  if (bots.length === 0) {
    console.error(`❌ บริษัท "${company.name}" ยังไม่มี Bot config`);
    process.exit(1);
  }

  console.log(`🏢 ${company.name} — bot ${bots.length} ตัว`);
  for (const bot of bots) {
    const existing = await prisma.knowledgeBase.findFirst({
      where: { botConfigId: bot.id, category: WITHDRAW_NOTICE_CATEGORY },
      select: { id: true },
    });
    if (existing) {
      await prisma.knowledgeBase.update({
        where: { id: existing.id },
        data: {
          question: WITHDRAW_NOTICE_QUESTION,
          answer: WITHDRAW_NOTICE_ANSWER,
          isActive: true,
        },
      });
      console.log(`  ~ [${bot.channel}] ${bot.name} — อัปเดตข้อความแจ้งถอนแล้ว`);
    } else {
      await prisma.knowledgeBase.create({
        data: {
          botConfigId: bot.id,
          question: WITHDRAW_NOTICE_QUESTION,
          answer: WITHDRAW_NOTICE_ANSWER,
          category: WITHDRAW_NOTICE_CATEGORY,
          sourceType: 'qa',
          isActive: true,
        },
      });
      console.log(`  + [${bot.channel}] ${bot.name} — เพิ่มข้อความแจ้งถอนแล้ว`);
    }
  }

  console.log('\n✅ เสร็จแล้ว — ลูกค้าแจ้งถอนจะได้รับข้อความนี้ทุกครั้ง:');
  console.log(`   ${WITHDRAW_NOTICE_ANSWER}`);
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());

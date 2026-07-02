// export-line-ids.ts — ดึงข้อมูล LINE User IDs ของผู้ติดตามทั้งหมดจาก LINE Messaging API
// รันด้วยคำสั่ง: npm run export-line-ids
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🏁 กำลังเริ่มต้นระบบดึงข้อมูล LINE User ID...');
  
  // ค้นหาการตั้งค่าช่องทาง LINE
  const config = await prisma.channelConfig.findFirst({
    where: { channel: 'line', isActive: true }
  });
  
  if (!config) {
    console.error('❌ ไม่พบการตั้งค่าช่องทาง LINE (LINE Channel Config) ที่เปิดใช้งานอยู่ในระบบ');
    return;
  }
  
  let parsedConfig: any = {};
  try {
    parsedConfig = typeof config.config === 'string' ? JSON.parse(config.config) : config.config;
  } catch (e) {
    console.error('❌ ไม่สามารถอ่านค่าตั้งค่า LINE Config ได้:', e);
    return;
  }
  
  const token = parsedConfig.accessToken;
  if (!token) {
    console.error('❌ ไม่พบ Channel Access Token ในการตั้งค่า LINE');
    return;
  }
  
  console.log('📡 กำลังเรียกข้อมูลจาก LINE Messaging API (Follower IDs)...');
  
  const allUserIds: string[] = [];
  let nextToken: string | undefined = undefined;
  let hasMore = true;
  let page = 1;
  
  while (hasMore) {
    console.log(`⏳ กำลังโหลดหน้ารายชื่อที่ ${page}...`);
    try {
      const url = 'https://api.line.me/v2/bot/followers/ids';
      const params: any = { limit: 1000 };
      if (nextToken) params.start = nextToken;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params
      });
      
      const userIds = response.data.userIds || [];
      allUserIds.push(...userIds);
      console.log(`   โหลดสำเร็จ ${userIds.length} รายการ (รวมทั้งหมดตอนนี้: ${allUserIds.length} รายชื่อ)`);
      
      nextToken = response.data.next;
      hasMore = !!nextToken;
      page++;
    } catch (e: any) {
      console.error('❌ เกิดข้อผิดพลาดในการดึงข้อมูลจาก LINE API:', e.response?.data || e.message);
      break;
    }
  }
  
  if (allUserIds.length === 0) {
    console.log('⚠️ ไม่พบข้อมูลผู้ใช้แอดไลน์เข้ามา หรือเกิดข้อผิดพลาดในการดึงข้อมูล');
    return;
  }
  
  // บันทึกข้อมูลลง CSV
  const csvContent = '\uFEFFlineUserId\n' + allUserIds.join('\n');
  const filePath = path.join(process.cwd(), 'line_followers.csv');
  fs.writeFileSync(filePath, csvContent, 'utf-8');
  
  console.log(`\n========================================`);
  console.log(`✅ ส่งออกข้อมูลสำเร็จ! ดึง LINE User ID ได้ทั้งหมด: ${allUserIds.length} รายชื่อ`);
  console.log(`📁 ไฟล์บันทึกอยู่ที่: ${filePath}`);
  console.log(`========================================\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

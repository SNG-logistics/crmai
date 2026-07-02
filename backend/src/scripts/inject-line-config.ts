// inject-line-config.ts — ใส่ LINE credentials ลง DB โดยตรง
// npx ts-node src/scripts/inject-line-config.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── ✅ ใส่ค่าเหล่านี้ก่อนรัน ─────────────────────────────────────────────────
const CHANNEL_SECRET = '148c21bfddd1cb26c97250772f616b4c';  // จาก screenshot
const CHANNEL_ACCESS_TOKEN = 'zjIIwMOgKzflHgaT5WHg/mMwjaTRIeVYlMX8xAVMTBY9Y3xwkpqjLdWLPPuokny0t2YwqXMlDZGbcH5IZyOmzuUOCAERLr38lQ6/0vD7EYqM5Ef+pR+8TPPvJJEKPD8cDvU+O571qoCX4RhR3Zc/zwdB04t89/1O/w1cDnyilFU=';      // ← ไปก็ออก token ใน LINE Console
const TENANT_SLUG = 'happy77'; // slug หรือ demo (จะเซิร์จค้นหา id จาก DB เอง)
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!CHANNEL_ACCESS_TOKEN || CHANNEL_ACCESS_TOKEN === 'PASTE_YOUR_ACCESS_TOKEN_HERE') {
    console.error('\n❌ กรุณาใส่ CHANNEL_ACCESS_TOKEN ก่อนรัน!');
    process.exit(1);
  }

  // หา tenant
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ slug: TENANT_SLUG }, { slug: 'demo' }] },
  });

  if (!tenant) {
    console.error(`❌ ไม่พบ tenant slug="${TENANT_SLUG}" หรือ "demo"`);
    process.exit(1);
  }

  console.log(`\n✅ พบ Tenant: ${tenant.name} (${tenant.slug}) id=${tenant.id}`);

  // อัพเดต slug ถ้าจำเป็น
  if (tenant.slug !== TENANT_SLUG) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { name: 'happy77', slug: TENANT_SLUG },
    });
    console.log(`✅ อัพเดต slug → ${TENANT_SLUG}`);
  }

  // Upsert ChannelConfig LINE
  await prisma.channelConfig.upsert({
    where: { tenantId_channel: { tenantId: tenant.id, channel: 'line' } },
    create: {
      tenantId: tenant.id,
      channel: 'line',
      isActive: true,
      config: JSON.stringify({
        channelSecret: CHANNEL_SECRET,
        accessToken: CHANNEL_ACCESS_TOKEN,
      }),
    },
    update: {
      isActive: true,
      config: JSON.stringify({
        channelSecret: CHANNEL_SECRET,
        accessToken: CHANNEL_ACCESS_TOKEN,
      }),
    },
  });
  console.log('✅ บันทึก LINE ChannelConfig สำเร็จ!');

  // Upsert BotConfig (per-company now)
  const existingBot = await prisma.botConfig.findFirst({ where: { tenantId: tenant.id } });
  if (existingBot) {
    await prisma.botConfig.update({ where: { id: existingBot.id }, data: { isActive: true } });
  } else {
    await prisma.botConfig.create({
      data: {
        tenantId: tenant.id,
        name: 'happy77 AI Bot',
        isActive: true,
        model: 'gpt-4o-mini',
        temperature: 0.7,
        systemPrompt: `คุณเป็น AI Assistant ของ happy77 ผู้ช่วยลูกค้าที่เป็นมิตรและสุภาพ
ตอบภาษาไทยเสมอ กระชับ ไม่เกิน 3 ประโยค ช่วยเหลือลูกค้าได้ทุกเรื่อง`,
      },
    });
  }
  console.log('✅ เปิดใช้งาน BotConfig สำเร็จ!');

  // สรุป
  console.log('\n' + '='.repeat(50));
  console.log('🎉 ตั้งค่าครบแล้ว! ทดสอบได้เลย');
  console.log('='.repeat(50));
  console.log('🔗 Webhook URL:');
  console.log('   https://nonexpedient-unshuttered-manuela.ngrok-free.dev/api/webhooks/line/happy77');
  console.log('\n💬 ลองส่งข้อความหา LINE OA แล้ว AI จะตอบทันที!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

// inject-line-config.js — run: node src/scripts/inject-line-config.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CHANNEL_SECRET       = '148c21bfddd1cb26c97250772f616b4c';
const CHANNEL_ACCESS_TOKEN = 'zjIIwMOgKzflHgaT5WHg/mMwjaTRIeVYlMX8xAVMTBY9Y3xwkpqjLdWLPPuokny0t2YwqXMlDZGbcH5IZyOmzuUOCAERLr38lQ6/0vD7EYqM5Ef+pR+8TPPvJJEKPD8cDvU+O571qoCX4RhR3Zc/zwdB04t89/1O/w1cDnyilFU=';

async function main() {
  // ─── หา tenant ───────────────────────────────────────────────────────────
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, slug: true } });
  console.log('\n📋 Tenants ทั้งหมด:');
  console.table(tenants);

  // หา tenant ที่ใกล้เคียงที่สุด
  const tenant = tenants.find(t =>
    t.slug === 'happy77' || t.slug === 'demo' || t.name.includes('Demo') || t.name.includes('มหาเฮง')
  ) || tenants[0];

  if (!tenant) {
    console.error('❌ ไม่พบ tenant ใดๆ ในระบบ');
    process.exit(1);
  }

  console.log(`\n🎯 ใช้ Tenant: "${tenant.name}" (slug=${tenant.slug}) id=${tenant.id}`);

  // ─── อัพเดต slug/name ถ้าจำเป็น ─────────────────────────────────────────
  if (tenant.slug !== 'happy77') {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { name: 'happy77', slug: 'happy77' },
    });
    console.log('✅ เปลี่ยนชื่อ Tenant → happy77');
  }

  // ─── Upsert ChannelConfig LINE ───────────────────────────────────────────
  const cfg = JSON.stringify({ channelSecret: CHANNEL_SECRET, accessToken: CHANNEL_ACCESS_TOKEN });

  await prisma.channelConfig.upsert({
    where: { tenantId_channel: { tenantId: tenant.id, channel: 'line' } },
    create: { tenantId: tenant.id, channel: 'line', isActive: true, config: cfg },
    update: { isActive: true, config: cfg },
  });
  console.log('✅ บันทึก LINE ChannelConfig สำเร็จ!');

  // ─── Upsert BotConfig ────────────────────────────────────────────────────
  await prisma.botConfig.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      name: 'happy77 AI Bot',
      isActive: true,
      model: 'gpt-4o-mini',
      temperature: 0.7,
      systemPrompt: `คุณเป็น AI Assistant ของ happy77 ผู้ช่วยลูกค้าที่เป็นมิตรและสุภาพ ตอบภาษาไทยเสมอ กระชับ ไม่เกิน 3 ประโยค`,
    },
    update: { isActive: true },
  });
  console.log('✅ เปิดใช้งาน BotConfig สำเร็จ!');

  // ─── สรุป ────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(55));
  console.log('🎉 ตั้งค่าครบ! ลองส่งข้อความหา LINE OA ได้เลย');
  console.log('='.repeat(55));
  console.log(`🆔 Tenant ID: ${tenant.id}`);
  console.log(`🔗 Webhook: https://nonexpedient-unshuttered-manuela.ngrok-free.dev/api/webhooks/line/${tenant.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

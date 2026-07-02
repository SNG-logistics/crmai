// setup-happy77.ts — ตั้งค่าครบในคำสั่งเดียว
// npx ts-node src/scripts/setup-happy77.ts
import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>(res => rl.question(q, res));

async function main() {
  console.log('\n🚀 Setup happy77 Tenant\n' + '='.repeat(40));

  // ─── 1. แสดง tenants ───────────────────────────────────────────────────────
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, slug: true } });
  console.log('\n📋 Tenants ปัจจุบัน:');
  console.table(tenants);

  // ─── 2. อัพเดต tenant demo → happy77 ──────────────────────────────────────
  const result = await prisma.tenant.updateMany({
    where: { OR: [{ slug: 'demo' }, { name: { contains: 'Demo' } }, { name: { contains: 'มหาเฮง' } }] },
    data: { name: 'happy77', slug: 'happy77' },
  });
  console.log(`\n✅ อัพเดต Tenant: ${result.count} รายการ → name="happy77" slug="happy77"`);

  // ─── หา tenant id ──────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'happy77' } });
  if (!tenant) { console.error('❌ ไม่พบ tenant happy77'); process.exit(1); }
  console.log(`\n🎯 Tenant ID: ${tenant.id}`);

  // ─── 3. ตั้งค่า BotConfig ──────────────────────────────────────────────────
  const existBot = await prisma.botConfig.findFirst({ where: { tenantId: tenant.id } });
  if (!existBot) {
    await prisma.botConfig.create({
      data: {
        tenantId: tenant.id,
        name: 'happy77 AI Bot',
        isActive: true,
        model: 'gpt-4o-mini',
        temperature: 0.7,
        systemPrompt: `คุณเป็น AI Assistant ของ happy77 ผู้ช่วยลูกค้าที่เป็นมิตร สุภาพ และช่วยเหลือได้หลายเรื่อง
บทบาท: ตอบคำถาม แนะนำบริการ รับเรื่องปัญหา
กฎ: ตอบภาษาไทยเสมอ กระชับไม่เกิน 3 ประโยค ไม่ต้องพูดว่าตัวเองเป็น AI`,
      },
    });
    console.log('✅ สร้าง BotConfig สำเร็จ');
  } else {
    // เปิด bot ถ้าปิดอยู่
    if (!existBot.isActive) {
      await prisma.botConfig.update({ where: { id: existBot.id }, data: { isActive: true } });
    }
    console.log('ℹ️  BotConfig มีอยู่แล้ว (เปิดใช้งานแล้ว)');
  }

  // ─── 4. ตั้งค่า ChannelConfig LINE ─────────────────────────────────────────
  const existChannel = await prisma.channelConfig.findUnique({
    where: { tenantId_channel: { tenantId: tenant.id, channel: 'line' } },
  });

  if (existChannel) {
    const cfg: any = typeof existChannel.config === 'string'
      ? JSON.parse(existChannel.config) : existChannel.config;

    if (cfg?.channelSecret && cfg.channelSecret !== 'your-line-channel-secret') {
      console.log('\n✅ LINE ChannelConfig มีอยู่แล้วและตั้งค่าแล้ว');
      console.log(`   Secret: ${cfg.channelSecret?.slice(0,6)}...`);
      rl.close();
      return;
    }
  }

  // ขอ credentials จากผู้ใช้
  console.log('\n🔑 ต้องการ LINE Channel credentials:');
  console.log('   ไปที่ https://developers.line.biz → เลือก channel → Messaging API');

  const secret = await ask('\n📋 Channel Secret (Basic settings): ');
  const token  = await ask('🔑 Channel Access Token (Messaging API → Issue): ');

  if (!secret.trim() || !token.trim()) {
    console.log('\n⚠️  ไม่ได้ใส่ credentials — ข้ามขั้นตอนนี้');
    console.log('   รัน script นี้ใหม่เมื่อมี credentials พร้อม');
    rl.close();
    return;
  }

  await prisma.channelConfig.upsert({
    where: { tenantId_channel: { tenantId: tenant.id, channel: 'line' } },
    create: {
      tenantId: tenant.id,
      channel: 'line',
      isActive: true,
      config: JSON.stringify({ channelSecret: secret.trim(), accessToken: token.trim() }),
    },
    update: {
      isActive: true,
      config: JSON.stringify({ channelSecret: secret.trim(), accessToken: token.trim() }),
    },
  });

  console.log('\n✅ ตั้งค่า LINE ChannelConfig สำเร็จ!');
  console.log('\n📋 สรุปการตั้งค่า:');
  console.log('   Tenant:  happy77');
  console.log('   Bot:     เปิดใช้งาน ✅');
  console.log('   LINE:    เชื่อมต่อแล้ว ✅');
  console.log('\n🔗 Webhook URL สำหรับ LINE Console:');
  console.log('   https://nonexpedient-unshuttered-manuela.ngrok-free.dev/api/webhooks/line/happy77');

  rl.close();
}

main()
  .catch(e => { console.error(e); rl.close(); })
  .finally(() => prisma.$disconnect());

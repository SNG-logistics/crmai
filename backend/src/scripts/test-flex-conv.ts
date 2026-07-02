import dotenv from 'dotenv';
dotenv.config();

import prisma from '../lib/prisma';
import axios from 'axios';

function parseCfg(raw: any) {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

async function main() {
  // 1. ดึง conversation ของ อ.โอ่ง
  const conv = await prisma.conversation.findFirst({
    where: { tenantId: 'cmpl7zoco00039nmlofqakkwz', channelId: 'U51531bac05c45e0fc36c8780ffde0b6e' },
    include: { contact: true },
  });
  if (!conv) { console.error('❌ Conversation not found'); return; }
  console.log('✅ Conversation:', conv.id, '| channel:', conv.channel, '| channelId:', conv.channelId, '| status:', conv.status);
  console.log('  contact:', conv.contact.displayName, '| lineUserId:', conv.contact.lineUserId);
  
  // 2. ดึง LINE config
  const ch = await prisma.channelConfig.findUnique({
    where: { tenantId_channel: { tenantId: 'cmpl7zoco00039nmlofqakkwz', channel: 'line' } },
  });
  if (!ch) { console.error('❌ Channel config not found'); return; }
  const cfg = parseCfg(ch.config);

  // 3. ทดสอบส่ง flex ผ่าน conv.channelId (เหมือน route /api/flex/send ทำ)
  console.log('\n--- Test: Send Flex via conv.channelId ---');
  const flexMsg = {
    type: 'flex',
    altText: 'ยินดีต้อนรับ!',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '🎉 ทดสอบ Flex ผ่าน conv.channelId', weight: 'bold', size: 'xl' },
        ],
      },
    },
  };

  try {
    const res = await axios.post(
      'https://api.line.me/v2/bot/message/push',
      { to: conv.channelId, messages: [flexMsg] },
      { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' } }
    );
    console.log('✅ Send via channelId SUCCESS! Status:', res.status);
  } catch (e: any) {
    console.error('❌ Send via channelId FAILED!');
    console.error('Status:', e.response?.status);
    console.error('Data:', JSON.stringify(e.response?.data, null, 2));
  }

  // 4. ดึง flex templates ที่บันทึกไว้ เพื่อดูว่า flexJson ที่ user ส่งมีอะไร
  const savedTemplates = await prisma.flexTemplate.findMany({
    where: { tenantId: 'cmpl7zoco00039nmlofqakkwz' },
  });
  console.log('\n--- Saved templates ---');
  for (const t of savedTemplates) {
    console.log(`  ${t.name} | category: ${t.category}`);
    const json = typeof t.flexJson === 'string' ? JSON.parse(t.flexJson) : t.flexJson;
    console.log('  flexJson type:', json?.type);
    console.log('  has hero?', !!json?.hero);
    console.log('  has body?', !!json?.body);
  }

  // 5. ทดสอบส่ง flex ด้วย saved template (ถ้ามี)
  if (savedTemplates.length > 0) {
    const tpl = savedTemplates[0];
    const tplJson = typeof tpl.flexJson === 'string' ? JSON.parse(tpl.flexJson) : tpl.flexJson;
    console.log('\n--- Test: Send saved template flex ---');
    try {
      const res = await axios.post(
        'https://api.line.me/v2/bot/message/push',
        { to: conv.channelId, messages: [{ type: 'flex', altText: tpl.altText || tpl.name, contents: tplJson }] },
        { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' } }
      );
      console.log('✅ Saved template send SUCCESS! Status:', res.status);
    } catch (e: any) {
      console.error('❌ Saved template send FAILED!');
      console.error('Status:', e.response?.status);
      console.error('Data:', JSON.stringify(e.response?.data, null, 2));
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

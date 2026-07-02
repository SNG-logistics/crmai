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
  // 1. ดึง LINE channel config ของ tenant happy77
  const ch = await prisma.channelConfig.findUnique({
    where: { tenantId_channel: { tenantId: 'cmpl7zoco00039nmlofqakkwz', channel: 'line' } },
  });
  if (!ch) { console.error('❌ Channel config not found'); return; }
  const cfg = parseCfg(ch.config);
  console.log('✅ Got LINE config, accessToken starts with:', cfg.accessToken?.substring(0, 20) + '...');

  // 2. ดึงข้อมูล contact อ.โอ่ง
  const contact = await prisma.contact.findFirst({
    where: { tenantId: 'cmpl7zoco00039nmlofqakkwz', displayName: { contains: 'โอ่ง' } },
  });
  if (!contact) { console.error('❌ Contact อ.โอ่ง not found'); return; }
  console.log('✅ Found contact:', contact.displayName, '| lineUserId:', contact.lineUserId);

  if (!contact.lineUserId) { console.error('❌ Contact has no lineUserId'); return; }

  // 3. ทดลองส่ง simple text message ก่อน
  console.log('\n--- Test 1: Send simple text message ---');
  try {
    const res = await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: contact.lineUserId,
        messages: [{ type: 'text', text: 'ทดสอบส่งข้อความจาก CRM' }],
      },
      { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' } }
    );
    console.log('✅ Text send SUCCESS! Status:', res.status);
  } catch (e: any) {
    console.error('❌ Text send FAILED!');
    console.error('Status:', e.response?.status);
    console.error('Data:', JSON.stringify(e.response?.data, null, 2));
    console.error('Message:', e.message);
  }

  // 4. ทดลองส่ง Flex message
  console.log('\n--- Test 2: Send Flex message ---');
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
          { type: 'text', text: '🎉 ทดสอบ Flex', weight: 'bold', size: 'xl' },
          { type: 'text', text: 'ส่งจาก CRM มหาเฮง', size: 'sm', color: '#999999', margin: 'md' },
        ],
      },
    },
  };

  try {
    const res = await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: contact.lineUserId,
        messages: [flexMsg],
      },
      { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' } }
    );
    console.log('✅ Flex send SUCCESS! Status:', res.status);
  } catch (e: any) {
    console.error('❌ Flex send FAILED!');
    console.error('Status:', e.response?.status);
    console.error('Data:', JSON.stringify(e.response?.data, null, 2));
    console.error('Message:', e.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

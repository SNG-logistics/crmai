/**
 * Backfill script — ดาวน์โหลดรูปจาก LINE สำหรับ messages เก่าที่ยังไม่มี imageUrl
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../lib/prisma';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

async function main() {
  const imgDir = path.join(process.cwd(), 'uploads', 'line-images');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  // หา messages ประเภท image ที่ metadata ยังว่าง
  const imageMessages = await prisma.message.findMany({
    where: {
      type: 'image',
      platformMsgId: { not: null },
      OR: [
        { metadata: '{}' },
        { metadata: '' },
      ],
    },
    include: {
      conversation: {
        select: { tenantId: true, channel: true },
      },
    },
  });

  console.log(`📷 Found ${imageMessages.length} image messages to backfill`);

  // Group by tenant to get access tokens
  const tokenCache = new Map<string, string>();

  for (const msg of imageMessages) {
    const tenantId = msg.conversation.tenantId;
    if (msg.conversation.channel !== 'line') continue;

    // Get access token
    if (!tokenCache.has(tenantId)) {
      const config = await prisma.channelConfig.findUnique({
        where: { tenantId_channel: { tenantId, channel: 'line' } },
      });
      if (!config) continue;
      let parsed: any = config.config;
      if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { continue; } }
      tokenCache.set(tenantId, parsed.accessToken);
    }

    const accessToken = tokenCache.get(tenantId);
    if (!accessToken || !msg.platformMsgId) continue;

    const filename = `${msg.platformMsgId}.jpg`;
    const filepath = path.join(imgDir, filename);

    // ถ้าไฟล์มีอยู่แล้ว ก็ update metadata เลย
    if (fs.existsSync(filepath)) {
      const imageUrl = `/uploads/line-images/${filename}`;
      await prisma.message.update({
        where: { id: msg.id },
        data: { metadata: JSON.stringify({ imageUrl }) },
      });
      console.log(`✅ ${msg.id} — file exists, metadata updated`);
      continue;
    }

    // ดาวน์โหลดจาก LINE
    try {
      const resp = await axios.get(
        `https://api-data.line.me/v2/bot/message/${msg.platformMsgId}/content`,
        { headers: { Authorization: `Bearer ${accessToken}` }, responseType: 'arraybuffer', timeout: 15000 }
      );
      fs.writeFileSync(filepath, resp.data);
      const imageUrl = `/uploads/line-images/${filename}`;
      await prisma.message.update({
        where: { id: msg.id },
        data: { metadata: JSON.stringify({ imageUrl }) },
      });
      console.log(`✅ ${msg.id} — downloaded ${resp.data.length} bytes → ${imageUrl}`);
    } catch (err: any) {
      console.warn(`❌ ${msg.id} (platformMsgId=${msg.platformMsgId}) — ${err.response?.status || err.message}`);
    }

    // Rate limit: wait 200ms between requests
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('🏁 Backfill complete');
}

main().catch(console.error).finally(() => prisma.$disconnect());

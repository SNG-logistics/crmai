import { Router, Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { verifyLineSignature, parseLineEvent, getLineProfile, sendLineReply, lineTextMessage } from '../../services/line.service';
import { processBotMessage } from '../../services/ai.service';
import { emitToTenant } from '../../lib/socket';

const router = Router();

// ─── GET /api/webhooks/line/:tenantId ─────────────────────────────────────────
// LINE Developers Console บางครั้งเรียก GET เพื่อยืนยัน URL
router.get('/:tenantId', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// ─── POST /api/webhooks/line/:tenantId ────────────────────────────────────────
router.post('/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;

  try {
    // 1. ดึง config ของ tenant
    const channelConfig = await prisma.channelConfig.findUnique({
      where: { tenantId_channel: { tenantId, channel: 'line' } },
    });

    // ถ้าไม่มี config → ตอบ 200 เพื่อผ่าน LINE Verify ได้
    if (!channelConfig || !channelConfig.isActive) {
      console.warn(`LINE: no active config for tenant=${tenantId}`);
      return res.status(200).json({ status: 'ok' });
    }

    // 2. Parse config (SQLite เก็บเป็น JSON string)
    let config: any = channelConfig.config;
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch { config = {}; }
    }
    const { channelSecret, accessToken } = config;

    if (!channelSecret || !accessToken) {
      console.error(`LINE: missing secret/token for tenant=${tenantId}`);
      return res.status(200).json({ status: 'ok' });
    }

    // 3. rawBody เป็น Buffer จาก express.raw
    const rawBody   = req.body as Buffer;
    const signature = req.headers['x-line-signature'] as string;

    // ถ้าไม่มี signature → LINE health check หรือ verify ping
    if (!signature) {
      return res.status(200).json({ status: 'ok' });
    }

    // 4. Verify signature
    if (!verifyLineSignature(rawBody, signature, channelSecret)) {
      console.warn(`LINE: signature mismatch tenant=${tenantId}`);
      return res.status(200).json({ status: 'ok' }); // ยัง return 200 ไม่ให้ LINE retry ไม่หยุด
    }

    // 5. Parse JSON body
    const body   = JSON.parse(rawBody.toString('utf-8'));
    const events: any[] = body.events || [];

    // events: [] = LINE กด "Verify" → ตอบ 200 สำเร็จ
    if (events.length === 0) {
      console.log(`LINE: verify ping (empty events) tenant=${tenantId} ✅`);
      return res.status(200).json({ status: 'ok' });
    }

    // 6. ตอบ 200 ก่อนทันที แล้วค่อย process event
    res.status(200).json({ status: 'ok' });
    console.log(`LINE: tenant=${tenantId} events=${events.length}`);

    for (const event of events) {
      await processLineEvent(tenantId, event, accessToken);
    }

  } catch (err) {
    console.error('LINE webhook error:', err);
    if (!res.headersSent) res.status(200).json({ status: 'ok' });
  }
});

// ─── Process LINE Event ───────────────────────────────────────────────────────
async function processLineEvent(tenantId: string, event: any, accessToken: string) {
  const userId = event.source?.userId;
  if (!userId) return;

  // Get user profile
  let profile: any = null;
  try { profile = await getLineProfile(userId, accessToken); } catch {}

  const normalized = parseLineEvent(event, profile);
  if (!normalized) return;

  // Find or create contact
  let contact = await prisma.contact.findUnique({
    where: { tenantId_lineUserId: { tenantId, lineUserId: userId } },
  });
  if (!contact) {
    contact = await prisma.contact.create({
      data: { tenantId, lineUserId: userId, displayName: normalized.displayName || 'LINE User', avatar: normalized.pictureUrl },
    });
  } else if (profile?.displayName && contact.displayName !== profile.displayName) {
    // อัปเดตชื่อถ้าเปลี่ยน
    contact = await prisma.contact.update({ where: { id: contact.id }, data: { displayName: profile.displayName, avatar: profile.pictureUrl } });
  }

  // Find or create conversation
  let conversation = await prisma.conversation.findUnique({
    where: { tenantId_channel_channelId: { tenantId, channel: 'line', channelId: userId } },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { tenantId, contactId: contact.id, channel: 'line', channelId: userId, status: 'bot', isBot: true },
    });
  }

  // Save incoming message
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id, tenantId,
      senderType: 'customer', type: normalized.messageType,
      content: normalized.content, platformMsgId: normalized.platformMsgId,
    },
  });

  // Update conversation
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), status: conversation.status === 'resolved' ? 'open' : conversation.status },
  });

  // Emit real-time
  emitToTenant(tenantId, 'new_message', { conversationId: conversation.id, message: { ...message, senderType: 'customer' }, contact, channel: 'line' });

  // AI bot reply
  if (conversation.isBot && normalized.messageType === 'text' && normalized.replyToken) {
    try {
      const history = await prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'asc' }, take: 20 });
      const conversationHistory = history.map((m: any) => ({
        role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const,
        content: m.content,
      }));

      const { reply, shouldHandoff } = await processBotMessage(tenantId, conversationHistory, normalized.content);
      await sendLineReply(normalized.replyToken, [lineTextMessage(reply)], accessToken);

      const botReply = await prisma.message.create({
        data: { conversationId: conversation.id, tenantId, senderType: 'bot', type: 'text', content: reply },
      });

      emitToTenant(tenantId, 'new_message', { conversationId: conversation.id, message: { ...botReply, senderType: 'bot' }, contact, channel: 'line' });

      if (shouldHandoff) {
        await prisma.conversation.update({ where: { id: conversation.id }, data: { isBot: false, status: 'pending' } });
        emitToTenant(tenantId, 'conversation_updated', { conversationId: conversation.id, status: 'pending', isBot: false });
      }
    } catch (aiError) {
      console.error('LINE AI error:', aiError);
    }
  }
}

export default router;

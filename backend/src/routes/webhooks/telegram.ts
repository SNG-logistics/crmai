import { Router, Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { parseTelegramUpdate, sendTelegramMessage } from '../../services/telegram.service';
import { processBotMessage } from '../../services/ai.service';
import { emitToTenant } from '../../lib/socket';
import { defaultCompanyId } from '../../lib/company-scope';
import { getChannelConfig } from '../../lib/channel-config';
import { captureCustomerInfo, mightContainCustomerInfo, readProfile, buildProfileContext, isRegisterIntent, buildRegisterReply } from '../../services/contact-memory.service';

const router = Router();

const THAI_MOBILE_REGEX = /(?:\+?66|0)[689]\d{1}[-\s]?\d{3}[-\s]?\d{4}/;
const THAI_LANDLINE_REGEX = /(?:\+?66|0)[2-57]\d{0,1}[-\s]?\d{3}[-\s]?\d{4}/;
const LAO_PHONE_REGEX = /(?:020|030)[-\s]?\d{4}[-\s]?\d{4}/;

function isPhoneNumber(text: string): boolean {
  const clean = text.replace(/[-\s]/g, '');
  if (/^(\+?66|0)[689]\d{8}$/.test(clean)) return true;
  if (/^(\+?66|0)[2-57]\d{7,8}$/.test(clean)) return true;
  if (/^(020|030)\d{8}$/.test(clean)) return true;

  return THAI_MOBILE_REGEX.test(text) || THAI_LANDLINE_REGEX.test(text) || LAO_PHONE_REGEX.test(text);
}

function isFreeCreditQuery(text: string): boolean {
  const t = text.toLowerCase();
  const thaiKeywords = [
    'เครดิตฟรี',
    'ฟรีเครดิต',
    'เครดิฟรี',
    'เคดิสฟรี',
    'เครดิตฟี',
    'เครดิต ฟรี',
    'ฟรี เครดิต',
    'ขอเครดิต',
    'ขอเคดิด',
    'ขอเครดิส'
  ];
  const englishKeywords = ['free credit', 'freecredit'];

  return thaiKeywords.some(kw => t.includes(kw)) || englishKeywords.some(kw => t.includes(kw));
}

/** POST /api/webhooks/telegram/:tenantId[/:companyId] */
async function handleTelegramWebhook(req: Request, res: Response) {
  const { tenantId } = req.params;
  const companyIdHint = (req.params as any).companyId || null;
  res.status(200).json({ status: 'ok' });

  try {
    const channelConfig = await getChannelConfig(tenantId, 'telegram', companyIdHint);
    if (!channelConfig || !channelConfig.isActive) {
      console.warn(`Telegram webhook: no active config for tenant ${tenantId}`);
      return;
    }

    // ★ Fix: SQLite stores JSON as string — must parse
    let config: any = channelConfig.config;
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch { config = {}; }
    }
    const botToken = config.botToken;
    if (!botToken) {
      console.error(`Telegram webhook: missing botToken for tenant ${tenantId}`);
      return;
    }

    const update = typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(req.body.toString());

    const normalized = parseTelegramUpdate(update);
    if (!normalized) return;

    const chatId = normalized.platformUserId;

    // Find or create contact
    let contact = await prisma.contact.findUnique({
      where: { tenantId_telegramId: { tenantId, telegramId: chatId } },
    });
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          tenantId,
          telegramId: chatId,
          displayName: normalized.displayName || 'Telegram User',
        },
      });
    }

    // Find or create conversation
    let conversation = await prisma.conversation.findUnique({
      where: { tenantId_channel_channelId: { tenantId, channel: 'telegram', channelId: chatId } },
    });
    if (!conversation) {
      // ผูกบริษัทของช่องทางนี้ — ไม่มีก็ใช้บริษัทเริ่มต้นของ tenant
      const companyId = companyIdHint || (channelConfig as any).companyId || await defaultCompanyId(tenantId);
      conversation = await prisma.conversation.create({
        data: { tenantId, companyId, contactId: contact.id, channel: 'telegram', channelId: chatId, status: 'bot', isBot: true },
      });
    }
    if (!conversation.isBot) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id }, data: { isBot: true, status: 'bot' },
      });
    }

    // Save message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        tenantId,
        senderType: 'customer',
        type: normalized.messageType,
        content: normalized.content,
        platformMsgId: normalized.platformMsgId,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), status: conversation.status === 'resolved' ? 'open' : conversation.status },
    });

    emitToTenant(tenantId, 'new_message', {
      conversationId: conversation.id,
      message: { ...message, senderType: 'customer' },
      contact,
      channel: 'telegram',
    });

    // ─── AI bot processing ────────────────────────────────────────────────
    if (conversation.isBot && normalized.messageType === 'text') {
      // ✅ ตรวจสอบ: ลูกค้าส่งเบอร์โทรศัพท์มา → ตอบกลับรับรู้ข้อมูลลูกค้าแล้ว และส่งต่อให้เจ้าหน้าที่ทันที
      if (isPhoneNumber(normalized.content)) {
        const reply = `ได้รับข้อมูลเรียบร้อยแล้วค่ะ รอสักครู่ แอดมินกำลังตรวจสอบให้นะคะ 🙏😊`;
        try {
          await sendTelegramMessage(chatId, reply, botToken);
          const botReply = await prisma.message.create({
            data: { conversationId: conversation.id, tenantId, senderType: 'bot', type: 'text', content: reply },
          });
          emitToTenant(tenantId, 'new_message', {
            conversationId: conversation.id,
            message: { ...botReply, senderType: 'bot' },
            contact, channel: 'telegram',
          });
        } catch (e: any) {
          console.warn(`[TG Bot] phone number reply failed:`, e.message);
        }

        // Keep bot mode active; admins may still reply directly from the inbox.
        console.log(`[TG Bot] Phone number received; bot remains active conversation=${conversation.id}`);
        return;
      }

      // ✅ ตรวจสอบ: เครดิตฟรี → ตอบกลับว่าไม่มีบริการและให้รออัปเดต โดยบอทยังดูแลอยู่
      if (isFreeCreditQuery(normalized.content)) {
        const reply = `ตอนนี้ยังไม่มีบริการเครดิตฟรีนะคะ ถ้ามีช่วงไหน เดี๋ยวแอดมินแจ้งให้ทราบนะคะ 🙏😊`;
        try {
          await sendTelegramMessage(chatId, reply, botToken);
          const botReply = await prisma.message.create({
            data: { conversationId: conversation.id, tenantId, senderType: 'bot', type: 'text', content: reply },
          });
          emitToTenant(tenantId, 'new_message', {
            conversationId: conversation.id,
            message: { ...botReply, senderType: 'bot' },
            contact, channel: 'telegram',
          });
        } catch (e: any) {
          console.warn(`[TG Bot] free credit reply failed:`, e.message);
        }
        return;
      }

      try {
        const history = await prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'asc' },
          take: 20,
        });
        const conversationHistory = history.map((m: any) => ({
          role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const,
          content: m.content,
        }));

        // 💾 เก็บข้อมูลลูกค้าอัตโนมัติ + ส่ง context ให้บอท
        let profileForBot = readProfile(contact as any);
        if (mightContainCustomerInfo(normalized.content)) {
          const captured = await captureCustomerInfo({
            tenantId, contactId: contact.id,
            recentMessages: [...conversationHistory.slice(-5), { role: 'user', content: normalized.content }],
          });
          if (captured) profileForBot = captured;
        }
        let reply: string;
        if (isRegisterIntent(normalized.content) && !mightContainCustomerInfo(normalized.content)) {
          reply = buildRegisterReply(profileForBot);
        } else {
          const r = await processBotMessage(
            tenantId, conversationHistory, normalized.content,
            { displayName: contact.displayName },
            conversation.companyId,
            { profileContext: buildProfileContext(profileForBot) },
          );
          reply = r.reply;
        }
        console.log(`[TG Bot] tenant=${tenantId} reply="${reply.substring(0,60)}"`);

        await sendTelegramMessage(chatId, reply, botToken);
        console.log(`[TG Bot] ✅ Reply sent to chatId=${chatId}`);

        const botReply = await prisma.message.create({
          data: { conversationId: conversation.id, tenantId, senderType: 'bot', type: 'text', content: reply },
        });

        emitToTenant(tenantId, 'new_message', {
          conversationId: conversation.id,
          message: { ...botReply, senderType: 'bot' },
          contact, channel: 'telegram',
        });

        // Never switch to human mode automatically.
      } catch (aiError: any) {
        console.error('[TG Bot] ❌ AI error:', aiError?.message || aiError);
        // Fallback message ถึงลูกค้า
        try {
          await sendTelegramMessage(chatId, 'ขออภัยค่ะ ระบบขัดข้องชั่วคราว กรุณารอสักครู่ 🙏', botToken);
        } catch {}
      }
    }
  } catch (err: any) {
    console.error('Telegram webhook error:', err?.message || err);
  }
}
router.post('/:tenantId', handleTelegramWebhook);
router.post('/:tenantId/:companyId', handleTelegramWebhook);

export default router;

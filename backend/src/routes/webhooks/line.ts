import { Router, Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { verifyLineSignature, parseLineEvent, getLineProfile, sendLineReply, sendLinePush, lineTextMessage, lineImageMessage, lineBotReplyMessage, lineWelcomeMessage } from '../../services/line.service';
import { processBotMessage, visionAssistReply } from '../../services/ai.service';
import { checkRepeatAbuse, REPEAT_HANDOFF_REPLY } from '../../services/bot-guard';
import { emitToTenant } from '../../lib/socket';
import { verifySlip } from '../../services/slip-verify.service';
import { defaultCompanyId } from '../../lib/company-scope';
import { getChannelConfig } from '../../lib/channel-config';
import { captureCustomerInfo, mightContainCustomerInfo, readProfile, buildProfileContext, isRegisterIntent, buildRegisterReply, missingRegisterFields } from '../../services/contact-memory.service';
import {
  buildBonusTimeMenuMessages, buildBonusTimeGamesMessages,
  matchBonusTimeKeyword, parseBonusPostback,
} from '../../services/bonustime.service';

const router = Router();

function requestPublicOrigin(req: Request): string | null {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(forwardedHost);
  const protocol = forwardedProto || (isLocalHost ? req.protocol : 'https');
  if (!forwardedHost || protocol !== 'https') return null;
  return `${protocol}://${forwardedHost}`;
}

function publicKnowledgeImageUrl(publicOrigin: string | null, imageUrl?: string | null): string | null {
  if (!imageUrl) return null;
  try {
    if (/^https:\/\//i.test(imageUrl)) return new URL(imageUrl).toString();
    if (!publicOrigin || !imageUrl.startsWith('/uploads/knowledge/')) return null;
    const url = new URL(imageUrl, publicOrigin);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ⚡ BONUS TIME helpers
// ════════════════════════════════════════════════════════════════════════════

// โหลด config ของบริษัท — แยกขาดต่อบริษัท 100% (ไม่มี fallback ข้ามบริษัท):
//   • บริษัทมี config และเปิดสวิตช์ (จาก dropdown หน้า BONUS TIME) → ใช้ของบริษัทนั้น
//   • บริษัทปิดสวิตช์ หรือยังไม่เคยตั้งค่า → ไม่โชว์ BONUS TIME กับ OA นั้นเลย
async function loadBonusConfig(companyId: string | null | undefined, _tenantId?: string): Promise<any | null> {
  try {
    if (!companyId) return null;
    const cfg = await prisma.bonusTimeConfig.findUnique({ where: { companyId } });
    return (cfg && cfg.isActive) ? cfg : null;
  } catch { return null; }
}

// หา/สร้าง contact + conversation สำหรับ LINE userId (ใช้กับ postback)
async function resolveLineConvo(tenantId: string, userId: string, profile: any, companyIdHint?: string | null) {
  let contact = await prisma.contact.findUnique({
    where: { tenantId_lineUserId: { tenantId, lineUserId: userId } },
  });
  if (!contact) {
    contact = await prisma.contact.create({
      data: { tenantId, lineUserId: userId, displayName: profile?.displayName || 'LINE User', avatar: profile?.pictureUrl },
    });
  }
  let conversation = await prisma.conversation.findUnique({
    where: { tenantId_channel_channelId: { tenantId, channel: 'line', channelId: userId } },
  });
  if (!conversation) {
    const companyId = companyIdHint || await defaultCompanyId(tenantId);
    conversation = await prisma.conversation.create({
      data: { tenantId, companyId, contactId: contact.id, channel: 'line', channelId: userId, status: 'bot', isBot: true },
    });
  } else if (companyIdHint && conversation.companyId !== companyIdHint) {
    // ห้องแชทตาม OA ที่ลูกค้ากดล่าสุด (แยกบริษัทเด็ดขาด)
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { companyId: companyIdHint },
    });
  }
  // ⚠️ เคารพโหมด Human: ไม่บังคับกลับเป็นบอทเมื่อแอดมินดูแลอยู่ (isBot=false)
  return { contact, conversation };
}

interface BonusCtx {
  tenantId: string; conversation: any; contact: any;
  userId: string; replyToken: string | null; accessToken: string; config: any;
}

// ส่งข้อความ (reply → fallback push) + บันทึกลง DB + emit ไป inbox
async function sendBonusMessages(ctx: BonusCtx, messages: any[]) {
  let sent = false;
  if (ctx.replyToken) {
    try { await sendLineReply(ctx.replyToken, messages, ctx.accessToken); sent = true; } catch { /* try push */ }
  }
  if (!sent) {
    try { await sendLinePush(ctx.userId, messages, ctx.accessToken); sent = true; } catch (e: any) {
      console.warn('[BonusTime] send failed:', e?.response?.data?.message || e.message);
    }
  }
  if (sent) {
    const first = messages[0];
    const isFlex = first?.type === 'flex';
    const dbMsg = await prisma.message.create({
      data: {
        conversationId: ctx.conversation.id, tenantId: ctx.tenantId,
        senderType: 'bot', type: isFlex ? 'flex' : 'text',
        content: isFlex ? (first.altText || '[BONUS TIME]') : (first.text || ''),
        metadata: isFlex ? JSON.stringify({ flexJson: first.contents }) : '{}',
      },
    });
    emitToTenant(ctx.tenantId, 'new_message', {
      conversationId: ctx.conversation.id,
      message: { ...dbMsg, senderType: 'bot' },
      contact: ctx.contact, channel: 'line',
    });
  }
  return sent;
}

// ส่งเมนูค่ายเกม — คืน false ถ้ายังไม่มีค่าย (ให้ flow ปกติทำงานต่อ)
// ⚡ ค่าย/เกม = SHARED ทั้ง tenant (เพิ่มครั้งเดียวใช้ได้ทุกเว็บ) — ส่วนเปิด/ปิดคุมที่ checklist บริษัท
async function sendBonusMenu(ctx: BonusCtx): Promise<boolean> {
  const camps = await prisma.bonusTimeCamp.findMany({
    where: { tenantId: ctx.tenantId, isActive: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  if (!camps.length) return false;
  const messages = buildBonusTimeMenuMessages(ctx.config, camps as any);
  return sendBonusMessages(ctx, messages);
}

// ส่งการ์ดเกมของค่าย
async function sendBonusGames(ctx: BonusCtx, campId: string): Promise<boolean> {
  // ค้นด้วย tenant (ไม่ล็อก companyId) — กัน postback หาไม่เจอเพราะ config มาจาก fallback
  const camp = await prisma.bonusTimeCamp.findFirst({
    where: { id: campId, tenantId: ctx.tenantId },
  });
  if (!camp) return sendBonusMenu(ctx);
  const games = await prisma.bonusTimeGame.findMany({
    where: { campId: camp.id, isActive: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  const messages = buildBonusTimeGamesMessages(ctx.config, camp as any, games as any);
  return sendBonusMessages(ctx, messages);
}

// จัดการ postback ของ BONUS TIME (กดปุ่มค่าย / กลับเมนู)
async function handleBonusPostback(tenantId: string, event: any, userId: string, profile: any, accessToken: string, companyIdHint?: string | null) {
  const parsed = parseBonusPostback(event.postback?.data);
  if (!parsed) return; // postback อื่น — ไม่เกี่ยวกับ bonustime
  const { contact, conversation } = await resolveLineConvo(tenantId, userId, profile, companyIdHint);
  const config = await loadBonusConfig(companyIdHint, tenantId);
  if (!config) return;
  const ctx: BonusCtx = { tenantId, conversation, contact, userId, replyToken: event.replyToken || null, accessToken, config };
  if (parsed.action === 'menu') await sendBonusMenu(ctx);
  else if (parsed.id) await sendBonusGames(ctx, parsed.id);
  console.log(`[BonusTime] postback action=${parsed.action}${parsed.id ? ' camp=' + parsed.id : ''} conv=${conversation.id}`);
}

// ─── GET /api/webhooks/line/:tenantId[/:companyId] ────────────────────────────
router.get('/:tenantId', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});
router.get('/:tenantId/:companyId', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// ─── POST /api/webhooks/line/:tenantId[/:companyId] ──────────────────────────
//  :companyId (ถ้ามี) = LINE OA ของบริษัทนั้น — ห้องแชท/บอทจะใช้ config ของบริษัทนั้น
async function handleLineWebhook(req: Request, res: Response) {
  const { tenantId } = req.params;
  const companyId = (req.params as any).companyId || null;

  try {
    const rawBody = req.body as Buffer;
    const signature = req.headers['x-line-signature'] as string;
    const devBypass = process.env.NODE_ENV === 'development' && req.headers['x-test-bypass'] === 'true';

    // โหลด LINE config ทั้งหมดของ tenant (active)
    const allConfigs = await prisma.channelConfig.findMany({
      where: { tenantId, channel: 'line', isActive: true },
    });
    if (!allConfigs.length) {
      console.warn(`LINE: no active config for tenant=${tenantId}`);
      return res.status(200).json({ status: 'ok' });
    }
    const parseCfg = (cc: any) => {
      let c = cc.config;
      if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = {}; } }
      return c || {};
    };

    // ─── เลือก config ของ OA ที่ส่งมา (deterministic) ──────────────────────────
    let channelConfig: any = null;
    let config: any = null;

    // 1) ถ้า URL ระบุ companyId → ใช้ config ของบริษัทนั้นตรงๆ
    if (companyId) {
      const byUrl = allConfigs.find((cc: any) => cc.companyId === companyId);
      if (byUrl) { channelConfig = byUrl; config = parseCfg(byUrl); }
    }

    // 2) เลือกด้วย signature — จับทุกตัวที่ secret ตรง แล้ว "เลือกตัวที่ผูกบริษัทก่อน"
    //    ⭐ กัน config ผี (ไม่มีบริษัท แต่ secret ซ้ำกับ OA จริง) มาแย่ง → เดิมทำให้แชท OneToBet ไปกอง databet
    if (!channelConfig) {
      if (!devBypass) {
        if (!signature) return res.status(200).json({ status: 'ok' });
        const matches = allConfigs.filter((cc: any) => {
          const c = parseCfg(cc);
          return c.channelSecret && verifyLineSignature(rawBody, signature, c.channelSecret);
        });
        if (!matches.length) {
          console.warn(`LINE: signature mismatch (all ${allConfigs.length} configs) tenant=${tenantId}`);
          return res.status(200).json({ status: 'ok' });
        }
        const best = matches.find((cc: any) => !!cc.companyId) || matches[0];
        channelConfig = best; config = parseCfg(best);
      } else {
        channelConfig = allConfigs[0]; config = parseCfg(allConfigs[0]);
      }
    }

    const accessToken = config.accessToken;
    if (!accessToken) {
      console.error(`LINE: missing token for tenant=${tenantId} company=${channelConfig.companyId || '((none))'}`);
      return res.status(200).json({ status: 'ok' });
    }

    const body = JSON.parse(rawBody.toString('utf-8'));
    const events: any[] = body.events || [];

    if (events.length === 0) {
      console.log(`LINE: verify ping (empty events) tenant=${tenantId} ✅`);
      return res.status(200).json({ status: 'ok' });
    }

    // ตอบ 200 ก่อน แล้วค่อย process
    res.status(200).json({ status: 'ok' });
    const oaCompanyId = companyId || channelConfig.companyId || null;
    const publicOrigin = requestPublicOrigin(req);
    console.log(`LINE: tenant=${tenantId} events=${events.length} → company=${oaCompanyId || '((not-linked))'}`);

    for (const event of events) {
      await processLineEvent(tenantId, event, accessToken, oaCompanyId, publicOrigin);
    }

    return;
  } catch (err) {
    console.error('LINE webhook error:', err);
    if (!res.headersSent) res.status(200).json({ status: 'ok' });
    return;
  }
}
router.post('/:tenantId', handleLineWebhook);
router.post('/:tenantId/:companyId', handleLineWebhook);

// ─── Smart Fallback Messages ──────────────────────────────────────────────────
function getSmartFallback(): string {
  return 'ขออภัยค่ะ ระบบตอบอัตโนมัติขัดข้องชั่วคราว รอแอดมินตรวจสอบสักครู่นะคะ 🙏';
}

// ─── Slip Tracker ─────────────────────────────────────────────────────────────
// key: conversationId → timestamp ที่ลูกค้าส่งรูปล่าสุด
const slipSentAt = new Map<string, number>();
const SLIP_WINDOW_MS = 5 * 60 * 1000; // 5 นาที

// Keyword บ่งบอกปัญหาเงินไม่เข้า / ถอนไม่ได้
const PAYMENT_ISSUE_KEYWORDS = [
  // ฝาก
  'เงินไม่เข้า', 'เงินไม่เข้าสักที', 'ยอดไม่เข้า', 'เครดิตไม่เข้า',
  'เงินไม่ถึง', 'เงินหาย', 'ไม่ได้เงิน', 'เงินผิดปกติ',
  'สลิปแล้วแต่ไม่เข้า', 'โอนแล้วแต่ไม่เข้า',
  'ฝากแล้วแต่ไม่เข้า', 'รอเงินนานมาก', 'ทำไมเงินไม่เข้า',
  'ฝากไม่เข้า', 'ฝากเงินไม่เข้า', 'ฝากแล้ว', 'โอนแล้ว',
  // ถอน
  'ถอนไม่เข้า', 'ถอนเงินไม่เข้า', 'ถอนไม่ได้', 'ถอนเงินไม่ได้',
  'ถอนแล้วไม่เข้า', 'ถอนแล้วแต่ไม่ได้', 'รอถอน', 'ถอนนานมาก',
  'ถอนเงิน', 'เงินถอนไม่เข้า', 'ยอดถอนไม่เข้า',
  'ถอนไม่ออก', 'ถอนเงินไม่ออก',
  // ทั่วไป
  'เงินหายไป', 'เครดิตหาย', 'ยอดหาย', 'ยอดเงินหาย',
  'เงินไม่มา', 'ยังไม่ได้เงิน', 'รอเงิน',
];

function isPaymentIssue(text: string): boolean {
  const t = text.toLowerCase();
  return PAYMENT_ISSUE_KEYWORDS.some(kw => t.includes(kw));
}

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

// เช็คจาก DB ว่ามีรูปภาพ (สลิป) ใน conversation นี้หรือไม่
async function hasImageInConversation(conversationId: string): Promise<boolean> {
  const imgCount = await prisma.message.count({
    where: { conversationId, type: 'image', senderType: 'customer' },
  });
  return imgCount > 0;
}

// ─── Promotion Query Detector ─────────────────────────────────────────────────
//  (เอาออกแล้ว) เดิมดักคีย์เวิร์ดโปรแล้วตอบข้อความฮาร์ดโค้ด 50% โดยไม่ผ่าน AI
//  ตอนนี้คำถามโปรจะไหลไปหา AI (processBotMessage) → ดึงโปรจาก "ระบบ" (businessInfo ต่อบริษัท)


// ─── Main Event Processor ─────────────────────────────────────────────────────
async function processLineEvent(
  tenantId: string,
  event: any,
  accessToken: string,
  companyIdHint?: string | null,
  publicOrigin: string | null = null,
) {
  const userId = event.source?.userId;
  if (!userId) return;

  let profile: any = null;
  try { profile = await getLineProfile(userId, accessToken); } catch { }

  // ─── ⚡ BONUS TIME postback (กดปุ่มค่ายเกม / กลับเมนู) ─────────────────────
  if (event.type === 'postback') {
    try { await handleBonusPostback(tenantId, event, userId, profile, accessToken, companyIdHint); }
    catch (e: any) { console.error('[BonusTime] postback error:', e?.message || e); }
    return;
  }

  const normalized = parseLineEvent(event, profile);
  if (!normalized) return;

  // ─── Handle follow / unfollow (block detection) ───────────────────────────
  const eventType = event.type; // 'follow' | 'unfollow' | 'message' | etc.

  if (eventType === 'unfollow') {
    // ลูกค้าบล็อค OA → บันทึกสถานะบล็อคใน Contact
    try {
      const blockedContact = await prisma.contact.findUnique({
        where: { tenantId_lineUserId: { tenantId, lineUserId: userId } },
      });
      if (blockedContact) {
        await prisma.contact.update({
          where: { id: blockedContact.id },
          data: { isBlocked: true },
        });
        emitToTenant(tenantId, 'contact_blocked', {
          contactId: blockedContact.id,
          lineUserId: userId,
          isBlocked: true,
        });
        console.log(`[LINE] 🚫 Contact blocked: ${blockedContact.displayName} (${userId})`);
      }
    } catch (e: any) {
      console.error('[LINE] unfollow handler error:', e.message);
    }
    return; // unfollow ไม่มี message ให้ process ต่อ
  }

  if (eventType === 'follow') {
    // ลูกค้า Add OA หรือ Unblock → รีเซ็ตสถานะบล็อค
    try {
      const followedContact = await prisma.contact.findUnique({
        where: { tenantId_lineUserId: { tenantId, lineUserId: userId } },
      });
      if (followedContact && followedContact.isBlocked) {
        await prisma.contact.update({
          where: { id: followedContact.id },
          data: { isBlocked: false },
        });
        emitToTenant(tenantId, 'contact_unblocked', {
          contactId: followedContact.id,
          lineUserId: userId,
          isBlocked: false,
        });
        console.log(`[LINE] ✅ Contact unblocked: ${followedContact.displayName} (${userId})`);
      }
    } catch (e: any) {
      console.error('[LINE] follow/unblock handler error:', e.message);
    }
    // ไม่ return ที่นี่ — ให้ flow ดำเนินต่อไปส่ง welcome message
  }

  // ─── Find/Create contact ──────────────────────────────────────────────────
  let contact = await prisma.contact.findUnique({
    where: { tenantId_lineUserId: { tenantId, lineUserId: userId } },
  });
  if (!contact) {
    contact = await prisma.contact.create({
      data: { tenantId, lineUserId: userId, displayName: normalized.displayName || 'LINE User', avatar: normalized.pictureUrl },
    });
  } else if (profile?.displayName && contact.displayName !== profile.displayName) {
    contact = await prisma.contact.update({ where: { id: contact.id }, data: { displayName: profile.displayName, avatar: profile.pictureUrl } });
  }

  // ─── รีเซ็ต isBlocked เมื่อลูกค้าส่งข้อความมาใหม่ (เผื่อเราไม่ได้รับ follow event) ───
  if (contact.isBlocked && eventType === 'message') {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: { isBlocked: false },
    });
    emitToTenant(tenantId, 'contact_unblocked', {
      contactId: contact.id, lineUserId: userId, isBlocked: false,
    });
    console.log(`[LINE] ✅ Auto-unblocked (message received): ${contact.displayName}`);
  }

  // ─── Find/Create conversation ─────────────────────────────────────────────
  let conversation = await prisma.conversation.findUnique({
    where: { tenantId_channel_channelId: { tenantId, channel: 'line', channelId: userId } },
  });
  if (!conversation) {
    // ผูกบริษัทของ LINE OA นี้ (จาก webhook/secret ที่ตรง) — ไม่มีก็ใช้บริษัทเริ่มต้นของ tenant
    const companyId = companyIdHint || await defaultCompanyId(tenantId);
    conversation = await prisma.conversation.create({
      data: { tenantId, companyId, contactId: contact.id, channel: 'line', channelId: userId, status: 'bot', isBot: true },
    });
  } else if (companyIdHint && conversation.companyId !== companyIdHint) {
    // ⚠️ ลูกค้าคนเดิม (LINE userId เดียวกัน) ทักมาจาก "OA ของอีกบริษัท"
    //    → ย้ายห้องแชทไปบริษัทของ OA ที่ทักล่าสุด (ไม่งั้นบอท/BONUS TIME จะใช้ของบริษัทเก่าตลอด)
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { companyId: companyIdHint },
    });
    emitToTenant(tenantId, 'conversation_updated', {
      conversationId: conversation.id, companyId: companyIdHint,
    });
    console.log(`[LINE] 🔀 conversation ${conversation.id} switched company → ${companyIdHint} (OA ที่ลูกค้าทักล่าสุด)`);
  }

  // ─── Save incoming message ────────────────────────────────────────────────
  let msgMetadata = '{}';

  // ดาวน์โหลดรูปภาพจาก LINE ทันที (ก่อน save message)
  if (normalized.messageType === 'image' && normalized.platformMsgId) {
    try {
      const axios = (await import('axios')).default;
      const fs = (await import('fs')).default;
      const path = (await import('path')).default;

      const imgDir = path.join(process.cwd(), 'uploads', 'line-images');
      if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

      const filename = `${normalized.platformMsgId}.jpg`;
      const filepath = path.join(imgDir, filename);

      const imgResp = await axios.get(
        `https://api-data.line.me/v2/bot/message/${normalized.platformMsgId}/content`,
        { headers: { Authorization: `Bearer ${accessToken}` }, responseType: 'arraybuffer', timeout: 15000 }
      );

      fs.writeFileSync(filepath, imgResp.data);
      const imageUrl = `/uploads/line-images/${filename}`;
      msgMetadata = JSON.stringify({ imageUrl });
      console.log(`[LINE Bot] 📸 Image saved: ${imageUrl} (${imgResp.data.length} bytes)`);
    } catch (dlErr: any) {
      console.warn(`[LINE Bot] ⚠️ Image download failed:`, dlErr.message);
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id, tenantId,
      senderType: 'customer', type: normalized.messageType,
      content: normalized.content, platformMsgId: normalized.platformMsgId,
      metadata: msgMetadata,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), status: conversation.status === 'resolved' ? 'open' : conversation.status },
  });

  emitToTenant(tenantId, 'new_message', {
    conversationId: conversation.id,
    message: { ...message, senderType: 'customer' },
    contact, channel: 'line',
  });

  // ─── Welcome (follow event) ───────────────────────────────────────────────
  if (normalized.metadata?.eventType === 'follow' && normalized.replyToken) {
    try {
      await sendLineReply(normalized.replyToken, [lineWelcomeMessage(contact.displayName)], accessToken);
      console.log(`[LINE Bot] 🎉 Welcome sent to ${contact.displayName}`);
    } catch (e: any) {
      console.warn(`[LINE Bot] Welcome send failed:`, e.message);
    }
    return;
  }

  // ─── Bot processing ───────────────────────────────────────────────────────
  if (!conversation.isBot) return; // human ดูแลอยู่ ไม่ต้อง bot ตอบ

  // ════════════════════════════════════════════════════════════════════════════
  // 📸 ลูกค้าส่งรูปภาพ → ตรวจสอบด้วย SlipOK + AI Vision ก่อน แล้วค่อยตอบ
  // ════════════════════════════════════════════════════════════════════════════
  if (normalized.messageType === 'image') {
    slipSentAt.set(conversation.id, Date.now());
    console.log(`[LINE Bot] 🖼️ Image received conversation=${conversation.id} — verifying before reply`);

    // ไม่ตอบอัตโนมัติ — รอผลตรวจสลิปก่อน แล้ว verifySlipFromLine จะเป็นคนส่งผลตอบกลับ
    verifySlipFromLine({
      tenantId, conversationId: conversation.id,
      contactId: contact.id, messageId: normalized.platformMsgId || '',
      accessToken, userId,
      replyToken: normalized.replyToken || null,
      contact, channel: 'line',
    }).catch(err => console.error('[SlipVerify] Unhandled error:', err));

    return;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 💬 ลูกค้าส่งข้อความ text
  // ════════════════════════════════════════════════════════════════════════════
  if (normalized.messageType !== 'text') return;

  // ⚡ BONUS TIME — key ตาม "บริษัทของ OA ที่ลูกค้าทัก" (companyIdHint)
  //    OA ยังไม่ต่อบริษัท (companyIdHint ว่าง) → btConfig=null → ไม่ส่ง bonustime เลย (ไม่ไป databet)
  const btConfig = await loadBonusConfig(companyIdHint, tenantId);
  // คำถามเกี่ยวกับเกมแตก / bonustime / อัตราชนะ → "ตอบเสมอ" ไม่นับ repeat-abuse ไม่ handoff
  const isGameQuery = btConfig ? matchBonusTimeKeyword(normalized.content, btConfig) : false;

  // ════════════════════════════════════════════════════════════════════════════
  // 🛡️ กันสแปม/มือบ่อนถามซ้ำความหมายเดิม ≥10 ครั้ง/นาที → ตอบ auto ไม่เรียก AI (ประหยัด token)
  //     บอทยังดูแลต่อ ไม่สลับ human (ยกเว้นคำถามเกี่ยวกับเกม — ตอบเสมอ)
  // ════════════════════════════════════════════════════════════════════════════
  const abuse = isGameQuery ? { repeat: false, count: 0 } : await checkRepeatAbuse(conversation.id, normalized.content);
  if (abuse.repeat) {
    const reply = REPEAT_HANDOFF_REPLY;
    try {
      if (normalized.replyToken) {
        await sendLineReply(normalized.replyToken, [lineTextMessage(reply)], accessToken);
      } else {
        await sendLinePush(userId, [lineTextMessage(reply)], accessToken);
      }
      const dbMsg = await prisma.message.create({
        data: { conversationId: conversation.id, tenantId, senderType: 'bot', type: 'text', content: reply },
      });
      emitToTenant(tenantId, 'new_message', {
        conversationId: conversation.id,
        message: { ...dbMsg, senderType: 'bot' },
        contact, channel: 'line',
      });
    } catch (e: any) {
      console.warn(`[LINE Bot] repeat guard reply failed:`, e.message);
    }
    console.log(`[LINE Bot] 🛡️ Repeat abuse → auto reply (bot ยังดูแลต่อ) conversation=${conversation.id} count=${abuse.count}`);
    return;
  }

  // ✅ BONUS TIME fast-path: ลูกค้าพิมพ์ bonustime หรือ "ถามหาเกมแตก/เกมไหนดี" → โชว์การ์ด BONUS TIME ทันที
  //    (แทนที่ลิสต์ข้อความแนะนำเกมแบบเดิม — ตอนนี้เกมแตกทุกแบบเด้งเป็นกล่อง BONUS TIME)
  if (btConfig && matchBonusTimeKeyword(normalized.content, btConfig)) {
    const ctx: BonusCtx = {
      tenantId, conversation, contact, userId,
      replyToken: normalized.replyToken || null, accessToken, config: btConfig,
    };
    const ok = await sendBonusMenu(ctx);
    if (ok) {
      console.log(`[BonusTime] ⚡ keyword/hot-games trigger → menu conv=${conversation.id}`);
      return;
    }
    // ยังไม่มีค่าย/ส่ง Flex ไม่ผ่าน → ห้ามเงียบ! ตอบ text แจ้งลูกค้าแล้วจบ
    // (เดิมปล่อยไหลไป flow โปรโมชั่น → ลูกค้าถาม BONUSTIME แต่ได้คำตอบโปรฝาก งง)
    const btFallback = 'ระบบ BONUS TIME กำลังอัปเดตข้อมูลค่ายเกมอยู่ค่ะ ⏳ อีกสักครู่พิมพ์ "BONUSTIME" มาใหม่ได้เลยนะคะ ✨';
    try {
      if (normalized.replyToken) {
        await sendLineReply(normalized.replyToken, [lineTextMessage(btFallback)], accessToken);
      } else {
        await sendLinePush(userId, [lineTextMessage(btFallback)], accessToken);
      }
      const dbMsg = await prisma.message.create({
        data: { conversationId: conversation.id, tenantId, senderType: 'bot', type: 'text', content: btFallback },
      });
      emitToTenant(tenantId, 'new_message', {
        conversationId: conversation.id,
        message: { ...dbMsg, senderType: 'bot' },
        contact, channel: 'line',
      });
    } catch (e: any) {
      console.warn('[BonusTime] fallback text failed:', e?.message);
    }
    console.log(`[BonusTime] ⚠️ keyword matched but menu unavailable → text fallback conv=${conversation.id}`);
    return;
  }

  // ✅ ถามหาเกมแตก/เกมไหนดี แต่บริษัทนี้ "ปิด" BONUS TIME (btConfig ว่าง)
  //    → ไม่โฆษณา BONUSTIME, ไม่ส่งลิสต์เกมเดิม — ปล่อยให้ AI ตอบตามข้อมูลธุรกิจปกติ
  //    (เปิด/ปิดต่อบริษัทได้ที่หน้า ตั้งค่า → BONUS TIME → dropdown บริษัท)

  // ✅ ตรวจสอบ: ลูกค้าส่งเบอร์โทรศัพท์มา → ตอบกลับรับรู้ข้อมูลลูกค้าแล้ว และส่งต่อให้เจ้าหน้าที่ทันที
  if (isPhoneNumber(normalized.content)) {
    const reply = `ได้รับข้อมูลเรียบร้อยแล้วค่ะ รอสักครู่ แอดมินกำลังตรวจสอบให้นะคะ 🙏😊`;
    try {
      if (normalized.replyToken) {
        await sendLineReply(normalized.replyToken, [lineTextMessage(reply)], accessToken);
      } else {
        await sendLinePush(userId, [lineTextMessage(reply)], accessToken);
      }
      const dbMsg = await prisma.message.create({
        data: { conversationId: conversation.id, tenantId, senderType: 'bot', type: 'text', content: reply },
      });
      emitToTenant(tenantId, 'new_message', {
        conversationId: conversation.id,
        message: { ...dbMsg, senderType: 'bot' },
        contact, channel: 'line',
      });
    } catch (e: any) {
      console.warn(`[LINE Bot] phone number reply failed:`, e.message);
    }

    // 🤖 บอทดูแลต่อ — ไม่สลับ human (แอดมินเห็นข้อมูลใน inbox อยู่แล้ว)
    console.log(`[LINE Bot] 📞 Phone number received (bot ยังดูแลต่อ) conversation=${conversation.id}`);
    return;
  }


  // ✅ ตรวจสอบ: เงินไม่เข้า / ถอนไม่ได้ → ตอบขอยูสเซอร์ + ถ้ามีสลิปแล้ว handoff ทันที
  const paymentIssue = isPaymentIssue(normalized.content);

  if (paymentIssue) {
    const hasSlip = await hasImageInConversation(conversation.id);
    console.log(`[LINE Bot] 💳 Payment issue detected | hasSlip=${hasSlip}`);

    if (hasSlip) {
      // มีสลิปอยู่แล้ว → ตอบรับ กำลังตรวจสอบ (บอทดูแลต่อ ไม่สลับ human)
      const reply = `รับทราบค่ะ เห็นว่าส่งสลิปไว้แล้ว กำลังตรวจสอบให้นะคะ รอสักครู่ค่ะ ⏳`;
      try {
        if (normalized.replyToken) {
          await sendLineReply(normalized.replyToken, [lineTextMessage(reply)], accessToken);
        } else {
          await sendLinePush(userId, [lineTextMessage(reply)], accessToken);
        }
        const dbMsg = await prisma.message.create({
          data: { conversationId: conversation.id, tenantId, senderType: 'bot', type: 'text', content: reply },
        });
        emitToTenant(tenantId, 'new_message', {
          conversationId: conversation.id,
          message: { ...dbMsg, senderType: 'bot' },
          contact, channel: 'line',
        });
      } catch (e: any) {
        console.warn(`[LINE Bot] payment issue reply failed:`, e.message);
      }

      // Handoff ทันที
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { isBot: true, status: 'bot' },
      });
      emitToTenant(tenantId, 'conversation_updated', {
        conversationId: conversation.id, status: 'bot', isBot: true,
      });
      console.log(`[LINE Bot] 🔄 Handoff (payment issue + has slip) conversation=${conversation.id}`);
    } else {
      // ยังไม่มีสลิป → ขอแจ้งยูสเซอร์
      const reply = `รบกวนแจ้งยูสเซอร์ ให้แอดมินตรวจสอบจากหน้าระบบหน่อยนะคะ🥰`;
      try {
        if (normalized.replyToken) {
          await sendLineReply(normalized.replyToken, [lineTextMessage(reply)], accessToken);
        } else {
          await sendLinePush(userId, [lineTextMessage(reply)], accessToken);
        }
        const dbMsg = await prisma.message.create({
          data: { conversationId: conversation.id, tenantId, senderType: 'bot', type: 'text', content: reply },
        });
        emitToTenant(tenantId, 'new_message', {
          conversationId: conversation.id,
          message: { ...dbMsg, senderType: 'bot' },
          contact, channel: 'line',
        });
      } catch (e: any) {
        console.warn(`[LINE Bot] username request reply failed:`, e.message);
      }
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

    // 💾 เก็บข้อมูลลูกค้าจากข้อความอัตโนมัติ (ชื่อ/เบอร์/ธนาคาร/บัญชี/ยูส)
    //    รอผลก่อนตอบ เพื่อให้บอทเห็นข้อมูลล่าสุด (เช่น ลูกค้าเพิ่งพิมพ์ข้อมูลสมัคร)
    // บอทเพิ่งขอข้อมูลสมัครไปหรือเปล่า (ดูจากข้อความล่าสุดของฝั่งเรา)
    const lastBotMsg = [...conversationHistory].reverse().find(m => m.role === 'assistant')?.content || '';
    const inRegisterFlow = /✅|รบกวนลูกค้าแจ้งข้อมูล|ขอเพิ่มอีกนิด|ยืนยันว่าข้อมูลถูกต้อง/.test(lastBotMsg);
    let profileForBot = readProfile(contact as any);
    if (mightContainCustomerInfo(normalized.content)) {
      const captured = await captureCustomerInfo({
        tenantId, contactId: contact.id,
        recentMessages: [...conversationHistory.slice(-5), { role: 'user', content: normalized.content }],
        registrationFlow: inRegisterFlow || isRegisterIntent(normalized.content),
        channel: 'line',
      });
      if (captured) profileForBot = captured;
    }
    const profileContext = buildProfileContext(profileForBot);

    // ═══ เรื่องสมัครสมาชิก — logic ตายตัว ไม่พึ่ง AI ═══
    //  ยังไม่มีข้อมูล → ส่งฟอร์ม ✅ ทั้งชุด | มีบางส่วน → ขอเฉพาะที่ขาด | ครบ → ทวนยืนยัน
    let reply: string;
    let responseImage: { imageUrl: string; imagePreviewUrl?: string; knowledgeId?: string } | undefined;
    const shouldHandoff = false;
    if (isRegisterIntent(normalized.content) && !mightContainCustomerInfo(normalized.content)) {
      // ลูกค้า "ถามเรื่องสมัคร" (ยังไม่ได้ให้ข้อมูล) → ส่งฟอร์ม/ขอเฉพาะที่ขาด แบบตายตัว
      reply = buildRegisterReply(profileForBot);
      console.log(`[LINE Bot] 📝 register-intent fast path conv=${conversation.id}`);
    } else if (inRegisterFlow && mightContainCustomerInfo(normalized.content)) {
      // ลูกค้ากำลังส่งข้อมูลสมัครตามที่ขอ → บันทึกแล้วตอบตามข้อมูลจริง (ขาดอะไรขอต่อ / ครบแล้วทวนยืนยัน)
      reply = buildRegisterReply(profileForBot);
      // ครบทุกช่องแล้ว → โอนให้แอดมินดำเนินการสมัครต่อ
      void missingRegisterFields(profileForBot);
      console.log(`[LINE Bot] 📝 register-info received conv=${conversation.id} handoff=${shouldHandoff}`);
    } else {
      const r = await processBotMessage(
        tenantId, conversationHistory, normalized.content,
        {
          displayName: contact.displayName,
          memberType: (contact as any).memberType,
          totalDeposit: (contact as any).totalDeposit,
          depositCount: (contact as any).depositCount,
        },
        conversation.companyId,
        { bonusTimeActive: !!btConfig, profileContext, channel: 'line' },
      );
      reply = r.reply;
      const imageWasSentRecently = r.knowledgeId && history.some((message: any) => {
        if (message.senderType !== 'bot' || Date.now() - new Date(message.createdAt).getTime() > 30 * 60 * 1000) return false;
        try { return JSON.parse(message.metadata || '{}').knowledgeId === r.knowledgeId; } catch { return false; }
      });
      if (r.imageUrl && !imageWasSentRecently) {
        responseImage = {
          imageUrl: r.imageUrl,
          imagePreviewUrl: r.imagePreviewUrl,
          knowledgeId: r.knowledgeId,
        };
      }
      void r.shouldHandoff;
    }

    // ⚡ AI ตัดสินใจเรียก BONUS TIME เอง (ตอบด้วยโทเคน [[BONUSTIME]])
    if (btConfig && /\[\[BONUSTIME\]\]/i.test(reply)) {
      const ctx: BonusCtx = {
        tenantId, conversation, contact, userId,
        replyToken: normalized.replyToken || null, accessToken, config: btConfig,
      };
      if (await sendBonusMenu(ctx)) {
        console.log(`[LINE Bot] ⚡ AI-triggered BONUS TIME menu conv=${conversation.id}`);
        return;
      }
    }
    // ตัดโทเคนออกก่อนส่ง (กันกรณีไม่มีค่าย/ตกหล่น)
    const cleanReply = reply.replace(/\[\[BONUSTIME\]\]/gi, '').trim() || 'ได้รับข้อความแล้วนะคะ 🙏';
    const originalImageUrl = publicKnowledgeImageUrl(publicOrigin, responseImage?.imageUrl);
    const previewImageUrl = publicKnowledgeImageUrl(publicOrigin, responseImage?.imagePreviewUrl) || originalImageUrl;
    const outboundMessages = originalImageUrl
      ? [lineImageMessage(originalImageUrl, previewImageUrl || undefined), lineBotReplyMessage(cleanReply)]
      : [lineBotReplyMessage(cleanReply)];

    console.log(`[LINE Bot] tenant=${tenantId} reply="${cleanReply.substring(0, 60)}" image=${!!originalImageUrl} handoff=${shouldHandoff}`);

    let sent = false;
    let sentWithImage = false;

    if (normalized.replyToken) {
      try {
        await sendLineReply(normalized.replyToken, outboundMessages, accessToken);
        sent = true;
        sentWithImage = !!originalImageUrl;
        console.log(`[LINE Bot] ✅ Reply sent via replyToken`);
      } catch (replyErr: any) {
        console.warn(`[LINE Bot] ⚠️ Reply API failed (${replyErr?.response?.data?.message || replyErr.message}), trying Push...`);
      }
    }

    if (!sent) {
      try {
        await sendLinePush(userId, outboundMessages, accessToken);
        sent = true;
        sentWithImage = !!originalImageUrl;
        console.log(`[LINE Bot] ✅ Reply sent via Push API`);
      } catch (pushErr: any) {
        console.error(`[LINE Bot] ❌ Push API failed:`, pushErr?.response?.data || pushErr.message);
        // รูปมีปัญหาหรือ LINE ดึงรูปไม่ได้ → ยังต้องส่งข้อความให้ลูกค้าได้
        if (originalImageUrl) {
          try {
            await sendLinePush(userId, [lineBotReplyMessage(cleanReply)], accessToken);
            sent = true;
            console.warn('[LINE Bot] ⚠️ Image failed; text fallback sent');
          } catch (textErr: any) {
            console.error('[LINE Bot] ❌ Text fallback also failed:', textErr?.response?.data || textErr.message);
          }
        }
      }
    }

    if (sent) {
      const botReply = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          tenantId,
          senderType: 'bot',
          type: sentWithImage ? 'image' : 'text',
          content: cleanReply,
          metadata: sentWithImage
            ? JSON.stringify({
                imageUrl: responseImage?.imageUrl,
                imagePreviewUrl: responseImage?.imagePreviewUrl,
                knowledgeId: responseImage?.knowledgeId,
                aiKnowledgeImage: true,
              })
            : undefined,
        },
      });
      emitToTenant(tenantId, 'new_message', {
        conversationId: conversation.id,
        message: { ...botReply, senderType: 'bot' },
        contact, channel: 'line',
      });
    }

    if (shouldHandoff) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { isBot: true, status: 'bot' },
      });
      emitToTenant(tenantId, 'conversation_updated', {
        conversationId: conversation.id, status: 'bot', isBot: true,
      });
      console.log(`[LINE Bot] 🔄 Handoff to agent conversation=${conversation.id}`);
    }

  } catch (aiError: any) {
    console.error('[LINE Bot] ❌ AI error:', aiError?.message || aiError);
    try {
      const smartFallback = getSmartFallback();
      if (normalized.replyToken) {
        await sendLineReply(normalized.replyToken, [lineTextMessage(smartFallback)], accessToken);
      } else {
        await sendLinePush(userId, [lineTextMessage(smartFallback)], accessToken);
      }
      const fallbackMsg = await prisma.message.create({
        data: { conversationId: conversation.id, tenantId, senderType: 'bot', type: 'text', content: smartFallback },
      });
      emitToTenant(tenantId, 'new_message', {
        conversationId: conversation.id,
        message: { ...fallbackMsg, senderType: 'bot' },
        contact, channel: 'line',
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { isBot: true, status: 'bot' },
      });
      emitToTenant(tenantId, 'conversation_updated', {
        conversationId: conversation.id, status: 'bot', isBot: true,
      });
    } catch (fallbackErr) {
      console.error('[LINE Bot] ❌ Fallback send also failed:', fallbackErr);
    }
  }
}

// ─── Async Slip Verification Handler ──────────────────────────────────────────
async function verifySlipFromLine(opts: {
  tenantId: string; conversationId: string; contactId: string;
  messageId: string; accessToken: string; userId: string;
  replyToken: string | null;
  contact: any; channel: string;
}) {
  const { tenantId, conversationId, contactId, messageId, accessToken, userId, replyToken, contact } = opts;

  try {
    const result = await verifySlip({
      tenantId, conversationId, contactId, messageId, accessToken, userId,
    });

    console.log(`[SlipVerify] Result: status=${result.status} by=${result.verifiedBy}`);

    // ── กำหนดข้อความตอบลูกค้าตามผลการตรวจ ──────────────────────────────────
    let customerMsg: string | null = null;

    if (result.status === 'verified' || result.status === 'duplicate' || result.status === 'fake' || result.status === 'error') {
      // ใช้ผลจากตัวตรวจโดยตรง ไม่ฝังเวลาเครดิต/เงื่อนไขธุรกิจไว้ใน webhook
      customerMsg = result.message;
    } else if (result.status === 'not_slip') {
      // 🖼️ ลูกค้าส่งรูปที่ "ไม่ใช่สลิป" → ให้ AI ดูรูปแล้วช่วยแก้ปัญหาให้ตรงจุด
      try {
        const imgPath = (result as any).imagePath || result.record?.imagePath;
        if (imgPath) {
          const fsMod = (await import('fs')).default;
          if (fsMod.existsSync(imgPath)) {
            const buf = fsMod.readFileSync(imgPath);
            const base64 = `data:image/jpeg;base64,${buf.toString('base64')}`;
            const convRow = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { companyId: true } });
            const recent = await prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, take: 10 });
            const history = recent
              .filter((m: any) => m.type === 'text' && m.content)
              .map((m: any) => ({ role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const, content: m.content }));
            const lastText = [...recent].reverse().find((m: any) => m.senderType === 'customer' && m.type === 'text')?.content || '';
            const assist = await visionAssistReply({
              tenantId, companyId: convRow?.companyId,
              imageBase64: base64, conversationHistory: history, lastCustomerText: lastText, channel: 'line',
            });
            if (!assist.isSlip && assist.reply) customerMsg = assist.reply;
          }
        }
      } catch (e: any) {
        console.warn('[SlipVerify] vision assist failed:', e.message);
      }
    }
    // ── ส่งข้อความกลับลูกค้า (เฉพาะกรณีที่มี customerMsg) ──────────────────
    if (customerMsg) {
      try {
        if (replyToken) {
          await sendLineReply(replyToken, [lineTextMessage(customerMsg)], accessToken);
        } else {
          await sendLinePush(userId, [lineTextMessage(customerMsg)], accessToken);
        }
        console.log(`[SlipVerify] 💬 Customer notified (${result.status})`);
      } catch (sendErr: any) {
        // replyToken อาจหมดอายุ (5 วิ) → ลอง push
        try {
          await sendLinePush(userId, [lineTextMessage(customerMsg)], accessToken);
        } catch (pushErr: any) {
          console.warn(`[SlipVerify] ⚠️ Could not notify customer: ${pushErr.message}`);
        }
      }
    }

    // ── บันทึกผลลง DB และ Emit ไปยัง admin inbox ───────────────────────────
    const adminNote = result.status === 'not_slip'
      ? (customerMsg || `🖼️ ลูกค้าส่งรูปทั่วไป (ไม่ใช่สลิป) — AI ไม่สามารถช่วยได้`)
      : result.message;

    const resultMsg = await prisma.message.create({
      data: {
        conversationId, tenantId,
        senderType: 'bot', type: 'text',
        content: adminNote,
        metadata: JSON.stringify({
          slipVerification: {
            status: result.status,
            verifiedBy: result.verifiedBy,
            amount: result.amount,
            bankFrom: result.bankFrom,
            bankTo: result.bankTo,
            transRef: result.transRef,
            recordId: result.record?.id,
          },
        }),
      },
    });

    emitToTenant(tenantId, 'new_message', {
      conversationId,
      message: { ...resultMsg, senderType: 'bot' },
      contact, channel: 'line',
    });

    // ── Handoff to human ถ้าน่าสงสัย หรือตรวจไม่ได้ ────────────────────────
    if (result.status === 'fake' || result.status === 'error') {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { isBot: true, status: 'bot' },
      });
      emitToTenant(tenantId, 'conversation_updated', {
        conversationId, status: 'bot', isBot: true,
      });
      console.log(`[SlipVerify] 🔄 Handoff to agent (${result.status}) conversation=${conversationId}`);
    }

  } catch (err: any) {
    console.error(`[SlipVerify] ❌ Fatal error: ${err.message}`);
  }
}

export default router;

import { Router, Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { verifyLineSignature, parseLineEvent, getLineProfile, sendLineReply, sendLinePush, lineTextMessage, lineBotReplyMessage, lineWelcomeMessage } from '../../services/line.service';
import { processBotMessage, generateAIResponse, visionAssistReply } from '../../services/ai.service';
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
    let channelConfig = await getChannelConfig(tenantId, 'line', companyId);

    if (!channelConfig || !channelConfig.isActive) {
      console.warn(`LINE: no active config for tenant=${tenantId}`);
      return res.status(200).json({ status: 'ok' });
    }

    let config: any = channelConfig.config;
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch { config = {}; }
    }
    let { channelSecret, accessToken } = config;

    if (!channelSecret || !accessToken) {
      console.error(`LINE: missing secret/token for tenant=${tenantId}`);
      return res.status(200).json({ status: 'ok' });
    }

    const rawBody = req.body as Buffer;
    const signature = req.headers['x-line-signature'] as string;

    if (process.env.NODE_ENV !== 'development' || req.headers['x-test-bypass'] !== 'true') {
      if (!signature) {
        return res.status(200).json({ status: 'ok' });
      }

      if (!verifyLineSignature(rawBody, signature, channelSecret)) {
        // ⚠️ secret ของ config ที่เดาไว้ไม่ตรง — tenant มีหลาย OA (หลายบริษัท)
        //    ลองเช็คกับ "ทุก" LINE config ของ tenant แล้วใช้ตัวที่ signature ตรง
        //    (เดิมตีทิ้งเลย → แชทจาก OA อื่นหายเงียบ ไม่เข้า CRM บอทไม่ตอบ)
        const allConfigs = await prisma.channelConfig.findMany({
          where: { tenantId, channel: 'line', isActive: true },
        });
        let matched: any = null;
        for (const cc of allConfigs) {
          let c: any = cc.config;
          if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = {}; } }
          if (c.channelSecret && verifyLineSignature(rawBody, signature, c.channelSecret)) {
            matched = { row: cc, cfg: c };
            break;
          }
        }
        if (!matched) {
          console.warn(`LINE: signature mismatch (all ${allConfigs.length} configs) tenant=${tenantId}`);
          return res.status(200).json({ status: 'ok' });
        }
        console.log(`LINE: signature matched via fallback config company=${matched.row.companyId || 'default'}`);
        channelConfig = matched.row;
        config = matched.cfg;
        channelSecret = config.channelSecret;
        accessToken = config.accessToken;
      }
    }

    const body = JSON.parse(rawBody.toString('utf-8'));
    const events: any[] = body.events || [];

    if (events.length === 0) {
      console.log(`LINE: verify ping (empty events) tenant=${tenantId} ✅`);
      return res.status(200).json({ status: 'ok' });
    }

    // ตอบ 200 ก่อน แล้วค่อย process
    res.status(200).json({ status: 'ok' });
    console.log(`LINE: tenant=${tenantId} events=${events.length}`);

    for (const event of events) {
      await processLineEvent(tenantId, event, accessToken, companyId || (channelConfig as any).companyId || null);
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
const FALLBACK_MESSAGES = [
  `ขอโทษนะคะ ตอบไม่ได้ตอนนี้ค่ะ เดี๋ยวเจ้าหน้าที่มาช่วยค่ะ 🙏`,
  `ขอโทษค่ะ ไม่แน่ใจเรื่องนี้ เดี๋ยวคนมาดูแลให้นะคะ`,
  `รับทราบแล้วค่ะ เดี๋ยวเจ้าหน้าที่ติดต่อกลับนะคะ`,
  `โอเคค่ะ รอแป๊บนึงนะคะ เดี๋ยวมีคนมาช่วย 😊`,
];

function getSmartFallback(userMessage: string): string {
  const msg = userMessage.toLowerCase();
  if (msg.includes('สมัคร') || msg.includes('register') || msg.includes('เปิดบัญชี')) {
    return `🖌รบกวนลูกค้าแจ้งข้อมูลดังนี้นะคะ🖌\n✅ชื่อ - นามสกุล :\n✅เบอร์โทรศัพท์ที่ใช้สมัครสมาชิก :\n✅ธนาคาร :\n✅เลขบัญชีธนาคาร :\n\nรบกวนคุณลูกค้าพิมพ์ข้อมูลเป็นตัวอักษรให้กับทางทีมงานนะคะ`;
  }
  if (msg.includes('ฝาก') || msg.includes('ถอน') || msg.includes('โอน')) {
    return `ส่งสลิปมาได้เลยค่ะ 💳 เดี๋ยวตรวจสอบให้ค่ะ`;
  }
  if (msg.includes('โปรโมชั่น') || msg.includes('โปร') || msg.includes('โบนัส')) {
    return `เดี๋ยวแจ้งโปรให้นะคะ 🎁 รอแป๊บนึงนะคะ`;
  }
  if (msg.includes('ปัญหา') || msg.includes('ไม่ได้') || msg.includes('error')) {
    return `เข้าใจแล้วค่ะ 🙏 เดี๋ยวมีเจ้าหน้าที่สอบดูให้ค่ะ`;
  }
  return FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)];
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

// Keyword บ่งบอกว่าลูกค้าหมดเงิน / เงินหมด
const OUT_OF_MONEY_KEYWORDS = [
  'หมดเงิน', 'เงินหมด', 'หมดตัว', 'หมดแล้ว',
  'ไม่มีเงิน', 'ไม่เหลือเงิน', 'เงินไม่เหลือ',
  'เจ๊งหมด', 'หมดเจ๊ง', 'หมดทุน',
  'ทุนหมด', 'หมดบัญชี',
  'ไม่เหลือแล้ว', 'พักก่อนดีมั้ย',
  'เล่นไม่ได้แล้ว', 'เล่นไม่ได้', 'ไม่ได้เล่น',
  'หมดครั้งนี้', 'หมดอีกแล้ว',
];

const OUT_OF_MONEY_REPLIES = [
  // โทน: ใจเย็น ชวนพัก (ตัวอย่างจากเจ้าของ)
  `เล่นใจเย็นๆ นะคะ อย่าเพิ่งรีบมาก หยุดพักสักครู่ แล้วค่อยๆ มาใหม่นะคะ จะรอต้อนรับเสมอเลยค่า 😊`,

  // โทน: ดวงยังไม่มา รอวันดี
  `วันนี้ดวงอาจยังไม่มาถึงค่ะ ไม่เป็นไรนะคะ พักก่อนได้เลยค่ะ พรุ่งนี้อาจเป็นวันของเราก็ได้นะคะ 🍀 จะรอต้อนรับอยู่เสมอเลยค่า`,

  // โทน: ดูแลตัวเอง ออกไปรับอากาศ
  `ขอบคุณที่บอกนะคะ 🙏 ลองพักผ่อนก่อนนะคะ ดื่มน้ำ หรือออกไปรับอากาศสักนิด กลับมาแล้วค่อยเล่นใหม่นะคะ ดวงจะมาเองเลยค่า 😊`,

  // โทน: เอาใจช่วย บางวันก็เป็นแบบนี้
  `เข้าใจเลยค่ะ บางวันก็เป็นแบบนี้นะคะ ไม่ต้องกังวลค่ะ 💪 หยุดพักก่อนแล้วรอบหน้าดวงจะมาแน่นอนเลยค่า จะรออยู่นะคะ`,

  // โทน: หายใจลึกๆ สงบใจ
  `หายใจลึกๆ ก่อนนะคะ 😊 ไม่ต้องรีบค่ะ ค่อยๆ พักก่อน เดี๋ยวโชคดีก็จะตามมาเองนะคะ จะรออยู่ตรงนี้เสมอเลยค่า 🌸`,

  // โทน: พลังบวก ดวงหมุนเวียน
  `ยังไม่สายนะคะ! แค่พักก่อน แล้วกลับมาใหม่ด้วยพลังบวกนะคะ ดวงมันหมุนเวียนเสมอค่ะ เดี๋ยวมาถึงเราแน่ๆ เลยค่า ✨`,

  // โทน: อ่อนโยน ไม่ตัดสิน
  `ไม่ต้องรู้สึกแย่นะคะ 🥰 มันเกิดขึ้นได้กับทุกคนค่ะ ลองหยุดพักสักครู่ ทำอะไรที่ชอบก่อนนะคะ แล้วค่อยกลับมาเมื่อพร้อมค่ะ จะรอเสมอเลยนะคะ`,

  // โทน: เพื่อนคุย ไม่ฝืน
  `อย่าฝืนนะคะ 😌 ถ้ารู้สึกว่าวันนี้ดวงยังไม่มา ก็พักก่อนได้เลยค่ะ ไม่มีใครตัดสินนะคะ แล้วเดี๋ยวค่อยกลับมาเล่นใหม่นะคะ จะรออยู่นะคะ 🌟`,

  // โทน: แคร์สุขภาพ จิตใจก่อน
  `สุขภาพใจสำคัญที่สุดนะคะ 💙 พักก่อนนะคะ ไม่ต้องรีบ เดี๋ยวเมื่อหัวใจโล่งๆ แล้ว ค่อยกลับมาเล่นใหม่ดีกว่านะคะ ดวงดีก็จะตามมาเองค่า`,

  // โทน: เบาๆ ขอให้โชคดี
  `โชคดีจะมาหาเราเองนะคะ แค่พักสักนิดก่อนค่ะ 🍀 อย่าเพิ่งหนักใจนะคะ แล้วค่อยๆ กลับมาใหม่เมื่อพร้อม จะรอต้อนรับอยู่เสมอเลยค่า 😊`,
];

function isOutOfMoney(text: string): boolean {
  const t = text.toLowerCase();
  return OUT_OF_MONEY_KEYWORDS.some(kw => t.includes(kw));
}

// ─── เกมไหนแตก / แนะนำเกม ────────────────────────────────────────────────────
// ─── เกมไหนแตก / แนะนำเกม ────────────────────────────────────────────────────
const HOT_GAMES_KEYWORDS = [
  'เกมไหนแตก', 'เกมแตก', 'เกมดัง', 'แนะนำเกม', 'เกมอะไรดี',
  'เล่นเกมอะไร', 'เกมไหนดี', 'เกมอะไรแตก', 'เกมไหนได้เงิน',
  'เกมฮิต', 'สล็อตไหนแตก', 'สล็อตแตก', 'บาคาร่าไหนดี',
  'เกมแนะนำ', 'เล่นอะไรดี', 'ตอนนี้เกมไหน', 'เกมไหนดีสุด',
  'ขอเกมแตกดีๆ', 'ขอเกมแตก', 'ขอเกมส์แตก', 'ขอสล็อตแตกดีๆ',
  'ขอเกมแตกวันนี้', 'แนะนำสล็อต', 'แนะนำสล๊อต', 'เล่นเกมไหนแตก',
  'มีเกมแตกแนะนำไหม', 'อยากบวกเล่นเกมไหนดี', 'ขอเกมน่าเล่น',
  'ขอเกมส์น่าเล่น', 'เกมไหนกำลังแตก', 'ขอสล็อตแตกๆ',
  'ขอแนวทาง', 'ขอเกมนำทาง', 'ขอค่ายไหนดี', 'เล่นค่ายไหนดี',
  'ค่ายไหนแตกดี', 'เกมส์ไหนแตกดี', 'มีเกมส์ไหนแตก', 'เล่นไรดี',
  'เล่นสล็อตไหนดี', 'เล่นสล๊อตไหนดี', 'เกมแนะนำวันนี้',
  'แนะนำสล็อตแตกดี', 'มีเกมน่าเล่นแนะนำไหม', 'มีเกมแตกๆไหม',
  'ขอเกมทำเงิน', 'ขอเกมแตกง่าย', 'เกมไหนแตกง่าย',
  'แนะนำสล็อตแตกง่าย', 'แนะนำสล๊อตแตกง่าย', 'สล็อตค่ายไหนดี',
  'ขอสล็อตแตกวันนี้', 'เกมส์ไหนดี', 'ขอแนวทางสล็อต', 'ขอแนวทางเกม'
];

function isHotGamesQuery(text: string): boolean {
  const t = text.toLowerCase();
  return HOT_GAMES_KEYWORDS.some(kw => t.includes(kw));
}

// ลิสต์ประวัติการแนะนำเกมต่อห้องสนทนาเพื่อไม่ให้ซ้ำกันภายใน 1 ชั่วโมง
const lastRecommendedGames = new Map<string, { games: string[]; timestamp: number }>();

const FALLBACK_GAMES_POOL = [
  { name: 'Treasures of Aztec', provider: 'PG Soft' },
  { name: 'Lucky Neko', provider: 'PG Soft' },
  { name: 'Wild Bounty Bandito', provider: 'PG Soft' },
  { name: 'Caishen Wins', provider: 'PG Soft' },
  { name: 'Fortune Ox', provider: 'PG Soft' },
  { name: 'Fortune Tiger', provider: 'PG Soft' },
  { name: 'Dragon Hatch', provider: 'PG Soft' },
  { name: 'Ganesha Gold', provider: 'PG Soft' },
  { name: 'Songkran Splash', provider: 'PG Soft' },
  { name: 'Sugar Rush', provider: 'Pragmatic Play' },
  { name: 'Sweet Bonanza', provider: 'Pragmatic Play' },
  { name: 'Gates of Olympus', provider: 'Pragmatic Play' },
  { name: 'Starlight Princess', provider: 'Pragmatic Play' },
  { name: 'Wild West Gold', provider: 'Pragmatic Play' },
  { name: 'Roma', provider: 'Joker Gaming' },
  { name: 'Roma X', provider: 'Jili' },
  { name: 'Boxing King', provider: 'Jili' }
];

const FALLBACK_REASONS = [
  'ช่วงนี้สถิติคนเล่นเยอะมากค่ะ มีลุ้นโบนัสแตกง่ายเลย 🤑✨',
  'ช่วงเวลานี้ประวัติโบนัสแตกดีค่ะ น่าลองสลับเล่นดูนะคะ 🎉💸',
  'มีคนเพิ่งชนะรางวัลใหญ่ไปหมาดๆ เลยค่ะ ดวงกำลังขึ้นเลย 🌟💰',
  'อัตราการจ่ายคืนสถิติกำลังพุ่งสูงค่ะ ลองสับเปลี่ยนเกมดูนะคะ 🚀💵',
  'ช่วงนี้ฟรีสปินเข้ารัวๆ เลยค่ะ ขอให้เฮงๆ รวยๆ นะคะ 🥰💎'
];

async function getHotGamesReply(conversationId: string): Promise<string> {
  const now = new Date();
  const hourTH = (now.getUTCHours() + 7) % 24;

  let timeLabel: string;
  let timeEmoji: string;

  if (hourTH >= 0 && hourTH < 6) {
    timeLabel = 'ช่วงดึกนี้'; timeEmoji = '🌙';
  } else if (hourTH >= 6 && hourTH < 12) {
    timeLabel = 'ช่วงเช้านี้'; timeEmoji = '🌅';
  } else if (hourTH >= 12 && hourTH < 17) {
    timeLabel = 'ช่วงบ่ายนี้'; timeEmoji = '☀️';
  } else if (hourTH >= 17 && hourTH < 21) {
    timeLabel = 'ช่วงเย็นนี้'; timeEmoji = '🌆';
  } else {
    timeLabel = 'ช่วงกลางคืนนี้'; timeEmoji = '🌃';
  }

  try {
    const prompt = `คุณเป็นแอดมินเว็บสล็อตออนไลน์ บริการลูกค้าอย่างเป็นกันเองและสุภาพ อบอุ่น มีความหวัง
ลูกค้าทักมาขอเกมสล็อตที่กำลังแตกดี ตอนนี้เวลา ${hourTH}:00 น. (เวลาไทย)

หน้าที่ของคุณ:
สุ่มแนะนำเกมสล็อตออนไลน์ที่มีอยู่จริงจำนวน 2-3 เกม (อย่าแนะนำแต่เกมซ้ำเดิมๆ เช่น Sweet Bonanza, Gates of Olympus, Mahjong Ways ทุกครั้ง ให้สลับแนะนำเกมอื่นๆ บ้างเพื่อความหลากหลาย)

คอลเลกชันตัวอย่างเกมจริงที่คุณสามารถเลือกแนะนำได้ (หรือแนะนำเกมจริงอื่นๆ จากค่ายเหล่านี้):
- PG Soft: Treasures of Aztec (สาวถ้ำ), Wild Bounty Bandito, Lucky Neko (เนโกะ), Caishen Wins, Ganesha Fortune, Fortune Ox, Fortune Tiger, Songkran Splash, Dragon Hatch
- Pragmatic Play: Sugar Rush, Sweet Bonanza, Gates of Olympus, Starlight Princess, Cleocatra, Big Bass Bonanza, Wild West Gold
- Joker Gaming: Roma, Horus Eye, Joker Madness
- Jili: Roma X, Super Rich, Boxing King

จัดรูปแบบข้อความตอบกลับให้เป็นไปตามนี้เป๊ะๆ (ห้ามมีข้อความทักทาย หรือคำชี้แจงอื่นก่อนหรือหลังรูปแบบนี้):

• [ชื่อเกม] - [ชื่อค่าย]
• [ชื่อเกม] - [ชื่อค่าย]
• [ชื่อเกม] - [ชื่อค่าย]

[ประโยควิเคราะห์/ให้ความหวังและแนะนำสั้นๆ ว่าทำไมเวลานี้น่าลอง เช่น ช่วงนี้สถิติคนเล่นเยอะ อัตราการจ่ายกำลังดี/มีลุ้นโบนัสแตกง่าย ไม่เกิน 2 ประโยค + ใส่ emoji เช่น 🤑✨]

กฎเหล็กสำคัญ:
1. ⚠️ ต้องใช้รูปแบบลิสต์ • [ชื่อเกม] - [ชื่อค่าย] เท่านั้น ห้ามใส่ตัวหนา **
2. ⚠️ ห้ามรับประกัน 100% ว่าจะชนะหรือจะแตก ให้บอกเป็นแนวทาง/สถิติ
3. ⚠️ ห้ามใช้ศัพท์เทคนิค เช่น RNG, อัลกอริทึม, RTP, ความผันผวน ให้ใช้คำง่ายๆ ที่คนเล่นเข้าใจ
4. ⚠️ ห้ามพูดคำทักทาย เช่น สวัสดีค่ะ ยินดีต้อนรับ ให้ขึ้นต้นลิสต์ทันที`;

    const aiReply = await generateAIResponse(
      [{ role: 'system', content: prompt }],
      process.env.COMETAPI_MODEL || 'gpt-4o',
      0.9,
      250
    );

    if (aiReply) {
      return `${timeEmoji} ${timeLabel} เกมที่น่าสนใจนะคะ!\n\n${aiReply.trim()}`;
    }
  } catch (e: any) {
    console.warn('[LINE Bot] AI hot-games failed, using fallback:', e.message);
  }

  // ─── Fallback กรณี AI ล่ม / ขัดข้อง ───
  let availablePool = FALLBACK_GAMES_POOL;
  const cached = lastRecommendedGames.get(conversationId);
  const ONE_HOUR = 3600000; // 1 ชั่วโมงในหน่วย ms

  if (cached && (Date.now() - cached.timestamp < ONE_HOUR)) {
    // กรองเอาเกมที่เคยแนะนำไปใน 1 ชั่วโมงที่ผ่านมาออก
    availablePool = FALLBACK_GAMES_POOL.filter(g => !cached.games.includes(g.name));
    
    // ป้องกันกรณีที่กรองจนเหลือน้อยกว่า 3 เกม (ให้ย้อนกลับไปใช้ pool เต็ม)
    if (availablePool.length < 3) {
      availablePool = FALLBACK_GAMES_POOL;
    }
  }

  // สุ่มเลือก 3 เกมที่เหลือ
  const shuffled = [...availablePool].sort(() => 0.5 - Math.random());
  const selectedGames = shuffled.slice(0, 3);

  // บันทึกประวัติการแนะนำเพื่อป้องกันการซ้ำใน 1 ชั่วโมงถัดไป
  lastRecommendedGames.set(conversationId, {
    games: selectedGames.map(g => g.name),
    timestamp: Date.now()
  });

  // สุ่มประโยคลงท้ายที่เป็นมิตร
  const reason = FALLBACK_REASONS[Math.floor(Math.random() * FALLBACK_REASONS.length)];
  const gameLines = selectedGames.map(g => `• ${g.name} - ${g.provider}`).join('\n');

  return `${timeEmoji} ${timeLabel} เกมที่น่าสนใจนะคะ!\n\n${gameLines}\n\n${reason}`;
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

// เช็คจาก DB ว่ามีรูปภาพ (สลิป) ใน conversation นี้หรือไม่
async function hasImageInConversation(conversationId: string): Promise<boolean> {
  const imgCount = await prisma.message.count({
    where: { conversationId, type: 'image', senderType: 'customer' },
  });
  return imgCount > 0;
}

// ─── Promotion Query Detector ─────────────────────────────────────────────────
const PROMOTION_KEYWORDS = [
  'โปร', 'โปรโมชั่น', 'โปรโมชน', 'โปรชั่น', 'promotion', 'bonus', 'โบนัส',
  'รับโปร', 'มีโปร', 'โปรอะไร', 'โปรไหน', 'โปรดีไหม',
  'สมัครใหม่', 'สมาชิกใหม่', 'สมาชิกได้อะไร',
  'รับโบนัส', 'โบนัสสมาชิก', 'โบนัสใหม่',
  'เทิร์น', 'ยอดเทิร์น', 'ถอนได้เท่าไหร่', 'ถอนได้เท่าไร',
  'ถอนสูงสุด', 'ถอนได้กี่บาท', 'ถอนได้กี่เท่า',
  'ฝาก 100', 'ฝาก 200', 'ฝาก 300',
  'ฝากแล้วได้อะไร', 'ฝากแล้วรับอะไร', 'ฝากเท่าไหร่', 'ฝากเท่าไร',
  'รับเพิ่มเท่าไหร่', 'ได้เพิ่มเท่าไหร่', 'ได้กี่บาท',
  'เงื่อนไข', 'ข้อกำหนด', 'กฎ',
];

function isPromotionQuery(text: string): boolean {
  const t = text.toLowerCase();
  return PROMOTION_KEYWORDS.some(kw => t.includes(kw));
}

const PROMOTION_REPLY = `📌 โปรสมาชิกใหม่ รับโบนัส 50% ค่ะ
• ฝาก 100 → รับเพิ่ม 50 บาท (รวม 150)
• ฝาก 200 → รับเพิ่ม 100 บาท (รวม 300)
• ฝาก 300 → รับเพิ่ม 150 บาท (รวม 450)
🔄 เทิร์น 3 เท่าของ (ยอดฝาก+โบนัส) ถึงจะถอนได้นะคะ
💰 ถอนได้สูงสุด 10 เท่าของ (ยอดฝาก+โบนัส) ค่ะ`;


// ─── Main Event Processor ─────────────────────────────────────────────────────
async function processLineEvent(tenantId: string, event: any, accessToken: string, companyIdHint?: string | null) {
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
  const isGameQuery = isHotGamesQuery(normalized.content) || (btConfig ? matchBonusTimeKeyword(normalized.content, btConfig) : false);

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
  if (btConfig && (matchBonusTimeKeyword(normalized.content, btConfig) || isHotGamesQuery(normalized.content))) {
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


  // ✅ ตรวจสอบ: เครดิตฟรี → ตอบกลับว่าไม่มีบริการและให้รออัปเดต โดยบอทยังดูแลอยู่
  if (isFreeCreditQuery(normalized.content)) {
    const reply = `ตอนนี้ยังไม่มีบริการเครดิตฟรีนะคะ ถ้ามีช่วงไหน เดี๋ยวแอดมินแจ้งให้ทราบนะคะ 🙏😊`;
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
      console.warn(`[LINE Bot] free credit reply failed:`, e.message);
    }
    return;
  }

  // ✅ ตรวจสอบ: ลูกค้าถามโปรโมชั่น → ตอบโปรข้อมูลจริงทันที ไม่ผ่าน AI
  if (isPromotionQuery(normalized.content)) {
    const reply = PROMOTION_REPLY;
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
      console.warn(`[LINE Bot] promotion reply failed:`, e.message);
    }
    return; // บอทตอบเอง ไม่ handoff
  }

  // ✅ ตรวจสอบ: ลูกค้าหมดเงิน / ไม่มีเงิน → ตอบใจเย็นๆ ชวนพักก่อน
  if (isOutOfMoney(normalized.content)) {
    const reply = OUT_OF_MONEY_REPLIES[Math.floor(Math.random() * OUT_OF_MONEY_REPLIES.length)];
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
      console.warn(`[LINE Bot] out-of-money reply failed:`, e.message);
    }
    return; // bot ยังดูแลอยู่ ไม่ handoff — เผื่ออย่าให้ลูกค้าเติมเงินโดยอัตโนมัติ
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
    let profileForBot = readProfile(contact as any);
    if (mightContainCustomerInfo(normalized.content)) {
      const captured = await captureCustomerInfo({
        tenantId, contactId: contact.id,
        recentMessages: [...conversationHistory.slice(-5), { role: 'user', content: normalized.content }],
      });
      if (captured) profileForBot = captured;
    }
    const profileContext = buildProfileContext(profileForBot);

    // ═══ เรื่องสมัครสมาชิก — logic ตายตัว ไม่พึ่ง AI ═══
    //  ยังไม่มีข้อมูล → ส่งฟอร์ม ✅ ทั้งชุด | มีบางส่วน → ขอเฉพาะที่ขาด | ครบ → ทวนยืนยัน
    // บอทเพิ่งขอข้อมูลสมัครไปหรือเปล่า (ดูจากข้อความล่าสุดของฝั่งเรา)
    const lastBotMsg = [...conversationHistory].reverse().find(m => m.role === 'assistant')?.content || '';
    const inRegisterFlow = /✅|รบกวนลูกค้าแจ้งข้อมูล|ขอเพิ่มอีกนิด|ยืนยันว่าข้อมูลถูกต้อง/.test(lastBotMsg);

    let reply: string;
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
        { bonusTimeActive: !!btConfig, profileContext },
      );
      reply = r.reply;
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

    console.log(`[LINE Bot] tenant=${tenantId} reply="${cleanReply.substring(0, 60)}" handoff=${shouldHandoff}`);

    let sent = false;

    if (normalized.replyToken) {
      try {
        await sendLineReply(normalized.replyToken, [lineBotReplyMessage(cleanReply)], accessToken);
        sent = true;
        console.log(`[LINE Bot] ✅ Reply sent via replyToken`);
      } catch (replyErr: any) {
        console.warn(`[LINE Bot] ⚠️ Reply API failed (${replyErr?.response?.data?.message || replyErr.message}), trying Push...`);
      }
    }

    if (!sent) {
      try {
        await sendLinePush(userId, [lineBotReplyMessage(cleanReply)], accessToken);
        sent = true;
        console.log(`[LINE Bot] ✅ Reply sent via Push API`);
      } catch (pushErr: any) {
        console.error(`[LINE Bot] ❌ Push API also failed:`, pushErr?.response?.data || pushErr.message);
      }
    }

    if (sent) {
      const botReply = await prisma.message.create({
        data: { conversationId: conversation.id, tenantId, senderType: 'bot', type: 'text', content: cleanReply },
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
      const smartFallback = getSmartFallback(normalized.content);
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

    if (result.status === 'verified') {
      // ✅ ตรวจผ่าน — แจ้งรอเครดิตเข้า
      customerMsg = `รับทราบค่ะ 💕 กรุณารอยอดเครดิตเข้าระบบอัตโนมัตินะคะ ภายใน 1-2 นาที ⏳\nหากเครดิตยังไม่เข้า ติดต่อแอดได้เลยนะคะ 🙏`;
    } else if (result.status === 'duplicate') {
      // ⚠️ สลิปซ้ำ
      customerMsg = `⚠️ สลิปนี้เคยส่งมาแล้วค่ะ กรุณาส่งสลิปใหม่ที่ยังไม่เคยใช้นะคะ 🙏`;
    } else if (result.status === 'fake') {
      // ❌ สลิปปลอม / ผิดปกติ
      customerMsg = `⚠️ สลิปนี้ไม่ผ่านการตรวจสอบค่ะ กรุณาส่งสลิปจริงจากแอปธนาคารนะคะ 🙏`;
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
              imageBase64: base64, conversationHistory: history, lastCustomerText: lastText,
            });
            if (!assist.isSlip && assist.reply) customerMsg = assist.reply;
          }
        }
      } catch (e: any) {
        console.warn('[SlipVerify] vision assist failed:', e.message);
      }
    }
    // error → ไม่ตอบลูกค้า (ระบบมีปัญหา → เงียบ)

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

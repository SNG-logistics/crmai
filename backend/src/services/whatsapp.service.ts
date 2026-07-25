import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  jidNormalizedUser,
  downloadMediaMessage,
  proto,
  WAMessageContent,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import qrcode from 'qrcode';
import prisma from '../lib/prisma';
import { emitToTenant } from '../lib/socket';
import { checkRepeatAbuse, REPEAT_HANDOFF_REPLY } from './bot-guard';
import { parseBotSettings, processBotMessage, visionAssistReply } from './ai.service';
import {
  buildProfileContext,
  buildRegisterReply,
  captureCustomerInfo,
  isRegisterIntent,
  mightContainCustomerInfo,
  readProfile,
} from './contact-memory.service';
import { verifySlip } from './slip-verify.service';

// ═══════════════════════════════════════════════════════════════════════════
//  Multi-company WhatsApp — 1 tenant มีได้หลายบริษัท, แต่ละบริษัทมีได้หลายเบอร์
//  ทุกอย่าง keyed ด้วย accountId (WhatsAppAccount.id) ไม่ใช่ tenantId อีกต่อไป
// ═══════════════════════════════════════════════════════════════════════════

type WAStatus = 'qr' | 'connecting' | 'connected' | 'disconnected';

interface AccountCtx {
  accountId: string;
  tenantId: string;
  companyId: string;
  sessionKey: string; // ชื่อโฟลเดอร์ auth บนดิสก์
}

const sockets   = new Map<string, WASocket>();  // accountId → socket
const qrCache   = new Map<string, string>();    // accountId → base64 QR
const statusMap = new Map<string, WAStatus>();  // accountId → status
const phoneMap  = new Map<string, string>();    // accountId → phone
const ctxMap    = new Map<string, AccountCtx>();// accountId → ctx (tenant/company/session)

// conversation.channelId ของ whatsapp = "<accountId>:<jid>" เพื่อแยกเบอร์
// (ลูกค้าคนเดียวทักหลายเบอร์ = คนละบทสนทนา ไม่ชน @@unique([tenantId,channel,channelId]))
export function waChannelId(accountId: string, jid: string): string {
  return `${accountId}:${jid}`;
}

function isDepositNotCredited(text: string): boolean {
  return /ฝาก.{0,12}(ไม่เข้า|ยังไม่เข้า|หาย|ไม่มา)|โอน.{0,12}(ไม่เข้า|ยังไม่เข้า)|ยอด.{0,8}(ไม่เข้า|ยังไม่เข้า)|ຝາກ.{0,12}(ບໍ່ເຂົ້າ|ຍັງບໍ່ເຂົ້າ)|ໂອນ.{0,12}(ບໍ່ເຂົ້າ|ຍັງບໍ່ເຂົ້າ)/i.test(text || '');
}

function resolveKnowledgeImageFile(imageUrl?: string): string | undefined {
  if (!imageUrl?.startsWith('/uploads/knowledge/')) return undefined;
  const knowledgeRoot = path.resolve(process.cwd(), 'uploads', 'knowledge');
  const filePath = path.resolve(process.cwd(), imageUrl.replace(/^\/+/, ''));
  if (!filePath.startsWith(knowledgeRoot + path.sep) || !fs.existsSync(filePath)) return undefined;
  return filePath;
}

function sessionDir(sessionKey: string): string {
  const dir = path.join(process.cwd(), 'auth_whatsapp', sessionKey);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function loadAccountCtx(accountId: string): Promise<AccountCtx | null> {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
  if (!acc) return null;
  return { accountId: acc.id, tenantId: acc.tenantId, companyId: acc.companyId, sessionKey: acc.sessionId || acc.id };
}

// ─── Start or reconnect a WhatsApp account session ───────────────────────────
export async function connectWhatsAppAccount(accountId: string): Promise<void> {
  if (sockets.has(accountId) && statusMap.get(accountId) === 'connected') return;
  if (statusMap.get(accountId) === 'connecting') return;

  const ctx = await loadAccountCtx(accountId);
  if (!ctx) throw new Error('ไม่พบ WhatsApp account');
  ctxMap.set(accountId, ctx);
  statusMap.set(accountId, 'connecting');

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(ctx.sessionKey));
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['CRM Happy77', 'Chrome', '1.0.0'],
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
    retryRequestDelayMs: 250,
  });

  sockets.set(accountId, sock);

  // ─── Connection events ──────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const dataUrl = await qrcode.toDataURL(qr, { width: 300, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
        qrCache.set(accountId, dataUrl);
        statusMap.set(accountId, 'qr');
        await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: 'qr' } }).catch(() => {});
        emitToTenant(ctx.tenantId, 'whatsapp:qr', { accountId, companyId: ctx.companyId, qr: dataUrl });
        console.log(`[WA] QR generated account=${accountId}`);
      } catch (e) { console.error('[WA] QR gen error:', e); }
    }

    if (connection === 'open') {
      statusMap.set(accountId, 'connected');
      qrCache.delete(accountId);
      const phone = jidNormalizedUser(sock.user?.id || '').replace('@s.whatsapp.net', '');
      phoneMap.set(accountId, phone);
      await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: 'connected', phone, isActive: true } }).catch(() => {});
      emitToTenant(ctx.tenantId, 'whatsapp:connected', { accountId, companyId: ctx.companyId, phone });
      console.log(`[WA] Connected account=${accountId} phone=${phone}`);
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log(`[WA] Disconnected account=${accountId} code=${statusCode} reconnect=${!loggedOut}`);

      sockets.delete(accountId);
      statusMap.set(accountId, 'disconnected');
      phoneMap.delete(accountId);
      await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: 'disconnected' } }).catch(() => {});
      emitToTenant(ctx.tenantId, 'whatsapp:disconnected', { accountId, companyId: ctx.companyId, reason: `code=${statusCode}` });

      if (!loggedOut) {
        setTimeout(() => connectWhatsAppAccount(accountId).catch(console.error), 5000);
      } else {
        clearSession(ctx.sessionKey);
        await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: 'disconnected', isActive: false } }).catch(() => {});
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ─── Incoming messages ──────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key.fromMe) continue;
      if (isJidBroadcast(msg.key.remoteJid || '')) continue;
      if (isJidGroup(msg.key.remoteJid || '')) continue; // ข้าม group chat
      await handleIncomingMessage(ctx, msg, sock);
    }
  });
}

// ─── Handle incoming message pipeline ────────────────────────────────────────
async function handleIncomingMessage(ctx: AccountCtx, msg: any, sock: WASocket) {
  try {
    const { tenantId, companyId, accountId } = ctx;
    const jid     = msg.key.remoteJid as string;
    const phone   = jid.replace('@s.whatsapp.net', '');
    const content = extractMessageText(msg.message);
    const msgType = detectMsgType(msg.message);
    const platformMsgId = msg.key.id;

    // ดาวน์โหลดสื่อ (รูป/เสียง/วิดีโอ/ไฟล์) → เก็บเป็น static file ให้แอดมินเปิดดู/ฟังได้
    const mediaMeta = await downloadWhatsAppMedia(sock, msg, msgType);

    // 1. Contact (ระดับ tenant — ลูกค้าคนเดียวใช้ contact เดียวข้ามบริษัทได้)
    let contact = await prisma.contact.findFirst({ where: { tenantId, whatsappId: jid } });
    if (!contact) {
      contact = await prisma.contact.create({
        data: { tenantId, displayName: msg.pushName || phone, phone, whatsappId: jid },
      });
    } else if (msg.pushName && contact.displayName !== msg.pushName) {
      await prisma.contact.update({ where: { id: contact.id }, data: { displayName: msg.pushName } });
    }

    // 2. Conversation — ผูกกับ "เบอร์" (account) + บริษัท
    const convChannelId = waChannelId(accountId, jid);
    let conversation = await prisma.conversation.findFirst({
      where: { tenantId, channel: 'whatsapp', channelId: convChannelId },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          tenantId, companyId, whatsAppAccountId: accountId,
          contactId: contact.id, channel: 'whatsapp', channelId: convChannelId,
          status: 'bot', isBot: true,
        },
      });
    }
    // ⚠️ เคารพโหมด Human: ถ้าแอดมินสลับเป็นคนดูแลแล้ว (isBot=false) ห้ามบังคับกลับเป็นบอท
    //    (เดิมบรรทัดนี้ force isBot:true ทุกข้อความ → สลับ Human ไม่ติด)

    // 3. Message (แนบ URL สื่อลง metadata)
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id, tenantId,
        senderType: 'customer', type: msgType,
        content: content || `[${msgType}]`,
        platformMsgId,
        metadata: JSON.stringify({ waJid: jid, pushName: msg.pushName, ...mediaMeta }),
      },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

    // 4. Realtime → inbox (แนบ companyId ให้ frontend กรองตามบริษัทได้)
    emitToTenant(tenantId, 'new_message', {
      conversationId: conversation.id, companyId,
      message: { ...message, senderType: 'customer' },
      contact, channel: 'whatsapp',
    });

    // 5. AI Bot reply — เคารพสวิตช์ AI auto-reply ต่อบริษัท (botConfig ของ company)
    if (conversation.isBot && (msgType === 'text' || msgType === 'image')) {
      const bot = await prisma.botConfig.findFirst({ where: { companyId, channel: 'whatsapp' }, select: { isActive: true, metadata: true } });
      if (bot?.isActive !== false) {
        if (msgType === 'text') {
          await processBotReply(ctx, conversation.id, contact.id, content, jid);
        } else if (mediaMeta.imageUrl) {
          const language = parseBotSettings(bot?.metadata).whatsappLanguage || 'th';
          await processWhatsAppImage(ctx, conversation.id, contact.id, message.id, platformMsgId, mediaMeta.imageUrl, jid, language);
        }
      }
    }
  } catch (err) {
    console.error('[WA] handleIncomingMessage error:', err);
  }
}

// ─── AI Bot reply via WhatsApp ────────────────────────────────────────────────
async function processBotReply(ctx: AccountCtx, conversationId: string, contactId: string, userMessage: string, jid: string) {
  const { tenantId, companyId, accountId } = ctx;
  try {
    // 🛡️ กันสแปมถามซ้ำเผา token → ตอบ auto ครั้งเดียว + สลับเป็น human (ไม่เรียก AI)
    const abuse = await checkRepeatAbuse(conversationId, userMessage);
    if (abuse.repeat) {
      await trySend(accountId, jid, REPEAT_HANDOFF_REPLY);
      const botMsg = await prisma.message.create({
        data: { conversationId, tenantId, senderType: 'bot', type: 'text', content: REPEAT_HANDOFF_REPLY },
      });
      emitToTenant(tenantId, 'new_message', { conversationId, companyId, channel: 'whatsapp', message: { ...botMsg, senderType: 'bot' } });
      console.log(`[WA] 🛡️ Repeat abuse → bot remains active conversation=${conversationId} count=${abuse.count}`);
      return;
    }

    // Fetch the latest messages, not the first messages ever sent in the room.
    // The old ascending + take query silently dropped new registration details
    // once a conversation had more than 15 messages.
    const recentDescending = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const history = recentDescending.reverse();
    const conversationHistory = history.map((m: any) => ({
      role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));

    const contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) return;
    const botConfig = await prisma.botConfig.findFirst({ where: { companyId, channel: 'whatsapp' }, select: { metadata: true } });
    const language = parseBotSettings(botConfig?.metadata).whatsappLanguage || 'th';
    const lastBot = [...history].reverse().find((m: any) => m.senderType === 'bot');
    let lastBotMeta: any = {};
    try { lastBotMeta = JSON.parse((lastBot as any)?.metadata || '{}'); } catch { lastBotMeta = {}; }
    const registerIntent = isRegisterIntent(userMessage);
    const hasCustomerInfo = mightContainCustomerInfo(userMessage);
    const registrationFlow = registerIntent || lastBotMeta.flow === 'registration';

    let profile = readProfile(contact as any);
    if (hasCustomerInfo) {
      const captured = await captureCustomerInfo({
        tenantId,
        contactId,
        recentMessages: conversationHistory,
        registrationFlow,
        channel: 'whatsapp',
      });
      if (captured) profile = captured;
      emitToTenant(tenantId, 'conversation_updated', { id: conversationId });
    }

    let reply: string;
    let responseFlow: string | undefined;
    let responseImage: { imageUrl: string; imagePreviewUrl?: string; knowledgeId?: string } | undefined;
    const hasEarlierSlip = isDepositNotCredited(userMessage) && (
      await prisma.slipVerification.count({ where: { conversationId } }) > 0
      || await prisma.message.count({ where: { conversationId, senderType: 'customer', type: 'image' } }) > 0
    );
    if (hasEarlierSlip) {
      reply = language === 'lo'
        ? 'ແອດມິນໄດ້ຮັບສະລິບແລ້ວເຈົ້າ ກຳລັງດຳເນີນການກວດສອບໃຫ້ ລໍຖ້າຈັກຄູ່ເຈົ້າ'
        : 'แอดมินได้รับสลิปแล้วค่ะ กำลังดำเนินการตรวจสอบให้ รอสักครู่นะคะ';
    } else if ((registerIntent && !hasCustomerInfo) || (registrationFlow && hasCustomerInfo)) {
      reply = buildRegisterReply(profile, language);
      responseFlow = 'registration';
    } else {
      const result = await processBotMessage(
        tenantId,
        conversationHistory,
        userMessage,
        { displayName: contact.displayName },
        companyId,
        { profileContext: buildProfileContext(profile), channel: 'whatsapp' },
      );
      reply = result.reply;
      const imageWasSentRecently = result.knowledgeId && history.some((message: any) => {
        if (message.senderType !== 'bot' || Date.now() - new Date(message.createdAt).getTime() > 30 * 60 * 1000) return false;
        try { return JSON.parse(message.metadata || '{}').knowledgeId === result.knowledgeId; } catch { return false; }
      });
      if (result.imageUrl && !imageWasSentRecently) {
        responseImage = {
          imageUrl: result.imageUrl,
          imagePreviewUrl: result.imagePreviewUrl,
          knowledgeId: result.knowledgeId,
        };
      }
    }

    const imageFile = resolveKnowledgeImageFile(responseImage?.imageUrl);
    const sentWithImage = imageFile ? await trySend(accountId, jid, reply, imageFile) : false;
    if (!sentWithImage) await trySend(accountId, jid, reply);
    const responseMetadata = {
      ...(responseFlow ? { flow: responseFlow } : {}),
      ...(sentWithImage ? {
        imageUrl: responseImage?.imageUrl,
        imagePreviewUrl: responseImage?.imagePreviewUrl,
        knowledgeId: responseImage?.knowledgeId,
        aiKnowledgeImage: true,
      } : {}),
    };
    const botMsg = await prisma.message.create({
      data: {
        conversationId,
        tenantId,
        senderType: 'bot',
        type: sentWithImage ? 'image' : 'text',
        content: reply,
        metadata: Object.keys(responseMetadata).length ? JSON.stringify(responseMetadata) : undefined,
      },
    });
    emitToTenant(tenantId, 'new_message', { conversationId, companyId, channel: 'whatsapp', message: { ...botMsg, senderType: 'bot' } });

    // Never hand off automatically. An admin can send a reply directly from the inbox.
  } catch (err) {
    console.error('[WA] Bot reply error:', err);
  }
}

async function processWhatsAppImage(
  ctx: AccountCtx,
  conversationId: string,
  contactId: string,
  dbMessageId: string,
  platformMsgId: string,
  imageUrl: string,
  jid: string,
  language: 'th' | 'lo',
) {
  const { tenantId, companyId, accountId } = ctx;
  try {
    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    const filePath = path.resolve(process.cwd(), imageUrl.replace(/^\/+/, ''));
    if (!filePath.startsWith(uploadsRoot + path.sep) || !fs.existsSync(filePath)) {
      throw new Error('WhatsApp image file not found');
    }
    const buffer = fs.readFileSync(filePath);
    const slip = await verifySlip({
      tenantId,
      conversationId,
      contactId,
      messageId: platformMsgId || dbMessageId,
      buffer,
      filePath,
      language,
      companyId,
    });

    let reply = slip.message;
    let imageAnalysis: any = { kind: 'slip', confidence: 'high', slipStatus: slip.status };
    if (slip.status === 'not_slip' || slip.status === 'error') {
      const history = await prisma.message.findMany({
        where: { conversationId, type: 'text' },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      const assist = await visionAssistReply({
        tenantId,
        companyId,
        imageBase64: `data:image/jpeg;base64,${buffer.toString('base64')}`,
        conversationHistory: history.map((m: any) => ({
          role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const,
          content: m.content,
        })),
        lastCustomerText: [...history].reverse().find((m: any) => m.senderType === 'customer')?.content,
        channel: 'whatsapp',
      });
      imageAnalysis = {
        kind: assist.kind,
        confidence: assist.confidence,
        summary: assist.summary,
        slipStatus: slip.status,
      };
      if (!assist.isSlip) reply = assist.reply;
    }

    const original = await prisma.message.findUnique({ where: { id: dbMessageId }, select: { metadata: true } });
    let metadata: any = {};
    try { metadata = JSON.parse(original?.metadata || '{}'); } catch { metadata = {}; }
    metadata.aiImageAnalysis = imageAnalysis;
    metadata.slipVerification = {
      status: slip.status,
      verifiedBy: slip.verifiedBy,
      amount: slip.amount,
      bankFrom: slip.bankFrom,
      bankTo: slip.bankTo,
      transRef: slip.transRef,
      receiverName: slip.receiverName,
      receiverAccount: slip.receiverAccount,
      receiverAccountPrefix: slip.receiverAccountPrefix,
      receiverAccountSuffix: slip.receiverAccountSuffix,
      accountCheck: slip.accountCheck,
      recordId: slip.record?.id,
    };
    await prisma.message.update({ where: { id: dbMessageId }, data: { metadata: JSON.stringify(metadata) } });

    if (!reply) {
      reply = language === 'lo'
        ? 'ແອດມິນໄດ້ຮັບຮູບແລ້ວເຈົ້າ ກຳລັງກວດສອບໃຫ້'
        : 'แอดมินได้รับรูปแล้วค่ะ กำลังตรวจสอบให้';
    }
    await trySend(accountId, jid, reply);
    const botMsg = await prisma.message.create({
      data: {
        conversationId,
        tenantId,
        senderType: 'bot',
        type: 'text',
        content: reply,
        metadata: JSON.stringify({ imageAnalysis }),
      },
    });
    emitToTenant(tenantId, 'new_message', {
      conversationId,
      companyId,
      channel: 'whatsapp',
      message: { ...botMsg, senderType: 'bot' },
    });
    emitToTenant(tenantId, 'conversation_updated', { id: conversationId });
  } catch (err: any) {
    console.error('[WA] Image AI error:', err?.message || err);
    const reply = language === 'lo'
      ? 'ໄດ້ຮັບຮູບແລ້ວເຈົ້າ ແອດມິນຈະກວດສອບໃຫ້'
      : 'ได้รับรูปแล้วค่ะ แอดมินจะตรวจสอบให้';
    await trySend(accountId, jid, reply);
  }
}

// ส่งข้อความแบบไม่ throw (สำหรับ bot) — คืน true/false
async function trySend(accountId: string, jid: string, text: string, imageUrl?: string): Promise<boolean> {
  const sock = sockets.get(accountId);
  if (!sock || statusMap.get(accountId) !== 'connected') return false;
  try {
    if (imageUrl) await sock.sendMessage(jid, { image: { url: imageUrl }, caption: text });
    else await sock.sendMessage(jid, { text });
    return true;
  } catch { return false; }
}

// ─── Send message (agent reply) — โยน error ถ้าเบอร์นั้นไม่ได้ต่อ ───────────────
export async function sendWhatsAppMessage(accountId: string, jid: string, text: string, imageUrl?: string): Promise<void> {
  const sock = sockets.get(accountId);
  if (!sock || statusMap.get(accountId) !== 'connected') {
    throw new Error('WhatsApp เบอร์นี้ยังไม่ได้เชื่อมต่อ');
  }
  if (imageUrl) await sock.sendMessage(jid, { image: { url: imageUrl }, caption: text });
  else await sock.sendMessage(jid, { text });
}

// ─── Disconnect & clear session (ต่อ account) ─────────────────────────────────
export async function disconnectWhatsAppAccount(accountId: string): Promise<void> {
  const ctx = ctxMap.get(accountId) || (await loadAccountCtx(accountId));
  const sock = sockets.get(accountId);
  if (sock) {
    try { await sock.logout(); } catch {}
    try { sock.end(undefined); } catch {}
    sockets.delete(accountId);
  }
  if (ctx) clearSession(ctx.sessionKey);
  statusMap.set(accountId, 'disconnected');
  phoneMap.delete(accountId);
  qrCache.delete(accountId);
  await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: 'disconnected', isActive: false } }).catch(() => {});
}

function clearSession(sessionKey: string) {
  const dir = path.join(process.cwd(), 'auth_whatsapp', sessionKey);
  try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true }); }
  catch (e) { console.error('[WA] clearSession error:', e); }
}

// ─── Status & QR getters (ต่อ account) ────────────────────────────────────────
export function getAccountStatus(accountId: string) {
  return {
    status: statusMap.get(accountId) || 'disconnected',
    phone:  phoneMap.get(accountId)  || null,
    qr:     qrCache.get(accountId)   || null,
  };
}

// ─── Auto-reconnect on startup — ต่อทุก account ที่เคยล็อกอินไว้ ────────────────
export async function initWhatsAppSessions() {
  try {
    const accounts = await prisma.whatsAppAccount.findMany({ where: { isActive: true } });
    for (const acc of accounts) {
      const key = acc.sessionId || acc.id;
      const credsPath = path.join(process.cwd(), 'auth_whatsapp', key, 'creds.json');
      if (fs.existsSync(credsPath)) {
        console.log(`[WA] Auto-reconnect account=${acc.id} session=${key}`);
        connectWhatsAppAccount(acc.id).catch(console.error);
      }
    }
  } catch (e) {
    console.error('[WA] initWhatsAppSessions error:', e);
  }
}

// ─── Media download ─────────────────────────────────────────────────────────
const mediaLogger = pino({ level: 'silent' });

// map mimetype → นามสกุลไฟล์ (ใช้ mimetype ก่อน ถ้าไม่มีค่อยเดาจากชนิดข้อความ)
function mediaExt(msgType: string, mimetype: string): string {
  const mt = (mimetype || '').toLowerCase();
  if (mt.includes('jpeg') || mt.includes('jpg')) return 'jpg';
  if (mt.includes('png'))  return 'png';
  if (mt.includes('webp')) return 'webp';
  if (mt.includes('gif'))  return 'gif';
  if (mt.includes('mp4'))  return 'mp4';
  if (mt.includes('3gpp')) return '3gp';
  if (mt.includes('ogg'))  return 'ogg';
  if (mt.includes('mpeg') || mt.includes('mp3')) return 'mp3';
  if (mt.includes('m4a') || mt.includes('aac') || mt.includes('mp4a')) return 'm4a';
  if (mt.includes('wav'))  return 'wav';
  if (mt.includes('pdf'))  return 'pdf';
  if (msgType === 'image' || msgType === 'sticker') return 'jpg';
  if (msgType === 'video') return 'mp4';
  if (msgType === 'audio') return 'ogg';
  return 'bin';
}

/**
 * ดาวน์โหลดสื่อจากข้อความ WhatsApp แล้วเก็บเป็นไฟล์ static ใน /uploads/whatsapp-media
 * คืน metadata (imageUrl / audioUrl / videoUrl / fileUrl) ให้แนบกับ message
 */
async function downloadWhatsAppMedia(sock: WASocket, msg: any, msgType: string): Promise<Record<string, string>> {
  if (!['image', 'audio', 'video', 'sticker', 'file'].includes(msgType)) return {};
  try {
    const node =
      msg.message?.imageMessage ||
      msg.message?.videoMessage ||
      msg.message?.audioMessage ||
      msg.message?.stickerMessage ||
      msg.message?.documentMessage;
    const mimetype: string = node?.mimetype || '';

    const buffer = (await downloadMediaMessage(
      msg,
      'buffer',
      {},
      { logger: mediaLogger, reuploadRequest: sock.updateMediaMessage }
    )) as Buffer;
    if (!buffer || !buffer.length) return {};

    const mediaDir = path.join(process.cwd(), 'uploads', 'whatsapp-media');
    if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

    const ext      = mediaExt(msgType, mimetype);
    const safeId   = String(msg.key?.id || `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `${safeId}.${ext}`;
    fs.writeFileSync(path.join(mediaDir, filename), buffer);
    const url = `/uploads/whatsapp-media/${filename}`;
    console.log(`[WA] 📎 Media saved: ${url} (${buffer.length} bytes, ${msgType})`);

    if (msgType === 'image' || msgType === 'sticker') return { imageUrl: url };
    if (msgType === 'video') return { videoUrl: url, mimetype };
    if (msgType === 'audio') return { audioUrl: url, mimetype };
    return { fileUrl: url, fileName: node?.fileName || filename, mimetype };
  } catch (err: any) {
    console.warn('[WA] ⚠️ Media download failed:', err?.message || err);
    return {};
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractMessageText(msg: WAMessageContent | null | undefined): string {
  if (!msg) return '';
  const text =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.fileName ||
    '';
  if (text) return text as string;
  if (msg.stickerMessage) return '[สติ๊กเกอร์]';
  if (msg.audioMessage)   return '[เสียง]';
  return '';
}

function detectMsgType(msg: WAMessageContent | null | undefined): string {
  if (!msg) return 'text';
  if (msg.imageMessage)    return 'image';
  if (msg.videoMessage)    return 'video';
  if (msg.audioMessage)    return 'audio';
  if (msg.documentMessage) return 'file';
  if (msg.stickerMessage)  return 'sticker';
  if (msg.locationMessage) return 'location';
  return 'text';
}

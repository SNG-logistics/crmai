import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  jidNormalizedUser,
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

// ─── session store per tenant ────────────────────────────────────────────────
const sockets   = new Map<string, WASocket>();
const qrCache   = new Map<string, string>();   // tenantId → base64 QR image
const statusMap = new Map<string, 'qr' | 'connecting' | 'connected' | 'disconnected'>(); // tenantId → status
const phoneMap  = new Map<string, string>();   // tenantId → phone number

function sessionDir(tenantId: string) {
  const dir = path.join(process.cwd(), 'auth_whatsapp', tenantId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Start or reconnect WhatsApp session ─────────────────────────────────────
export async function connectWhatsApp(tenantId: string): Promise<void> {
  // ถ้ามี socket อยู่แล้วและ connected → ไม่ต้องทำอีก
  if (sockets.has(tenantId) && statusMap.get(tenantId) === 'connected') return;

  // ถ้ากำลัง connecting อยู่ → ไม่สร้างซ้ำ
  if (statusMap.get(tenantId) === 'connecting') return;

  statusMap.set(tenantId, 'connecting');

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(tenantId));
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: 'silent' }); // ปิด verbose log

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['CRM มหาเฮง', 'Chrome', '1.0.0'],
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
    retryRequestDelayMs: 250,
  });

  sockets.set(tenantId, sock);

  // ─── Connection events ──────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // ── QR code ──
    if (qr) {
      try {
        const dataUrl = await qrcode.toDataURL(qr, { width: 300, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
        qrCache.set(tenantId, dataUrl);
        statusMap.set(tenantId, 'qr');
        emitToTenant(tenantId, 'whatsapp:qr', { qr: dataUrl });
        console.log(`[WA] QR generated for tenant=${tenantId}`);
      } catch (e) { console.error('[WA] QR gen error:', e); }
    }

    // ── Connected ──
    if (connection === 'open') {
      statusMap.set(tenantId, 'connected');
      qrCache.delete(tenantId);
      const phone = jidNormalizedUser(sock.user?.id || '').replace('@s.whatsapp.net', '');
      phoneMap.set(tenantId, phone);
      console.log(`[WA] Connected! tenant=${tenantId} phone=${phone}`);
      emitToTenant(tenantId, 'whatsapp:connected', { phone });

      // บันทึกลง ChannelConfig
      await prisma.channelConfig.upsert({
        where: { tenantId_channel: { tenantId, channel: 'whatsapp' } },
        create: { tenantId, channel: 'whatsapp', isActive: true, config: JSON.stringify({ phone }) },
        update: { isActive: true, config: JSON.stringify({ phone }) },
      });
    }

    // ── Disconnected ──
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[WA] Disconnected tenant=${tenantId} code=${statusCode} reconnect=${shouldReconnect}`);

      sockets.delete(tenantId);
      statusMap.set(tenantId, 'disconnected');
      phoneMap.delete(tenantId);
      emitToTenant(tenantId, 'whatsapp:disconnected', { reason: `code=${statusCode}` });

      if (shouldReconnect) {
        // reconnect หลัง 5 วินาที
        setTimeout(() => connectWhatsApp(tenantId), 5000);
      } else {
        // logged out → ลบ session
        clearSession(tenantId);
        await prisma.channelConfig.updateMany({ where: { tenantId, channel: 'whatsapp' }, data: { isActive: false } });
      }
    }
  });

  // ─── Save credentials ───────────────────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ─── Incoming messages ──────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key.fromMe) continue; // ข้ามข้อความที่เราส่งออก
      if (isJidBroadcast(msg.key.remoteJid || '')) continue;
      if (isJidGroup(msg.key.remoteJid || '')) continue; // ข้าม group chat (เพิ่มทีหลังได้)
      await handleIncomingMessage(tenantId, msg);
    }
  });
}

// ─── Handle incoming message pipeline ────────────────────────────────────────
async function handleIncomingMessage(tenantId: string, msg: any) {
  try {
    const jid      = msg.key.remoteJid as string;
    const phone    = jid.replace('@s.whatsapp.net', '');
    const waId     = jid;

    // ดึง text content
    const content  = extractMessageText(msg.message);
    const msgType  = detectMsgType(msg.message);
    const platformMsgId = msg.key.id;

    // 1. ดึง/สร้าง Contact
    let contact = await prisma.contact.findFirst({ where: { tenantId, whatsappId: waId } });
    if (!contact) {
      const pushName = msg.pushName || phone;
      contact = await prisma.contact.create({
        data: {
          tenantId, displayName: pushName, phone,
          whatsappId: waId,
        },
      });
    } else if (msg.pushName && contact.displayName !== msg.pushName) {
      await prisma.contact.update({ where: { id: contact.id }, data: { displayName: msg.pushName } });
    }

    // 2. ดึง/สร้าง Conversation
    let conversation = await prisma.conversation.findFirst({
      where: { tenantId, channel: 'whatsapp', channelId: waId },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          tenantId, contactId: contact.id,
          channel: 'whatsapp', channelId: waId,
          status: 'bot', isBot: true,
        },
      });
    }

    // 3. บันทึก Message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id, tenantId,
        senderType: 'customer', type: msgType,
        content: content || `[${msgType}]`,
        platformMsgId,
        metadata: JSON.stringify({ waJid: jid, pushName: msg.pushName }),
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    // 4. Emit to Inbox real-time
    emitToTenant(tenantId, 'new_message', {
      conversationId: conversation.id,
      message: { ...message, senderType: 'customer' },
      contact, channel: 'whatsapp',
    });

    // 5. AI Bot reply
    if (conversation.isBot && msgType === 'text') {
      await processBotReply(tenantId, conversation.id, content, waId);
    }
  } catch (err) {
    console.error('[WA] handleIncomingMessage error:', err);
  }
}

// ─── AI Bot reply via WhatsApp ────────────────────────────────────────────────
async function processBotReply(tenantId: string, conversationId: string, userMessage: string, waId: string) {
  try {
    const { processBotMessage } = await import('./ai.service');
    const history = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 15,
    });
    const conversationHistory = history.map((m: any) => ({
      role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));

    const { reply, shouldHandoff } = await processBotMessage(tenantId, conversationHistory, userMessage);

    // ส่งตอบกลับ WhatsApp
    const sock = sockets.get(tenantId);
    if (sock && statusMap.get(tenantId) === 'connected') {
      await sock.sendMessage(waId, { text: reply });
    }

    // บันทึก bot reply
    const botMsg = await prisma.message.create({
      data: { conversationId, tenantId, senderType: 'bot', type: 'text', content: reply },
    });

    emitToTenant(tenantId, 'new_message', {
      conversationId, channel: 'whatsapp',
      message: { ...botMsg, senderType: 'bot' },
    });

    if (shouldHandoff) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { isBot: false, status: 'pending' },
      });
      emitToTenant(tenantId, 'conversation_updated', { conversationId, status: 'pending', isBot: false });
    }
  } catch (err) {
    console.error('[WA] Bot reply error:', err);
  }
}

// ─── Send message (agent reply) ───────────────────────────────────────────────
export async function sendWhatsAppMessage(tenantId: string, waId: string, text: string, imageUrl?: string): Promise<void> {
  const sock = sockets.get(tenantId);
  if (!sock || statusMap.get(tenantId) !== 'connected') {
    throw new Error('WhatsApp ยังไม่ได้เชื่อมต่อ');
  }
  if (imageUrl) {
    await sock.sendMessage(waId, { image: { url: imageUrl }, caption: text });
  } else {
    await sock.sendMessage(waId, { text });
  }
}

// ─── Disconnect & clear session ───────────────────────────────────────────────
export async function disconnectWhatsApp(tenantId: string): Promise<void> {
  const sock = sockets.get(tenantId);
  if (sock) {
    try { await sock.logout(); } catch {}
    try { sock.end(undefined); } catch {}
    sockets.delete(tenantId);
  }
  clearSession(tenantId);
  statusMap.set(tenantId, 'disconnected');
  phoneMap.delete(tenantId);
  qrCache.delete(tenantId);
}

function clearSession(tenantId: string) {
  const dir = sessionDir(tenantId);
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  } catch (e) { console.error('[WA] clearSession error:', e); }
}

// ─── Status & QR getters ──────────────────────────────────────────────────────
export function getWhatsAppStatus(tenantId: string) {
  return {
    status: statusMap.get(tenantId) || 'disconnected',
    phone:  phoneMap.get(tenantId)  || null,
    qr:     qrCache.get(tenantId)   || null,
  };
}

export function getWhatsAppQR(tenantId: string): string | null {
  return qrCache.get(tenantId) || null;
}

// ─── Auto-reconnect on startup ────────────────────────────────────────────────
export async function initWhatsAppSessions() {
  try {
    const channels = await prisma.channelConfig.findMany({
      where: { channel: 'whatsapp', isActive: true },
    });
    for (const ch of channels) {
      const sessionPath = path.join(process.cwd(), 'auth_whatsapp', ch.tenantId, 'creds.json');
      if (fs.existsSync(sessionPath)) {
        console.log(`[WA] Auto-reconnect tenant=${ch.tenantId}`);
        connectWhatsApp(ch.tenantId).catch(console.error);
      }
    }
  } catch (e) {
    console.error('[WA] initWhatsAppSessions error:', e);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractMessageText(msg: WAMessageContent | null | undefined): string {
  if (!msg) return '';
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.fileName ||
    msg.stickerMessage ? '[สติ๊กเกอร์]' :
    msg.audioMessage  ? '[เสียง]' :
    ''
  ) as string;
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

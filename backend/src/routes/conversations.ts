import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getChannelConfig } from '../lib/channel-config';
import { verifyToken } from '../middleware/auth';
import { emitToTenant, emitToConversation } from '../lib/socket';
import { generateReplySuggestion, generateContextualReply, summarizeConversation, detectAndTranslate, enchantReply } from '../services/ai.service';
import { sendLineReply, sendLinePush, lineTextMessage } from '../services/line.service';
import { sendTelegramMessage } from '../services/telegram.service';
import { sendWhatsAppMessage } from '../services/whatsapp.service';
import { getUserCompanyIds, canAccessCompany } from '../lib/company-scope';

const router = Router();
router.use(verifyToken);

/** GET /api/conversations */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, channel, assignedTo, search, companyId, page = '1', limit = '30' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = { tenantId: req.tenantId };

    // ─── Company scope: จำกัดตามบริษัทที่แอดมินคนนี้เข้าถึงได้ ───────────────────
    const allowed = await getUserCompanyIds(req.user!.id);
    if (allowed) where.companyId = { in: allowed };
    // ตัวกรองบริษัทจาก UI (ต้องอยู่ในสิทธิ์ที่เข้าถึงได้)
    if (companyId && companyId !== 'all') {
      if (allowed && !allowed.includes(companyId as string)) {
        return res.json({ success: true, conversations: [], total: 0, page: parseInt(page as string), limit: parseInt(limit as string) });
      }
      where.companyId = companyId;
    }

    if (status && status !== 'all') where.status = status;
    if (channel && channel !== 'all') where.channel = channel;
    if (assignedTo === 'me') where.assignedToId = req.user!.id;
    else if (assignedTo) where.assignedToId = assignedTo;
    if (search) where.contact = { displayName: { contains: search, mode: 'insensitive' } };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          contact: { select: { id: true, displayName: true, avatar: true, lineUserId: true, telegramId: true, whatsappId: true, phone: true } },
          assignedTo: { select: { id: true, displayName: true, avatar: true } },
          company: { select: { id: true, name: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.conversation.count({ where }),
    ]);

    res.json({ success: true, conversations, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

/** GET /api/conversations/stats — สรุปสถิติ Inbox */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

    // company scope
    const allowed = await getUserCompanyIds(req.user!.id);
    const { companyId } = req.query;
    const cScope: any = {};
    if (allowed) cScope.companyId = { in: allowed };
    if (companyId && companyId !== 'all' && (!allowed || allowed.includes(companyId as string))) cScope.companyId = companyId;
    const base = { tenantId, ...cScope };
    // unread นับจาก message → ผูกผ่าน conversation relation
    const msgScope: any = cScope.companyId ? { conversation: { companyId: cScope.companyId } } : {};

    const [open, bot, pending, resolved, resolvedToday, newToday, unread, byChannel] = await Promise.all([
      prisma.conversation.count({ where: { ...base, status: 'open' } }),
      prisma.conversation.count({ where: { ...base, status: 'bot' } }),
      prisma.conversation.count({ where: { ...base, status: 'pending' } }),
      prisma.conversation.count({ where: { ...base, status: 'resolved' } }),
      prisma.conversation.count({ where: { ...base, status: 'resolved', resolvedAt: { gte: todayStart } } }),
      prisma.conversation.count({ where: { ...base, createdAt: { gte: todayStart } } }),
      prisma.message.count({ where: { tenantId, isRead: false, senderType: 'customer', ...msgScope } }),
      prisma.conversation.groupBy({ by: ['channel'], where: base, _count: true }),
    ]);

    res.json({ success: true, stats: { open, bot, pending, resolved, resolvedToday, newToday, unread, byChannel } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

/** GET /api/conversations/:id */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        contact: true,
        assignedTo: { select: { id: true, displayName: true, avatar: true } },
        messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, displayName: true, avatar: true } } } },
        ticket: true,
      },
    });
    if (!conversation) return res.status(404).json({ success: false, message: 'ไม่พบบทสนทนา' });
    // company scope: แอดมินที่ถูกจำกัดต้องเข้าถึงบริษัทของบทสนทนานี้ได้
    const allowed = await getUserCompanyIds(req.user!.id);
    if (!canAccessCompany(allowed, conversation.companyId)) return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงบทสนทนาของบริษัทนี้' });
    // Mark messages as read
    await prisma.message.updateMany({ where: { conversationId: req.params.id, isRead: false, senderType: 'customer' }, data: { isRead: true } });
    res.json({ success: true, conversation });
  } catch (err) {
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

/** PATCH /api/conversations/:id */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { status, assignedToId, priority, isBot } = req.body;
    // company scope gate
    const target = await prisma.conversation.findFirst({ where: { id: req.params.id, tenantId: req.tenantId }, select: { companyId: true } });
    if (!target) return res.status(404).json({ success: false, message: 'ไม่พบบทสนทนา' });
    const allowedP = await getUserCompanyIds(req.user!.id);
    if (!canAccessCompany(allowedP, target.companyId)) return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์จัดการบทสนทนาของบริษัทนี้' });
    const conversation = await prisma.conversation.update({
      where: { id: req.params.id, tenantId: req.tenantId },
      data: {
        ...(status && { status, ...(status === 'resolved' && { resolvedAt: new Date() }) }),
        ...(assignedToId !== undefined && { assignedToId }),
        ...(priority && { priority }),
        ...(isBot !== undefined && { isBot }),
      },
    });
    emitToTenant(req.tenantId!, 'conversation_updated', conversation);
    res.json({ success: true, conversation });
  } catch (err) {
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

/** POST /api/conversations/:id/messages - Send message as agent */
router.post('/:id/messages', async (req: Request, res: Response) => {
  try {
    const { content, type = 'text' } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'กรุณาใส่ข้อความ' });

    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: { contact: true },
    });
    if (!conversation) return res.status(404).json({ success: false, message: 'ไม่พบบทสนทนา' });

    // company scope gate — แอดมินที่ถูกจำกัดตอบได้เฉพาะบริษัทของตัวเอง
    const allowed = await getUserCompanyIds(req.user!.id);
    if (!canAccessCompany(allowed, conversation.companyId)) return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ตอบบทสนทนาของบริษัทนี้' });

    // Send to platform — ใช้ช่องทางของบริษัทที่ห้องแชทนี้สังกัด (fallback = config กลาง)
    const channelConfig = await getChannelConfig(req.tenantId!, conversation.channel, (conversation as any).companyId);
    // ★ Fix: SQLite stores JSON as string
    let cfg: any = channelConfig?.config;
    if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }
    cfg = cfg || {};

    try {
      if (conversation.channel === 'line' && cfg.accessToken) {
        await sendLinePush(conversation.channelId, [lineTextMessage(content)], cfg.accessToken);
      } else if (conversation.channel === 'telegram' && cfg.botToken) {
        await sendTelegramMessage(conversation.channelId, content, cfg.botToken);
      } else if (conversation.channel === 'whatsapp') {
        // WhatsApp: ส่งผ่าน socket ของ "เบอร์" (account) ที่บทสนทนานี้ผูกอยู่ + JID ของลูกค้า
        const accountId = conversation.whatsAppAccountId;
        const jid = (conversation.contact as any)?.whatsappId;
        if (accountId && jid) {
          await sendWhatsAppMessage(accountId, jid, content);
        } else {
          console.warn('[conv] whatsapp send skipped — missing account/jid', conversation.id);
        }
      }
    } catch (sendErr: any) {
      // log แต่ไม่ throw — ยัง save message ใน DB แม้ส่งไม่ได้
      console.error(`Send to ${conversation.channel} failed:`, sendErr.response?.data || sendErr.message);
    }


    // Save message
    const message = await prisma.message.create({
      data: { conversationId: conversation.id, tenantId: req.tenantId!, senderId: req.user!.id, senderType: 'agent', type, content },
    });

    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

    const fullMessage = { ...message, sender: { id: req.user!.id, displayName: req.user!.displayName } };
    emitToTenant(req.tenantId!, 'new_message', { conversationId: conversation.id, message: fullMessage, channel: conversation.channel });
    emitToConversation(conversation.id, 'new_message', { message: fullMessage });

    res.json({ success: true, message: fullMessage });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

/** POST /api/conversations/:id/handoff - สลับโหมด Bot ↔ Human
 *  Body: { toHuman: boolean } — toHuman=true → คนดูแล (isBot=false), toHuman=false → บอทดูแล
 */
router.post('/:id/handoff', async (req: Request, res: Response) => {
  try {
    const target = await prisma.conversation.findFirst({ where: { id: req.params.id, tenantId: req.tenantId }, select: { companyId: true } });
    if (!target) return res.status(404).json({ success: false, message: 'ไม่พบบทสนทนา' });
    const allowedH = await getUserCompanyIds(req.user!.id);
    if (!canAccessCompany(allowedH, target.companyId)) return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์จัดการบทสนทนาของบริษัทนี้' });
    // toHuman=true → คนดูแล (isBot=false, status=open) ; toHuman=false → บอทดูแล (isBot=true, status=bot)
    const toHuman = req.body?.toHuman === true;
    const conversation = await prisma.conversation.update({
      where: { id: req.params.id, tenantId: req.tenantId },
      data: toHuman ? { isBot: false, status: 'open' } : { isBot: true, status: 'bot' },
    });
    emitToTenant(req.tenantId!, 'conversation_updated', conversation);
    res.json({ success: true, conversation });
  } catch (err) {
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

/** GET /api/conversations/:id/ai-suggest - AI reply suggestion */
router.get('/:id/ai-suggest', async (req: Request, res: Response) => {
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId: req.params.id, tenantId: req.tenantId },
      orderBy: { createdAt: 'asc' }, take: 20,
    });
    const history = messages.map((m: any) => ({
      role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));
    const suggestion = await generateReplySuggestion(history, req.tenantId!);
    res.json({ success: true, suggestion });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

/** POST /api/conversations/:id/ai-draft - ร่างข้อความตอบ 3 ตัวเลือก (Admin-Assist) */
router.post('/:id/ai-draft', async (req: Request, res: Response) => {
  try {
    const { tone = 'friendly', purpose = 'reply' } = req.body;

    const conv = await prisma.conversation.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        contact: true,
        messages: { orderBy: { createdAt: 'asc' }, take: 20 },
      },
    });
    if (!conv) return res.status(404).json({ success: false, message: 'ไม่พบบทสนทนา' });

    const history = (conv.messages as any[]).map(m => ({
      role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));
    const lastCustomerMsg = (conv.messages as any[]).filter((m: any) => m.senderType === 'customer').slice(-1)[0]?.content || '';

    const contact: any = conv.contact;
    const result = await generateContextualReply({
      lastCustomerMessage: lastCustomerMsg,
      conversationHistory: history,
      contactProfile: {
        displayName: contact.displayName,
        username: contact.username,
        totalDeposit: contact.totalDeposit,
        depositCount: contact.depositCount,
        memberType: contact.memberType,
      },
      tone, purpose, tenantId: req.tenantId!,
    });

    res.json({ success: true, ...result });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

/** POST /api/conversations/:id/enchant — แปลร่างภาษาลาว→ไทย + แนะนำคำตอบ 3 โทน
 *  Body: { draft: "<ร่างที่แอดมินพิมพ์ มักเป็นภาษาลาว>" }
 *  Resp: { lang, thai, suggestions: [{ tone, text }] }
 */
router.post('/:id/enchant', async (req: Request, res: Response) => {
  try {
    const draft = (req.body?.draft || '').toString();
    if (!draft.trim()) return res.status(400).json({ success: false, message: 'กรุณาพิมพ์ร่างคำตอบก่อน' });

    const conv = await prisma.conversation.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: { contact: true, messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
    });
    if (!conv) return res.status(404).json({ success: false, message: 'ไม่พบบทสนทนา' });

    const history = (conv.messages as any[]).map(m => ({
      role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));

    // เรียนรู้สไตล์การตอบของทีม — ดึงคำตอบล่าสุดของแอดมิน (agent) ทั่วทั้ง tenant
    const recentAgentMsgs = await prisma.message.findMany({
      where: { tenantId: req.tenantId!, senderType: 'agent', type: 'text' },
      orderBy: { createdAt: 'desc' }, take: 8, select: { content: true },
    });
    const styleSamples = recentAgentMsgs.map(m => m.content).filter((c: string) => !!c && c.length > 2);

    const contact: any = conv.contact;
    const result = await enchantReply({
      adminDraft: draft,
      conversationHistory: history,
      contactProfile: { displayName: contact.displayName, depositCount: contact.depositCount, memberType: contact.memberType },
      styleSamples,
      tenantId: req.tenantId!,
    });

    res.json({ success: true, ...result });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

/** POST /api/conversations/:id/translate — แปลข้อความใดๆ เป็นไทย */
router.post('/:id/translate', async (req: Request, res: Response) => {
  try {
    const text = (req.body?.text || '').toString();
    if (!text.trim()) return res.status(400).json({ success: false, message: 'กรุณาใส่ข้อความ' });
    const result = await detectAndTranslate(text);
    res.json({ success: true, ...result });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

/** GET /api/conversations/:id/summary - AI summarize conversation */
router.get('/:id/summary', async (req: Request, res: Response) => {
  try {
    const conv = await prisma.conversation.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        contact: { select: { displayName: true } },
        messages: { orderBy: { createdAt: 'asc' }, take: 30 },
      },
    });
    if (!conv) return res.status(404).json({ success: false, message: 'ไม่พบบทสนทนา' });

    const history = (conv.messages as any[]).map(m => ({
      role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));
    const result = await summarizeConversation(history, (conv.contact as any).displayName);
    res.json({ success: true, ...result });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

/** POST /api/conversations/:id/sync-line
 *  ─────────────────────────────────────────────────────────────────────────────
 *  Sync conversation กับ LINE:
 *  1. ดึง LINE profile ล่าสุดมา update contact (displayName, avatar)
 *  2. ตรวจหา message "gap" ใน 24 ชั่วโมงที่ผ่านมา
 *     (ลูกค้าส่งมาแต่ไม่มี agent/bot reply ตามมาภายใน 5 นาที)
 *  3. Inject system note เข้า DB แจ้งเตือนทีมว่า "อาจมีการตอบนอก CRM"
 *
 *  ข้อจำกัด LINE API: ไม่มี API ดึงประวัติข้อความที่ admin ส่งจาก LINE OA Manager
 *  โดยตรง — สิ่งที่ทำได้คือ detect pattern จาก DB + update profile
 */
router.post('/:id/sync-line', async (req: Request, res: Response) => {
  try {
    const conv = await prisma.conversation.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        contact: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          // ดึงเฉพาะ 24 ชั่วโมงย้อนหลัง
          where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        },
      },
    });

    if (!conv) return res.status(404).json({ success: false, message: 'ไม่พบบทสนทนา' });
    if (conv.channel !== 'line') {
      return res.status(400).json({ success: false, message: 'Sync รองรับเฉพาะ LINE channel' });
    }

    const results: string[] = [];
    let profileUpdated = false;
    let gapsFound = 0;
    let notesInjected = 0;

    // ─── 1. ดึง LINE Profile ล่าสุด ──────────────────────────────────────────
    const channelConfig = await getChannelConfig(req.tenantId!, 'line', (conv as any)?.companyId);

    if (channelConfig?.isActive) {
      let cfg: any = channelConfig.config;
      if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }

      if (cfg.accessToken && conv.channelId) {
        try {
          const axios = (await import('axios')).default;
          const profileRes = await axios.get(
            `https://api.line.me/v2/bot/profile/${conv.channelId}`,
            { headers: { Authorization: `Bearer ${cfg.accessToken}` }, timeout: 8000 }
          );
          const profile = profileRes.data;

          const contact = conv.contact as any;
          const needsUpdate =
            (profile.displayName && profile.displayName !== contact.displayName) ||
            (profile.pictureUrl && profile.pictureUrl !== contact.avatar);

          if (needsUpdate) {
            await prisma.contact.update({
              where: { id: contact.id },
              data: {
                ...(profile.displayName && { displayName: profile.displayName }),
                ...(profile.pictureUrl && { avatar: profile.pictureUrl }),
              },
            });
            profileUpdated = true;
            results.push(`✅ อัปเดต Profile: ${profile.displayName}`);
          } else {
            results.push(`ℹ️ Profile ล่าสุดอยู่แล้ว (${contact.displayName})`);
          }
        } catch (profileErr: any) {
          // User อาจ block bot หรือ unfriend แล้ว
          const status = profileErr?.response?.status;
          if (status === 404) {
            results.push('⚠️ ผู้ใช้อาจยกเลิก Follow แล้ว (ไม่พบ Profile)');
          } else {
            results.push(`⚠️ ดึง Profile ไม่ได้: ${profileErr.message}`);
          }
        }
      }
    }

    // ─── 2. ตรวจหา Message Gap ใน 24 ชั่วโมง ─────────────────────────────────
    const msgs = conv.messages as any[];

    // จัดกลุ่ม: หาทุก customer message ที่ไม่มี agent/bot reply ตามมาภายใน 10 นาที
    const GAP_THRESHOLD_MS = 10 * 60 * 1000; // 10 นาที
    const SYSTEM_NOTE_MARKER = '[SYNC_NOTE]'; // marker สำหรับ note ที่ inject ไปแล้ว

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      if (msg.senderType !== 'customer') continue;

      const msgTime = new Date(msg.createdAt).getTime();

      // หา agent/bot reply ที่ตามมาภายใน 10 นาที
      const replyAfter = msgs.find((m, idx) =>
        idx > i &&
        (m.senderType === 'agent' || m.senderType === 'bot') &&
        new Date(m.createdAt).getTime() - msgTime < GAP_THRESHOLD_MS
      );

      if (!replyAfter) {
        // ไม่มี reply ตามมา → อาจมีการตอบนอก CRM
        const gapEndTime = new Date(msgTime + GAP_THRESHOLD_MS);

        // เช็คว่ามี system note นี้อยู่แล้วหรือไม่ (ป้องกัน duplicate)
        const existingNote = await prisma.message.findFirst({
          where: {
            conversationId: conv.id,
            senderType: 'bot',
            content: { contains: SYSTEM_NOTE_MARKER },
            createdAt: {
              gte: new Date(msgTime),
              lte: new Date(msgTime + GAP_THRESHOLD_MS * 2),
            },
          },
        });

        if (!existingNote) {
          gapsFound++;

          // Inject system note บอกทีมว่ามี gap
          const noteContent = `${SYSTEM_NOTE_MARKER} ⚠️ ตรวจพบ Gap: ลูกค้าส่งข้อความเมื่อ ${new Date(msgTime).toLocaleTimeString('th-TH')} แต่ไม่พบการตอบกลับใน CRM ภายใน 10 นาที — อาจมีการตอบผ่าน LINE OA Manager โดยตรง (ข้อความจาก OA Manager ไม่สามารถดึงมาบันทึกได้อัตโนมัติ)`;

          await prisma.message.create({
            data: {
              conversationId: conv.id,
              tenantId: req.tenantId!,
              senderType: 'bot',
              type: 'text',
              content: noteContent,
              createdAt: gapEndTime, // ใส่ timestamp ตอนสิ้นสุด gap
            },
          });
          notesInjected++;
        }
      }
    }

    if (gapsFound > 0) {
      results.push(`🔍 พบ ${gapsFound} gap — inject note แจ้งเตือน ${notesInjected} รายการ`);
    } else {
      results.push('✅ ไม่พบ message gap ใน 24 ชั่วโมงที่ผ่านมา');
    }

    // ─── 3. อัปเดต lastMessageAt ──────────────────────────────────────────────
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: new Date() },
    });

    results.push(`📊 วิเคราะห์ ${msgs.length} ข้อความ ใน 24 ชั่วโมงที่ผ่านมา`);

    res.json({
      success: true,
      summary: {
        profileUpdated,
        gapsFound,
        notesInjected,
        messagesAnalyzed: msgs.length,
        results,
      },
    });

  } catch (err: any) {
    console.error('[sync-line]', err.message);
    res.status(500).json({ success: false, message: err.message || 'เกิดข้อผิดพลาด' });
  }
});

export default router;



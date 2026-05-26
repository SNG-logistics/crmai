import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import { emitToTenant, emitToConversation } from '../lib/socket';
import { generateReplySuggestion, generateContextualReply, summarizeConversation, detectAndTranslate } from '../services/ai.service';
import { sendLineReply, sendLinePush, lineTextMessage } from '../services/line.service';
import { sendTelegramMessage } from '../services/telegram.service';

const router = Router();
router.use(verifyToken);

/** GET /api/conversations */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, channel, assignedTo, search, page = '1', limit = '30' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = { tenantId: req.tenantId };
    if (status && status !== 'all') where.status = status;
    if (channel && channel !== 'all') where.channel = channel;
    if (assignedTo === 'me') where.assignedToId = req.user!.id;
    else if (assignedTo) where.assignedToId = assignedTo;
    if (search) where.contact = { displayName: { contains: search, mode: 'insensitive' } };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          contact: { select: { id: true, displayName: true, avatar: true, lineUserId: true, telegramId: true } },
          assignedTo: { select: { id: true, displayName: true, avatar: true } },
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

    // Send to platform
    const channelConfig = await prisma.channelConfig.findUnique({
      where: { tenantId_channel: { tenantId: req.tenantId!, channel: conversation.channel } },
    });
    if (channelConfig) {
      // ★ Fix: SQLite stores JSON as string
      let cfg: any = channelConfig.config;
      if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }

      try {
        if (conversation.channel === 'line' && cfg.accessToken) {
          await sendLinePush(conversation.channelId, [lineTextMessage(content)], cfg.accessToken);
        } else if (conversation.channel === 'telegram' && cfg.botToken) {
          await sendTelegramMessage(conversation.channelId, content, cfg.botToken);
        }
      } catch (sendErr: any) {
        // log แต่ไม่ throw — ยัง save message ใน DB แม้ส่งไม่ได้
        console.error(`Send to ${conversation.channel} failed:`, sendErr.response?.data || sendErr.message);
      }
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

/** POST /api/conversations/:id/handoff - Toggle bot/human */
router.post('/:id/handoff', async (req: Request, res: Response) => {
  try {
    const { toHuman } = req.body;
    const conversation = await prisma.conversation.update({
      where: { id: req.params.id, tenantId: req.tenantId },
      data: { isBot: !toHuman, status: toHuman ? 'open' : 'bot', ...(toHuman && { assignedToId: req.user!.id }) },
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
        tsStatus: contact.tsStatus,
        firstDepositAt: contact.firstDepositAt,
      },
      tone, purpose, tenantId: req.tenantId!,
    });

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

/** POST /api/conversations/:id/translate - แปลข้อความเป็นไทย */
router.post('/:id/translate', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'กรุณาใส่ข้อความ' });
    const result = await detectAndTranslate(text);
    res.json({ success: true, ...result });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;


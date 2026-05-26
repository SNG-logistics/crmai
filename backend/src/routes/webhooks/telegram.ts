import { Router, Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { parseTelegramUpdate, sendTelegramMessage } from '../../services/telegram.service';
import { processBotMessage } from '../../services/ai.service';
import { emitToTenant } from '../../lib/socket';

const router = Router();

/** POST /api/webhooks/telegram/:tenantId */
router.post('/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  res.status(200).json({ status: 'ok' });

  try {
    const channelConfig = await prisma.channelConfig.findUnique({
      where: { tenantId_channel: { tenantId, channel: 'telegram' } },
    });
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
      conversation = await prisma.conversation.create({
        data: { tenantId, contactId: contact.id, channel: 'telegram', channelId: chatId, status: 'bot', isBot: true },
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

    // AI bot processing
    if (conversation.isBot && normalized.messageType === 'text') {
      const history = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      const conversationHistory = history.map((m: any) => ({
        role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const,
        content: m.content,
      }));

      const { reply, shouldHandoff } = await processBotMessage(tenantId, conversationHistory, normalized.content);
      await sendTelegramMessage(chatId, reply, botToken);

      const botReply = await prisma.message.create({
        data: { conversationId: conversation.id, tenantId, senderType: 'bot', type: 'text', content: reply },
      });

      emitToTenant(tenantId, 'new_message', {
        conversationId: conversation.id,
        message: { ...botReply, senderType: 'bot' },
        contact,
        channel: 'telegram',
      });

      if (shouldHandoff) {
        await prisma.conversation.update({ where: { id: conversation.id }, data: { isBot: false, status: 'pending' } });
        emitToTenant(tenantId, 'conversation_updated', { conversationId: conversation.id, status: 'pending', isBot: false });
      }
    }
  } catch (err) {
    console.error('Telegram webhook error:', err);
  }
});

export default router;

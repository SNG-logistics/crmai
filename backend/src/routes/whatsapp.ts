import { Router, Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
  sendWhatsAppMessage,
} from '../services/whatsapp.service';
import prisma from '../lib/prisma';

const router = Router();
router.use(verifyToken);

// ─── GET /api/whatsapp/status ─────────────────────────────────────────────────
router.get('/status', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const info = getWhatsAppStatus(tenantId);

    // นับสถิติวันนี้
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [recv, sent] = await Promise.all([
      prisma.message.count({ where: { tenantId, senderType: 'customer', createdAt: { gte: today }, conversation: { channel: 'whatsapp' } } }),
      prisma.message.count({ where: { tenantId, senderType: { in: ['agent', 'bot'] }, createdAt: { gte: today }, conversation: { channel: 'whatsapp' } } }),
    ]);

    res.json({ success: true, ...info, stats: { received: recv, sent } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/whatsapp/connect ── สร้าง session + QR ─────────────────────────
router.post('/connect', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    // เริ่มต้น connect แบบ non-blocking
    connectWhatsApp(tenantId).catch(console.error);
    res.json({ success: true, message: '🔄 กำลังสร้าง QR Code... รอ socket event "whatsapp:qr"' });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/whatsapp/qr ── ดึง QR image (base64) ────────────────────────────
router.get('/qr', async (req: Request, res: Response) => {
  try {
    const { qr, status } = getWhatsAppStatus(req.tenantId!);
    if (!qr) {
      return res.json({ success: false, status, message: status === 'connected' ? 'เชื่อมต่อแล้ว ไม่ต้องสแกน' : 'ยังไม่มี QR — POST /connect ก่อน' });
    }
    res.json({ success: true, qr, status });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/whatsapp/disconnect ────────────────────────────────────────────
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    await disconnectWhatsApp(req.tenantId!);
    await prisma.channelConfig.updateMany({ where: { tenantId: req.tenantId!, channel: 'whatsapp' }, data: { isActive: false } });
    res.json({ success: true, message: '✅ ตัดการเชื่อมต่อแล้ว' });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/whatsapp/send ── ส่งข้อความไปยังลูกค้า ────────────────────────
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { conversationId, text, imageUrl } = req.body;
    if (!conversationId || !text) return res.status(400).json({ success: false, message: 'ต้องระบุ conversationId และ text' });

    const tenantId = req.tenantId!;
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId, channel: 'whatsapp' },
      include: { contact: true },
    });
    if (!conv) return res.status(404).json({ success: false, message: 'ไม่พบบทสนทนา WhatsApp' });

    const waId = conv.channelId; // เช่น "66812345678@s.whatsapp.net"
    await sendWhatsAppMessage(tenantId, waId, text, imageUrl);

    // บันทึก Message
    const msg = await prisma.message.create({
      data: {
        conversationId, tenantId,
        senderId: req.user!.id, senderType: 'agent',
        type: imageUrl ? 'image' : 'text',
        content: text,
      },
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });

    const { emitToTenant } = await import('../lib/socket');
    emitToTenant(tenantId, 'new_message', {
      conversationId, channel: 'whatsapp',
      message: { ...msg, sender: { id: req.user!.id, displayName: req.user!.displayName } },
    });

    res.json({ success: true, message: '✅ ส่งสำเร็จ' });
  } catch (e: any) {
    console.error('[WA] send error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── GET /api/whatsapp/conversations ── WhatsApp conversations list ──────────
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: { tenantId: req.tenantId!, channel: 'whatsapp' },
        include: {
          contact: { select: { id: true, displayName: true, phone: true, avatar: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip, take: parseInt(limit as string),
      }),
      prisma.conversation.count({ where: { tenantId: req.tenantId!, channel: 'whatsapp' } }),
    ]);
    res.json({ success: true, conversations, total });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;

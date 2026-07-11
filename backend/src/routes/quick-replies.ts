import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import { composeQuickReply } from '../services/ai.service';

const router = Router();
router.use(verifyToken);

const normalizeTrigger = (t: string) => {
  let s = (t || '').trim().replace(/\s+/g, '');
  if (!s.startsWith('/')) s = '/' + s;
  return s.toLowerCase();
};

/** GET /api/quick-replies — รายการ key ลัดทั้งหมดของ tenant */
router.get('/', async (req: Request, res: Response) => {
  try {
    const items = await prisma.quickReply.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: [{ category: 'asc' }, { trigger: 'asc' }],
    });
    res.json({ success: true, items });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

/** POST /api/quick-replies — เพิ่ม key ลัด */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { trigger, title, content, category, aiCompose } = req.body || {};
    if (!trigger?.trim() || !title?.trim() || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'กรุณากรอก key ลัด, ชื่อ และเนื้อหาให้ครบ' });
    }
    const item = await prisma.quickReply.create({
      data: {
        tenantId: req.tenantId!,
        trigger: normalizeTrigger(trigger),
        title: title.trim(),
        content: content.trim(),
        category: (category || 'ทั่วไป').trim(),
        aiCompose: aiCompose !== false,
      },
    });
    res.json({ success: true, item });
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ success: false, message: 'key ลัดนี้ถูกใช้แล้ว' });
    res.status(500).json({ success: false, message: e.message });
  }
});

/** PATCH /api/quick-replies/:id — แก้ไข key ลัด */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const exists = await prisma.quickReply.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!exists) return res.status(404).json({ success: false, message: 'ไม่พบ key ลัด' });

    const { trigger, title, content, category, aiCompose, isActive } = req.body || {};
    const item = await prisma.quickReply.update({
      where: { id: req.params.id },
      data: {
        ...(trigger !== undefined ? { trigger: normalizeTrigger(trigger) } : {}),
        ...(title !== undefined ? { title: String(title).trim() } : {}),
        ...(content !== undefined ? { content: String(content).trim() } : {}),
        ...(category !== undefined ? { category: String(category).trim() || 'ทั่วไป' } : {}),
        ...(aiCompose !== undefined ? { aiCompose: !!aiCompose } : {}),
        ...(isActive !== undefined ? { isActive: !!isActive } : {}),
      },
    });
    res.json({ success: true, item });
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ success: false, message: 'key ลัดนี้ถูกใช้แล้ว' });
    res.status(500).json({ success: false, message: e.message });
  }
});

/** DELETE /api/quick-replies/:id — ลบ key ลัด */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const exists = await prisma.quickReply.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!exists) return res.status(404).json({ success: false, message: 'ไม่พบ key ลัด' });
    await prisma.quickReply.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

/** POST /api/quick-replies/:id/compose — AI แต่งคำตอบจาก key ลัด + บริบทบทสนทนา
 *  Body: { conversationId }
 *  Resp: { text }
 */
router.post('/:id/compose', async (req: Request, res: Response) => {
  try {
    const qr = await prisma.quickReply.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!qr) return res.status(404).json({ success: false, message: 'ไม่พบ key ลัด' });

    // ไม่ใช้ AI → คืนข้อความตรงๆ
    if (!qr.aiCompose) return res.json({ success: true, text: qr.content });

    const conversationId = (req.body?.conversationId || '').toString();
    let history: { role: 'user' | 'assistant'; content: string }[] = [];
    let contactProfile: { displayName?: string; memberType?: string; depositCount?: number } | undefined;

    if (conversationId) {
      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId, tenantId: req.tenantId! },
        include: { contact: true, messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
      });
      if (conv) {
        history = (conv.messages as any[])
          .filter((m: any) => m.type === 'text' && m.content)
          .map((m: any) => ({
            role: m.senderType === 'customer' ? 'user' as const : 'assistant' as const,
            content: m.content,
          }));
        const c: any = conv.contact;
        contactProfile = { displayName: c?.displayName, memberType: c?.memberType, depositCount: c?.depositCount };
      }
    }

    // สไตล์การตอบของทีม
    const recentAgentMsgs = await prisma.message.findMany({
      where: { tenantId: req.tenantId!, senderType: 'agent', type: 'text' },
      orderBy: { createdAt: 'desc' }, take: 8, select: { content: true },
    });
    const styleSamples = recentAgentMsgs.map(m => m.content).filter((c: string) => !!c && c.length > 2);

    const text = await composeQuickReply({
      content: qr.content,
      title: qr.title,
      conversationHistory: history,
      contactProfile,
      styleSamples,
    });

    res.json({ success: true, text });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;

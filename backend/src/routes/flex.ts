import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import { sendLinePush } from '../services/line.service';
import { emitToTenant } from '../lib/socket';
import axios from 'axios';

const router = Router();
router.use(verifyToken);

// ─── parse config helper ──────────────────────────────────────────────────────
function parseCfg(raw: any) {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

// ─── GET /api/flex/templates ── list saved templates ──────────────────────────
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const recs = await prisma.flexTemplate.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ success: true, templates: recs });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/flex/templates ── save template ────────────────────────────────
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const { id, name, category, altText, flexJson } = req.body;
    if (!name || !flexJson) return res.status(400).json({ success: false, message: 'กรุณาใส่ชื่อและ Flex JSON' });

    const data = {
      tenantId: req.tenantId!,
      name, category: category || 'custom', altText: altText || name,
      flexJson: typeof flexJson === 'string' ? flexJson : JSON.stringify(flexJson),
    };

    const tpl = id
      ? await prisma.flexTemplate.update({ where: { id }, data })
      : await prisma.flexTemplate.create({ data });

    res.json({ success: true, template: tpl });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── DELETE /api/flex/templates/:id ──────────────────────────────────────────
router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    await prisma.flexTemplate.delete({ where: { id: req.params.id, tenantId: req.tenantId! } });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/flex/send ── send flex to single conversation ──────────────────
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { conversationId, altText, flexJson } = req.body;
    if (!conversationId || !flexJson) return res.status(400).json({ success: false, message: 'ต้องระบุ conversationId และ flexJson' });

    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId: req.tenantId! },
      include: { contact: true },
    });
    if (!conv) return res.status(404).json({ success: false, message: 'ไม่พบบทสนทนา' });
    if (conv.channel !== 'line') return res.status(400).json({ success: false, message: 'รองรับเฉพาะ LINE เท่านั้น' });

    const ch = await prisma.channelConfig.findUnique({
      where: { tenantId_channel: { tenantId: req.tenantId!, channel: 'line' } },
    });
    if (!ch) return res.status(400).json({ success: false, message: 'ยังไม่ได้ตั้งค่า LINE' });

    const cfg = parseCfg(ch.config);
    const flexContent = typeof flexJson === 'string' ? JSON.parse(flexJson) : flexJson;

    const flexMsg = {
      type: 'flex',
      altText: altText || 'ข้อความจากแอดมิน',
      contents: flexContent,
    };

    await sendLinePush(conv.channelId, [flexMsg], cfg.accessToken);

    // Save to messages
    const msg = await prisma.message.create({
      data: {
        conversationId, tenantId: req.tenantId!,
        senderId: req.user!.id, senderType: 'agent',
        type: 'flex', content: altText || '[FLEX Message]',
        metadata: JSON.stringify({ flexJson: flexContent }),
      },
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });

    emitToTenant(req.tenantId!, 'new_message', {
      conversationId, channel: 'line',
      message: { ...msg, sender: { id: req.user!.id, displayName: req.user!.displayName } },
    });

    res.json({ success: true, message: '✅ ส่ง Flex Message สำเร็จ' });
  } catch (e: any) {
    console.error('Flex send error:', e.response?.data || e.message);
    res.status(500).json({ success: false, message: e.response?.data?.message || e.message });
  }
});

// ─── POST /api/flex/broadcast ── broadcast flex to contacts by tag ─────────────
router.post('/broadcast', async (req: Request, res: Response) => {
  try {
    const { altText, flexJson, contactIds } = req.body;
    if (!flexJson || !contactIds?.length) return res.status(400).json({ success: false, message: 'ต้องระบุ flexJson และ contactIds' });

    const ch = await prisma.channelConfig.findUnique({
      where: { tenantId_channel: { tenantId: req.tenantId!, channel: 'line' } },
    });
    if (!ch) return res.status(400).json({ success: false, message: 'ยังไม่ได้ตั้งค่า LINE' });
    const cfg = parseCfg(ch.config);
    const flexContent = typeof flexJson === 'string' ? JSON.parse(flexJson) : flexJson;

    // ตอบ 200 ทันที แล้ว broadcast ใน background
    res.json({ success: true, message: `กำลังส่ง Flex ไปยัง ${contactIds.length} คน...` });

    // Background
    (async () => {
      const contacts = await prisma.contact.findMany({
        where: { id: { in: contactIds }, tenantId: req.tenantId!, lineUserId: { not: null } },
      });
      let success = 0, failed = 0;
      for (const c of contacts) {
        try {
          await sendLinePush(c.lineUserId!, [{ type: 'flex', altText: altText || 'ข้อความส่งเสริมการขาย', contents: flexContent }], cfg.accessToken);
          success++;
        } catch { failed++; }
        await new Promise(r => setTimeout(r, 200));
      }
      console.log(`Flex broadcast done: ${success} ok, ${failed} failed`);
    })().catch(console.error);
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/flex/preview-url ── get LINE Flex Simulator URL ─────────────────
router.post('/preview-url', async (req: Request, res: Response) => {
  try {
    const { flexJson } = req.body;
    // encode เพื่อส่งไป LINE Flex Message Simulator
    const encoded = Buffer.from(JSON.stringify(flexJson)).toString('base64url');
    const url = `https://developers.line.biz/flex-simulator/?payload=${encoded}`;
    res.json({ success: true, url });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;

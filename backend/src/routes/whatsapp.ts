import { Router, Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import {
  connectWhatsAppAccount,
  disconnectWhatsAppAccount,
  getAccountStatus,
  sendWhatsAppMessage,
} from '../services/whatsapp.service';
import { emitToTenant } from '../lib/socket';
import prisma from '../lib/prisma';

const router = Router();
router.use(verifyToken);

// เบอร์แรกของ tenant (ใช้กับ endpoint legacy แบบเบอร์เดียว)
async function firstAccount(tenantId: string) {
  return prisma.whatsAppAccount.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
}
// เช็คว่า account เป็นของ tenant นี้จริง
async function tenantAccount(tenantId: string, id: string) {
  return prisma.whatsAppAccount.findFirst({ where: { id, tenantId } });
}

// ═══ Per-account API (multi-company) ══════════════════════════════════════════

// GET /api/whatsapp/accounts?companyId= — รายการเบอร์ + สถานะ live
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const where: any = { tenantId: req.tenantId! };
    if (req.query.companyId) where.companyId = req.query.companyId as string;
    const accounts = await prisma.whatsAppAccount.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { company: { select: { id: true, name: true } } },
    });
    const withStatus = accounts.map((a) => {
      const live = getAccountStatus(a.id);
      return { ...a, liveStatus: live.status, livePhone: live.phone, hasQr: !!live.qr };
    });
    return res.json({ success: true, accounts: withStatus });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/whatsapp/accounts — สร้างเบอร์ใหม่ในบริษัท (แล้วค่อย /connect เพื่อสแกน QR)
router.post('/accounts', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { companyId, label } = req.body;
    if (!companyId) return res.status(400).json({ success: false, message: 'ต้องระบุ companyId' });
    const company = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
    if (!company) return res.status(404).json({ success: false, message: 'ไม่พบบริษัท' });
    const account = await prisma.whatsAppAccount.create({
      data: { tenantId, companyId, label: (label || 'WhatsApp').toString().slice(0, 60), status: 'disconnected', isActive: true },
    });
    return res.status(201).json({ success: true, account });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/whatsapp/accounts/:id/connect — เริ่ม session + สร้าง QR
router.post('/accounts/:id/connect', async (req: Request, res: Response) => {
  try {
    const acc = await tenantAccount(req.tenantId!, req.params.id);
    if (!acc) return res.status(404).json({ success: false, message: 'ไม่พบเบอร์' });
    connectWhatsAppAccount(acc.id).catch(console.error);
    return res.json({ success: true, message: '🔄 กำลังสร้าง QR... รอ socket event "whatsapp:qr"' });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/whatsapp/accounts/:id/qr
router.get('/accounts/:id/qr', async (req: Request, res: Response) => {
  const acc = await tenantAccount(req.tenantId!, req.params.id);
  if (!acc) return res.status(404).json({ success: false, message: 'ไม่พบเบอร์' });
  const { qr, status } = getAccountStatus(acc.id);
  if (!qr) return res.json({ success: false, status, message: status === 'connected' ? 'เชื่อมต่อแล้ว' : 'ยังไม่มี QR — /connect ก่อน' });
  return res.json({ success: true, qr, status });
});

// GET /api/whatsapp/accounts/:id/status
router.get('/accounts/:id/status', async (req: Request, res: Response) => {
  const acc = await tenantAccount(req.tenantId!, req.params.id);
  if (!acc) return res.status(404).json({ success: false, message: 'ไม่พบเบอร์' });
  return res.json({ success: true, ...getAccountStatus(acc.id) });
});

// POST /api/whatsapp/accounts/:id/disconnect
router.post('/accounts/:id/disconnect', async (req: Request, res: Response) => {
  const acc = await tenantAccount(req.tenantId!, req.params.id);
  if (!acc) return res.status(404).json({ success: false, message: 'ไม่พบเบอร์' });
  await disconnectWhatsAppAccount(acc.id);
  return res.json({ success: true, message: '✅ ตัดการเชื่อมต่อแล้ว' });
});

// DELETE /api/whatsapp/accounts/:id — ลบเบอร์ออกจากบริษัท
router.delete('/accounts/:id', async (req: Request, res: Response) => {
  const acc = await tenantAccount(req.tenantId!, req.params.id);
  if (!acc) return res.status(404).json({ success: false, message: 'ไม่พบเบอร์' });
  await disconnectWhatsAppAccount(acc.id).catch(() => {});
  await prisma.whatsAppAccount.delete({ where: { id: acc.id } });
  return res.json({ success: true });
});

// ═══ Legacy tenant-level endpoints (map → เบอร์แรกของ tenant) ══════════════════
// ยังคงไว้เพื่อให้หน้า settings/whatsapp เดิม (แบบเบอร์เดียว) ทำงานได้จนกว่าจะรีดีไซน์

router.get('/status', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const acc = await firstAccount(tenantId);
    const info = acc ? getAccountStatus(acc.id) : { status: 'disconnected', phone: null, qr: null };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [recv, sent] = await Promise.all([
      prisma.message.count({ where: { tenantId, senderType: 'customer', createdAt: { gte: today }, conversation: { channel: 'whatsapp' } } }),
      prisma.message.count({ where: { tenantId, senderType: { in: ['agent', 'bot'] }, createdAt: { gte: today }, conversation: { channel: 'whatsapp' } } }),
    ]);
    return res.json({ success: true, accountId: acc?.id || null, ...info, stats: { received: recv, sent } });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

router.post('/connect', async (req: Request, res: Response) => {
  const acc = await firstAccount(req.tenantId!);
  if (!acc) return res.status(404).json({ success: false, message: 'ยังไม่มีเบอร์ — สร้าง account ก่อน (POST /accounts)' });
  connectWhatsAppAccount(acc.id).catch(console.error);
  return res.json({ success: true, message: '🔄 กำลังสร้าง QR Code...' });
});

router.get('/qr', async (req: Request, res: Response) => {
  const acc = await firstAccount(req.tenantId!);
  if (!acc) return res.json({ success: false, message: 'ยังไม่มีเบอร์' });
  const { qr, status } = getAccountStatus(acc.id);
  if (!qr) return res.json({ success: false, status, message: status === 'connected' ? 'เชื่อมต่อแล้ว ไม่ต้องสแกน' : 'ยังไม่มี QR — POST /connect ก่อน' });
  return res.json({ success: true, qr, status });
});

router.post('/disconnect', async (req: Request, res: Response) => {
  const acc = await firstAccount(req.tenantId!);
  if (acc) await disconnectWhatsAppAccount(acc.id);
  return res.json({ success: true, message: '✅ ตัดการเชื่อมต่อแล้ว' });
});

// ═══ Send + conversations list ════════════════════════════════════════════════

// POST /api/whatsapp/send — ส่งข้อความไปยังลูกค้า (resolve เบอร์จากบทสนทนา)
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

    const accountId = conv.whatsAppAccountId;
    const jid = (conv.contact as any)?.whatsappId;
    if (!accountId || !jid) return res.status(400).json({ success: false, message: 'บทสนทนานี้ไม่มีเบอร์/JID ผูกอยู่' });

    await sendWhatsAppMessage(accountId, jid, text, imageUrl);

    const msg = await prisma.message.create({
      data: {
        conversationId, tenantId,
        senderId: req.user!.id, senderType: 'agent',
        type: imageUrl ? 'image' : 'text', content: text,
      },
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });

    emitToTenant(tenantId, 'new_message', {
      conversationId, companyId: conv.companyId, channel: 'whatsapp',
      message: { ...msg, sender: { id: req.user!.id, displayName: req.user!.displayName } },
    });

    return res.json({ success: true, message: '✅ ส่งสำเร็จ' });
  } catch (e: any) {
    console.error('[WA] send error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/whatsapp/conversations?companyId= — รายการบทสนทนา WhatsApp
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', companyId } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = { tenantId: req.tenantId!, channel: 'whatsapp' };
    if (companyId) where.companyId = companyId as string;
    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          contact: { select: { id: true, displayName: true, phone: true, avatar: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip, take: parseInt(limit as string),
      }),
      prisma.conversation.count({ where }),
    ]);
    return res.json({ success: true, conversations, total });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

export default router;

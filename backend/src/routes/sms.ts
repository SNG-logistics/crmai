import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import { sendSMS, getSmsBalance, broadcastSMS } from '../services/sms.service';

const router = Router();
router.use(verifyToken);

// ─── Parse config helper ──────────────────────────────────────────────────────
function parseConfig(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

// ─── GET /api/sms/balance — เช็คยอด credit ───────────────────────────────────
router.get('/balance', async (req: Request, res: Response) => {
  try {
    const result = await getSmsBalance(req.tenantId!);
    res.json({ success: true, ...result });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/sms/config — ดู SMS config ──────────────────────────────────────
router.get('/config', async (req: Request, res: Response) => {
  try {
    const channel = await prisma.channelConfig.findFirst({
      where: { tenantId: req.tenantId!, channel: 'sms', companyId: null },
    });
    if (!channel) return res.json({ success: true, configured: false });
    const cfg = parseConfig(channel.config);
    // ซ่อน API key ส่วนหลัง
    res.json({
      success: true,
      configured: channel.isActive,
      provider: cfg.provider,
      sender:   cfg.sender,
      hasApiKey: !!cfg.apiKey,
    });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/sms/config — บันทึก SMS config ────────────────────────────────
router.post('/config', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey, sender } = req.body;
    if (!provider) return res.status(400).json({ success: false, message: 'กรุณาเลือก Provider' });

    const tenantId = req.tenantId!;
    const existing = await prisma.channelConfig.findFirst({
      where: { tenantId, channel: 'sms', companyId: null },
    });

    if (existing) {
      await prisma.channelConfig.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          config: JSON.stringify({ provider, apiKey, sender: sender || 'CRM' }),
        },
      });
    } else {
      await prisma.channelConfig.create({
        data: {
          tenantId,
          channel: 'sms',
          isActive: true,
          companyId: null,
          config: JSON.stringify({ provider, apiKey, sender: sender || 'CRM' }),
        },
      });
    }

    res.json({ success: true, message: 'บันทึก SMS config เรียบร้อย' });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/sms/send — ส่ง SMS เดี่ยว ─────────────────────────────────────
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { phone, message, contactId } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'กรุณาใส่เบอร์โทร' });
    if (!message) return res.status(400).json({ success: false, message: 'กรุณาใส่ข้อความ' });
    if (message.length > 480) return res.status(400).json({ success: false, message: 'ข้อความยาวเกินไป (สูงสุด 480 ตัวอักษร / 3 SMS)' });

    const result = await sendSMS({ tenantId: req.tenantId!, phone, message, contactId });
    res.json({ success: result.success, logId: result.logId, error: result.error,
      message: result.success ? `✅ ส่ง SMS ไปยัง ${phone} สำเร็จ` : `❌ ส่งไม่สำเร็จ: ${result.error}` });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/sms/broadcast — ส่ง SMS หลายเบอร์ ─────────────────────────────
router.post('/broadcast', async (req: Request, res: Response) => {
  try {
    const { phones, message, broadcastId } = req.body;
    if (!phones?.length) return res.status(400).json({ success: false, message: 'กรุณาใส่เบอร์โทรอย่างน้อย 1 เบอร์' });
    if (!message) return res.status(400).json({ success: false, message: 'กรุณาใส่ข้อความ' });
    if (phones.length > 500) return res.status(400).json({ success: false, message: 'ส่งได้สูงสุด 500 เบอร์ต่อครั้ง' });

    // ตอบ 200 ก่อน แล้วค่อย process ใน background
    res.json({ success: true, message: `กำลังส่ง SMS ${phones.length} เบอร์...`, total: phones.length });

    // Background broadcast
    broadcastSMS({ tenantId: req.tenantId!, phones, message, broadcastId }).catch(console.error);
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/sms/logs — ดูประวัติ SMS ───────────────────────────────────────
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const { status, page = '1', limit = '50' } = req.query;
    const skip  = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = { tenantId: req.tenantId };
    if (status && status !== 'all') where.status = status;

    const [logs, total] = await Promise.all([
      prisma.smsLog.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit as string),
      }),
      prisma.smsLog.count({ where }),
    ]);

    // สรุป stats
    const stats = await prisma.smsLog.groupBy({
      by: ['status'],
      where: { tenantId: req.tenantId },
      _count: true,
      _sum:   { creditUsed: true },
    });

    res.json({ success: true, logs, total, stats });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/sms/webhook — รับ delivery report (ThSMS callback) ─────────────
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { msgId, status } = req.body;
    if (msgId) {
      const statusMap: Record<string, string> = {
        'DELIVRD': 'delivered', 'UNDELIV': 'failed', 'EXPIRED': 'failed',
        'REJECTD': 'failed',    'SENT': 'sent',
      };
      await prisma.smsLog.updateMany({
        where: { providerMsgId: msgId },
        data:  { status: statusMap[status] || status },
      });
    }
    res.status(200).json({ status: 'ok' });
  } catch { res.status(200).json({ status: 'ok' }); }
});

export default router;

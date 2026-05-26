import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import { setTelegramWebhook, getTelegramBotInfo } from '../services/telegram.service';
import axios from 'axios';

const router = Router();
router.use(verifyToken);

// ─── Helper: parse config JSON safely ────────────────────────────────────────
function parseConfig(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

// ─── GET /api/channels ────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const channels = await prisma.channelConfig.findMany({ where: { tenantId: req.tenantId } });
    const sanitized = channels.map((c: any) => ({
      ...c,
      // ส่งกลับเฉพาะ flag ว่า configured หรือไม่ (ไม่ส่ง secret/token กลับ)
      config: { configured: true, channel: c.channel },
    }));
    res.json({ success: true, channels: sanitized });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/channels/webhook-url ───────────────────────────────────────────
// คืน Webhook URL สำหรับ tenant นี้
router.get('/webhook-url', async (req: Request, res: Response) => {
  const base = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`;
  res.json({
    success: true,
    line:     `${base}/api/webhooks/line/${req.tenantId}`,
    telegram: `${base}/api/webhooks/telegram/${req.tenantId}`,
    note: process.env.BACKEND_URL
      ? 'ใช้ได้เลย'
      : '⚠️ Development mode — LINE ต้องการ HTTPS จาก internet (ใช้ ngrok)',
  });
});

// ─── POST /api/channels/line ──────────────────────────────────────────────────
router.post('/line', async (req: Request, res: Response) => {
  try {
    const { channelSecret, accessToken } = req.body;
    if (!channelSecret || !accessToken)
      return res.status(400).json({ success: false, message: 'กรุณาใส่ Channel Secret และ Access Token' });

    // ★ ทดสอบ accessToken จริงก่อน save
    try {
      await axios.get('https://api.line.me/v2/bot/info', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 8000,
      });
    } catch (e: any) {
      const status = e.response?.status;
      if (status === 401)
        return res.status(400).json({ success: false, message: '❌ Access Token ไม่ถูกต้อง (401 Unauthorized) — ตรวจสอบใน LINE Developers' });
      if (status === 403)
        return res.status(400).json({ success: false, message: '❌ Access Token หมดอายุหรือ Messaging API ไม่ได้เปิด' });
      // network error → warn only, continue saving
      console.warn('LINE verify warning:', e.message);
    }

    const base = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`;
    const webhookUrl = `${base}/api/webhooks/line/${req.tenantId}`;

    // ★ Fix: stringify config for SQLite storage
    await prisma.channelConfig.upsert({
      where:  { tenantId_channel: { tenantId: req.tenantId!, channel: 'line' } },
      create: { tenantId: req.tenantId!, channel: 'line', isActive: true, config: JSON.stringify({ channelSecret, accessToken }) },
      update: { isActive: true, config: JSON.stringify({ channelSecret, accessToken }) },
    });

    res.json({
      success: true,
      webhookUrl,
      message: 'บันทึก LINE OA เรียบร้อยแล้ว',
      steps: [
        '1. เข้า https://developers.line.biz/console/',
        `2. เลือก Channel → Messaging API`,
        `3. Webhook URL: ${webhookUrl}`,
        '4. กด Verify แล้วเปิด "Use webhook"',
        '5. ปิด Auto-reply messages',
      ],
      note: !process.env.BACKEND_URL
        ? '⚠️ กำลัง run แบบ local — LINE ต้องการ HTTPS จาก internet ใช้ ngrok หรือ deploy ก่อน'
        : '✅ URL พร้อมใช้งาน',
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'เกิดข้อผิดพลาด' });
  }
});

// ─── POST /api/channels/line/verify ──────────────────────────────────────────
// ทดสอบ access token ว่ายังใช้ได้ไหม
router.post('/line/verify', async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken)
      return res.status(400).json({ success: false, message: 'กรุณาใส่ Access Token' });

    const r = await axios.get('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 8000,
    });
    res.json({ success: true, botName: r.data.displayName, botPicture: r.data.pictureUrl, followersCount: r.data.followersCount });
  } catch (e: any) {
    const status = e.response?.status;
    const msg = status === 401 ? 'Access Token ไม่ถูกต้อง' : status === 403 ? 'ไม่มีสิทธิ์' : e.message;
    res.status(400).json({ success: false, message: msg, status });
  }
});

// ─── POST /api/channels/telegram ─────────────────────────────────────────────
router.post('/telegram', async (req: Request, res: Response) => {
  try {
    const { botToken } = req.body;
    if (!botToken)
      return res.status(400).json({ success: false, message: 'กรุณาใส่ Bot Token' });

    const botInfo    = await getTelegramBotInfo(botToken);
    const base       = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`;
    const webhookUrl = `${base}/api/webhooks/telegram/${req.tenantId}`;

    await setTelegramWebhook(botToken, webhookUrl);

    // ★ Fix: stringify config for SQLite
    await prisma.channelConfig.upsert({
      where:  { tenantId_channel: { tenantId: req.tenantId!, channel: 'telegram' } },
      create: { tenantId: req.tenantId!, channel: 'telegram', isActive: true, config: JSON.stringify({ botToken, botUsername: botInfo.username }) },
      update: { isActive: true, config: JSON.stringify({ botToken, botUsername: botInfo.username }) },
    });

    res.json({
      success: true,
      botUsername: botInfo.username,
      webhookUrl,
      message: `✅ เชื่อมต่อ @${botInfo.username} เรียบร้อย`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Bot Token ไม่ถูกต้อง' });
  }
});

// ─── DELETE /api/channels/:channel ───────────────────────────────────────────
router.delete('/:channel', async (req: Request, res: Response) => {
  try {
    await prisma.channelConfig.update({
      where: { tenantId_channel: { tenantId: req.tenantId!, channel: req.params.channel } },
      data:  { isActive: false },
    });
    res.json({ success: true, message: 'ปิดการเชื่อมต่อแล้ว' });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;

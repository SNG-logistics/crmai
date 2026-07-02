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

// ─── POST /api/channels/line/sync-followers ──────────────────────────────────
router.post('/line/sync-followers', async (req: Request, res: Response) => {
  try {
    const channelConfig = await prisma.channelConfig.findUnique({
      where: { tenantId_channel: { tenantId: req.tenantId!, channel: 'line' } },
    });

    if (!channelConfig || !channelConfig.isActive) {
      return res.status(400).json({ success: false, message: 'กรุณาเชื่อมต่อ LINE OA ก่อน' });
    }

    let config: any = channelConfig.config;
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch { config = {}; }
    }
    const { accessToken } = config;
    if (!accessToken) {
      return res.status(400).json({ success: false, message: 'ไม่พบ Access Token สำหรับ LINE OA' });
    }

    let userIds: string[] = [];
    let nextToken: string | undefined = undefined;

    // 1. ดึง User IDs ทั้งหมดจาก LINE API
    do {
      const urlStr: string = 'https://api.line.me/v2/bot/followers/ids' + (nextToken ? `?start=${nextToken}` : '');
      const resp: any = await axios.get(urlStr, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
      });
      if (resp.data.userIds && Array.isArray(resp.data.userIds)) {
        userIds.push(...resp.data.userIds);
      }
      nextToken = resp.data.next;
    } while (nextToken);

    console.log(`[LINE Sync] Found ${userIds.length} followers for tenant ${req.tenantId}`);

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    // 2. นำข้อมูลบันทึกลงระบบฐานข้อมูล CRM
    for (const userId of userIds) {
      try {
        const existingContact = await prisma.contact.findUnique({
          where: { tenantId_lineUserId: { tenantId: req.tenantId!, lineUserId: userId } },
        });

        if (existingContact) {
          skipped++;
          continue;
        }

        // ดึงข้อมูลโปรไฟล์ (ชื่อแสดงผล, รูปภาพ)
        let profile: any = null;
        try {
          const profResp = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 5000,
          });
          profile = profResp.data;
        } catch (profErr: any) {
          console.warn(`[LINE Sync] Failed to get profile for ${userId}:`, profErr.message);
        }

        const displayName = profile?.displayName || 'LINE User';
        const avatar = profile?.pictureUrl || null;

        // บันทึกผู้ติดต่อในฐานข้อมูล
        const newContact = await prisma.contact.create({
          data: {
            tenantId: req.tenantId!,
            lineUserId: userId,
            displayName,
            avatar,
          },
        });

        // สร้างห้องแชทในระบบ
        await prisma.conversation.create({
          data: {
            tenantId: req.tenantId!,
            contactId: newContact.id,
            channel: 'line',
            channelId: userId,
            status: 'bot',
            isBot: true,
            lastMessageAt: new Date(),
          },
        });

        synced++;
        // ป้องกันการยิงถี่เกินไปจนติด rate limit
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (err: any) {
        errors++;
        console.error(`[LINE Sync] Error syncing user ${userId}:`, err.message);
      }
    }

    res.json({
      success: true,
      message: `ดึงข้อมูลเสร็จสิ้น: นำเข้าใหม่ ${synced} ราย, มีอยู่แล้ว ${skipped} ราย, ล้มเหลว ${errors} ราย`,
      stats: { synced, skipped, errors, total: userIds.length },
    });
  } catch (e: any) {
    console.error('[LINE Sync] Sync followers failed:', e.message || e);
    let errorMsg = 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ติดตาม';
    if (e.response?.status === 403 || e.response?.data?.message?.includes('not available')) {
      errorMsg = '❌ บัญชี LINE OA ของคุณไม่รองรับการดึงข้อมูลนี้ (ต้องเป็นบัญชีที่ได้รับการรับรอง - Verified Account หรือ Premium Account เท่านั้นจึงจะสามารถใช้ API ดึงผู้ติดตามได้ค่ะ)';
    } else {
      errorMsg = e?.response?.data?.message || e.message || errorMsg;
    }
    res.status(500).json({ success: false, message: errorMsg });
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

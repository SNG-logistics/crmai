import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getChannelConfig } from '../lib/channel-config';
import { verifyToken } from '../middleware/auth';
import { sendLinePush, lineTextMessage } from '../services/line.service';
import { sendTelegramMessage } from '../services/telegram.service';
const router = Router();
router.use(verifyToken);

// Helper: SQLite stores arrays as JSON strings
function toJsonStr(val: any): string {
  if (typeof val === 'string') return val;
  return JSON.stringify(val || []);
}
function fromJsonStr(val: any): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return []; } }
  return [];
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const raw = await prisma.broadcast.findMany({ where: { tenantId: req.tenantId }, orderBy: { createdAt: 'desc' } });
    // Parse JSON string fields back to arrays for frontend
    const broadcasts = raw.map((b: any) => ({
      ...b,
      channels: fromJsonStr(b.channels),
      targetTags: fromJsonStr(b.targetTags),
    }));
    res.json({ success: true, broadcasts });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, channels, message, targetTags, scheduledAt } = req.body;
    const broadcast = await prisma.broadcast.create({
      data: {
        tenantId: req.tenantId!, name,
        channels: toJsonStr(channels),
        message,
        targetTags: toJsonStr(targetTags || []),
        status: scheduledAt ? 'scheduled' : 'draft',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      },
    });
    // Send immediately if not scheduled
    if (!scheduledAt) await sendBroadcast(broadcast.id, req.tenantId!);
    res.status(201).json({ success: true, broadcast: { ...broadcast, channels: fromJsonStr(broadcast.channels), targetTags: fromJsonStr(broadcast.targetTags) } });
  } catch (e: any) {
    console.error('Broadcast create error:', e.message);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

async function sendBroadcast(broadcastId: string, tenantId: string) {
  const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  if (!broadcast) return;
  await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: 'sending' } });

  const tags = fromJsonStr(broadcast.targetTags);
  const channels = fromJsonStr(broadcast.channels);

  const contactWhere: any = { tenantId };
  if (tags.length > 0) contactWhere.tags = { some: { tag: { name: { in: tags } } } };

  const contacts = await prisma.contact.findMany({ where: contactWhere });
  let sentCount = 0, failedCount = 0;

  for (const contact of contacts) {
    for (const channel of channels) {
      try {
        const channelConfig = await getChannelConfig(tenantId, channel);
        if (!channelConfig) continue;
        let config: any = channelConfig.config;
        if (typeof config === 'string') { try { config = JSON.parse(config); } catch { config = {}; } }
        if (channel === 'line' && contact.lineUserId) {
          await sendLinePush(contact.lineUserId, [lineTextMessage(broadcast.message)], config.accessToken);
          sentCount++;
        } else if (channel === 'telegram' && contact.telegramId) {
          await sendTelegramMessage(contact.telegramId, broadcast.message, config.botToken);
          sentCount++;
        }
      } catch { failedCount++; }
    }
  }

  await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: 'sent', sentAt: new Date(), sentCount, failedCount } });
}

export default router;


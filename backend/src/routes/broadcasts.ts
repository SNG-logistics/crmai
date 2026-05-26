import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import { sendLinePush, lineTextMessage } from '../services/line.service';
import { sendTelegramMessage } from '../services/telegram.service';
const router = Router();
router.use(verifyToken);

router.get('/', async (req: Request, res: Response) => {
  try {
    const broadcasts = await prisma.broadcast.findMany({ where: { tenantId: req.tenantId }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, broadcasts });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, channels, message, targetTags, scheduledAt } = req.body;
    const broadcast = await prisma.broadcast.create({
      data: { tenantId: req.tenantId!, name, channels, message, targetTags: targetTags || [], status: scheduledAt ? 'scheduled' : 'draft', scheduledAt: scheduledAt ? new Date(scheduledAt) : null },
    });
    // Send immediately if not scheduled
    if (!scheduledAt) await sendBroadcast(broadcast.id, req.tenantId!);
    res.status(201).json({ success: true, broadcast });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

async function sendBroadcast(broadcastId: string, tenantId: string) {
  const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  if (!broadcast) return;
  await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: 'sending' } });

  const contactWhere: any = { tenantId };
  if (broadcast.targetTags?.length > 0) contactWhere.tags = { some: { tag: { name: { in: broadcast.targetTags } } } };

  const contacts = await prisma.contact.findMany({ where: contactWhere });
  let sentCount = 0, failedCount = 0;

  for (const contact of contacts) {
    for (const channel of broadcast.channels) {
      try {
        const channelConfig = await prisma.channelConfig.findUnique({ where: { tenantId_channel: { tenantId, channel } } });
        if (!channelConfig) continue;
        const config = channelConfig.config as any;
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

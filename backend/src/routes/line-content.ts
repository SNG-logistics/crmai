import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import axios from 'axios';

const router = Router();

// img tag ส่ง Authorization header ไม่ได้ ต้องรับ token จาก query string ด้วย
function flexAuth(req: Request, res: Response, next: NextFunction) {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  verifyToken(req, res, next);
}
router.use(flexAuth);

/**
 * GET /api/line/content/:messageId
 * Proxy เพื่อดึง content (รูปภาพ, วิดีโอ, ไฟล์) จาก LINE Content API
 * แล้ว stream กลับไปให้ frontend แสดงรูปได้ทันที
 */
router.get('/content/:messageId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;

    // หา LINE access token ของ tenant
    const channelConfig = await prisma.channelConfig.findUnique({
      where: { tenantId_channel: { tenantId: req.tenantId!, channel: 'line' } },
    });

    if (!channelConfig) {
      res.status(404).json({ success: false, message: 'ไม่พบ LINE config' });
      return;
    }

    let config: any = channelConfig.config;
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch { config = {}; }
    }

    const { accessToken } = config;
    if (!accessToken) {
      res.status(400).json({ success: false, message: 'ไม่พบ access token' });
      return;
    }

    // ดึง content จาก LINE
    const response = await axios.get(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'stream',
      }
    );

    // Set headers
    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 24 hours

    // Pipe stream ไปยัง response
    response.data.pipe(res);

  } catch (err: any) {
    console.error(`[LINE Content Proxy] Error:`, err?.response?.status, err.message);
    if (!res.headersSent) {
      res.status(err?.response?.status || 500).json({ success: false, message: 'ดึงรูปภาพไม่ได้' });
    }
  }
});

export default router;

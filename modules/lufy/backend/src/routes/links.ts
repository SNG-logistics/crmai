import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

// nanoid fallback (use uuid if not installed)
function generateSlug(len = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function parseTargets(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return []; } }
  return [];
}

const router = Router();
router.use(requireAuth);

// GET /api/links — list my links
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const links = await prisma.link.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, links: links.map(l => ({ ...l, targets: parseTargets(l.targets) })) });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

// POST /api/links — create link
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { slug, type = 'simple', destinationUrl, desktopUrl, mobileUrl, targets, comment } = req.body;

    // Validate by type
    if (type === 'simple' && !destinationUrl) return res.status(400).json({ success: false, message: 'ต้องระบุ URL ปลายทาง' });
    if (type === 'device' && !desktopUrl && !mobileUrl) return res.status(400).json({ success: false, message: 'ต้องระบุ URL อย่างน้อย 1 ช่อง' });
    if (type === 'split' && (!targets || parseTargets(targets).length < 2)) return res.status(400).json({ success: false, message: 'ต้องระบุปลายทางอย่างน้อย 2 URL' });

    // Auto-generate or use custom slug
    let finalSlug = slug?.trim() || '';
    if (!finalSlug) {
      // Auto-generate unique slug
      let attempts = 0;
      do {
        finalSlug = generateSlug(6);
        attempts++;
      } while (await prisma.link.findUnique({ where: { slug: finalSlug } }) && attempts < 10);
    } else {
      // Check if custom slug is taken
      const existing = await prisma.link.findUnique({ where: { slug: finalSlug } });
      if (existing) return res.status(400).json({ success: false, message: `Slug /${finalSlug} ถูกใช้แล้ว` });
    }

    const link = await prisma.link.create({
      data: {
        userId, slug: finalSlug, type, comment: comment || null,
        destinationUrl: type === 'simple' ? destinationUrl : null,
        desktopUrl: type === 'device' ? (desktopUrl || null) : null,
        mobileUrl: type === 'device' ? (mobileUrl || null) : null,
        targets: type === 'split' ? JSON.stringify(parseTargets(targets)) : '[]',
        status: 'active',
      },
    });

    res.status(201).json({ success: true, link: { ...link, targets: parseTargets(link.targets) } });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

// PATCH /api/links/:id — update link
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const link = await prisma.link.findFirst({ where: { id: req.params.id, userId } });
    if (!link) return res.status(404).json({ success: false, message: 'ไม่พบลิงก์' });

    const { type, destinationUrl, desktopUrl, mobileUrl, targets, comment, status } = req.body;
    const t = type || link.type;

    const updated = await prisma.link.update({
      where: { id: link.id },
      data: {
        type: t, comment: comment ?? link.comment, status: status || link.status,
        destinationUrl: t === 'simple' ? (destinationUrl ?? link.destinationUrl) : null,
        desktopUrl: t === 'device' ? (desktopUrl ?? link.desktopUrl) : null,
        mobileUrl: t === 'device' ? (mobileUrl ?? link.mobileUrl) : null,
        targets: t === 'split' ? JSON.stringify(parseTargets(targets || link.targets)) : '[]',
      },
    });

    res.json({ success: true, link: { ...updated, targets: parseTargets(updated.targets) } });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

// DELETE /api/links/:id — delete link
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const link = await prisma.link.findFirst({ where: { id: req.params.id, userId } });
    if (!link) return res.status(404).json({ success: false, message: 'ไม่พบลิงก์' });
    await prisma.link.delete({ where: { id: link.id } });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

export default router;

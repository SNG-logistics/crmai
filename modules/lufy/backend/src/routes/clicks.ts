import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /api/clicks — latest clicks for this user's links
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { page = '1', limit = '50', linkId } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get user's link IDs
    const userLinks = await prisma.link.findMany({ where: { userId }, select: { id: true } });
    const linkIds = userLinks.map((l: any) => l.id);

    const where: any = { linkId: { in: linkIds } };
    if (linkId) where.linkId = linkId as string;

    const [clicks, total] = await Promise.all([
      prisma.click.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit as string) }),
      prisma.click.count({ where }),
    ]);

    res.json({ success: true, clicks, total });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

// DELETE /api/clicks/:id — delete a click record
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const click = await prisma.click.findUnique({ where: { id: req.params.id }, include: { link: true } });
    if (!click || click.link.userId !== userId) return res.status(404).json({ success: false, message: 'ไม่พบบันทึก' });
    await prisma.click.delete({ where: { id: click.id } });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

// GET /api/clicks/ip-detail/:ip — lookup IP info
router.get('/ip-detail/:ip', async (req: Request, res: Response) => {
  try {
    const ip = decodeURIComponent(req.params.ip);
    // Skip lookup for local IPs
    const isLocal = ip === '::1' || 
                    ip.includes('127.0.0.1') || 
                    ip.startsWith('127.') || 
                    ip.startsWith('192.168.') || 
                    ip.startsWith('10.') || 
                    ip.startsWith('172.16.') || 
                    ip.startsWith('::ffff:127.') ||
                    ip.startsWith('::ffff:192.168.') ||
                    ip.startsWith('::ffff:10.') ||
                    ip === 'localhost';

    if (isLocal) {
      return res.json({ success: true, data: { ip, asn: 'LOCAL', asName: 'Local Network', asDomain: 'localhost', country: 'Local Network', continent: 'Local', city: 'Local', region: 'Local' } });
    }
    const resp = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
    if (!resp.ok) throw new Error('IP lookup failed');
    const data: any = await resp.json();
    res.json({
      success: true,
      data: {
        ip: data.ip,
        asn: data.asn || '—',
        asName: data.org || '—',
        asDomain: data.org?.split(' ').slice(1).join(' ') || '—',
        country: data.country_name || data.country || '—',
        countryCode: data.country_code || '—',
        continent: data.continent_code || '—',
        city: data.city || '—',
        region: data.region || '—',
        latitude: data.latitude,
        longitude: data.longitude,
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'IP lookup ล้มเหลว' });
  }
});

export default router;

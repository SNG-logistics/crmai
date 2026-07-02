import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /api/analysis — aggregated analytics
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { linkId, days = '30', topN = '10' } = req.query;
    const n = parseInt(topN as string);
    const d = parseInt(days as string);
    const since = new Date(Date.now() - d * 24 * 60 * 60 * 1000);

    // Get user's links
    const userLinks = await prisma.link.findMany({ where: { userId }, select: { id: true, slug: true, clickCount: true, status: true } });
    const linkIds = userLinks.map((l: any) => l.id);

    // Build where
    const where: any = { linkId: { in: linkIds }, createdAt: { gte: since } };
    if (linkId) where.linkId = linkId as string;

    // Fetch all matching clicks (for aggregation)
    const clicks = await prisma.click.findMany({ where, select: { id: true, country: true, os: true, browser: true, device: true, deviceType: true, referrer: true, ip: true, slug: true, createdAt: true } });

    const totalClicks = clicks.length;
    const activeLinks = userLinks.filter((l: any) => l.status === 'active').length;

    // Click over time (by day)
    const byDay: Record<string, number> = {};
    for (const c of clicks) {
      const day = c.createdAt.toISOString().split('T')[0];
      byDay[day] = (byDay[day] || 0) + 1;
    }
    const clicksByDay = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

    // Helper: count top N
    function topN_agg(field: string, items: any[], limit: number) {
      const map: Record<string, number> = {};
      for (const c of items) { const v = (c as any)[field] || 'Unknown'; map[v] = (map[v] || 0) + 1; }
      return Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, limit).map(([label, count]) => ({ label, count }));
    }

    // Top slugs
    const slugMap: Record<string, number> = {};
    for (const c of clicks) { slugMap[c.slug] = (slugMap[c.slug] || 0) + 1; }
    const topSlugs = Object.entries(slugMap).sort(([, a], [, b]) => b - a).slice(0, n).map(([label, count]) => ({ label, count }));

    res.json({
      success: true,
      data: {
        totalClicks,
        activeLinks,
        clicksByDay,
        topCountries:   topN_agg('country',    clicks, n),
        topOS:          topN_agg('os',          clicks, n),
        topBrowsers:    topN_agg('browser',     clicks, n),
        topDevices:     topN_agg('device',      clicks, n),
        topDeviceTypes: topN_agg('deviceType',  clicks, n),
        topIPs:         topN_agg('ip',          clicks, n),
        topReferrers:   topN_agg('referrer',    clicks, n),
        topSlugs,
      },
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

export default router;

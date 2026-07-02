import { Router, Request, Response } from 'express';
import UAParser from 'ua-parser-js';
import prisma from '../lib/prisma';

const router = Router();

// GET /:slug — redirect + log click (no auth needed)
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const link = await prisma.link.findUnique({ where: { slug } });

    if (!link || link.status !== 'active') {
      return res.status(404).send(`
        <!DOCTYPE html><html><head><title>Not Found | lufy.cc</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
        </head><body data-bs-theme="dark" class="d-flex align-items-center justify-content-center min-vh-100">
        <div class="text-center"><h1 class="display-1 text-muted">404</h1><p class="text-muted">ไม่พบลิงก์นี้หรือหมดอายุแล้ว</p>
        <a href="/" class="btn btn-outline-light mt-3">กลับหน้าแรก</a></div></body></html>
      `);
    }

    // Parse UA
    const ua = new UAParser(req.headers['user-agent'] || '');
    const browser = ua.getBrowser().name || 'Unknown';
    const os = ua.getOS().name || 'Unknown';
    const device = ua.getDevice().model || ua.getDevice().vendor || (ua.getDevice().type ? '' : 'PC');
    const deviceType = ua.getDevice().type === 'mobile' || ua.getDevice().type === 'tablet' ? ua.getDevice().type : 'desktop';

    // Get IP
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';

    // Get referrer
    const referrer = req.headers.referer || req.headers.referrer || 'Direct';
    const referrerHost = referrer !== 'Direct' ? (new URL(referrer as string).hostname || 'Direct') : 'Direct';

    // Determine destination URL
    let destUrl = '';
    if (link.type === 'simple') {
      destUrl = link.destinationUrl || '';
    } else if (link.type === 'device') {
      const isMobile = deviceType === 'mobile' || deviceType === 'tablet';
      destUrl = isMobile ? (link.mobileUrl || link.desktopUrl || '') : (link.desktopUrl || link.mobileUrl || '');
    } else if (link.type === 'split') {
      const targets: any[] = JSON.parse(link.targets || '[]');
      const total = targets.reduce((s: number, t: any) => s + (t.weight || 0), 0);
      let rand = Math.random() * total;
      for (const t of targets) {
        rand -= t.weight || 0;
        if (rand <= 0) { destUrl = t.url; break; }
      }
      if (!destUrl) destUrl = targets[0]?.url || '';
    }

    if (!destUrl) return res.status(404).send('ไม่มี URL ปลายทาง');

    // Log click (async, non-blocking)
    prisma.click.create({
      data: {
        linkId: link.id, slug,
        ip: ip || null, country: null, os, browser,
        device: device || 'Unknown', deviceType,
        referrer: referrerHost,
      },
    }).then(async (click) => {
      // Update click count
      await prisma.link.update({ where: { id: link.id }, data: { clickCount: { increment: 1 } } });

      // Async IP lookup (non-blocking)
      if (ip && !ip.startsWith('127.') && ip !== '::1') {
        fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`)
          .then(r => r.json())
          .then((data: any) => {
            if (!data.error) {
              prisma.click.update({
                where: { id: click.id },
                data: {
                  country: data.country_name || data.country || null,
                  asn: data.asn || null,
                  asName: data.org || null,
                  asDomain: data.org?.split(' ').slice(1).join(' ') || null,
                  continent: data.continent_code || null,
                },
              }).catch(() => {});
            }
          }).catch(() => {});
      }
    }).catch(console.error);

    // Redirect immediately
    res.redirect(302, destUrl);
  } catch (e) {
    console.error(e);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

export default router;

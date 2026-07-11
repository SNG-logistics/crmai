import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getChannelConfig } from '../lib/channel-config';
import { verifyToken } from '../middleware/auth';
import { sendLinePush } from '../services/line.service';
import {
  buildBonusTimeMenuMessages,
  buildBonusTimeGamesMessages,
  DEFAULT_BONUS_KEYWORDS,
} from '../services/bonustime.service';

const router = Router();
router.use(verifyToken);

// ─── resolve companyId (เหมือน bot.ts — per-company config) ───────────────────
async function resolveCompanyId(req: Request): Promise<string> {
  const tenantId = req.tenantId!;
  const q = (req.query.companyId || req.body?.companyId) as string | undefined;
  if (q) {
    const c = await prisma.company.findFirst({ where: { id: q, tenantId }, select: { id: true } });
    if (c) return c.id;
  }
  let def = await prisma.company.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!def) {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } });
    def = await prisma.company.create({
      data: { tenantId, name: t?.name || 'บริษัทหลัก', slug: t?.slug || undefined },
      select: { id: true },
    });
  }
  return def.id;
}

async function getOrCreateConfig(tenantId: string, companyId: string) {
  let cfg = await prisma.bonusTimeConfig.findUnique({ where: { companyId } });
  if (!cfg) {
    cfg = await prisma.bonusTimeConfig.create({ data: { tenantId, companyId } });
  }
  return cfg;
}

// ─── GET /api/bonustime — config + camps (พร้อม games) ────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const config = await getOrCreateConfig(req.tenantId!, companyId);
    const camps = await prisma.bonusTimeCamp.findMany({
      where: { companyId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { games: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
    });
    return res.json({ success: true, companyId, config, camps, defaultKeywords: DEFAULT_BONUS_KEYWORDS });
  } catch (e: any) {
    console.error('BonusTime GET error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// ─── PUT /api/bonustime/config — upsert config ────────────────────────────────
router.put('/config', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    await getOrCreateConfig(req.tenantId!, companyId);
    const {
      isActive, headerTitle, headerSubtitle, intro, gamesIntro, footerNote,
      aiTrigger, keywords, liveJitter, accent,
    } = req.body;

    const data: any = {};
    if (isActive !== undefined) data.isActive = !!isActive;
    if (headerTitle !== undefined) data.headerTitle = String(headerTitle);
    if (headerSubtitle !== undefined) data.headerSubtitle = String(headerSubtitle);
    if (intro !== undefined) data.intro = String(intro);
    if (gamesIntro !== undefined) data.gamesIntro = String(gamesIntro);
    if (footerNote !== undefined) data.footerNote = String(footerNote);
    if (aiTrigger !== undefined) data.aiTrigger = !!aiTrigger;
    if (accent !== undefined) data.accent = String(accent);
    if (liveJitter !== undefined) data.liveJitter = Math.max(0, Math.min(20, parseInt(liveJitter, 10) || 0));
    if (keywords !== undefined) {
      const arr = Array.isArray(keywords)
        ? keywords
        : String(keywords).split(',').map((s) => s.trim()).filter(Boolean);
      data.keywords = JSON.stringify(arr);
    }

    const config = await prisma.bonusTimeConfig.update({ where: { companyId }, data });
    return res.json({ success: true, config });
  } catch (e: any) {
    console.error('BonusTime config error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// ─── Camps CRUD ───────────────────────────────────────────────────────────────
router.post('/camps', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const { name, code, logo, accent, order, isActive } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'กรุณาใส่ชื่อค่าย' });
    const camp = await prisma.bonusTimeCamp.create({
      data: {
        tenantId: req.tenantId!, companyId,
        name: String(name),
        code: String(code || name).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40) || 'camp',
        logo: logo || null,
        accent: accent || '#00D4AA',
        order: parseInt(order, 10) || 0,
        isActive: isActive === undefined ? true : !!isActive,
      },
    });
    return res.status(201).json({ success: true, camp });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

router.put('/camps/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.bonusTimeCamp.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบค่าย' });
    const { name, code, logo, accent, order, isActive } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = String(name);
    if (code !== undefined) data.code = String(code);
    if (logo !== undefined) data.logo = logo || null;
    if (accent !== undefined) data.accent = accent;
    if (order !== undefined) data.order = parseInt(order, 10) || 0;
    if (isActive !== undefined) data.isActive = !!isActive;
    const camp = await prisma.bonusTimeCamp.update({ where: { id: req.params.id }, data });
    return res.json({ success: true, camp });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/camps/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.bonusTimeCamp.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบค่าย' });
    await prisma.bonusTimeCamp.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─── Games CRUD ───────────────────────────────────────────────────────────────
router.post('/games', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const { campId, name, image, banner, winRate, freeSpinRate, wildRate, provider, languages, link, order, isActive } = req.body;
    if (!campId || !name) return res.status(400).json({ success: false, message: 'กรุณาระบุค่ายและชื่อเกม' });
    const camp = await prisma.bonusTimeCamp.findFirst({ where: { id: campId, tenantId: req.tenantId! } });
    if (!camp) return res.status(404).json({ success: false, message: 'ไม่พบค่ายที่เลือก' });
    const clampPct = (v: any, d: number) => Math.max(0, Math.min(100, parseInt(v, 10) || d));
    const game = await prisma.bonusTimeGame.create({
      data: {
        tenantId: req.tenantId!, companyId, campId,
        name: String(name),
        image: image || null,
        banner: banner || null,
        winRate: clampPct(winRate, 85),
        freeSpinRate: clampPct(freeSpinRate, 70),
        wildRate: clampPct(wildRate, 75),
        provider: provider || '',
        languages: JSON.stringify(Array.isArray(languages) ? languages : (languages ? [languages] : ['TH'])),
        link: link || null,
        order: parseInt(order, 10) || 0,
        isActive: isActive === undefined ? true : !!isActive,
      },
    });
    return res.status(201).json({ success: true, game });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

router.put('/games/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.bonusTimeGame.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบเกม' });
    const { name, image, banner, winRate, freeSpinRate, wildRate, provider, languages, link, order, isActive, campId } = req.body;
    const clampPct = (v: any) => Math.max(0, Math.min(100, parseInt(v, 10)));
    const data: any = {};
    if (name !== undefined) data.name = String(name);
    if (image !== undefined) data.image = image || null;
    if (banner !== undefined) data.banner = banner || null;
    if (winRate !== undefined) data.winRate = clampPct(winRate);
    if (freeSpinRate !== undefined) data.freeSpinRate = clampPct(freeSpinRate);
    if (wildRate !== undefined) data.wildRate = clampPct(wildRate);
    if (provider !== undefined) data.provider = provider || '';
    if (languages !== undefined) data.languages = JSON.stringify(Array.isArray(languages) ? languages : (languages ? [languages] : ['TH']));
    if (link !== undefined) data.link = link || null;
    if (order !== undefined) data.order = parseInt(order, 10) || 0;
    if (isActive !== undefined) data.isActive = !!isActive;
    if (campId !== undefined) {
      const camp = await prisma.bonusTimeCamp.findFirst({ where: { id: campId, tenantId: req.tenantId! } });
      if (camp) data.campId = campId;
    }
    const game = await prisma.bonusTimeGame.update({ where: { id: req.params.id }, data });
    return res.json({ success: true, game });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/games/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.bonusTimeGame.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบเกม' });
    await prisma.bonusTimeGame.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/bonustime/preview — คืน Flex JSON เพื่อพรีวิว/ทดสอบใน UI ────────
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const config = await getOrCreateConfig(req.tenantId!, companyId);
    const { campId } = req.body;
    if (campId) {
      const camp = await prisma.bonusTimeCamp.findFirst({ where: { id: campId, companyId } });
      if (!camp) return res.status(404).json({ success: false, message: 'ไม่พบค่าย' });
      const games = await prisma.bonusTimeGame.findMany({
        where: { campId, isActive: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      });
      return res.json({ success: true, messages: buildBonusTimeGamesMessages(config as any, camp as any, games as any) });
    }
    const camps = await prisma.bonusTimeCamp.findMany({
      where: { companyId, isActive: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return res.json({ success: true, messages: buildBonusTimeMenuMessages(config as any, camps as any) });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/bonustime/test-send — ส่งเมนู BONUSTIME เข้า LINE (ทดสอบ) ───────
router.post('/test-send', async (req: Request, res: Response) => {
  try {
    const { lineUserId } = req.body;
    if (!lineUserId) return res.status(400).json({ success: false, message: 'กรุณาระบุ LINE User ID' });
    const companyId = await resolveCompanyId(req);
    const config = await getOrCreateConfig(req.tenantId!, companyId);
    const camps = await prisma.bonusTimeCamp.findMany({
      where: { companyId, isActive: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    if (!camps.length) return res.status(400).json({ success: false, message: 'ยังไม่มีค่ายเกม — กด "เพิ่มค่ายตัวอย่าง" ก่อนนะคะ' });

    const ch = await getChannelConfig(req.tenantId!, 'line', (req.query.companyId as string) || (req.body?.companyId as string) || null);
    if (!ch) return res.status(400).json({ success: false, message: 'ยังไม่ได้ตั้งค่า LINE OA' });
    let cfg: any = ch.config; if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }

    await sendLinePush(lineUserId, buildBonusTimeMenuMessages(config as any, camps as any), cfg.accessToken);
    return res.json({ success: true, message: '✅ ส่งเมนู BONUS TIME แล้ว' });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.response?.data?.message || e.message });
  }
});

// ─── POST /api/bonustime/seed — เพิ่มค่าย + เกมตัวอย่าง (ตามรูป) ───────────────
const SEED_CAMPS: { name: string; code: string }[] = [
  { name: 'PG SOFT', code: 'pgsoft' }, { name: 'JILI', code: 'jili' }, { name: 'PRAGMATIC', code: 'pragmatic' },
  { name: 'JOKER', code: 'joker' }, { name: 'SPADEGAMING', code: 'spadegaming' }, { name: 'RICH88', code: 'rich88' },
  { name: 'HABANERO', code: 'habanero' }, { name: 'YGGDRASIL', code: 'yggdrasil' }, { name: 'NOLIMIT CITY', code: 'nolimit' },
  { name: 'NEXTSPIN', code: 'nextspin' }, { name: 'KA GAMING', code: 'kagaming' }, { name: 'MICROGAMING', code: 'microgaming' },
  { name: 'RED TIGER', code: 'redtiger' }, { name: 'ASKMEBET', code: 'askmebet' }, { name: 'ASKMESLOT', code: 'askmeslot' },
  { name: 'BOOONGO', code: 'booongo' }, { name: 'DRAGON', code: 'dragon' }, { name: 'ROYAL SLOT', code: 'royalslot' },
  { name: 'SIMPLE PLAY', code: 'simpleplay' }, { name: 'MANA PLAY', code: 'manaplay' }, { name: 'MANNAPLAY', code: 'mannaplay' },
  { name: 'SLOTXO', code: 'slotxo' }, { name: 'KING MIDAS', code: 'kingmidas' }, { name: 'OCTOPUS', code: 'octopus' },
  { name: 'NAGA', code: 'naga' }, { name: 'NETENT', code: 'netent' }, { name: "PLAY'N GO", code: 'playngo' },
  { name: 'ES GAMING', code: 'esgaming' }, { name: 'FASTSPIN', code: 'fastspin' }, { name: 'FC', code: 'fc' },
  { name: 'GMW', code: 'gmw' }, { name: 'HACKSAW', code: 'hacksaw' }, { name: 'EVOPLAY', code: 'evoplay' },
  { name: '5G', code: '5g' }, { name: 'TOP TREND', code: 'toptrend' }, { name: 'YGR', code: 'ygr' },
];

const SEED_GAMES: Record<string, { name: string; win: number; free: number; wild: number; langs: string[] }[]> = {
  jili: [
    { name: 'Bombing Fishing', win: 89, free: 70, wild: 78, langs: ['TH', 'EN'] },
    { name: 'God Of Martial', win: 72, free: 60, wild: 65, langs: ['TH', 'EN'] },
    { name: 'Golden Empire', win: 86, free: 68, wild: 74, langs: ['TH', 'EN'] },
    { name: 'Boxing King', win: 84, free: 66, wild: 71, langs: ['TH'] },
  ],
  pgsoft: [
    { name: 'Fortune Tiger', win: 88, free: 72, wild: 80, langs: ['TH', 'EN'] },
    { name: 'Treasures of Aztec', win: 86, free: 70, wild: 77, langs: ['TH'] },
    { name: 'Lucky Neko', win: 85, free: 69, wild: 75, langs: ['TH'] },
  ],
  pragmatic: [
    { name: 'Sweet Bonanza', win: 87, free: 71, wild: 79, langs: ['TH', 'EN'] },
    { name: 'Gates of Olympus', win: 86, free: 70, wild: 78, langs: ['TH'] },
  ],
  joker: [
    { name: 'Roma', win: 83, free: 65, wild: 70, langs: ['TH'] },
  ],
};

router.post('/seed', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    await getOrCreateConfig(req.tenantId!, companyId);
    let campsAdded = 0, gamesAdded = 0;

    for (let i = 0; i < SEED_CAMPS.length; i++) {
      const s = SEED_CAMPS[i];
      let camp = await prisma.bonusTimeCamp.findFirst({ where: { companyId, code: s.code } });
      if (!camp) {
        camp = await prisma.bonusTimeCamp.create({
          data: { tenantId: req.tenantId!, companyId, name: s.name, code: s.code, order: i },
        });
        campsAdded++;
      }
      const games = SEED_GAMES[s.code];
      if (games) {
        const existingCount = await prisma.bonusTimeGame.count({ where: { campId: camp.id } });
        if (existingCount === 0) {
          for (let g = 0; g < games.length; g++) {
            const gg = games[g];
            await prisma.bonusTimeGame.create({
              data: {
                tenantId: req.tenantId!, companyId, campId: camp.id,
                name: gg.name, winRate: gg.win, freeSpinRate: gg.free, wildRate: gg.wild,
                provider: s.name, languages: JSON.stringify(gg.langs), order: g,
              },
            });
            gamesAdded++;
          }
        }
      }
    }
    return res.json({ success: true, message: `✅ เพิ่มค่าย ${campsAdded} ค่าย, เกมตัวอย่าง ${gamesAdded} เกม`, campsAdded, gamesAdded });
  } catch (e: any) {
    console.error('BonusTime seed error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

export default router;

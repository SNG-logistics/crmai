import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import { generateAIResponse } from '../services/ai.service';
const router = Router();
router.use(verifyToken);

// เลือกบริษัทที่จะจัดการ config: ?companyId= หรือ body.companyId ; ไม่ระบุ → บริษัทเริ่มต้นของ tenant
// (สร้างบริษัทเริ่มต้นให้อัตโนมัติถ้ายังไม่มี — กัน tenant เก่าที่ยังไม่ backfill)
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

router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await prisma.botConfig.findFirst({
      where: { companyId },
      include: { knowledgeBase: { where: { isActive: true }, orderBy: { createdAt: 'desc' } } },
    });
    return res.json({ success: true, bot, companyId });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const { systemPrompt, model, temperature, isActive } = req.body;
    const companyId = await resolveCompanyId(req);
    const existing = await prisma.botConfig.findFirst({ where: { companyId } });
    const bot = existing
      ? await prisma.botConfig.update({ where: { id: existing.id }, data: { systemPrompt, model, temperature, isActive } })
      : await prisma.botConfig.create({ data: { tenantId: req.tenantId!, companyId, name: 'AI Bot', systemPrompt, model, temperature, isActive } });
    return res.json({ success: true, bot });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

// GET /api/bot/knowledge — list all knowledge base items
router.get('/knowledge', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await prisma.botConfig.findFirst({ where: { companyId } });
    if (!bot) return res.json({ success: true, items: [] });
    const items = await prisma.knowledgeBase.findMany({ where: { botConfigId: bot.id }, orderBy: { createdAt: 'desc' } });
    return res.json({ success: true, items });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.post('/knowledge', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await prisma.botConfig.findFirst({ where: { companyId } });
    if (!bot) return res.status(404).json({ success: false, message: 'ยังไม่มี Bot Config' });
    const { companyId: _c, ...kb } = req.body || {};
    const item = await prisma.knowledgeBase.create({ data: { botConfigId: bot.id, ...kb } });
    return res.status(201).json({ success: true, item });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.put('/knowledge/:id', async (req: Request, res: Response) => {
  try {
    const item = await prisma.knowledgeBase.update({ where: { id: req.params.id }, data: req.body });
    return res.json({ success: true, item });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.delete('/knowledge/:id', async (req: Request, res: Response) => {
  try {
    await prisma.knowledgeBase.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.post('/test', async (req: Request, res: Response) => {
  try {
    const { message, history = [] } = req.body;
    const companyId = await resolveCompanyId(req);
    const bot = await prisma.botConfig.findFirst({ where: { companyId }, include: { knowledgeBase: { where: { isActive: true } } } });
    const kbContext = (bot?.knowledgeBase || []).map((kb: any) => `Q: ${kb.question}\nA: ${kb.answer}`).join('\n\n');
    const systemPrompt = `${bot?.systemPrompt || 'คุณเป็น AI Assistant ที่เป็นมิตร'}\n\nฐานความรู้:\n${kbContext}`;
    const messages = [{ role: 'system' as const, content: systemPrompt }, ...history, { role: 'user' as const, content: message }];
    const reply = await generateAIResponse(messages, bot?.model || 'gpt-4o', bot?.temperature || 0.7);
    return res.json({ success: true, reply });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/bot/auto-seed — AI สร้าง Q&A อัตโนมัติ ────────────────────────
router.post('/auto-seed', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await prisma.botConfig.findFirst({ where: { companyId } });
    if (!bot) return res.status(404).json({ success: false, message: 'กรุณาตั้งค่า Bot ก่อน' });

    const { category = 'general', count = 10 } = req.body;
    const prompt = bot.systemPrompt || 'ธุรกิจบริการออนไลน์';

    const messages = [
      {
        role: 'system' as const,
        content: `คุณเป็นผู้เชี่ยวชาญสร้าง FAQ สำหรับ Customer Service Bot ในธุรกิจไทย
กฎ: สร้าง ${Math.min(count, 15)} คู่ คำถาม-คำตอบ ที่ลูกค้ามักจะถามบ่อย
ตอบเป็น JSON array: [{"question":"...", "answer":"..."}]
คำตอบต้อง: สุภาพ กระชับ 1-3 ประโยค ภาษาไทย
ห้ามใส่ markdown หรือ code blocks ตอบ JSON อย่างเดียว`
      },
      {
        role: 'user' as const,
        content: `บริบทธุรกิจ: "${prompt}"
หมวด: ${category}
สร้าง FAQ ${Math.min(count, 15)} ข้อ:`
      }
    ];

    const raw = await generateAIResponse(messages, bot.model || 'gpt-4o', 0.8, 1500);

    let items: { question: string; answer: string }[] = [];
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      items = JSON.parse(cleaned);
    } catch {
      return res.status(400).json({ success: false, message: 'AI ไม่สามารถสร้าง Q&A ได้ กรุณาลองใหม่', raw });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'ไม่ได้รับ Q&A จาก AI' });
    }

    const created = [];
    for (const item of items) {
      if (!item.question || !item.answer) continue;
      const kb = await prisma.knowledgeBase.create({
        data: { botConfigId: bot.id, question: item.question.trim(), answer: item.answer.trim(), category, isActive: true },
      });
      created.push(kb);
    }

    return res.json({ success: true, message: `✅ สร้าง Q&A สำเร็จ ${created.length} ข้อ`, items: created, count: created.length });
  } catch (err: any) {
    console.error('Auto-seed error:', err);
    return res.status(500).json({ success: false, message: err.message || 'เกิดข้อผิดพลาด' });
  }
});

// ─── PUT /api/bot/extended — welcome message, quick replies, handoff keywords ──
router.put('/extended', async (req: Request, res: Response) => {
  try {
    const { welcomeMessage, quickReplies, handoffKeywords } = req.body;
    const companyId = await resolveCompanyId(req);
    const metadata = JSON.stringify({ welcomeMessage, quickReplies, handoffKeywords });
    const existing = await prisma.botConfig.findFirst({ where: { companyId } });
    const bot = existing
      ? await prisma.botConfig.update({ where: { id: existing.id }, data: { metadata } })
      : await prisma.botConfig.create({
          data: { tenantId: req.tenantId!, companyId, name: 'AI Bot', systemPrompt: 'คุณเป็น AI Assistant ที่เป็นมิตร', model: 'gpt-4o-mini', temperature: 0.7, isActive: true, metadata },
        });
    return res.json({ success: true, bot });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/bot/extended — ดึง extended config ──────────────────────────────
router.get('/extended', async (req: Request, res: Response) => {
  try {
    const companyId = await resolveCompanyId(req);
    const bot = await prisma.botConfig.findFirst({ where: { companyId } });
    let extended: any = {};
    if (bot && (bot as any).metadata) {
      try { extended = JSON.parse((bot as any).metadata); } catch { extended = {}; }
    }
    return res.json({ success: true, extended });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

export default router;

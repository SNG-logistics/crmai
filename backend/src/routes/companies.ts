import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken, requireRole } from '../middleware/auth';
import { getUserCompanyIds } from '../lib/company-scope';

const router = Router();
router.use(verifyToken);

// GET /api/companies — รายชื่อบริษัท (เฉพาะที่ user เข้าถึงได้) + จำนวนที่เกี่ยวข้อง
router.get('/', async (req: Request, res: Response) => {
  try {
    const allowed = await getUserCompanyIds(req.user!.id);
    const where: any = { tenantId: req.tenantId! };
    if (allowed) where.id = { in: allowed };
    const companies = await prisma.company.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { whatsappAccounts: true, conversations: true, members: true } } },
    });
    return res.json({ success: true, companies });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/companies — สร้างบริษัทใหม่ (admin/superadmin) + สร้าง BotConfig เริ่มต้นให้
router.post('/', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const name = (req.body.name || '').toString().trim();
    if (!name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อบริษัท' });

    const exists = await prisma.company.findFirst({ where: { tenantId, name } });
    if (exists) return res.status(409).json({ success: false, message: 'มีบริษัทชื่อนี้แล้ว' });

    const company = await prisma.company.create({
      data: { tenantId, name, slug: (req.body.slug || '').toString().trim() || null, logo: req.body.logo || null },
    });

    // BotConfig เริ่มต้นของบริษัท (per-company AI)
    await prisma.botConfig.create({
      data: {
        tenantId, companyId: company.id, name: `AI Bot — ${name}`,
        systemPrompt: `คุณเป็น AI Assistant ของ ${name} ตอบลูกค้าด้วยความเป็นมิตร สุภาพ กระชับ ภาษาไทย`,
        model: 'gpt-4o-mini', temperature: 0.7, isActive: true,
      },
    }).catch(() => {});

    return res.status(201).json({ success: true, company });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /api/companies/:id — แก้ไขบริษัท
router.patch('/:id', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.company.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบบริษัท' });
    const data: any = {};
    if (typeof req.body.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim();
    if (typeof req.body.slug === 'string') data.slug = req.body.slug.trim() || null;
    if (typeof req.body.logo === 'string') data.logo = req.body.logo || null;
    if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
    const company = await prisma.company.update({ where: { id: existing.id }, data });
    return res.json({ success: true, company });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/companies/:id — ลบบริษัท (กันลบถ้ายังมีบทสนทนา/เบอร์ผูกอยู่)
router.delete('/:id', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.company.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบบริษัท' });

    const [convCount, accCount] = await Promise.all([
      prisma.conversation.count({ where: { companyId: existing.id } }),
      prisma.whatsAppAccount.count({ where: { companyId: existing.id } }),
    ]);
    if (convCount > 0 || accCount > 0) {
      return res.status(400).json({ success: false, message: `ลบไม่ได้ — ยังมี ${convCount} บทสนทนา และ ${accCount} เบอร์ WhatsApp ผูกอยู่ กรุณาย้าย/ลบก่อน` });
    }
    await prisma.company.delete({ where: { id: existing.id } });
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

export default router;

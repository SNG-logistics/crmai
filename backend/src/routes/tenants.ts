import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { verifyToken, requireRole } from '../middleware/auth';
const router = Router();
router.use(verifyToken, requireRole('superadmin'));

router.get('/tenants', async (_req: Request, res: Response) => {
  try {
    const tenants = await prisma.tenant.findMany({ include: { _count: { select: { users: true, contacts: true, conversations: true } } }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, tenants });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.post('/tenants', async (req: Request, res: Response) => {
  try {
    const { name, slug, plan, adminEmail, adminPassword, adminName } = req.body;
    const tenant = await prisma.tenant.create({ data: { name, slug, plan: plan || 'starter' } });
    // Create admin user for this tenant
    const passwordHash = await bcrypt.hash(adminPassword || 'Admin@1234', 12);
    await prisma.user.create({ data: { tenantId: tenant.id, email: adminEmail, username: adminEmail, passwordHash, displayName: adminName || 'Admin', role: 'admin' } });
    // Create default bot config
    await prisma.botConfig.create({ data: { tenantId: tenant.id, name: 'AI Bot', systemPrompt: `คุณเป็น AI Assistant ของ ${name} ที่พร้อมช่วยเหลือลูกค้าด้วยความเป็นมิตรและมืออาชีพ` } });
    res.status(201).json({ success: true, tenant });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/tenants/:id', async (req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, tenant });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.delete('/tenants/:id', async (req: Request, res: Response) => {
  try {
    await prisma.tenant.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

export default router;

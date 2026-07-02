import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken, requireRole } from '../middleware/auth';
import { provisionFirebaseUser } from '../lib/firebase-users';
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
    const { name, slug, plan, adminPassword, adminName } = req.body;
    const adminEmail = (req.body.adminEmail || '').trim().toLowerCase();
    if (!adminEmail) return res.status(400).json({ success: false, message: 'กรุณากรอกอีเมลผู้ดูแล tenant' });

    const tenant = await prisma.tenant.create({ data: { name, slug, plan: plan || 'starter' } });

    // Default company for the new tenant (multi-company layer)
    const company = await prisma.company.create({ data: { tenantId: tenant.id, name, slug } });

    // Create the tenant admin — credential lives in Firebase, not locally.
    const admin = await prisma.user.create({
      data: { tenantId: tenant.id, email: adminEmail, username: adminEmail, displayName: adminName || 'Admin', role: 'admin' },
    });

    let firebaseWarning: string | undefined;
    try {
      const uid = await provisionFirebaseUser({
        email: adminEmail,
        password: adminPassword || 'Admin@1234',
        displayName: adminName || 'Admin',
        claims: { tenantId: tenant.id, role: 'admin', userId: admin.id },
      });
      if (uid) await prisma.user.update({ where: { id: admin.id }, data: { firebaseUid: uid } });
      else firebaseWarning = 'Firebase ยังไม่ได้ตั้งค่า — ผู้ดูแล tenant ยังเข้าสู่ระบบไม่ได้จนกว่าจะตั้งค่า Firebase';
    } catch (e: any) {
      // Roll back the half-created tenant so we never strand an un-loginnable admin.
      await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
      if (e.code === 'cross-tenant-email') return res.status(409).json({ success: false, message: e.message });
      return res.status(502).json({ success: false, message: `สร้างผู้ดูแลใน Firebase ไม่สำเร็จ: ${e.message}` });
    }

    // Create default bot config (ผูกกับบริษัทเริ่มต้น)
    await prisma.botConfig.create({ data: { tenantId: tenant.id, companyId: company.id, name: 'AI Bot', systemPrompt: `คุณเป็น AI Assistant ของ ${name} ที่พร้อมช่วยเหลือลูกค้าด้วยความเป็นมิตรและมืออาชีพ` } });
    res.status(201).json({ success: true, tenant, firebaseWarning });
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

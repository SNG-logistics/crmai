import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { verifyToken, requireRole } from '../middleware/auth';

const router = Router();
router.use(verifyToken);

// GET /api/users — list users in tenant
router.get('/', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.tenantId },
      select: {
        id: true, email: true, username: true, displayName: true,
        avatar: true, role: true, isActive: true,
        twoFactorEnabled: true, lastLoginAt: true, createdAt: true,
        _count: { select: { assignedConversations: true, tickets: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, users });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

// POST /api/users — create agent (admin only)
router.post('/', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const { email, username, displayName, role, password } = req.body;
    if (!email || !displayName) return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ' });
    const passwordHash = await bcrypt.hash(password || 'Agent@1234', 12);
    const user = await prisma.user.create({
      data: { tenantId: req.tenantId!, email, username: username || email, displayName, role: role || 'agent', passwordHash },
      select: { id: true, email: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
    });
    res.status(201).json({ success: true, user });
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'อีเมลนี้มีผู้ใช้แล้ว' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/users/:id — update user
router.patch('/:id', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const { displayName, role, isActive, password } = req.body;
    const data: any = {};
    if (displayName) data.displayName = displayName;
    if (role) data.role = role;
    if (typeof isActive === 'boolean') data.isActive = isActive;
    if (password) data.passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.update({
      where: { id: req.params.id, tenantId: req.tenantId },
      data,
      select: { id: true, email: true, displayName: true, role: true, isActive: true },
    });
    res.json({ success: true, user });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

// DELETE /api/users/:id — deactivate
router.delete('/:id', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    if (req.params.id === req.user!.id) return res.status(400).json({ success: false, message: 'ไม่สามารถลบตัวเองได้' });
    await prisma.user.update({ where: { id: req.params.id, tenantId: req.tenantId }, data: { isActive: false } });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

export default router;

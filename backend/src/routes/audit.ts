import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken, requireRole } from '../middleware/auth';

const router = Router();
router.use(verifyToken);
router.use(requireRole('admin', 'supervisor', 'superadmin'));

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { action, userId, search, page = '1', limit = '50' } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Build filter conditions
    const where: any = { tenantId };

    if (action) {
      where.action = String(action);
    }

    if (userId) {
      where.userId = String(userId);
    }

    if (search) {
      where.OR = [
        { action: { contains: String(search) } },
        { details: { contains: String(search) } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Fetch user details for each log manually to avoid strict relations in sqlite if userId is simple string
    const userIds = Array.from(new Set(logs.map(l => l.userId).filter(Boolean))) as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, email: true, username: true, role: true },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    const logsWithUser = logs.map(log => ({
      ...log,
      user: log.userId ? userMap.get(log.userId) || null : null,
    }));

    res.json({
      success: true,
      logs: logsWithUser,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: take,
        pages: Math.ceil(total / take),
      },
    });
  } catch (error: any) {
    console.error('[AUDIT LOGS ROUTE] Error:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติการใช้ระบบ' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { signSession, requireAuth } from '../middleware/auth';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'กรุณากรอก username และ password' });

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

    const token = signSession({ userId: user.id, username: user.username, isAdmin: user.isAdmin });
    res.cookie('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    res.json({ success: true, user: { id: user.id, username: user.username, isAdmin: user.isAdmin } });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('session');
  res.json({ success: true });
});

// GET /api/auth/me — check current session
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({
    success: true,
    user: {
      userId: (req as any).userId,
      username: (req as any).username,
      isAdmin: (req as any).isAdmin,
    },
  });
});

export default router;

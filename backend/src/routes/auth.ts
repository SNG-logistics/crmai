import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';

const router = Router();

/** POST /api/auth/login */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password, token: twoFAToken, tenantSlug } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'กรุณากรอก Username และ Password' });

    // Find tenant
    let user;
    if (tenantSlug) {
      const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (!tenant || !tenant.isActive) return res.status(400).json({ success: false, message: 'ไม่พบ Tenant หรือ Tenant ถูกระงับ' });
      user = await prisma.user.findFirst({
        where: { tenantId: tenant.id, OR: [{ username }, { email: username }], isActive: true },
        include: { tenant: true },
      });
    } else {
      user = await prisma.user.findFirst({
        where: { OR: [{ username }, { email: username }], isActive: true },
        include: { tenant: true },
      });
    }

    if (!user) return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });

    // 2FA check
    if (user.twoFactorEnabled) {
      if (!twoFAToken) return res.status(200).json({ success: false, requiresTwoFactor: true, message: 'กรุณาใส่รหัส 2FA' });
      const valid2FA = speakeasy.totp.verify({ secret: user.twoFactorSecret!, encoding: 'base32', token: twoFAToken, window: 1 });
      if (!valid2FA) return res.status(401).json({ success: false, message: 'รหัส 2FA ไม่ถูกต้อง' });
    }

    const payload = { id: user.id, tenantId: user.tenantId, email: user.email, username: user.username, role: user.role, displayName: user.displayName };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1d' });
    const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: { ...payload, avatar: user.avatar },
      tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, logo: user.tenant.logo },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
  }
});

/** POST /api/auth/refresh */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'No refresh token' });
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { id: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, tenantId: true, email: true, username: true, role: true, displayName: true, avatar: true, isActive: true },
    });
    if (!user || !user.isActive) return res.status(401).json({ success: false, message: 'User not found' });
    const payload = { id: user.id, tenantId: user.tenantId, email: user.email, username: user.username, role: user.role, displayName: user.displayName };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1d' });
    res.json({ success: true, accessToken });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
});

/** GET /api/auth/me */
router.get('/me', verifyToken, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { tenant: { select: { id: true, name: true, slug: true, logo: true } } },
  });
  res.json({ success: true, user });
});

/** POST /api/auth/2fa/setup */
router.post('/2fa/setup', verifyToken, async (req: Request, res: Response) => {
  const secret = speakeasy.generateSecret({ name: `CRM (${req.user!.username})`, length: 20 });
  await prisma.user.update({ where: { id: req.user!.id }, data: { twoFactorSecret: secret.base32 } });
  const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url!);
  res.json({ success: true, secret: secret.base32, qrCode: qrDataUrl });
});

/** POST /api/auth/2fa/verify */
router.post('/2fa/verify', verifyToken, async (req: Request, res: Response) => {
  const { token } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.twoFactorSecret) return res.status(400).json({ success: false, message: 'ยังไม่ได้ตั้งค่า 2FA' });
  const valid = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token, window: 1 });
  if (!valid) return res.status(400).json({ success: false, message: 'รหัส OTP ไม่ถูกต้อง' });
  await prisma.user.update({ where: { id: req.user!.id }, data: { twoFactorEnabled: true } });
  res.json({ success: true, message: 'เปิดใช้งาน 2FA เรียบร้อยแล้ว' });
});

/** POST /api/auth/2fa/disable */
router.post('/2fa/disable', verifyToken, async (req: Request, res: Response) => {
  await prisma.user.update({ where: { id: req.user!.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
  res.json({ success: true, message: 'ปิดใช้งาน 2FA แล้ว' });
});

export default router;

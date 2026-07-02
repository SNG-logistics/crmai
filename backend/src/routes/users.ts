import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken, requireRole } from '../middleware/auth';
import { createAuditLog } from '../lib/audit';
import {
  provisionFirebaseUser,
  setFirebasePassword,
  setFirebaseUserClaims,
  setFirebaseUserDisabled,
} from '../lib/firebase-users';
import { isFirebaseEnabled } from '../lib/firebase-admin';

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
        companies: { select: { companyId: true } },
        _count: { select: { assignedConversations: true, tickets: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // แปลง companies → companyIds[] (ว่าง = เห็นทุกบริษัท)
    const shaped = users.map((u: any) => ({ ...u, companyIds: (u.companies || []).map((c: any) => c.companyId), companies: undefined }));
    res.json({ success: true, users: shaped });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

// POST /api/users — create agent (admin only).
// Accounts are provisioned in Firebase Auth (the only place users can be created).
router.post('/', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const { username, displayName, role, password } = req.body;
    const email = (req.body.email || '').trim().toLowerCase(); // normalize — Firebase lowercases emails
    if (!email || !displayName) return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบ' });
    const desiredRole = role || 'agent';

    // Reactivate a previously soft-deleted account rather than colliding on the
    // per-tenant unique email (which would dead-end at 409 with no way back).
    const prior = await prisma.user.findFirst({
      where: { tenantId: req.tenantId!, email },
      select: { id: true, isActive: true },
    });
    if (prior && prior.isActive) {
      return res.status(409).json({ success: false, message: 'อีเมลนี้มีผู้ใช้แล้ว' });
    }
    const isReactivate = !!prior;

    // 1) Create or reactivate the local record (no local password — Firebase owns the credential).
    const user = prior
      ? await prisma.user.update({
          where: { id: prior.id },
          data: { isActive: true, displayName, role: desiredRole, username: username || email },
          select: { id: true, email: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
        })
      : await prisma.user.create({
          data: { tenantId: req.tenantId!, email, username: username || email, displayName, role: desiredRole },
          select: { id: true, email: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
        });

    // 2) Provision (or re-enable) the matching Firebase Auth account + custom claims.
    let firebaseWarning: string | undefined;
    try {
      const uid = await provisionFirebaseUser({
        email,
        password: password || 'Agent@1234',
        displayName,
        claims: { tenantId: req.tenantId!, role: user.role, userId: user.id },
      });
      if (uid) {
        await prisma.user.update({ where: { id: user.id }, data: { firebaseUid: uid } });
        await setFirebaseUserDisabled(uid, false).catch(() => {}); // re-enable if it had been disabled
      } else {
        firebaseWarning = 'Firebase ยังไม่ได้ตั้งค่า — สร้าง user ใน DB อย่างเดียว (ยังเข้าสู่ระบบไม่ได้จนกว่าจะตั้งค่า Firebase)';
      }
    } catch (e: any) {
      // Undo the local change so we never leave an account that can't log in.
      if (isReactivate) await prisma.user.update({ where: { id: user.id }, data: { isActive: false } }).catch(() => {});
      else await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      if (e.code === 'cross-tenant-email') {
        return res.status(409).json({ success: false, message: e.message });
      }
      return res.status(502).json({ success: false, message: `สร้างใน Firebase ไม่สำเร็จ: ${e.message}` });
    }

    await createAuditLog(
      req.tenantId!,
      req.user!.id,
      isReactivate ? 'USER_REACTIVATE' : 'USER_CREATE',
      { targetUserId: user.id, email: user.email, username: user.username, role: user.role, firebaseWarning },
      req.ip,
      req.headers['user-agent']
    );

    res.status(isReactivate ? 200 : 201).json({ success: true, user, firebaseWarning, reactivated: isReactivate });
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'อีเมลนี้มีผู้ใช้แล้ว' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/users/:id — update user (also syncs to Firebase)
router.patch('/:id', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const { displayName, role, isActive, password } = req.body;

    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      select: { id: true, tenantId: true, firebaseUid: true },
    });
    if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });

    const data: any = {};
    if (displayName) data.displayName = displayName;
    if (role) data.role = role;
    if (typeof isActive === 'boolean') data.isActive = isActive;
    // We no longer store a local password hash — passwords live in Firebase.

    const user = await prisma.user.update({
      where: { id: existing.id },
      data,
      select: { id: true, email: true, displayName: true, role: true, isActive: true },
    });

    // Sync to Firebase
    if (isFirebaseEnabled() && existing.firebaseUid) {
      try {
        if (password) await setFirebasePassword(existing.firebaseUid, password);
        if (role) await setFirebaseUserClaims(existing.firebaseUid, { tenantId: existing.tenantId, role, userId: existing.id });
        if (typeof isActive === 'boolean') await setFirebaseUserDisabled(existing.firebaseUid, !isActive);
      } catch (e: any) {
        console.warn('[users.patch] Firebase sync failed:', e.message);
      }
    }

    await createAuditLog(
      req.tenantId!,
      req.user!.id,
      'USER_UPDATE',
      { targetUserId: user.id, displayName: user.displayName, role: user.role, isActive: user.isActive },
      req.ip,
      req.headers['user-agent']
    );

    res.json({ success: true, user });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

// PUT /api/users/:id/companies — กำหนดบริษัทที่ user คนนี้เข้าถึงได้ (แอดมินตอบได้เฉพาะบริษัทที่ระบุ)
// body: { companyIds: string[] } — [] = เห็นทุกบริษัทใน tenant (ไม่จำกัด)
router.put('/:id/companies', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const target = await prisma.user.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
    if (!target) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });

    const ids: string[] = Array.isArray(req.body.companyIds) ? req.body.companyIds : [];
    // เก็บเฉพาะบริษัทที่อยู่ใน tenant นี้จริง
    const valid = ids.length
      ? (await prisma.company.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true } })).map((c) => c.id)
      : [];

    await prisma.userCompany.deleteMany({ where: { userId: target.id } });
    if (valid.length) {
      await prisma.userCompany.createMany({ data: valid.map((companyId) => ({ userId: target.id, companyId })) });
    }

    await createAuditLog(tenantId, req.user!.id, 'USER_COMPANIES_SET', { targetUserId: target.id, companyIds: valid }, req.ip, req.headers['user-agent']);
    return res.json({ success: true, companyIds: valid });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/users/:id — deactivate (also disables the Firebase account)
router.delete('/:id', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    if (req.params.id === req.user!.id) return res.status(400).json({ success: false, message: 'ไม่สามารถลบตัวเองได้' });

    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      select: { id: true, firebaseUid: true },
    });
    if (!existing) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });

    await prisma.user.update({ where: { id: existing.id }, data: { isActive: false } });

    if (existing.firebaseUid) {
      await setFirebaseUserDisabled(existing.firebaseUid, true).catch((e) =>
        console.warn('[users.delete] Firebase disable failed:', e.message)
      );
    }

    await createAuditLog(
      req.tenantId!,
      req.user!.id,
      'USER_DEACTIVATE',
      { targetUserId: req.params.id },
      req.ip,
      req.headers['user-agent']
    );

    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

export default router;

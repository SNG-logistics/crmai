import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken, requireRole } from '../middleware/auth';
import { canAccessCompany, getUserCompanyIds } from '../lib/company-scope';
import { encryptSecret } from '../services/backend-api-config.service';
import { normalizeBankPackages } from '../services/bank-notification.service';

const router = Router();
router.use(verifyToken);

function safePackages(value: string): string[] {
  try { return normalizeBankPackages(JSON.parse(value || '[]')); }
  catch { return []; }
}

function safeDevice(device: any) {
  const { secretEncrypted: _secret, ...safe } = device;
  let signerPins: Record<string, string> = {};
  try { signerPins = JSON.parse(device.signerPins || '{}'); } catch { signerPins = {}; }
  return { ...safe, allowedPackages: safePackages(device.allowedPackages), signerPins };
}

async function requireCompanyAccess(req: Request, companyId: string): Promise<boolean> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId: req.tenantId! },
    select: { id: true },
  });
  if (!company) return false;
  const allowed = await getUserCompanyIds(req.user!.id);
  return canAccessCompany(allowed, company.id);
}

function enrollmentResponse(req: Request, device: any, secret: string) {
  const configured = (process.env.PUBLIC_API_URL || process.env.BACKEND_PUBLIC_URL || '').replace(/\/+$/, '');
  const forwardedProto = String(req.header('x-forwarded-proto') || '').split(',')[0].trim();
  const forwardedHost = String(req.header('x-forwarded-host') || '').split(',')[0].trim();
  const protocol = forwardedProto === 'https' || forwardedProto === 'http' ? forwardedProto : req.protocol;
  const inferred = `${protocol}://${forwardedHost || req.get('host')}`;
  return {
    serverUrl: configured || inferred,
    endpoint: '/api/bank-notifications/ingest',
    publicId: device.publicId,
    deviceId: device.publicId,
    secret,
    allowedPackages: safePackages(device.allowedPackages),
  };
}

router.get('/devices', requireRole('admin', 'supervisor', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const companyId = String(req.query.companyId || '');
    if (!companyId || !(await requireCompanyAccess(req, companyId))) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    const devices = await prisma.bankCaptureDevice.findMany({
      where: { tenantId: req.tenantId!, companyId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, devices: devices.map(safeDevice) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/devices', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const companyId = String(req.body.companyId || '');
    if (!companyId || !(await requireCompanyAccess(req, companyId))) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    const name = String(req.body.name || '').trim();
    const allowedPackages = normalizeBankPackages(req.body.allowedPackages);
    if (!name || name.length > 100) {
      return res.status(400).json({ success: false, message: 'Device name is required (max 100 characters)' });
    }
    if (allowedPackages.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one exact bank package id is required' });
    }
    const secret = crypto.randomBytes(32).toString('base64url');
    const publicId = `bn_${crypto.randomBytes(18).toString('base64url')}`;
    const device = await prisma.bankCaptureDevice.create({
      data: {
        tenantId: req.tenantId!,
        companyId,
        publicId,
        name,
        secretEncrypted: encryptSecret(secret),
        allowedPackages: JSON.stringify(allowedPackages),
      },
    });
    return res.status(201).json({
      success: true,
      device: safeDevice(device),
      enrollment: enrollmentResponse(req, device, secret),
      message: 'Save the enrollment secret now; it will not be shown again.',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/devices/:id', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.bankCaptureDevice.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!existing || !(await requireCompanyAccess(req, existing.companyId))) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }
    const data: any = {};
    let removedPackages: string[] = [];
    if (typeof req.body.name === 'string') {
      const name = req.body.name.trim();
      if (!name || name.length > 100) return res.status(400).json({ success: false, message: 'Invalid device name' });
      data.name = name;
    }
    if (Array.isArray(req.body.allowedPackages)) {
      const packages = normalizeBankPackages(req.body.allowedPackages);
      if (!packages.length) return res.status(400).json({ success: false, message: 'At least one exact package id is required' });
      data.allowedPackages = JSON.stringify(packages);
      removedPackages = safePackages(existing.allowedPackages).filter(item => !packages.includes(item));
    }
    if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
    const device = await prisma.$transaction(async tx => {
      const updated = await tx.bankCaptureDevice.update({ where: { id: existing.id }, data });
      if (data.isActive === false) {
        await tx.bankNotification.updateMany({
          where: { deviceId: existing.id, matchedSlipId: null },
          data: {
            status: 'invalidated',
            matchReason: 'capture device suspended before the notification was matched',
          },
        });
      } else if (removedPackages.length > 0) {
        await tx.bankNotification.updateMany({
          where: {
            deviceId: existing.id,
            matchedSlipId: null,
            packageName: { in: removedPackages },
          },
          data: {
            status: 'invalidated',
            matchReason: 'bank package was removed from the device allow-list',
          },
        });
      }
      return updated;
    });
    return res.json({ success: true, device: safeDevice(device) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/devices/:id/rotate', requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.bankCaptureDevice.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!existing || !(await requireCompanyAccess(req, existing.companyId))) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }
    const secret = crypto.randomBytes(32).toString('base64url');
    const encryptedSecret = encryptSecret(secret);
    const device = await prisma.$transaction(async tx => {
      const updated = await tx.bankCaptureDevice.update({
        where: { id: existing.id },
        data: {
          secretEncrypted: encryptedSecret,
          credentialVersion: { increment: 1 },
          signerPins: '{}',
          isActive: true,
          lastError: null,
        },
      });
      await tx.bankNotification.updateMany({
        where: { deviceId: updated.id, matchedSlipId: null },
        data: {
          status: 'invalidated',
          matchReason: 'device credential was rotated before the notification was matched',
        },
      });
      await tx.bankRequestNonce.deleteMany({ where: { deviceId: updated.id } });
      return updated;
    });
    return res.json({
      success: true,
      device: safeDevice(device),
      enrollment: enrollmentResponse(req, device, secret),
      message: 'The old device secret is no longer valid.',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/transactions', requireRole('admin', 'supervisor', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const companyId = String(req.query.companyId || '');
    if (!companyId || !(await requireCompanyAccess(req, companyId))) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const status = String(req.query.status || '');
    const direction = String(req.query.direction || '');
    const notifications = await prisma.bankNotification.findMany({
      where: {
        tenantId: req.tenantId!,
        companyId,
        ...(status && status !== 'all' ? { status } : {}),
        ...(direction && direction !== 'all' ? { direction } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: limit,
      include: {
        device: { select: { id: true, publicId: true, name: true, isActive: true } },
        matchedSlip: {
          select: {
            id: true, status: true, conversationId: true, messageId: true,
            normalizedTransRef: true, bankMatchConfidence: true, bankMatchReason: true,
          },
        },
      },
    });
    const safe = notifications.map(({ rawPayloadEncrypted: _raw, senderName, ...item }) => ({
      ...item,
      senderName: senderName ? `${senderName.slice(0, 2)}***` : null,
    }));
    return res.json({ success: true, transactions: safe, notifications: safe });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

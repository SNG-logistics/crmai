import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken, requireRole } from '../middleware/auth';
import { emitToTenant } from '../lib/socket';
import { getUserCompanyIds } from '../lib/company-scope';

const router = Router();
router.use(verifyToken);

async function scopedWhere(req: Request, extra: Record<string, unknown> = {}) {
  const allowed = await getUserCompanyIds(req.user!.id);
  return {
    tenantId: req.tenantId!,
    ...(allowed ? { companyId: { in: allowed } } : {}),
    ...extra,
  };
}

// ─── GET /api/slips — รายการสลิปทั้งหมด ─────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, page = '1', limit = '20' } = req.query;

    const where: any = await scopedWhere(req);
    if (status && status !== 'all') where.status = status;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [slips, total] = await Promise.all([
      prisma.slipVerification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          bankNotification: {
            select: {
              id: true, packageName: true, bankHint: true, direction: true,
              amountDisplay: true, amountMinor: true, currency: true, transRef: true,
              accountSuffix: true, postedAt: true, receivedAt: true,
              parseConfidence: true, status: true, matchReason: true,
            },
          },
        },
      }),
      prisma.slipVerification.count({ where }),
    ]);

    res.json({ slips, total, page: parseInt(page as string), limit: take });
  } catch (err: any) {
    console.error('[Slips] List error:', err);
    res.status(500).json({ message: 'Failed to load slips' });
  }
});

// ─── GET /api/slips/stats — สรุปสถิติ ────────────────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const baseWhere: any = await scopedWhere(req);

    const [total, verified, fake, duplicate, error, pending] = await Promise.all([
      prisma.slipVerification.count({ where: baseWhere }),
      prisma.slipVerification.count({ where: { ...baseWhere, status: 'verified' } }),
      prisma.slipVerification.count({ where: { ...baseWhere, status: 'fake' } }),
      prisma.slipVerification.count({ where: { ...baseWhere, status: 'duplicate' } }),
      prisma.slipVerification.count({ where: { ...baseWhere, status: 'error' } }),
      prisma.slipVerification.count({ where: { ...baseWhere, status: 'pending' } }),
    ]);

    res.json({ total, verified, fake, duplicate, error, pending });
  } catch (err: any) {
    console.error('[Slips] Stats error:', err);
    res.status(500).json({ message: 'Failed to load stats' });
  }
});

// ─── GET /api/slips/:id — รายละเอียดสลิป ─────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const slip = await prisma.slipVerification.findFirst({
      where: await scopedWhere(req, { id: req.params.id }),
      include: {
        bankNotification: {
          select: {
            id: true, packageName: true, signerSha256: true, appVersion: true,
            bankHint: true, direction: true, amountDisplay: true, amountMinor: true,
            currency: true, transRef: true, accountSuffix: true, postedAt: true,
            capturedAt: true, receivedAt: true, parseConfidence: true,
            status: true, matchReason: true,
          },
        },
      },
    });

    if (!slip) return res.status(404).json({ message: 'Slip not found' });
    res.json(slip);
  } catch (err: any) {
    console.error('[Slips] Detail error:', err);
    res.status(500).json({ message: 'Failed to load slip' });
  }
});

// ─── PATCH /api/slips/:id — Admin override ────────────────────────────────────
router.patch('/:id', requireRole('admin', 'supervisor', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { status, notes } = req.body;
    const allowedStatuses = new Set(['pending', 'verified', 'fake']);
    if (status !== undefined && !allowedStatuses.has(status)) {
      return res.status(400).json({ message: 'Invalid slip status' });
    }
    if (status === undefined && notes === undefined) {
      return res.status(400).json({ message: 'Status or review note is required' });
    }

    const existing = await prisma.slipVerification.findFirst({
      where: await scopedWhere(req, { id: req.params.id }),
    });
    if (!existing) return res.status(404).json({ message: 'Slip not found' });

    let evidence: any = {};
    try {
      const parsed = JSON.parse(existing.notes || '{}');
      evidence = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { evidence = { legacyNote: existing.notes }; }
    const reviewedAt = new Date().toISOString();
    const manualReview = {
      note: String(notes || ''),
      userId: req.user!.id,
      reviewedAt,
      previousStatus: existing.status,
      nextStatus: status || existing.status,
    };
    const previousReviews = Array.isArray(evidence.manualReviews)
      ? evidence.manualReviews
      : (evidence.manualReview ? [evidence.manualReview] : []);
    evidence.manualReviews = [...previousReviews, manualReview].slice(-50);
    evidence.manualReview = manualReview;
    const structuredNotes = JSON.stringify(evidence);

    const updated = await prisma.$transaction(async tx => {
      if (status && status !== 'verified') {
        // Query by matchedSlipId inside the write transaction. This closes the
        // race where a matcher claims an event after the pre-transaction read.
        await tx.bankNotification.updateMany({
          where: { matchedSlipId: existing.id },
          data: {
            matchedSlipId: null,
            status: 'invalidated',
            matchReason: 'released_by_manual_review',
          },
        });
      }
      const slip = await tx.slipVerification.update({
        where: { id: req.params.id },
        data: {
          ...(status && {
            status,
            verifiedBy: 'manual',
            ...(status !== 'verified' ? {
              bankMatchConfidence: null,
              bankMatchReason: 'overridden_by_manual_review',
              bankMatchedAt: null,
            } : {}),
          }),
          notes: structuredNotes,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: req.user!.id,
          action: 'SLIP_MANUAL_REVIEW',
          details: JSON.stringify({
            slipId: existing.id,
            companyId: existing.companyId,
            conversationId: existing.conversationId,
            previousStatus: existing.status,
            nextStatus: slip.status,
            note: manualReview.note,
            reviewedAt,
          }),
          ipAddress: req.ip || null,
          userAgent: req.headers['user-agent'] || null,
        },
      });
      return slip;
    });

    emitToTenant(tenantId, 'conversation_updated', {
      id: existing.conversationId,
      conversationId: existing.conversationId,
      slipId: updated.id,
      slipStatus: updated.status,
    });
    res.json(updated);
  } catch (err: any) {
    console.error('[Slips] Override error:', err);
    res.status(500).json({ message: 'Failed to update slip' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';

const router = Router();
router.use(verifyToken);

// ─── GET /api/slips — รายการสลิปทั้งหมด ─────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId;
    const { status, page = '1', limit = '20' } = req.query;

    const where: any = { tenantId };
    if (status && status !== 'all') where.status = status;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [slips, total] = await Promise.all([
      prisma.slipVerification.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take,
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
    const tenantId = (req as any).user.tenantId;

    const [total, verified, fake, duplicate, error, pending] = await Promise.all([
      prisma.slipVerification.count({ where: { tenantId } }),
      prisma.slipVerification.count({ where: { tenantId, status: 'verified' } }),
      prisma.slipVerification.count({ where: { tenantId, status: 'fake' } }),
      prisma.slipVerification.count({ where: { tenantId, status: 'duplicate' } }),
      prisma.slipVerification.count({ where: { tenantId, status: 'error' } }),
      prisma.slipVerification.count({ where: { tenantId, status: 'pending' } }),
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
    const tenantId = (req as any).user.tenantId;
    const slip = await prisma.slipVerification.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!slip) return res.status(404).json({ message: 'Slip not found' });
    res.json(slip);
  } catch (err: any) {
    console.error('[Slips] Detail error:', err);
    res.status(500).json({ message: 'Failed to load slip' });
  }
});

// ─── PATCH /api/slips/:id — Admin override ────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user.tenantId;
    const { status, notes } = req.body;

    const existing = await prisma.slipVerification.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!existing) return res.status(404).json({ message: 'Slip not found' });

    const updated = await prisma.slipVerification.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status, verifiedBy: 'manual' }),
        ...(notes !== undefined && { notes }),
      },
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[Slips] Override error:', err);
    res.status(500).json({ message: 'Failed to update slip' });
  }
});

export default router;

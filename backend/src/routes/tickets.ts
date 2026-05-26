import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
const router = Router();
router.use(verifyToken);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, priority, assignedTo, page = '1', limit = '20' } = req.query;
    const where: any = { tenantId: req.tenantId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedTo === 'me') where.assignedToId = req.user!.id;
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({ where, include: { contact: { select: { id: true, displayName: true, avatar: true } }, assignedTo: { select: { id: true, displayName: true, avatar: true } } }, orderBy: { createdAt: 'desc' }, skip: (parseInt(page as string) - 1) * parseInt(limit as string), take: parseInt(limit as string) }),
      prisma.ticket.count({ where }),
    ]);
    res.json({ success: true, tickets, total });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, description, contactId, conversationId, priority, assignedToId } = req.body;
    const ticket = await prisma.ticket.create({ data: { tenantId: req.tenantId!, title, description, contactId, conversationId, priority: priority || 'medium', assignedToId } });
    res.status(201).json({ success: true, ticket });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        contact: { select: { id: true, displayName: true, avatar: true, email: true, phone: true, lineUserId: true, telegramId: true } },
        assignedTo: { select: { id: true, displayName: true, avatar: true, email: true, role: true } },
        conversation: { include: { messages: { orderBy: { createdAt: 'asc' }, take: 10 } } },
      },
    });
    if (!ticket) return res.status(404).json({ success: false, message: 'ไม่พบ Ticket' });
    res.json({ success: true, ticket });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.ticket.update({ where: { id: req.params.id, tenantId: req.tenantId }, data: { ...req.body, ...(req.body.status === 'resolved' && { resolvedAt: new Date() }) } });
    res.json({ success: true, ticket });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.ticket.delete({ where: { id: req.params.id, tenantId: req.tenantId } });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

export default router;

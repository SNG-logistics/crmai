import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';

const router = Router();
router.use(verifyToken);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, tag, channel, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = { tenantId: req.tenantId };
    if (search) where.OR = [{ displayName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }];
    if (channel === 'line') where.lineUserId = { not: null };
    if (channel === 'telegram') where.telegramId = { not: null };
    if (tag) where.tags = { some: { tag: { name: tag } } };
    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({ where, include: { tags: { include: { tag: true } }, conversations: { orderBy: { lastMessageAt: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' }, skip, take: parseInt(limit as string) }),
      prisma.contact.count({ where }),
    ]);
    res.json({ success: true, contacts, total });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        tags: { include: { tag: true } },
        conversations: { orderBy: { lastMessageAt: 'desc' }, take: 10, include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 }, assignedTo: { select: { id: true, displayName: true } } } },
        tickets: { orderBy: { createdAt: 'desc' }, take: 10, include: { assignedTo: { select: { id: true, displayName: true } } } },
      },
    });
    if (!contact) return res.status(404).json({ success: false, message: 'ไม่พบลูกค้า' });
    res.json({ success: true, contact });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});


router.post('/', async (req: Request, res: Response) => {
  try {
    const { displayName, email, phone, firstName, lastName, notes } = req.body;
    const contact = await prisma.contact.create({ data: { tenantId: req.tenantId!, displayName, email, phone, firstName, lastName, notes } });
    res.status(201).json({ success: true, contact });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const contact = await prisma.contact.update({ where: { id: req.params.id, tenantId: req.tenantId }, data: req.body });
    res.json({ success: true, contact });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.contact.delete({ where: { id: req.params.id, tenantId: req.tenantId } });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

export default router;

import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import { createAuditLog } from '../lib/audit';

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
    return res.json({ success: true, contact });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});


router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      displayName, email, phone, firstName, lastName, notes,
      username, affiliateCode, memberType,
      totalDeposit, totalWithdraw, totalProfit,
      depositCount, withdrawCount,
      registeredAt, firstDepositAt, lastDepositAt,
      customFields,
    } = req.body;
    const contact = await prisma.contact.create({
      data: {
        tenantId: req.tenantId!, displayName, email, phone, firstName, lastName, notes,
        ...(username && { username }),
        ...(affiliateCode && { affiliateCode }),
        ...(memberType && { memberType }),
        ...(totalDeposit !== undefined && { totalDeposit: parseFloat(totalDeposit) || 0 }),
        ...(totalWithdraw !== undefined && { totalWithdraw: parseFloat(totalWithdraw) || 0 }),
        ...(totalProfit !== undefined && { totalProfit: parseFloat(totalProfit) || 0 }),
        ...(depositCount !== undefined && { depositCount: parseInt(depositCount) || 0 }),
        ...(withdrawCount !== undefined && { withdrawCount: parseInt(withdrawCount) || 0 }),
        ...(registeredAt && { registeredAt: new Date(registeredAt) }),
        ...(firstDepositAt && { firstDepositAt: new Date(firstDepositAt) }),
        ...(lastDepositAt && { lastDepositAt: new Date(lastDepositAt) }),
        ...(customFields && { customFields: typeof customFields === 'string' ? customFields : JSON.stringify(customFields) }),
      },
    });
    
    await createAuditLog(
      req.tenantId!,
      req.user!.id,
      'CONTACT_CREATE',
      { contactId: contact.id, displayName: contact.displayName },
      req.ip,
      req.headers['user-agent']
    );

    return res.status(201).json({ success: true, contact });
  } catch (e: any) {
    console.error('Contact create error:', e.message);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const contact = await prisma.contact.update({ where: { id: req.params.id, tenantId: req.tenantId }, data: req.body });

    await createAuditLog(
      req.tenantId!,
      req.user!.id,
      'CONTACT_UPDATE',
      { contactId: contact.id, displayName: contact.displayName },
      req.ip,
      req.headers['user-agent']
    );

    return res.json({ success: true, contact });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.contact.delete({ where: { id: req.params.id, tenantId: req.tenantId } });

    await createAuditLog(
      req.tenantId!,
      req.user!.id,
      'CONTACT_DELETE',
      { contactId: req.params.id },
      req.ip,
      req.headers['user-agent']
    );

    return res.json({ success: true });
  } catch { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

// ─── GET /api/contacts/by-line-user-id/:lineUserId ───────────────────────────
// ดึงโปรไฟล์ลูกค้าในระบบ CRM ด้วย LINE User ID พร้อมรายการตั๋วปัญหาล่าสุด
router.get('/by-line-user-id/:lineUserId', async (req: Request, res: Response) => {
  try {
    const { lineUserId } = req.params;
    const contact = await prisma.contact.findFirst({
      where: { tenantId: req.tenantId, lineUserId },
      include: {
        tickets: {
          where: { status: { notIn: ['resolved', 'closed'] } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!contact) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลลูกค้าสำหรับ LINE User ID นี้' });
    }

    return res.json({ success: true, contact });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message || 'เกิดข้อผิดพลาด' });
  }
});

// ─── POST /api/contacts/link-line-user ───────────────────────────────────────
// ผูกบัญชีสมาชิกเว็บ CRM เข้ากับ LINE User ID (พร้อมระบบรวมบัญชีและย้ายประวัติธุรกรรม/แชทเดิม)
router.post('/link-line-user', async (req: Request, res: Response) => {
  try {
    const { lineUserId, username, phone } = req.body;
    if (!lineUserId) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุ lineUserId' });
    }
    if (!username && !phone) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุ username หรือเบอร์โทรศัพท์อย่างน้อยหนึ่งอย่าง' });
    }

    // 1. ค้นหา Contact สมาชิกเว็บ (CRM) ที่ระบุ
    const webContact = await prisma.contact.findFirst({
      where: {
        tenantId: req.tenantId,
        OR: [
          username ? { username: username.trim() } : null,
          phone ? { phone: phone.trim() } : null,
        ].filter(Boolean) as any,
      },
    });

    if (!webContact) {
      return res.status(404).json({ success: false, message: 'ไม่พบสมาชิกนี้ในระบบ CRM' });
    }

    // 2. ค้นหา LINE contact เดิมที่เกิดจากการแชทหาบอท เพื่อรวมเข้ากับบัญชีเว็บ
    const lineContact = await prisma.contact.findFirst({
      where: { tenantId: req.tenantId, lineUserId },
    });

    // 3. หากมี LINE contact ที่มี lineUserId นี้อยู่แล้วและเป็นคนละตัวกับบัญชีเว็บ ให้ทำการ Merge บัญชี
    if (lineContact && lineContact.id !== webContact.id) {
      console.log(`[Link LINE] Merging contact ${lineContact.id} (LINE) into ${webContact.id} (Web)`);

      // ย้ายการสนทนาทั้งหมด
      await prisma.conversation.updateMany({
        where: { tenantId: req.tenantId, contactId: lineContact.id },
        data: { contactId: webContact.id },
      });

      // ย้ายตั๋วปัญหาทั้งหมด
      await prisma.ticket.updateMany({
        where: { tenantId: req.tenantId, contactId: lineContact.id },
        data: { contactId: webContact.id },
      });

      // ย้ายประวัติการโทร
      await prisma.callLog.updateMany({
        where: { tenantId: req.tenantId, contactId: lineContact.id },
        data: { contactId: webContact.id },
      });

      // ย้ายประวัติทางการเงิน
      await prisma.financialRecord.updateMany({
        where: { tenantId: req.tenantId, contactId: lineContact.id },
        data: { contactId: webContact.id },
      });

      // ลบ ContactTag ของ LINE contact ออกก่อนเพื่อไม่ให้ชน
      await prisma.contactTag.deleteMany({
        where: { contactId: lineContact.id },
      });

      // ลบตัว LINE contact เดิมออกเพื่อปลดล็อก unique constraint tenantId_lineUserId
      await prisma.contact.delete({
        where: { id: lineContact.id },
      });
    }

    // 4. บันทึก/อัปเดต lineUserId บน Web Contact
    const updatedContact = await prisma.contact.update({
      where: { id: webContact.id },
      data: { lineUserId },
    });

    // 5. บันทึก Audit Log
    await createAuditLog(
      req.tenantId!,
      req.user!.id,
      'CONTACT_LINK_LINE',
      { contactId: updatedContact.id, username: updatedContact.username, lineUserId },
      req.ip,
      req.headers['user-agent']
    );

    return res.json({ success: true, contact: updatedContact, message: 'ผูกบัญชีและรวบรวมประวัติลูกค้าเรียบร้อยแล้ว' });
  } catch (e: any) {
    console.error('[Link LINE] Error:', e.message);
    return res.status(500).json({ success: false, message: e.message || 'เกิดข้อผิดพลาดขณะผูกบัญชี' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';

const router = Router();
router.use(verifyToken);

const normalizeTrigger = (t: string) => {
  let s = (t || '').trim().replace(/\s+/g, '');
  if (!s.startsWith('/')) s = '/' + s;
  return s.toLowerCase();
};

/** GET /api/quick-replies — รายการ key ลัดทั้งหมดของ tenant */
router.get('/', async (req: Request, res: Response) => {
  try {
    const items = await prisma.quickReply.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: [{ category: 'asc' }, { trigger: 'asc' }],
    });
    res.json({ success: true, items });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

/** POST /api/quick-replies — เพิ่ม key ลัด */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { trigger, title, content, category, aiCompose } = req.body || {};
    if (!trigger?.trim() || !title?.trim() || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'กรุณากรอก key ลัด, ชื่อ และเนื้อหาให้ครบ' });
    }
    const item = await prisma.quickReply.create({
      data: {
        tenantId: req.tenantId!,
        trigger: normalizeTrigger(trigger),
        title: title.trim(),
        content: content.trim(),
        category: (category || 'ทั่วไป').trim(),
        aiCompose: aiCompose === true,   // ค่าเริ่มต้น: ตอบตรงตามที่ตั้งไว้ (ไม่ให้ AI แต่งใหม่)
      },
    });
    res.json({ success: true, item });
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ success: false, message: 'key ลัดนี้ถูกใช้แล้ว' });
    res.status(500).json({ success: false, message: e.message });
  }
});

/** PATCH /api/quick-replies/:id — แก้ไข key ลัด */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const exists = await prisma.quickReply.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!exists) return res.status(404).json({ success: false, message: 'ไม่พบ key ลัด' });

    const { trigger, title, content, category, aiCompose, isActive } = req.body || {};
    const item = await prisma.quickReply.update({
      where: { id: req.params.id },
      data: {
        ...(trigger !== undefined ? { trigger: normalizeTrigger(trigger) } : {}),
        ...(title !== undefined ? { title: String(title).trim() } : {}),
        ...(content !== undefined ? { content: String(content).trim() } : {}),
        ...(category !== undefined ? { category: String(category).trim() || 'ทั่วไป' } : {}),
        ...(aiCompose !== undefined ? { aiCompose: !!aiCompose } : {}),
        ...(isActive !== undefined ? { isActive: !!isActive } : {}),
      },
    });
    res.json({ success: true, item });
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ success: false, message: 'key ลัดนี้ถูกใช้แล้ว' });
    res.status(500).json({ success: false, message: e.message });
  }
});

/** DELETE /api/quick-replies/:id — ลบ key ลัด */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const exists = await prisma.quickReply.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!exists) return res.status(404).json({ success: false, message: 'ไม่พบ key ลัด' });
    await prisma.quickReply.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

/** POST /api/quick-replies/:id/compose — คืนคำตอบของ key ลัด
 *  ✅ Key ลัด = คำตอบสำเร็จรูปที่ตั้งไว้ → คืน "เนื้อหาที่ตั้งไว้เป๊ะๆ" เสมอ
 *     (เดิมส่งเข้า AI แต่งใหม่ → เพี้ยน/ตอบมั่ว) แอดมินตรวจ/แก้ในช่องพิมพ์ได้ก่อนส่งอยู่แล้ว
 */
router.post('/:id/compose', async (req: Request, res: Response) => {
  try {
    const qr = await prisma.quickReply.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!qr) return res.status(404).json({ success: false, message: 'ไม่พบ key ลัด' });
    return res.json({ success: true, text: qr.content });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;

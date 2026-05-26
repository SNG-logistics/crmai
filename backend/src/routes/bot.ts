import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import { generateAIResponse } from '../services/ai.service';
const router = Router();
router.use(verifyToken);

router.get('/', async (req: Request, res: Response) => {
  try {
    const bot = await prisma.botConfig.findUnique({ where: { tenantId: req.tenantId }, include: { knowledgeBase: { where: { isActive: true }, orderBy: { createdAt: 'desc' } } } });
    res.json({ success: true, bot });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const { systemPrompt, model, temperature, isActive } = req.body;
    const bot = await prisma.botConfig.upsert({
      where: { tenantId: req.tenantId },
      create: { tenantId: req.tenantId!, name: 'AI Bot', systemPrompt, model, temperature, isActive },
      update: { systemPrompt, model, temperature, isActive },
    });
    res.json({ success: true, bot });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.post('/knowledge', async (req: Request, res: Response) => {
  try {
    const bot = await prisma.botConfig.findUnique({ where: { tenantId: req.tenantId } });
    if (!bot) return res.status(404).json({ success: false, message: 'ยังไม่มี Bot Config' });
    const item = await prisma.knowledgeBase.create({ data: { botConfigId: bot.id, ...req.body } });
    res.status(201).json({ success: true, item });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.put('/knowledge/:id', async (req: Request, res: Response) => {
  try {
    const item = await prisma.knowledgeBase.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, item });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.delete('/knowledge/:id', async (req: Request, res: Response) => {
  try {
    await prisma.knowledgeBase.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.post('/test', async (req: Request, res: Response) => {
  try {
    const { message, history = [] } = req.body;
    const bot = await prisma.botConfig.findUnique({ where: { tenantId: req.tenantId }, include: { knowledgeBase: { where: { isActive: true } } } });
    const kbContext = (bot?.knowledgeBase || []).map((kb: any) => `Q: ${kb.question}\nA: ${kb.answer}`).join('\n\n');
    const systemPrompt = `${bot?.systemPrompt || 'คุณเป็น AI Assistant ที่เป็นมิตร'}\n\nฐานความรู้:\n${kbContext}`;
    const messages = [{ role: 'system' as const, content: systemPrompt }, ...history, { role: 'user' as const, content: message }];
    const reply = await generateAIResponse(messages, bot?.model || 'gpt-4o', bot?.temperature || 0.7);
    res.json({ success: true, reply });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

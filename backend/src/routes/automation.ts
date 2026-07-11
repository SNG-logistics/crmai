import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getChannelConfig } from '../lib/channel-config';
import { verifyToken } from '../middleware/auth';
import { sendLinePush, lineTextMessage, lineFlexMessage } from '../services/line.service';
import { sendTelegramMessage } from '../services/telegram.service';

const router = Router();
router.use(verifyToken);

// ─── Message Templates (stored in-process, extendable to DB) ─────────────────
const DEFAULT_TEMPLATES = [
  { id: 'welcome',       name: 'ยินดีต้อนรับสมาชิกใหม่',     category: 'onboarding',   icon: '👋', message: 'สวัสดีค่ะ 🎉 ยินดีต้อนรับสู่ระบบ! ลงทะเบียนเสร็จแล้ว กรุณาฝากเงินเพื่อเริ่มเล่นได้เลยค่ะ 💰' },
  { id: 'first_deposit', name: 'แจ้งเตือนฝากครั้งแรก',        category: 'deposit',      icon: '💰', message: '💰 ขอบคุณที่ฝากเงินครั้งแรกค่ะ! รับโบนัสต้อนรับ 100% ทันที เงื่อนไขตามที่ระบุในเว็บไซต์ค่ะ 🎁' },
  { id: 'no_deposit',    name: 'กระตุ้นสมัครไม่ฝาก',          category: 'retention',    icon: '⚠️', message: '⚠️ สวัสดีค่ะ คุณสมัครสมาชิกแล้วแต่ยังไม่ได้ฝากเงิน ฝากวันนี้รับโบนัสพิเศษ 50% เลยค่ะ! 🎉' },
  { id: 'comeback',      name: 'ดึงลูกค้ากลับ (Winback)',     category: 'retention',    icon: '🔙', message: '🔙 เราคิดถึงคุณ! ไม่ได้เข้าใช้งานสักพักแล้ว กลับมาเล่นรับโบนัส 30% ทันทีค่ะ 💎' },
  { id: 'promotion',     name: 'โปรโมชั่นทั่วไป',              category: 'marketing',    icon: '🎁', message: '🎁 โปรโมชั่นพิเศษ! ฝากเงินวันนี้รับโบนัสเพิ่ม ลิมิตเวลาเท่านั้น อย่าพลาดนะค่ะ 🔥' },
  { id: 'vip_invite',   name: 'เชิญเข้า VIP',                  category: 'vip',          icon: '👑', message: '👑 ยินดีด้วยค่ะ! คุณได้รับการเชิญเข้าสู่โปรแกรม VIP พิเศษ สิทธิประโยชน์มากมายรอคุณอยู่ค่ะ 🌟' },
  { id: 'cashback',      name: 'แจ้งคืนเงิน Cashback',         category: 'reward',       icon: '💸', message: '💸 ดีใจมากเลยค่ะ! Cashback สัปดาห์นี้ของคุณพร้อมแล้ว กรุณาติดต่อ Admin เพื่อรับเงินได้เลยค่ะ 🎊' },
  { id: 'birthday',     name: 'อวยพรวันเกิด',                   category: 'engagement',   icon: '🎂', message: '🎂 สุขสันต์วันเกิดค่ะ! เราขอมอบโบนัสพิเศษเนื่องในโอกาสวันเกิดของคุณ ขอให้มีความสุขมากๆ นะค่ะ 🎉' },
];

// GET /api/automation/templates
router.get('/templates', (req: Request, res: Response) => {
  res.json({ success: true, templates: DEFAULT_TEMPLATES });
});

// ─── Automation Rules CRUD ────────────────────────────────────────────────────

// GET /api/automation
router.get('/', async (req: Request, res: Response) => {
  try {
    const rules = await prisma.automationRule.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const parsed = rules.map(r => ({
      ...r,
      trigger:    JSON.parse(r.trigger    || '{}'),
      conditions: JSON.parse(r.conditions || '[]'),
      actions:    JSON.parse(r.actions    || '[]'),
    }));
    res.json({ success: true, rules: parsed });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/automation
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, isActive = true, trigger, conditions = [], actions } = req.body;
    const rule = await prisma.automationRule.create({
      data: {
        tenantId:   req.tenantId!,
        name,
        isActive,
        trigger:    JSON.stringify(trigger),
        conditions: JSON.stringify(conditions),
        actions:    JSON.stringify(actions),
      },
    });
    res.status(201).json({ success: true, rule: { ...rule, trigger, conditions, actions } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /api/automation/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, isActive, trigger, conditions, actions } = req.body;
    const data: any = {};
    if (name      !== undefined) data.name      = name;
    if (isActive  !== undefined) data.isActive   = isActive;
    if (trigger   !== undefined) data.trigger    = JSON.stringify(trigger);
    if (conditions!== undefined) data.conditions = JSON.stringify(conditions);
    if (actions   !== undefined) data.actions    = JSON.stringify(actions);

    const rule = await prisma.automationRule.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ success: true, rule: { ...rule, trigger: JSON.parse(rule.trigger), conditions: JSON.parse(rule.conditions), actions: JSON.parse(rule.actions) } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/automation/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.automationRule.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── Manual Trigger: Run automation rule NOW ──────────────────────────────────
// POST /api/automation/:id/run
router.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const rule = await prisma.automationRule.findUnique({ where: { id: req.params.id } });
    if (!rule || rule.tenantId !== tenantId) return res.status(404).json({ success: false, message: 'ไม่พบ rule' });

    const actions: any[] = JSON.parse(rule.actions || '[]');
    const trigger: any   = JSON.parse(rule.trigger  || '{}');

    // Build target contacts based on trigger type
    let contactWhere: any = { tenantId };
    if (trigger.type === 'no_deposit') {
      const days = trigger.config?.daysAfter || 1;
      contactWhere.totalDeposit = 0;
      contactWhere.createdAt    = { gte: new Date(Date.now() - days * 86400000) };
    } else if (trigger.type === 'new_member') {
      contactWhere.createdAt = { gte: new Date(Date.now() - 86400000) };
    } else if (trigger.type === 'inactive') {
      const days = trigger.config?.daysInactive || 7;
      contactWhere.lastDepositAt = { lte: new Date(Date.now() - days * 86400000) };
    }

    const contacts = await prisma.contact.findMany({ where: contactWhere, take: 500 });
    let sent = 0, failed = 0;

    for (const action of actions) {
      if (action.type !== 'send_message') continue;
      const { channels = [], message = '' } = action.config || {};

      for (const contact of contacts) {
        for (const ch of channels) {
          try {
            const cfg = await getChannelConfig(tenantId, ch);
            if (!cfg) continue;
            const config = JSON.parse(cfg.config);
            if (ch === 'line' && contact.lineUserId) {
              await sendLinePush(contact.lineUserId, [lineTextMessage(message)], config.accessToken);
              sent++;
            } else if (ch === 'telegram' && contact.telegramId) {
              await sendTelegramMessage(contact.telegramId, message, config.botToken);
              sent++;
            }
          } catch { failed++; }
        }
      }
    }

    res.json({ success: true, sent, failed, total: contacts.length });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── Auto-run statistics ──────────────────────────────────────────────────────
// GET /api/automation/stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const [total, active] = await Promise.all([
      prisma.automationRule.count({ where: { tenantId } }),
      prisma.automationRule.count({ where: { tenantId, isActive: true } }),
    ]);
    // Count contacts that would match each trigger
    const noDepositContacts = await prisma.contact.count({ where: { tenantId, totalDeposit: 0 } });
    const newTodayContacts  = await prisma.contact.count({ where: { tenantId, createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } });
    res.json({ success: true, stats: { total, active, inactive: total - active, noDepositContacts, newTodayContacts } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;

import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';

const router = Router();
router.use(verifyToken);

// ─── KPI WEIGHTS ─────────────────────────────────────────────────────────────
const W = { callRate: 0.20, depositRate: 0.35, depositAmount: 0.30, netProfit: 0.15 };

function calcScore(actual: any, target: any): number {
  if (!target) return 0;
  const s = {
    callRate:      target.answerRateTarget   > 0 ? Math.min((actual.callRate      / target.answerRateTarget)   * 100, 150) : 0,
    depositRate:   target.depositRateTarget  > 0 ? Math.min((actual.depositRate   / target.depositRateTarget)  * 100, 150) : 0,
    depositAmount: target.depositAmountTarget > 0 ? Math.min((actual.depositAmount / target.depositAmountTarget) * 100, 150) : 0,
    netProfit:     target.profitTarget       > 0 ? Math.min((actual.netProfit     / target.profitTarget)       * 100, 150) : 0,
  };
  return +(s.callRate * W.callRate + s.depositRate * W.depositRate + s.depositAmount * W.depositAmount + s.netProfit * W.netProfit).toFixed(2);
}

function calcGrade(score: number): string {
  if (score >= 120) return 'A';
  if (score >= 110) return 'B+';
  if (score >= 90)  return 'B';
  if (score >= 80)  return 'C+';
  if (score >= 70)  return 'C';
  if (score >= 60)  return 'D';
  return 'F';
}

function calcSD(agentScore: number, allScores: number[]): number {
  if (allScores.length < 2) return 0;
  const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const variance = allScores.reduce((s, x) => s + Math.pow(x - avg, 2), 0) / allScores.length;
  const sd = Math.sqrt(variance);
  return sd === 0 ? 0 : +((agentScore - avg) / sd).toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/telesales/kpi?from=&to=&agentId=
// ─────────────────────────────────────────────────────────────────────────────
router.get('/kpi', async (req: Request, res: Response) => {
  try {
    const { from, to, agentId } = req.query;
    const tenantId = req.tenantId!;
    const dateFrom = from ? new Date(from as string) : new Date(new Date().setDate(1));
    const dateTo   = to   ? new Date(new Date(to as string).setHours(23,59,59)) : new Date();

    const where: any = { tenantId, calledAt: { gte: dateFrom, lte: dateTo } };
    if (agentId) where.agentId = agentId;

    const logs = await prisma.callLog.findMany({ where });

    const total      = logs.length;
    const answered   = logs.filter(l => l.status === 'answered').length;
    const noAnswer   = logs.filter(l => l.status === 'no_answer').length;
    const repeated   = total - new Set(logs.map(l => l.contactId)).size;
    const deposited  = logs.filter(l => l.depositedAfter).length;
    const notDeposited = answered - deposited;

    // New members today not yet deposited
    const noDepositCount = await prisma.contact.count({
      where: { tenantId, totalDeposit: 0, registeredAt: { gte: new Date(new Date().setDate(new Date().getDate() - 30)) } },
    });

    res.json({ success: true, kpi: { total, answered, noAnswer, repeated, deposited, notDeposited, noDepositCount } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/telesales/performance?period=2026-05
// ─────────────────────────────────────────────────────────────────────────────
router.get('/performance', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const period = (req.query.period as string) || new Date().toISOString().slice(0, 7);
    const [year, month] = period.split('-').map(Number);
    const dateFrom = new Date(year, month - 1, 1);
    const dateTo   = new Date(year, month, 0, 23, 59, 59);

    const [agents, targets, logs] = await Promise.all([
      prisma.user.findMany({ where: { tenantId, isActive: true, role: { in: ['agent', 'supervisor'] } }, select: { id: true, displayName: true, avatar: true, role: true } }),
      prisma.telesalesTarget.findMany({ where: { tenantId, period } }),
      prisma.callLog.findMany({ where: { tenantId, calledAt: { gte: dateFrom, lte: dateTo } } }),
    ]);

    const targetMap = new Map(targets.map(t => [t.agentId, t]));

    const performances = agents.map(agent => {
      const agentLogs = logs.filter(l => l.agentId === agent.id);
      const callTotal = agentLogs.length;
      const answered  = agentLogs.filter(l => l.status === 'answered').length;
      const noAnswer  = agentLogs.filter(l => l.status === 'no_answer').length;
      const depositedLogs = agentLogs.filter(l => l.depositedAfter);
      const depositAmount = depositedLogs.reduce((s, l) => s + (l.depositAmount || 0), 0);
      const lastCall  = agentLogs.sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime())[0]?.calledAt || null;

      const callRate    = callTotal > 0 ? answered / callTotal : 0;
      const depositRate = answered  > 0 ? depositedLogs.length / answered : 0;
      const target = targetMap.get(agent.id);

      const actual = { callRate, depositRate, depositAmount, netProfit: depositAmount * 0.05 };
      const score = calcScore(actual, target);

      return { agent, callTotal, answered, noAnswer, depositedCount: depositedLogs.length, depositAmount, callRate, depositRate, score, target, lastCallAt: lastCall };
    });

    // คำนวณ SD
    const allScores = performances.map(p => p.score);
    const result = performances.map(p => ({
      ...p,
      sd: calcSD(p.score, allScores),
      grade: calcGrade(p.score),
    }));

    res.json({ success: true, performances: result.sort((a, b) => b.score - a.score), period });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/telesales/members?tab=new|old&status=&agentId=&page=&limit=
// ─────────────────────────────────────────────────────────────────────────────
router.get('/members', async (req: Request, res: Response) => {
  try {
    const { tab = 'new', status, agentId, page = '1', limit = '25', search } = req.query;
    const tenantId = req.tenantId!;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { tenantId };
    if (tab === 'new') {
      where.memberType = 'new';
      // สมาชิกใหม่ภายใน 30 วัน
      where.createdAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    } else {
      where.memberType = { not: 'new' };
    }
    if (status)  where.tsStatus = status;
    if (agentId) where.tsAssignedToId = agentId;
    if (search)  where.OR = [
      { displayName: { contains: search as string } },
      { phone:       { contains: search as string } },
      { username:    { contains: search as string } },
    ];

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: {
          callLogs: { orderBy: { calledAt: 'desc' }, take: 1, include: { agent: { select: { id: true, displayName: true } } } },
          tags: { include: { tag: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip, take: parseInt(limit as string),
      }),
      prisma.contact.count({ where }),
    ]);

    res.json({ success: true, contacts, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/telesales/no-deposit?page=&limit=
// ─────────────────────────────────────────────────────────────────────────────
router.get('/no-deposit', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '25', from, to } = req.query;
    const tenantId = req.tenantId!;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const dateFrom = from ? new Date(from as string) : new Date(new Date().setDate(new Date().getDate() - 30));
    const dateTo   = to   ? new Date(new Date(to as string).setHours(23,59,59)) : new Date();

    const where: any = { tenantId, totalDeposit: 0, createdAt: { gte: dateFrom, lte: dateTo } };

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        select: { id: true, displayName: true, phone: true, username: true, lineUserId: true, telegramId: true, tsStatus: true, affiliateCode: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip, take: parseInt(limit as string),
      }),
      prisma.contact.count({ where }),
    ]);

    res.json({ success: true, contacts, total });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/telesales/call — บันทึกการโทร
// ─────────────────────────────────────────────────────────────────────────────
router.post('/call', async (req: Request, res: Response) => {
  try {
    const { contactId, status, duration, notes, depositedAfter, depositAmount, scheduledAt } = req.body;
    if (!contactId || !status) return res.status(400).json({ success: false, message: 'กรุณาระบุ contactId และ status' });

    const tenantId = req.tenantId!;
    const agentId  = req.user!.id;

    // บันทึก call log
    const log = await prisma.callLog.create({
      data: { tenantId, contactId, agentId, status, duration, notes, depositedAfter: !!depositedAfter, depositAmount: depositAmount || null, scheduledAt: scheduledAt ? new Date(scheduledAt) : null },
    });

    // อัปเดต status ของ Contact
    const tsStatus = status === 'answered' ? 'answered' : status === 'no_answer' ? 'no_answer' : status === 'done' ? 'done' : 'calling';
    await prisma.contact.update({
      where: { id: contactId },
      data: { tsStatus, tsAssignedToId: agentId, ...(depositedAfter && depositAmount ? { totalDeposit: { increment: depositAmount }, depositCount: { increment: 1 }, firstDepositAt: { set: new Date() } } : {}) },
    });

    res.status(201).json({ success: true, log });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/telesales/assign — มอบหมาย agent
// ─────────────────────────────────────────────────────────────────────────────
router.post('/assign', async (req: Request, res: Response) => {
  try {
    const { contactIds, agentId } = req.body;
    if (!contactIds?.length || !agentId) return res.status(400).json({ success: false, message: 'กรุณาระบุ contactIds และ agentId' });

    await prisma.contact.updateMany({
      where: { id: { in: contactIds }, tenantId: req.tenantId },
      data: { tsAssignedToId: agentId, tsStatus: 'pending' },
    });

    res.json({ success: true, updated: contactIds.length });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/telesales/call-history/:contactId
// ─────────────────────────────────────────────────────────────────────────────
router.get('/call-history/:contactId', async (req: Request, res: Response) => {
  try {
    const logs = await prisma.callLog.findMany({
      where: { contactId: req.params.contactId, tenantId: req.tenantId },
      include: { agent: { select: { id: true, displayName: true, avatar: true } } },
      orderBy: { calledAt: 'desc' },
    });
    res.json({ success: true, logs });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET/PUT /api/telesales/targets — จัดการเป้าหมาย
// ─────────────────────────────────────────────────────────────────────────────
router.get('/targets', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || new Date().toISOString().slice(0, 7);
    const targets = await prisma.telesalesTarget.findMany({
      where: { tenantId: req.tenantId, period },
      include: { agent: { select: { id: true, displayName: true } } },
    });
    res.json({ success: true, targets, period });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/targets', async (req: Request, res: Response) => {
  try {
    const { agentId, period, callTarget, answerRateTarget, depositRateTarget, depositAmountTarget, profitTarget } = req.body;
    const target = await prisma.telesalesTarget.upsert({
      where: { tenantId_agentId_period: { tenantId: req.tenantId!, agentId, period } },
      update: { callTarget, answerRateTarget, depositRateTarget, depositAmountTarget, profitTarget },
      create: { tenantId: req.tenantId!, agentId, period, callTarget, answerRateTarget, depositRateTarget, depositAmountTarget, profitTarget },
    });
    res.json({ success: true, target });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/telesales/dashboard — รวม KPI + performance summary สำหรับหน้าหลัก
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const period = (req.query.period as string) || new Date().toISOString().slice(0, 7);
    const [year, month] = period.split('-').map(Number);
    const dateFrom = new Date(year, month - 1, 1);
    const dateTo   = new Date(year, month, 0, 23, 59, 59);
    const today    = new Date(); today.setHours(0, 0, 0, 0);

    const [totalCalls, answeredCalls, depositedCalls, newContacts, noDepositCount, agents] = await Promise.all([
      prisma.callLog.count({ where: { tenantId, calledAt: { gte: dateFrom, lte: dateTo } } }),
      prisma.callLog.count({ where: { tenantId, status: 'answered', calledAt: { gte: dateFrom, lte: dateTo } } }),
      prisma.callLog.count({ where: { tenantId, depositedAfter: true, calledAt: { gte: dateFrom, lte: dateTo } } }),
      prisma.contact.count({ where: { tenantId, createdAt: { gte: today } } }),
      prisma.contact.count({ where: { tenantId, totalDeposit: 0 } }),
      prisma.user.count({ where: { tenantId, role: { in: ['agent', 'supervisor'] }, isActive: true } }),
    ]);

    const callsToday = await prisma.callLog.count({ where: { tenantId, calledAt: { gte: today } } });

    res.json({
      success: true,
      dashboard: {
        period,
        totalCalls, answeredCalls, depositedCalls,
        callRate: totalCalls > 0 ? (answeredCalls / totalCalls) : 0,
        depositRate: answeredCalls > 0 ? (depositedCalls / answeredCalls) : 0,
        newContacts, noDepositCount, agents, callsToday,
      },
    });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/telesales/call-logs — ดู call log ทั้งหมด (paginated)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/call-logs', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '25', agentId, status, from, to } = req.query;
    const tenantId = req.tenantId!;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { tenantId };
    if (agentId) where.agentId = agentId;
    if (status)  where.status  = status;
    if (from || to) {
      where.calledAt = {};
      if (from) where.calledAt.gte = new Date(from as string);
      if (to)   where.calledAt.lte = new Date(new Date(to as string).setHours(23, 59, 59));
    }

    const [logs, total] = await Promise.all([
      prisma.callLog.findMany({
        where, skip, take: parseInt(limit as string),
        include: {
          contact: { select: { id: true, displayName: true, phone: true, username: true } },
          agent:   { select: { id: true, displayName: true } },
        },
        orderBy: { calledAt: 'desc' },
      }),
      prisma.callLog.count({ where }),
    ]);

    res.json({ success: true, logs, total, page: parseInt(page as string) });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;

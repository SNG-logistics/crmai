import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
const router = Router();
router.use(verifyToken);

router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const now = new Date();
    const todayStart = new Date(now.setHours(0,0,0,0));
    const [totalConversations, openConversations, resolvedToday, totalContacts, onlineAgents, lineCount, telegramCount, pendingTickets] = await Promise.all([
      prisma.conversation.count({ where: { tenantId } }),
      prisma.conversation.count({ where: { tenantId, status: { in: ['open', 'bot', 'pending'] } } }),
      prisma.conversation.count({ where: { tenantId, status: 'resolved', resolvedAt: { gte: todayStart } } }),
      prisma.contact.count({ where: { tenantId } }),
      prisma.user.count({ where: { tenantId, isActive: true } }),
      prisma.conversation.count({ where: { tenantId, channel: 'line' } }),
      prisma.conversation.count({ where: { tenantId, channel: 'telegram' } }),
      prisma.ticket.count({ where: { tenantId, status: { in: ['open', 'in_progress'] } } }),
    ]);
    const recentMessages = await prisma.message.groupBy({
      by: ['createdAt'],
      where: { tenantId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      _count: true,
    });
    res.json({ success: true, stats: { totalConversations, openConversations, resolvedToday, totalContacts, onlineAgents, lineCount, telegramCount, pendingTickets, recentMessages } });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.get('/agents', async (req: Request, res: Response) => {
  try {
    const agents = await prisma.user.findMany({
      where: { tenantId: req.tenantId, role: { in: ['agent', 'supervisor', 'admin'] } },
      select: { id: true, displayName: true, avatar: true, role: true, lastLoginAt: true,
        _count: { select: { assignedConversations: true } } },
    });
    res.json({ success: true, agents });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

router.get('/channels', async (req: Request, res: Response) => {
  try {
    const [line, telegram] = await Promise.all([
      prisma.conversation.count({ where: { tenantId: req.tenantId, channel: 'line' } }),
      prisma.conversation.count({ where: { tenantId: req.tenantId, channel: 'telegram' } }),
    ]);
    res.json({ success: true, channels: { line, telegram, total: line + telegram } });
  } catch { res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/daily?from=&to=&affiliateCode=
// รายงาน สมัคร-ฝากถอน รายวัน (ตารางที่ 1)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { from, to, affiliateCode } = req.query;
    const dateFrom = from ? new Date(from as string) : new Date(new Date().setDate(1));
    const dateTo   = to   ? new Date(new Date(to as string).setHours(23,59,59,999)) : new Date();

    const contactWhere: any = { tenantId, createdAt: { gte: dateFrom, lte: dateTo } };
    if (affiliateCode) contactWhere.affiliateCode = affiliateCode;

    const contacts = await prisma.contact.findMany({
      where: contactWhere,
      select: { id: true, createdAt: true, firstDepositAt: true, totalDeposit: true, totalWithdraw: true, depositCount: true, withdrawCount: true },
    });

    // Group by date
    const byDate = new Map<string, { registered: number; withDeposit: number; noDeposit: number; totalDeposit: number; totalWithdraw: number; depositTransactions: number; withdrawTransactions: number }>();

    const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    let cur = new Date(dateFrom);
    while (cur <= dateTo) {
      byDate.set(cur.toISOString().slice(0, 10), { registered: 0, withDeposit: 0, noDeposit: 0, totalDeposit: 0, totalWithdraw: 0, depositTransactions: 0, withdrawTransactions: 0 });
      cur = addDays(cur, 1);
    }

    for (const c of contacts) {
      const d = new Date(c.createdAt).toISOString().slice(0, 10);
      if (!byDate.has(d)) continue;
      const row = byDate.get(d)!;
      row.registered++;
      if (c.totalDeposit > 0) {
        row.withDeposit++;
        row.totalDeposit += c.totalDeposit;
        row.depositTransactions += c.depositCount;
      } else {
        row.noDeposit++;
      }
      row.totalWithdraw += c.totalWithdraw;
      row.withdrawTransactions += c.withdrawCount;
    }

    const rows = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, r]) => ({
      date,
      registered:          r.registered,
      withDeposit:         r.withDeposit,
      withDepositPct:      r.registered > 0 ? +((r.withDeposit / r.registered) * 100).toFixed(2) : 0,
      noDeposit:           r.noDeposit,
      noDepositPct:        r.registered > 0 ? +((r.noDeposit / r.registered) * 100).toFixed(2) : 0,
      totalDeposit:        +r.totalDeposit.toFixed(2),
      avgDepositPerPerson: r.withDeposit > 0 ? +(r.totalDeposit / r.withDeposit).toFixed(2) : 0,
      totalWithdraw:       +r.totalWithdraw.toFixed(2),
      depositTransactions: r.depositTransactions,
      withdrawTransactions:r.withdrawTransactions,
      netProfit:           +(r.totalDeposit - r.totalWithdraw).toFixed(2),
    }));

    // Summary totals
    const summary = rows.reduce((s, r) => ({
      registered:    s.registered + r.registered,
      withDeposit:   s.withDeposit + r.withDeposit,
      noDeposit:     s.noDeposit + r.noDeposit,
      totalDeposit:  s.totalDeposit + r.totalDeposit,
      totalWithdraw: s.totalWithdraw + r.totalWithdraw,
      netProfit:     s.netProfit + r.netProfit,
    }), { registered: 0, withDeposit: 0, noDeposit: 0, totalDeposit: 0, totalWithdraw: 0, netProfit: 0 });

    res.json({ success: true, rows, summary });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/cohort?from=&to=  (ตารางที่ 2 — ฝากครั้งที่ 1-10+)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cohort', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { from, to } = req.query;
    const dateFrom = from ? new Date(from as string) : new Date(new Date().setDate(1));
    const dateTo   = to   ? new Date(new Date(to as string).setHours(23,59,59,999)) : new Date();

    const contacts = await prisma.contact.findMany({
      where: { tenantId, createdAt: { gte: dateFrom, lte: dateTo } },
      select: { createdAt: true, depositCount: true, withdrawCount: true, totalDeposit: true, totalWithdraw: true },
    });

    const cohortMap = new Map<string, { total: number; deposit: number[]; withdraw: number[] }>();
    const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    let cur = new Date(dateFrom);
    while (cur <= dateTo) {
      cohortMap.set(cur.toISOString().slice(0, 10), { total: 0, deposit: Array(10).fill(0), withdraw: Array(10).fill(0) });
      cur = addDays(cur, 1);
    }

    for (const c of contacts) {
      const d = new Date(c.createdAt).toISOString().slice(0, 10);
      if (!cohortMap.has(d)) continue;
      const row = cohortMap.get(d)!;
      row.total++;
      const depIdx = Math.min(c.depositCount, 10) - 1;
      if (depIdx >= 0) row.deposit[depIdx]++;
      const witIdx = Math.min(c.withdrawCount, 10) - 1;
      if (witIdx >= 0) row.withdraw[witIdx]++;
    }

    const rows = [...cohortMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, r]) => ({
      date, total: r.total,
      depositCohort: r.deposit.map((v, i) => ({ round: i + 1, count: v, pct: r.total > 0 ? +((v / r.total) * 100).toFixed(1) : 0 })),
      withdrawCohort: r.withdraw.map((v, i) => ({ round: i + 1, count: v, pct: r.total > 0 ? +((v / r.total) * 100).toFixed(1) : 0 })),
    }));

    res.json({ success: true, rows });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/members/new?from=&to=&page=&limit=
// รายงาน สมัคร-ฝากถอน-การเล่น สมาชิกใหม่
// ─────────────────────────────────────────────────────────────────────────────
router.get('/members/new', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { from, to, affiliateCode, page = '1', limit = '25' } = req.query;
    const dateFrom = from ? new Date(from as string) : new Date(new Date().setDate(1));
    const dateTo   = to   ? new Date(new Date(to as string).setHours(23,59,59,999)) : new Date();
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { tenantId, createdAt: { gte: dateFrom, lte: dateTo } };
    if (affiliateCode) where.affiliateCode = affiliateCode;

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        select: {
          id: true, displayName: true, username: true, phone: true,
          affiliateCode: true, lineUserId: true, telegramId: true,
          totalDeposit: true, totalWithdraw: true, depositCount: true, withdrawCount: true,
          createdAt: true, firstDepositAt: true,
          financials: { select: { gameBreakdown: true, depositAmount: true, withdrawAmount: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip, take: parseInt(limit as string),
      }),
      prisma.contact.count({ where }),
    ]);

    const result = contacts.map(c => {
      // Merge game breakdown from all financial records
      const gameTotal = { lottery: 0, slot: 0, casino: 0, fishing: 0, sport: 0, other: 0 };
      for (const f of c.financials) {
        try {
          const g = JSON.parse(f.gameBreakdown || '{}');
          for (const key of Object.keys(gameTotal)) {
            (gameTotal as any)[key] += g[key] || 0;
          }
        } catch {}
      }
      const netProfit = +(c.totalDeposit - c.totalWithdraw).toFixed(2);
      return { ...c, financials: undefined, gameBreakdown: gameTotal, netProfit };
    });

    res.json({ success: true, members: result, total, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/partners?from=&to=
// รายงาน พาร์ทเนอร์/Affiliate
// ─────────────────────────────────────────────────────────────────────────────
router.get('/partners', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { from, to } = req.query;
    const dateFrom = from ? new Date(from as string) : new Date(new Date().setDate(1));
    const dateTo   = to   ? new Date(new Date(to as string).setHours(23,59,59,999)) : new Date();

    const contacts = await prisma.contact.findMany({
      where: { tenantId, createdAt: { gte: dateFrom, lte: dateTo } },
      select: { affiliateCode: true, totalDeposit: true, totalWithdraw: true, depositCount: true },
    });

    const partnerMap = new Map<string, { code: string; members: number; withDeposit: number; totalDeposit: number; totalWithdraw: number }>();
    for (const c of contacts) {
      const code = c.affiliateCode || '(ไม่มีพาร์ทเนอร์)';
      if (!partnerMap.has(code)) partnerMap.set(code, { code, members: 0, withDeposit: 0, totalDeposit: 0, totalWithdraw: 0 });
      const r = partnerMap.get(code)!;
      r.members++;
      if (c.totalDeposit > 0) { r.withDeposit++; r.totalDeposit += c.totalDeposit; }
      r.totalWithdraw += c.totalWithdraw;
    }

    const partners = [...partnerMap.values()]
      .map(p => ({ ...p, conversionRate: p.members > 0 ? +((p.withDeposit / p.members) * 100).toFixed(1) : 0, netProfit: +(p.totalDeposit - p.totalWithdraw).toFixed(2) }))
      .sort((a, b) => b.totalDeposit - a.totalDeposit);

    res.json({ success: true, partners });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/funnel?from=&to=
// Member funnel: สมัคร → ฝากครั้งแรก → ฝากซ้ำ
// ─────────────────────────────────────────────────────────────────────────────
router.get('/funnel', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { from, to } = req.query;
    const dateFrom = from ? new Date(from as string) : new Date(new Date().setDate(1));
    const dateTo   = to   ? new Date(new Date(to as string).setHours(23,59,59,999)) : new Date();

    const [total, firstDeposit, repeat, vip] = await Promise.all([
      prisma.contact.count({ where: { tenantId, createdAt: { gte: dateFrom, lte: dateTo } } }),
      prisma.contact.count({ where: { tenantId, createdAt: { gte: dateFrom, lte: dateTo }, depositCount: { gte: 1 } } }),
      prisma.contact.count({ where: { tenantId, createdAt: { gte: dateFrom, lte: dateTo }, depositCount: { gte: 3 } } }),
      prisma.contact.count({ where: { tenantId, createdAt: { gte: dateFrom, lte: dateTo }, totalDeposit: { gte: 50000 } } }),
    ]);

    res.json({ success: true, funnel: [
      { stage: 'สมัครสมาชิก',    count: total,        pct: 100 },
      { stage: 'ฝากครั้งแรก',   count: firstDeposit,  pct: total > 0 ? +((firstDeposit / total) * 100).toFixed(1) : 0 },
      { stage: 'ฝากซ้ำ (3+)',   count: repeat,        pct: total > 0 ? +((repeat / total) * 100).toFixed(1) : 0 },
      { stage: 'VIP (฿50k+)',   count: vip,           pct: total > 0 ? +((vip / total) * 100).toFixed(1) : 0 },
    ]});
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;

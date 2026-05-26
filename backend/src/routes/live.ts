import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import { emitToTenant } from '../lib/socket';

const router = Router();
router.use(verifyToken);

// ─── GET /api/live/stats — ดึง KPI ทั้งหมด real-time ──────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const [
      // Conversations
      openChats, botChats, pendingChats, resolvedToday,
      newChatsToday, totalChats,
      // Contacts
      totalContacts, newContactsToday,
      // Messages
      msgToday,
      // Tickets
      openTickets,
      // Agents
      agents,
      // Financial
      depositToday, withdrawToday, depositYesterday, withdrawYesterday,
      // Recent chats (live feed)
      recentConvs,
    ] = await Promise.all([
      prisma.conversation.count({ where: { tenantId, status: 'open' } }),
      prisma.conversation.count({ where: { tenantId, status: 'bot' } }),
      prisma.conversation.count({ where: { tenantId, status: 'pending' } }),
      prisma.conversation.count({ where: { tenantId, status: 'resolved', resolvedAt: { gte: todayStart } } }),
      prisma.conversation.count({ where: { tenantId, createdAt: { gte: todayStart } } }),
      prisma.conversation.count({ where: { tenantId } }),
      prisma.contact.count({ where: { tenantId } }),
      prisma.contact.count({ where: { tenantId, createdAt: { gte: todayStart } } }),
      prisma.message.count({ where: { tenantId, createdAt: { gte: todayStart } } }),
      prisma.ticket.count({ where: { tenantId, status: { in: ['open', 'in_progress'] } } }),
      prisma.user.findMany({
        where: { tenantId, isActive: true, role: { in: ['agent', 'supervisor', 'admin'] } },
        select: {
          id: true, displayName: true, avatar: true, role: true, lastLoginAt: true,
          _count: { select: { assignedConversations: { where: { status: { in: ['open', 'pending'] } } } } },
        },
        orderBy: { displayName: 'asc' },
      }),
      // Financial — ยอดฝากวันนี้ (aggregate depositAmount)
      prisma.financialRecord.aggregate({
        where: { tenantId, date: todayStart.toISOString().slice(0, 10) },
        _sum: { depositAmount: true, depositCount: true },
      }),
      // Financial — ยอดถอนวันนี้ (aggregate withdrawAmount)
      prisma.financialRecord.aggregate({
        where: { tenantId, date: todayStart.toISOString().slice(0, 10) },
        _sum: { withdrawAmount: true, withdrawCount: true },
      }),
      // เมื่อวาน
      prisma.financialRecord.aggregate({
        where: { tenantId, date: yesterdayStart.toISOString().slice(0, 10) },
        _sum: { depositAmount: true, withdrawAmount: true },
      }),
      prisma.financialRecord.aggregate({
        where: { tenantId, date: yesterdayStart.toISOString().slice(0, 10) },
        _sum: { withdrawAmount: true },
      }),
      // 10 แชทล่าสุดที่ active
      prisma.conversation.findMany({
        where: { tenantId, status: { in: ['open', 'pending', 'bot'] } },
        include: {
          contact: { select: { displayName: true, avatar: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
      }),
    ]);

    const depToday  = depositToday._sum.depositAmount   || 0;
    const withToday = withdrawToday._sum.withdrawAmount  || 0;
    const depYest   = depositYesterday._sum.depositAmount  || 0;
    const withYest  = depositYesterday._sum.withdrawAmount || 0;

    const depCountToday  = depositToday._sum.depositCount   || 0;
    const withCountToday = withdrawToday._sum.withdrawCount  || 0;

    // Agent status: online = lastLogin ใน 30 นาที
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const agentsWithStatus = agents.map((a: any) => ({
      ...a,
      isOnline: a.lastLoginAt ? new Date(a.lastLoginAt) > thirtyMinAgo : false,
      activeChatCount: a._count.assignedConversations,
    }));

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        // Chats
        openChats, botChats, pendingChats, resolvedToday,
        newChatsToday, totalChats,
        // Contacts
        totalContacts, newContactsToday,
        // Messages
        msgToday,
        // Tickets
        openTickets,
        // Financial
        depositToday: depToday,
        withdrawToday: withToday,
        netToday: depToday - withToday,
        depositCount: depCountToday,
        withdrawCount: withCountToday,
        depositYesterday: depYest,
        withdrawYesterday: withYest,
        netYesterday: depYest - withYest,
        // Pct change
        depositChange: depYest > 0 ? ((depToday - depYest) / depYest) * 100 : 0,
        withdrawChange: withYest > 0 ? ((withToday - withYest) / withYest) * 100 : 0,
      },
      agents: agentsWithStatus,
      recentConvs: recentConvs.map((c: any) => ({
        id: c.id,
        contactName: c.contact.displayName,
        channel: c.channel,
        status: c.status,
        lastMsg: c.messages[0]?.content?.slice(0, 60) || '',
        lastMsgAt: c.messages[0]?.createdAt || c.lastMessageAt,
      })),
    });
  } catch (err: any) {
    console.error('Live stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/live/agent-status — อัปเดต status agent ──────────────────────
router.post('/agent-status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body; // online, away, busy, offline
    // Update lastLoginAt as proxy for "online"
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { lastLoginAt: status === 'offline' ? new Date(0) : new Date() },
    });
    // Broadcast to all agents in tenant
    emitToTenant(req.tenantId!, 'agent_status_change', {
      userId: req.user!.id,
      displayName: req.user!.displayName,
      status,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

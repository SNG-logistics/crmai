import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import axios from 'axios';

const router = Router();
router.use(verifyToken);

// PKM Backend URL (configurable per tenant)
const PKM_BASE = process.env.PKM_BASE_URL || 'https://pkm-bo.gamingcenter.club';

// ─── POST /api/pkm/config — บันทึก credentials ──────────────────────────────
router.post('/config', async (req: Request, res: Response) => {
  try {
    const { baseUrl, username, password, domain } = req.body;
    const tenantId = req.tenantId!;
    await prisma.channelConfig.upsert({
      where: { tenantId_channel: { tenantId, channel: 'pkm' } },
      create: {
        tenantId, channel: 'pkm', isActive: true,
        config: JSON.stringify({ baseUrl: baseUrl || PKM_BASE, username, password, domain }),
      },
      update: {
        config: JSON.stringify({ baseUrl: baseUrl || PKM_BASE, username, password, domain }),
        isActive: true,
      },
    });
    res.json({ success: true, message: '✅ บันทึก PKM config แล้ว' });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/pkm/config ──────────────────────────────────────────────────────
router.get('/config', async (req: Request, res: Response) => {
  try {
    const cfg = await prisma.channelConfig.findFirst({
      where: { tenantId: req.tenantId!, channel: 'pkm' },
    });
    if (!cfg) return res.json({ success: true, configured: false });
    const config = JSON.parse(cfg.config as string || '{}');
    res.json({ success: true, configured: true, baseUrl: config.baseUrl, username: config.username, domain: config.domain });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/pkm/import-member — Import สมาชิก 1 คนจากข้อมูลที่ paste ───────
// รับข้อมูลที่ copy มาจากหน้า PKM memberlist
router.post('/import-member', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const {
      displayName, phone, username,
      bank, bankAccount,
      credit, balance,
      depositTotal, withdrawTotal,
      registeredAt, memberType,
      affiliateCode, status,
      promotions = [],
    } = req.body;

    if (!username && !phone) {
      return res.status(400).json({ success: false, message: 'ต้องระบุ username หรือ phone' });
    }

    const existing = await prisma.contact.findFirst({
      where: { tenantId, OR: [{ username }, { phone }].filter(Boolean) },
    });

    const data: any = {
      displayName: displayName || username || phone,
      phone:    phone    || null,
      username: username || null,
      notes: [
        bank        ? `ธนาคาร: ${bank}`           : null,
        bankAccount ? `เลขบัญชี: ${bankAccount}`  : null,
        memberType  ? `ประเภท: ${memberType}`      : null,
        affiliateCode ? `แนะนำโดย: ${affiliateCode}` : null,
        status      ? `สถานะ: ${status}`           : null,
      ].filter(Boolean).join('\n'),
      totalDeposit:  parseFloat(depositTotal || '0') || 0,
      totalWithdraw: parseFloat(withdrawTotal || '0') || 0,
      totalProfit:   (parseFloat(depositTotal || '0') - parseFloat(withdrawTotal || '0')) || 0,
      leadScore:     parseFloat(depositTotal || '0') > 0 ? 50 : 10,
      registeredAt:  registeredAt ? new Date(registeredAt) : null,
      memberType:    memberType || 'new',
      customFields: JSON.stringify({
        bank, bankAccount,
        credit:  parseFloat(credit  || '0') || 0,
        balance: parseFloat(balance || '0') || 0,
        promotions,
        pkm_synced_at: new Date().toISOString(),
      }),
    };

    let contact;
    if (existing) {
      contact = await prisma.contact.update({ where: { id: existing.id }, data });
    } else {
      contact = await prisma.contact.create({ data: { tenantId, ...data } });
    }

    res.json({
      success: true,
      action: existing ? 'updated' : 'created',
      contact: { id: contact.id, displayName: contact.displayName, username: contact.username, phone: contact.phone },
    });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/pkm/import-bulk — Import หลายคนพร้อมกัน ────────────────────────
router.post('/import-bulk', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { members = [] } = req.body;
    if (!Array.isArray(members) || members.length === 0)
      return res.status(400).json({ success: false, message: 'members array ว่าง' });

    let inserted = 0, updated = 0, errors = 0;
    const errorDetail: string[] = [];

    for (const m of members) {
      try {
        const existing = await prisma.contact.findFirst({
          where: { tenantId, OR: [m.username && { username: m.username }, m.phone && { phone: m.phone }].filter(Boolean) as any },
        });
        const data: any = {
          displayName:  m.displayName || m.username || m.phone || 'Unknown',
          phone:        m.phone        || null,
          username:     m.username     || null,
          affiliateCode:m.affiliateCode|| null,
          totalDeposit: parseFloat(m.depositTotal  || m.totalDeposit  || '0') || 0,
          totalWithdraw:parseFloat(m.withdrawTotal || m.totalWithdraw || '0') || 0,
          depositCount: parseInt(m.depositCount  || '0') || 0,
          withdrawCount:parseInt(m.withdrawCount || '0') || 0,
          memberType:   m.memberType  || 'new',
          registeredAt: m.registeredAt ? new Date(m.registeredAt) : null,
          notes: [m.bank && `ธนาคาร: ${m.bank}`, m.bankAccount && `บัญชี: ${m.bankAccount}`].filter(Boolean).join('\n'),
          customFields: JSON.stringify({
            bank: m.bank, bankAccount: m.bankAccount,
            credit: parseFloat(m.credit || '0') || 0,
            balance: parseFloat(m.balance || '0') || 0,
            pkm_synced_at: new Date().toISOString(),
          }),
        };
        data.totalProfit = data.totalDeposit - data.totalWithdraw;
        if (existing) { await prisma.contact.update({ where: { id: existing.id }, data }); updated++; }
        else { await prisma.contact.create({ data: { tenantId, ...data } }); inserted++; }
      } catch (e: any) {
        errors++;
        errorDetail.push(`${m.username || m.phone}: ${e.message}`);
      }
    }

    res.json({ success: true, inserted, updated, errors, total: members.length, errorDetail });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/pkm/lookup?q= — ค้นหาสมาชิกจาก username/phone ───────────────────
router.get('/lookup', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, message: 'ต้องระบุ q (username หรือ phone)' });
    const tenantId = req.tenantId!;

    const contacts = await prisma.contact.findMany({
      where: {
        tenantId,
        OR: [
          { username: { contains: String(q) } },
          { phone:    { contains: String(q) } },
          { displayName: { contains: String(q) } },
        ],
      },
      take: 10,
      select: {
        id: true, displayName: true, username: true, phone: true,
        totalDeposit: true, totalWithdraw: true, totalProfit: true,
        depositCount: true, withdrawCount: true, memberType: true,
        registeredAt: true, firstDepositAt: true, lastDepositAt: true,
        notes: true, customFields: true, leadScore: true, affiliateCode: true,
        tags: { include: { tag: true } },
      },
    });

    // Parse customFields JSON
    const result = contacts.map(c => {
      let custom: any = {};
      try { custom = JSON.parse(c.customFields || '{}'); } catch {}
      return { ...c, bank: custom.bank, bankAccount: custom.bankAccount, credit: custom.credit, balance: custom.balance, promotions: custom.promotions };
    });

    res.json({ success: true, contacts: result, total: result.length });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/pkm/member/:username — ดูข้อมูลเต็มของสมาชิก ────────────────────
router.get('/member/:username', async (req: Request, res: Response) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { tenantId: req.tenantId!, username: req.params.username },
      include: {
        financials: { orderBy: { date: 'desc' }, take: 30 },
        tags: { include: { tag: true } },
        conversations: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, channel: true, status: true, createdAt: true } },
      },
    });
    if (!contact) return res.status(404).json({ success: false, message: 'ไม่พบสมาชิก' });

    let custom: any = {};
    try { custom = JSON.parse(contact.customFields || '{}'); } catch {}

    res.json({
      success: true,
      member: {
        ...contact,
        bank: custom.bank, bankAccount: custom.bankAccount,
        credit: custom.credit, balance: custom.balance,
        promotions: custom.promotions || [],
        pkm_synced_at: custom.pkm_synced_at,
        netProfit: contact.totalDeposit - contact.totalWithdraw,
      },
    });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/pkm/add-promotion — บันทึกโปรโมชั่นที่ใช้ ─────────────────────
router.post('/add-promotion', async (req: Request, res: Response) => {
  try {
    const { username, phone, promotionName, amount, date } = req.body;
    const tenantId = req.tenantId!;
    const contact = await prisma.contact.findFirst({
      where: { tenantId, OR: [username && { username }, phone && { phone }].filter(Boolean) as any },
    });
    if (!contact) return res.status(404).json({ success: false, message: 'ไม่พบสมาชิก' });

    let custom: any = {};
    try { custom = JSON.parse(contact.customFields || '{}'); } catch {}
    const promotions: any[] = custom.promotions || [];
    promotions.push({ name: promotionName, amount: parseFloat(amount) || 0, date: date || new Date().toISOString() });

    await prisma.contact.update({
      where: { id: contact.id },
      data: { customFields: JSON.stringify({ ...custom, promotions }) },
    });

    res.json({ success: true, message: `✅ เพิ่มโปรโมชั่น "${promotionName}" แล้ว`, promotions });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

export default router;

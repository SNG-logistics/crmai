import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken } from '../middleware/auth';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: 'uploads/tmp/', limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

// ─── Helper: parse number safely ─────────────────────────────────────────────
const num = (v: any) => parseFloat(String(v || '0').replace(/,/g, '')) || 0;
const dt  = (v: any) => { if (!v || v === '' || v === 'NULL') return null; try { return new Date(v); } catch { return null; } };
const str = (v: any) => (v == null || v === 'NULL') ? null : String(v).trim();

// ─── Helper: create SyncLog ───────────────────────────────────────────────────
async function createLog(tenantId: string, type: string, source = 'api', filename?: string) {
  return prisma.syncLog.create({ data: { tenantId, type, status: 'running', source, filename } });
}
async function finishLog(id: string, stats: { inserted: number; updated: number; skipped: number; errors: number; errorDetail?: string[] }) {
  return prisma.syncLog.update({
    where: { id },
    data: {
      status: stats.errors > 0 && stats.inserted + stats.updated === 0 ? 'error' : 'done',
      inserted: stats.inserted,
      updated:  stats.updated,
      skipped:  stats.skipped,
      errors:   stats.errors,
      errorDetail: stats.errorDetail ? JSON.stringify(stats.errorDetail.slice(0, 20)) : null,
      finishedAt: new Date(),
    },
  });
}

// ─── Middleware: API Key OR JWT ───────────────────────────────────────────────
// Sync API รองรับทั้ง JWT (Admin ใช้) และ API Key (ระบบเกมใช้)
function syncAuth(req: Request, res: Response, next: any) {
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey) {
    // Validate against tenant's API key in settings
    const tenantHeader = req.headers['x-tenant-id'] as string;
    if (!tenantHeader) return res.status(400).json({ success: false, message: 'ต้องระบุ x-tenant-id' });
    req.tenantId = tenantHeader;
    // TODO: validate apiKey against tenant settings
    return next();
  }
  return verifyToken(req, res, next);
}

// ─── GET /api/sync/logs ───────────────────────────────────────────────────────
router.get('/logs', verifyToken, async (req: Request, res: Response) => {
  try {
    const logs = await prisma.syncLog.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, logs });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── GET /api/sync/stats ──────────────────────────────────────────────────────
router.get('/stats', verifyToken, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const [totalContacts, totalFinancials, lastSync] = await Promise.all([
      prisma.contact.count({ where: { tenantId } }),
      prisma.financialRecord.count({ where: { tenantId } }),
      prisma.syncLog.findFirst({ where: { tenantId, status: 'done' }, orderBy: { finishedAt: 'desc' } }),
    ]);
    res.json({ success: true, stats: { totalContacts, totalFinancials, lastSync } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ─── POST /api/sync/members ───────────────────────────────────────────────────
// รับ JSON array ของสมาชิกจากระบบเกม
// Body: { members: [{ username, displayName, phone, affiliateCode, memberType, registeredAt, ... }] }
router.post('/members', syncAuth, async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { members = [] } = req.body;
  if (!Array.isArray(members) || members.length === 0)
    return res.status(400).json({ success: false, message: 'members array ว่างเปล่า' });

  const log = await createLog(tenantId, 'members', 'api');
  const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0, errorDetail: [] as string[] };

  for (const m of members) {
    try {
      if (!m.username) { stats.skipped++; continue; }
      const existing = await prisma.contact.findFirst({ where: { tenantId, username: m.username } });
      const data: any = {
        displayName:   str(m.displayName) || m.username,
        firstName:     str(m.firstName),
        lastName:      str(m.lastName),
        phone:         str(m.phone),
        email:         str(m.email),
        affiliateCode: str(m.affiliateCode),
        memberType:    str(m.memberType) || 'new',
        registeredAt:  dt(m.registeredAt),
        firstDepositAt:dt(m.firstDepositAt),
        lastDepositAt: dt(m.lastDepositAt),
        totalDeposit:  num(m.totalDeposit),
        totalWithdraw: num(m.totalWithdraw),
        totalProfit:   num(m.totalDeposit) - num(m.totalWithdraw),
        depositCount:  parseInt(m.depositCount) || 0,
        withdrawCount: parseInt(m.withdrawCount) || 0,
      };
      if (existing) {
        await prisma.contact.update({ where: { id: existing.id }, data });
        stats.updated++;
      } else {
        await prisma.contact.create({ data: { tenantId, username: m.username, ...data } });
        stats.inserted++;
      }
    } catch (e: any) {
      stats.errors++;
      stats.errorDetail.push(`${m.username}: ${e.message}`);
    }
  }

  await finishLog(log.id, stats);
  res.json({ success: true, ...stats, logId: log.id });
});

// ─── POST /api/sync/deposits ──────────────────────────────────────────────────
// รับ JSON array ธุรกรรมฝาก-ถอน แล้วอัปเดต Contact + FinancialRecord
// Body: { transactions: [{ username, type:'deposit'|'withdraw', amount, date, gameType }] }
router.post('/deposits', syncAuth, async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { transactions = [] } = req.body;
  if (!Array.isArray(transactions) || transactions.length === 0)
    return res.status(400).json({ success: false, message: 'transactions array ว่างเปล่า' });

  const log = await createLog(tenantId, 'deposits', 'api');
  const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0, errorDetail: [] as string[] };

  for (const tx of transactions) {
    try {
      if (!tx.username || !tx.amount || !tx.date) { stats.skipped++; continue; }
      const contact = await prisma.contact.findFirst({ where: { tenantId, username: tx.username } });
      if (!contact) { stats.skipped++; continue; }

      const dateStr = new Date(tx.date).toISOString().split('T')[0]; // YYYY-MM-DD
      const amount  = num(tx.amount);
      const isDeposit = tx.type !== 'withdraw';

      // Upsert FinancialRecord รายวัน
      const existing = await prisma.financialRecord.findUnique({
        where: { tenantId_contactId_date: { tenantId, contactId: contact.id, date: dateStr } },
      });

      const gameKey = tx.gameType || 'other';
      let gameBreakdown: any = {};
      if (existing) {
        try { gameBreakdown = JSON.parse(existing.gameBreakdown || '{}'); } catch {}
      }
      if (isDeposit) {
        gameBreakdown[gameKey] = (gameBreakdown[gameKey] || 0) + amount;
      }

      if (existing) {
        await prisma.financialRecord.update({
          where: { id: existing.id },
          data: {
            depositAmount:  isDeposit ? existing.depositAmount + amount : existing.depositAmount,
            withdrawAmount: !isDeposit ? existing.withdrawAmount + amount : existing.withdrawAmount,
            netProfit:      existing.netProfit + (isDeposit ? amount : -amount),
            depositCount:   isDeposit ? existing.depositCount + 1 : existing.depositCount,
            withdrawCount:  !isDeposit ? existing.withdrawCount + 1 : existing.withdrawCount,
            gameBreakdown:  JSON.stringify(gameBreakdown),
          },
        });
        stats.updated++;
      } else {
        await prisma.financialRecord.create({
          data: {
            tenantId, contactId: contact.id, date: dateStr,
            depositAmount:  isDeposit ? amount : 0,
            withdrawAmount: !isDeposit ? amount : 0,
            netProfit:      isDeposit ? amount : -amount,
            depositCount:   isDeposit ? 1 : 0,
            withdrawCount:  !isDeposit ? 1 : 0,
            gameBreakdown:  JSON.stringify(gameBreakdown),
          },
        });
        stats.inserted++;
      }

      // อัปเดต Contact aggregate
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          totalDeposit:  { increment: isDeposit ? amount : 0 },
          totalWithdraw: { increment: !isDeposit ? amount : 0 },
          totalProfit:   { increment: isDeposit ? amount : -amount },
          depositCount:  { increment: isDeposit ? 1 : 0 },
          withdrawCount: { increment: !isDeposit ? 1 : 0 },
          ...(isDeposit && !contact.firstDepositAt && { firstDepositAt: new Date(tx.date) }),
          ...(isDeposit && { lastDepositAt: new Date(tx.date) }),
          ...(isDeposit && { memberType: contact.memberType === 'new' ? 'regular' : contact.memberType }),
        },
      });

    } catch (e: any) {
      stats.errors++;
      stats.errorDetail.push(`${tx.username}: ${e.message}`);
    }
  }

  await finishLog(log.id, stats);
  res.json({ success: true, ...stats, logId: log.id });
});

// ─── POST /api/sync/csv/members — Upload CSV สมาชิก ──────────────────────────
// CSV columns: username, displayName, phone, email, affiliateCode, memberType,
//              registeredAt, firstDepositAt, totalDeposit, totalWithdraw, depositCount
router.post('/csv/members', verifyToken, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์ CSV' });
  const tenantId = req.tenantId!;
  const log = await createLog(tenantId, 'csv_members', 'csv', req.file.originalname);
  const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0, errorDetail: [] as string[] };

  try {
    const content = fs.readFileSync(req.file.path, 'utf-8');
    const rows: any[] = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    stats.inserted = stats.updated = stats.skipped = stats.errors = 0;

    for (const row of rows) {
      try {
        const username = str(row.username || row.USERNAME || row['ยูเซอร์เนม']);
        if (!username) { stats.skipped++; continue; }

        const existing = await prisma.contact.findFirst({ where: { tenantId, username } });
        const data: any = {
          displayName:   str(row.displayName || row.name || row['ชื่อ']) || username,
          phone:         str(row.phone || row['โทรศัพท์']),
          email:         str(row.email || row['อีเมล']),
          affiliateCode: str(row.affiliateCode || row.affiliate || row['พาร์ทเนอร์']),
          memberType:    str(row.memberType || row['ประเภท']) || 'new',
          registeredAt:  dt(row.registeredAt || row['วันสมัคร']),
          firstDepositAt:dt(row.firstDepositAt || row['ฝากครั้งแรก']),
          totalDeposit:  num(row.totalDeposit || row['ยอดฝากรวม']),
          totalWithdraw: num(row.totalWithdraw || row['ยอดถอนรวม']),
          totalProfit:   num(row.totalDeposit || 0) - num(row.totalWithdraw || 0),
          depositCount:  parseInt(row.depositCount || row['จำนวนฝาก'] || '0') || 0,
          withdrawCount: parseInt(row.withdrawCount || row['จำนวนถอน'] || '0') || 0,
        };

        if (existing) {
          await prisma.contact.update({ where: { id: existing.id }, data });
          stats.updated++;
        } else {
          await prisma.contact.create({ data: { tenantId, username, ...data } });
          stats.inserted++;
        }
      } catch (e: any) {
        stats.errors++;
        stats.errorDetail.push(`Row: ${JSON.stringify(row).slice(0, 80)} → ${e.message}`);
      }
    }

    // ลบไฟล์ชั่วคราว
    fs.unlinkSync(req.file.path);
    await finishLog(log.id, stats);
    res.json({ success: true, ...stats, totalRows: rows.length, logId: log.id });
  } catch (e: any) {
    fs.unlinkSync(req.file.path);
    await finishLog(log.id, { ...stats, errors: 1, errorDetail: [e.message] });
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── POST /api/sync/csv/transactions — Upload CSV ธุรกรรม ────────────────────
// CSV columns: username, type(deposit/withdraw), amount, date(YYYY-MM-DD), gameType
router.post('/csv/transactions', verifyToken, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์ CSV' });
  const tenantId = req.tenantId!;
  const log = await createLog(tenantId, 'csv_transactions', 'csv', req.file.originalname);
  const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0, errorDetail: [] as string[] };

  try {
    const content = fs.readFileSync(req.file.path, 'utf-8');
    const rows: any[] = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });

    for (const row of rows) {
      try {
        const username = str(row.username || row.USERNAME || row['ยูเซอร์เนม']);
        const amount   = num(row.amount || row['จำนวน']);
        const date     = str(row.date || row['วันที่']);
        const type     = (row.type || row['ประเภท'] || 'deposit').toLowerCase().trim();
        if (!username || !amount || !date) { stats.skipped++; continue; }

        const contact = await prisma.contact.findFirst({ where: { tenantId, username } });
        if (!contact) { stats.skipped++; stats.errorDetail.push(`ไม่พบสมาชิก: ${username}`); continue; }

        const dateStr    = new Date(date).toISOString().split('T')[0];
        const isDeposit  = !type.includes('withdraw') && !type.includes('ถอน');
        const gameKey    = str(row.gameType || row['ประเภทเกม']) || 'other';

        const existing = await prisma.financialRecord.findUnique({
          where: { tenantId_contactId_date: { tenantId, contactId: contact.id, date: dateStr } },
        });

        let gameBreakdown: any = {};
        if (existing) { try { gameBreakdown = JSON.parse(existing.gameBreakdown || '{}'); } catch {} }
        if (isDeposit) gameBreakdown[gameKey] = (gameBreakdown[gameKey] || 0) + amount;

        if (existing) {
          await prisma.financialRecord.update({
            where: { id: existing.id },
            data: {
              depositAmount:  isDeposit ? existing.depositAmount + amount : existing.depositAmount,
              withdrawAmount: !isDeposit ? existing.withdrawAmount + amount : existing.withdrawAmount,
              netProfit:      existing.netProfit + (isDeposit ? amount : -amount),
              depositCount:   isDeposit ? existing.depositCount + 1 : existing.depositCount,
              withdrawCount:  !isDeposit ? existing.withdrawCount + 1 : existing.withdrawCount,
              gameBreakdown:  JSON.stringify(gameBreakdown),
            },
          });
          stats.updated++;
        } else {
          await prisma.financialRecord.create({
            data: {
              tenantId, contactId: contact.id, date: dateStr,
              depositAmount:  isDeposit ? amount : 0,
              withdrawAmount: !isDeposit ? amount : 0,
              netProfit:      isDeposit ? amount : -amount,
              depositCount:   isDeposit ? 1 : 0,
              withdrawCount:  !isDeposit ? 1 : 0,
              gameBreakdown:  JSON.stringify(gameBreakdown),
            },
          });
          stats.inserted++;
        }

        // อัปเดต Contact aggregate
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            totalDeposit:  { increment: isDeposit ? amount : 0 },
            totalWithdraw: { increment: !isDeposit ? amount : 0 },
            totalProfit:   { increment: isDeposit ? amount : -amount },
            depositCount:  { increment: isDeposit ? 1 : 0 },
            withdrawCount: { increment: !isDeposit ? 1 : 0 },
            ...(isDeposit && !contact.firstDepositAt && { firstDepositAt: new Date(date) }),
            ...(isDeposit && { lastDepositAt: new Date(date) }),
            ...(isDeposit && contact.memberType === 'new' && { memberType: 'regular' }),
          },
        });
      } catch (e: any) {
        stats.errors++;
        stats.errorDetail.push(`Row ${stats.inserted + stats.updated + stats.errors}: ${e.message}`);
      }
    }

    fs.unlinkSync(req.file.path);
    await finishLog(log.id, stats);
    res.json({ success: true, ...stats, totalRows: rows.length, logId: log.id });
  } catch (e: any) {
    try { fs.unlinkSync(req.file.path); } catch {}
    await finishLog(log.id, { ...stats, errors: 1, errorDetail: [e.message] });
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── POST /api/sync/csv/preview — Preview CSV โดยไม่ Import ─────────────────
router.post('/csv/preview', verifyToken, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์ CSV' });
  try {
    const content = fs.readFileSync(req.file.path, 'utf-8');
    const rows: any[] = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    fs.unlinkSync(req.file.path);
    res.json({
      success: true,
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
      preview: rows.slice(0, 10),
      totalRows: rows.length,
    });
  } catch (e: any) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;

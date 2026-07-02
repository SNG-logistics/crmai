import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyToken, requireRole } from '../middleware/auth';
import { createAuditLog } from '../lib/audit';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();

// ─── Sync API key helpers ─────────────────────────────────────────────────────
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest();
function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function readSettings(raw: string | null | undefined): any {
  try { return JSON.parse(raw || '{}') || {}; } catch { return {}; }
}
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
//
// 🔒 SECURITY: x-api-key ต้องตรงกับ key ที่ตั้งไว้ของ tenant นั้น (เทียบ hash แบบ
//    constant-time) เท่านั้น — จะเชื่อ x-tenant-id ก็ต่อเมื่อ key ผ่านแล้ว
//    ปิดช่องโหว่เดิมที่ใครส่ง x-api-key อะไรก็ได้ + x-tenant-id ของคนอื่น = เขียนข้อมูลข้าม tenant ได้
async function syncAuth(req: Request, res: Response, next: any) {
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey) {
    try {
      const tenantHeader = (req.headers['x-tenant-id'] as string || '').trim();
      if (!tenantHeader) return res.status(400).json({ success: false, message: 'ต้องระบุ x-tenant-id' });

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantHeader },
        select: { id: true, isActive: true, settings: true },
      });
      // ข้อความ error เดียวกันทุกกรณี (กัน enumeration ว่า tenant ไหนมี key)
      const deny = () => res.status(401).json({ success: false, message: 'invalid tenant or api key' });
      if (!tenant || !tenant.isActive) return deny();

      const storedHashHex = readSettings(tenant.settings).syncApiKeyHash as string | undefined;
      if (!storedHashHex) return deny(); // tenant ยังไม่ได้ตั้ง sync API key → ปฏิเสธ (fail closed)

      const ok = safeEqual(sha256(apiKey), Buffer.from(storedHashHex, 'hex'));
      if (!ok) return deny();

      req.tenantId = tenant.id; // เชื่อ tenant นี้ได้แล้ว เพราะ key ตรง
      return next();
    } catch (e: any) {
      return res.status(401).json({ success: false, message: 'invalid tenant or api key' });
    }
  }
  return verifyToken(req, res, next);
}

// ─── Sync API key management (admin/superadmin) ───────────────────────────────
// GET /api/sync/api-key — สถานะว่าตั้ง key แล้วหรือยัง (ไม่คืนตัว key)
router.get('/api-key', verifyToken, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { settings: true } });
    const s = readSettings(tenant?.settings);
    return res.json({ success: true, configured: !!s.syncApiKeyHash, setAt: s.syncApiKeySetAt || null });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/sync/api-key/rotate — สร้าง key ใหม่ (คืน plaintext ครั้งเดียว เก็บแต่ hash)
router.post('/api-key/rotate', verifyToken, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const key = 'sk_' + crypto.randomBytes(24).toString('hex');
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const s = readSettings(tenant?.settings);
    s.syncApiKeyHash = sha256(key).toString('hex');
    s.syncApiKeySetAt = new Date().toISOString();
    await prisma.tenant.update({ where: { id: tenantId }, data: { settings: JSON.stringify(s) } });
    await createAuditLog(tenantId, req.user!.id, 'SYNC_APIKEY_ROTATE', {}, req.ip, req.headers['user-agent']);
    return res.json({ success: true, apiKey: key, message: '⚠️ เก็บ key นี้ไว้ให้ดี ระบบจะไม่แสดงอีก' });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/sync/api-key — ยกเลิก key (sync ผ่าน API key จะใช้ไม่ได้ทันที)
router.delete('/api-key', verifyToken, requireRole('admin', 'superadmin'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const s = readSettings(tenant?.settings);
    delete s.syncApiKeyHash; delete s.syncApiKeySetAt;
    await prisma.tenant.update({ where: { id: tenantId }, data: { settings: JSON.stringify(s) } });
    await createAuditLog(tenantId, req.user!.id, 'SYNC_APIKEY_REVOKE', {}, req.ip, req.headers['user-agent']);
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ success: false, message: e.message }); }
});

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
      const lineUserId = str(m.lineUserId || m.lineId || m.line_id);
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

      if (lineUserId) {
        const duplicateLineUser = await prisma.contact.findFirst({
          where: {
            tenantId,
            lineUserId,
            NOT: existing ? { id: existing.id } : undefined
          }
        });
        if (duplicateLineUser) {
          throw new Error(`LINE ID '${lineUserId}' ถูกใช้งานแล้วโดยผู้ใช้อื่น (${duplicateLineUser.username})`);
        }
        data.lineUserId = lineUserId;
      }

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
        const lineUserId = str(row.lineUserId || row.line || row.LINE_ID || row.line_id || row['ไลน์ไอดี']);
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

        if (lineUserId) {
          const duplicateLineUser = await prisma.contact.findFirst({
            where: {
              tenantId,
              lineUserId,
              NOT: existing ? { id: existing.id } : undefined
            }
          });
          if (duplicateLineUser) {
            throw new Error(`LINE ID '${lineUserId}' ถูกใช้งานแล้วโดยผู้ใช้อื่น (${duplicateLineUser.username})`);
          }
          data.lineUserId = lineUserId;
        }

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

// ─── POST /api/sync/line-reply — รับข้อความจาก Chrome Extension ──────────────
// Extension ส่งมาเมื่อแอดมินตอบใน LINE OA Manager
// Body: { tenantId, userId, text, timestamp, source }
router.post('/line-reply', verifyToken, async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { userId, text, timestamp, source } = req.body;

  if (!userId || !text) {
    return res.status(400).json({ ok: false, reason: 'userId and text are required' });
  }

  try {
    // lineUserId อยู่บน Contact — หา Contact ก่อน แล้วหา Conversation จาก contactId
    const contact = await prisma.contact.findUnique({
      where: { tenantId_lineUserId: { tenantId, lineUserId: userId } },
    });

    if (!contact) {
      return res.status(404).json({ ok: false, reason: 'contact not found for lineUserId: ' + userId });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { tenantId, contactId: contact.id },
      orderBy: { updatedAt: 'desc' },
    });

    if (!conversation) {
      // ยังไม่มี conversation (ลูกค้ายังไม่เคยส่งข้อความมาก่อน)
      return res.status(404).json({ ok: false, reason: 'conversation not found for userId: ' + userId });
    }

    // ตรวจ dedup — ห้ามบันทึกซ้ำภายใน 5 วินาที (content + senderType เหมือนกัน)
    const fiveSecsAgo = new Date(Date.now() - 5000);
    const duplicate = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        senderType: 'admin',
        content: text,
        createdAt: { gte: fiveSecsAgo },
      },
    });

    if (duplicate) {
      return res.json({ ok: true, duplicate: true, messageId: duplicate.id });
    }

    // บันทึกข้อความแอดมินลง DB
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        tenantId,
        senderType: 'admin',
        type: 'text',
        content: text,
        createdAt: timestamp ? new Date(timestamp) : new Date(),
        metadata: JSON.stringify({ source: source || 'extension', syncedAt: new Date().toISOString() }),
      },
    });

    // อัปเดต conversation updatedAt
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // Emit real-time ไป CRM Frontend
    const { emitToTenant } = await import('../lib/socket');
    emitToTenant(tenantId, 'new_message', {
      conversationId: conversation.id,
      message: { ...message, senderType: 'admin' },
      source: 'line_manager_extension',
    });

    console.log(`[LINE Sync] Admin reply synced: conv=${conversation.id} text="${text.slice(0, 30)}"`);
    res.json({ ok: true, messageId: message.id });

  } catch (e: any) {
    console.error('[LINE Sync] Error saving admin reply:', e.message);
    res.status(500).json({ ok: false, reason: e.message });
  }
});

export default router;

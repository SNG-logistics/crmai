import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import OpenAI from 'openai';
import prisma from '../lib/prisma';
import { emitToTenant } from '../lib/socket';
import {
  companyRequiresBankNotification,
  matchSlipWithBankNotification,
  normalizeBankTransactionRef,
  normalizeCurrency,
} from './bank-notification.service';

// ─── Config ──────────────────────────────────────────────────────────────────
const SLIPOK_API_KEY  = process.env.SLIPOK_API_KEY || '';
const SLIPOK_BRANCH   = process.env.SLIPOK_BRANCH_ID || '';
const SLIPS_DIR       = path.resolve(__dirname, '../../uploads/slips');

const aiClient = new OpenAI({
  apiKey:  process.env.COMETAPI_GEMINI_KEY || process.env.COMETAPI_KEY || '',
  baseURL: process.env.COMETAPI_BASE_URL || 'https://api.cometapi.com/v1',
});
const VISION_MODEL = process.env.COMETAPI_MODEL || 'gpt-4o';

// ─── Thai bank code → name mapping ──────────────────────────────────────────
const BANK_NAMES: Record<string, string> = {
  '002': 'กรุงเทพ (BBL)', '004': 'กสิกร (KBANK)', '006': 'กรุงไทย (KTB)',
  '011': 'ทหารไทยธนชาต (TTB)', '014': 'ไทยพาณิชย์ (SCB)',
  '025': 'กรุงศรี (BAY)', '030': 'ออมสิน (GSB)',
  '069': 'เกียรตินาคินภัทร (KKP)', '022': 'CIMB',
  '065': 'ธอส (GHB)', '034': 'BAAC', '071': 'UOB',
};

function bankName(code?: string | null): string {
  if (!code) return '';
  return BANK_NAMES[code] || code;
}

// ─── Ensure upload directory exists ─────────────────────────────────────────
function ensureSlipsDir() {
  if (!fs.existsSync(SLIPS_DIR)) {
    fs.mkdirSync(SLIPS_DIR, { recursive: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Download image from LINE Content API
// ═══════════════════════════════════════════════════════════════════════════════
export async function downloadLineImage(
  messageId: string,
  accessToken: string
): Promise<{ buffer: Buffer; filePath: string }> {
  ensureSlipsDir();

  const response = await axios.get(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: 'arraybuffer',
    }
  );

  const buffer = Buffer.from(response.data);
  const ext = 'jpg'; // LINE images are typically JPEG
  const filename = `${messageId}_${Date.now()}.${ext}`;
  const filePath = path.join(SLIPS_DIR, filename);

  fs.writeFileSync(filePath, buffer);
  console.log(`[SlipVerify] 📥 Downloaded image: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);

  return { buffer, filePath };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Hash image for duplicate detection
// ═══════════════════════════════════════════════════════════════════════════════
export function hashImage(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Check for duplicate slip
// ═══════════════════════════════════════════════════════════════════════════════
export async function checkDuplicate(
  tenantId: string,
  imageHash: string,
  companyId?: string | null,
): Promise<{ isDuplicate: boolean; original?: any; wasApproved?: boolean }> {
  const matches = await prisma.slipVerification.findMany({
    where: { tenantId, imageHash, ...(companyId ? { companyId } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  if (!matches.length) return { isDuplicate: false };

  // Keep the first copy as the canonical link, but respect an approval made on
  // any copy because an admin may have opened and approved a duplicate row.
  const original = matches.find(item => !item.isDuplicate) || matches[0];
  return {
    isDuplicate: true,
    original,
    wasApproved: matches.some(item => item.status === 'verified'),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Verify with SlipOK API
// ═══════════════════════════════════════════════════════════════════════════════
interface SlipOKResult {
  success: boolean;
  transRef?: string;
  sendingBank?: string;
  receivingBank?: string;
  amount?: number;
  transDate?: string;
  transTime?: string;
  senderName?: string;
  receiverName?: string;
  receiverAccount?: string;
  error?: string;
}

export async function verifyWithSlipOK(imagePath: string): Promise<SlipOKResult> {
  if (!SLIPOK_API_KEY || !SLIPOK_BRANCH) {
    console.log('[SlipVerify] ⚠️ SlipOK not configured — skipping');
    return { success: false, error: 'SlipOK not configured' };
  }

  try {
    const form = new FormData();
    form.append('files', fs.createReadStream(imagePath));
    form.append('log', 'true');

    const url = `https://api.slipok.com/api/line/apikey/${SLIPOK_BRANCH}`;
    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        'x-authorization': SLIPOK_API_KEY,
      },
      timeout: 15000,
    });

    const data = response.data?.data;
    if (data?.success) {
      console.log(`[SlipVerify] ✅ SlipOK verified: ref=${data.transRef} amount=${data.amount}`);
      return {
        success: true,
        transRef: data.transRef,
        sendingBank: data.sendingBank,
        receivingBank: data.receivingBank,
        amount: data.amount,
        transDate: data.transDate,
        transTime: data.transTime,
        senderName: data.sender?.displayName || data.sender?.name || '',
        receiverName: data.receiver?.displayName || data.receiver?.name || '',
        receiverAccount: data.receiver?.account || data.receiver?.accountNumber || data.receiver?.proxy?.value || '',
      };
    }

    return { success: false, error: data?.message || 'SlipOK verification failed' };
  } catch (err: any) {
    const errMsg = err.response?.data?.message || err.message;
    console.warn(`[SlipVerify] ⚠️ SlipOK error: ${errMsg}`);
    return { success: false, error: errMsg };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Verify with AI Vision (GPT-4o)
// ═══════════════════════════════════════════════════════════════════════════════
interface AIVisionResult {
  success: boolean;
  isSlip?: boolean;
  amount?: number;
  currency?: string;
  bankFrom?: string;
  bankTo?: string;
  transDate?: string;
  transTime?: string;
  transRef?: string;
  senderName?: string;
  receiverName?: string;
  receiverAccount?: string;
  receiverAccountPrefix?: string;
  receiverAccountSuffix?: string;
  confidence?: string;
  suspicious?: boolean;
  reason?: string;
  error?: string;
}

const AI_VISION_PROMPT = `วิเคราะห์รูปนี้ ตอบเป็น JSON เท่านั้น (ไม่ต้องมี markdown):
{
  "isSlip": true/false,
  "amount": 0,
  "currency": "THB/LAK/USD",
  "bankFrom": "ชื่อธนาคารต้นทาง",
  "bankTo": "ชื่อธนาคารปลายทาง",
  "transDate": "DD/MM/YYYY",
  "transTime": "HH:MM",
  "transRef": "เลขอ้างอิง",
  "senderName": "ชื่อผู้โอน",
  "receiverName": "ชื่อผู้รับ",
  "receiverAccount": "เลขบัญชีผู้รับตามที่เห็นทั้งหมด รวมเครื่องหมายปิดบัง เช่น xxx หรือ *",
  "receiverAccountPrefix": "เลขขึ้นต้นบัญชีผู้รับที่มองเห็น หรือค่าว่าง",
  "receiverAccountSuffix": "เลขท้ายบัญชีผู้รับที่มองเห็น หรือค่าว่าง",
  "confidence": "high/medium/low",
  "suspicious": false,
  "reason": ""
}

สำคัญมาก — ปฏิทินไทย:
- ประเทศไทยใช้ปฏิทินพุทธศักราช (พ.ศ.) โดย พ.ศ. = ค.ศ. + 543
- ปี พ.ศ. 2569 = ค.ศ. 2026 ซึ่งเป็นปีปัจจุบัน ถือว่าถูกต้อง
- สลิปธนาคารไทยจะแสดงปี พ.ศ. (เช่น 2568, 2569) ห้ามถือว่าผิดปกติ

กฎตรวจสอบ:
- ถ้าไม่ใช่สลิปโอนเงิน isSlip=false
- อ่านสกุลเงินจริงจากสลิปเท่านั้น (THB/LAK/USD) ถ้าไม่เห็นให้เป็นค่าว่าง
- อ่านเลขธุรกรรม/เลขอ้างอิง (transRef) ทุกตัวให้ครบ ห้ามเอาเลขบัญชีหรือวันเวลามาใส่แทน
- แยกเลขบัญชีผู้รับที่มองเห็นเป็นเลขขึ้นต้นและเลขท้าย หากเห็นเฉพาะเลขท้ายให้ receiverAccountPrefix เป็นค่าว่าง
- ห้ามเดาตัวเลขที่ถูกปิดบังด้วย x, X, *, จุด หรือขีด ให้เก็บเฉพาะตัวเลขที่มองเห็นจริง
- ตรวจ: ตัวเลขคมชัดหรือเบลอผิดปกติ, font ไม่ตรงกับธนาคาร, ขอบภาพตัดต่อ, โลโก้ผิด
- ถ้ามีสิ่งผิดปกติ suspicious=true พร้อมเหตุผลใน reason
- confidence: high=ชัดเจน, medium=ไม่แน่ใจบาง field, low=คุณภาพต่ำ
- ห้ามถือว่าปี พ.ศ. เป็นความผิดปกติ`;

export async function verifyWithAIVision(imageBuffer: Buffer): Promise<AIVisionResult> {
  try {
    const base64 = imageBuffer.toString('base64');
    const imageUrl = `data:image/jpeg;base64,${base64}`;

    const request: any = {
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: AI_VISION_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 500,
    };
    if (!/^gemini-3\.6-flash(?:$|-)/i.test(VISION_MODEL)) request.temperature = 0.1;
    const response = await aiClient.chat.completions.create(request);

    const raw = response.choices[0]?.message?.content?.trim() || '';
    // Clean markdown code blocks if present
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      console.log(`[SlipVerify] 🤖 AI Vision: isSlip=${parsed.isSlip} amount=${parsed.amount} confidence=${parsed.confidence} suspicious=${parsed.suspicious}`);
      return { success: true, ...parsed };
    } catch {
      console.warn(`[SlipVerify] ⚠️ AI Vision parse error. Raw: ${raw.substring(0, 200)}`);
      return { success: false, error: 'AI response parse failed' };
    }
  } catch (err: any) {
    console.error(`[SlipVerify] ❌ AI Vision error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export type ReceivingAccount = {
  bank?: string;
  accountName?: string;
  accountNumber?: string;
};

export type ReceiverEvidence = {
  bank?: string;
  accountName?: string;
  accountRaw?: string;
  accountPrefix?: string;
  accountSuffix?: string;
};

export type AccountCheckStatus = 'match' | 'mismatch' | 'unknown' | 'unconfigured';

export type AccountCheckResult = {
  status: AccountCheckStatus;
  matchedAccount?: ReceivingAccount;
  observedPrefix: string;
  observedSuffix: string;
  observedDigits: string;
  reason: string;
};

function normalizeText(value?: string): string {
  return (value || '').toLowerCase().replace(/[^ก-๙຀-໿a-z0-9]/g, '');
}

function normalizeDigits(value?: string): string {
  return (value || '').replace(/\D/g, '');
}

function normalizeBank(value?: string): string {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  const aliases: Array<[string, string[]]> = [
    ['bcel', ['bcel', 'ธนาคารการค้าต่างประเทศลาว', 'ທະນາຄານການຄ້າຕ່າງປະເທດລາວ', 'ທຄຕລ']],
    ['jdb', ['jdb', 'ธนาคารร่วมพัฒนา', 'ທະນາຄານຮ່ວມພັດທະນາ']],
    ['ldb', ['ldb', 'ธนาคารพัฒนาลาว', 'ທະນາຄານພັດທະນາລາວ']],
    ['apb', ['apb', 'ธนาคารส่งเสริมกสิกรรม', 'ທະນາຄານສົ່ງເສີມກະສິກຳ']],
    ['kbank', ['kbank', 'กสิกร', 'kasikorn']],
    ['scb', ['scb', 'ไทยพาณิชย์', 'siamcommercial']],
    ['ktb', ['ktb', 'กรุงไทย', 'krungthai']],
    ['bbl', ['bbl', 'กรุงเทพ', 'bangkokbank']],
    ['bay', ['bay', 'กรุงศรี', 'krungsri']],
  ];
  for (const [canonical, values] of aliases) {
    if (values.some(alias => normalized.includes(normalizeText(alias)))) return canonical;
  }
  return normalized;
}

function textMatches(expected?: string, actual?: string): boolean | null {
  const e = normalizeText(expected);
  const a = normalizeText(actual);
  if (!e) return true;
  if (!a) return null;
  return e.includes(a) || a.includes(e);
}

function bankMatches(expected?: string, actual?: string): boolean | null {
  const e = normalizeBank(expected);
  const a = normalizeBank(actual);
  if (!e) return true;
  if (!a) return null;
  return e === a || e.includes(a) || a.includes(e);
}

function visibleAccountParts(evidence: ReceiverEvidence): {
  full: string;
  prefix: string;
  suffix: string;
  digits: string;
} {
  const raw = evidence.accountRaw || '';
  const explicitPrefix = normalizeDigits(evidence.accountPrefix);
  const explicitSuffix = normalizeDigits(evidence.accountSuffix);
  const digits = normalizeDigits(raw);
  const hasMask = /[xX*•●]/.test(raw);
  let prefix = explicitPrefix;
  let suffix = explicitSuffix;
  let full = '';

  if (!hasMask && digits.length >= 6) {
    full = digits;
  } else if (hasMask) {
    const firstMask = raw.search(/[xX*•●]/);
    const lastMask = Math.max(
      raw.lastIndexOf('x'),
      raw.lastIndexOf('X'),
      raw.lastIndexOf('*'),
      raw.lastIndexOf('•'),
      raw.lastIndexOf('●'),
    );
    if (!prefix && firstMask >= 0) prefix = normalizeDigits(raw.slice(0, firstMask));
    if (!suffix && lastMask >= 0) suffix = normalizeDigits(raw.slice(lastMask + 1));
  } else if (!suffix && digits.length >= 4) {
    // Some banks/API providers expose only the last four digits without a mask.
    suffix = digits;
  }

  if (full) {
    if (!prefix) prefix = full.slice(0, Math.min(4, full.length));
    if (!suffix) suffix = full.slice(-Math.min(4, full.length));
  }
  return { full, prefix, suffix, digits };
}

function accountNumberMatches(expectedValue: string | undefined, parts: ReturnType<typeof visibleAccountParts>): boolean | null {
  const expected = normalizeDigits(expectedValue);
  if (!expected) return true;
  if (parts.full) return parts.full === expected;
  if (parts.prefix.length >= 2 && parts.suffix.length >= 2) {
    return expected.startsWith(parts.prefix) && expected.endsWith(parts.suffix);
  }
  if (parts.suffix.length >= 4) return expected.endsWith(parts.suffix);
  if (parts.prefix.length >= 4) return expected.startsWith(parts.prefix);
  return null;
}

/**
 * Fail closed: a slip is only considered tied to the shop when the configured
 * bank/account evidence is strong enough. Missing or unreadable evidence is
 * "unknown", never an automatic pass.
 */
export function checkReceivingAccount(
  configuredAccounts: ReceivingAccount[],
  evidence: ReceiverEvidence,
): AccountCheckResult {
  const parts = visibleAccountParts(evidence);
  if (!configuredAccounts.length) {
    return {
      status: 'unconfigured',
      observedPrefix: parts.prefix,
      observedSuffix: parts.suffix,
      observedDigits: parts.digits,
      reason: 'no receiving account configured',
    };
  }

  let hasNonMismatchCandidate = false;
  for (const account of configuredAccounts) {
    const bank = bankMatches(account.bank, evidence.bank);
    const number = accountNumberMatches(account.accountNumber, parts);
    const name = textMatches(account.accountName, evidence.accountName);
    const hasExpectedNumber = !!normalizeDigits(account.accountNumber);
    const numberIsStrong = hasExpectedNumber ? number !== null : true;
    const bankIsStrong = account.bank ? bank !== null : true;
    const identityMatches = hasExpectedNumber
      ? number === true
      : (!!normalizeText(account.accountName) && name === true);

    if (bank === true && identityMatches && name !== false && numberIsStrong && bankIsStrong) {
      return {
        status: 'match',
        matchedAccount: account,
        observedPrefix: parts.prefix,
        observedSuffix: parts.suffix,
        observedDigits: parts.digits,
        reason: 'bank and visible account digits match',
      };
    }

    const conclusiveMismatch = bank === false
      || number === false
      || (bank === true && name === false && number !== true);
    if (!conclusiveMismatch) hasNonMismatchCandidate = true;
  }

  return {
    status: hasNonMismatchCandidate ? 'unknown' : 'mismatch',
    observedPrefix: parts.prefix,
    observedSuffix: parts.suffix,
    observedDigits: parts.digits,
    reason: hasNonMismatchCandidate
      ? 'receiver account evidence is incomplete or unreadable'
      : 'receiver bank/name/account digits do not match configured accounts',
  };
}

function normalizeTransactionRef(value?: string): string {
  return normalizeBankTransactionRef(value);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Main Orchestrator — verifySlip
// ═══════════════════════════════════════════════════════════════════════════════
export interface VerifySlipOptions {
  tenantId: string;
  conversationId: string;
  contactId: string;
  messageId: string;
  accessToken?: string;
  userId?: string; // LINE userId for push response
  buffer?: Buffer;
  filePath?: string;
  language?: 'th' | 'lo';
  companyId?: string | null;
}

export interface VerifySlipResult {
  status: 'verified' | 'fake' | 'duplicate' | 'not_slip' | 'error' | 'pending';
  verifiedBy: string;
  amount?: number;
  currency?: string;
  bankFrom?: string;
  bankTo?: string;
  transRef?: string;
  receiverName?: string;
  receiverAccount?: string;
  receiverAccountPrefix?: string;
  receiverAccountSuffix?: string;
  accountCheck?: AccountCheckStatus;
  bankNotificationMatched?: boolean;
  bankMatchReason?: string;
  message: string; // message to send to customer
  record?: any; // saved DB record
  imagePath?: string; // ที่อยู่ไฟล์รูปที่ดาวน์โหลดไว้ (ใช้ต่อกับ AI Vision กรณีไม่ใช่สลิป)
}

export async function verifySlip(opts: VerifySlipOptions): Promise<VerifySlipResult> {
  const { tenantId, conversationId, contactId, messageId, accessToken, language = 'th' } = opts;
  let companyId = opts.companyId || null;
  if (!companyId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { companyId: true },
    });
    companyId = conversation?.companyId || null;
  }
  if (!companyId) {
    companyId = (await prisma.company.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }))?.id || null;
  }

  console.log(`[SlipVerify] 🔍 Starting verification: tenant=${tenantId} msg=${messageId}`);

  // ── Step 1: Download image ──────────────────────────────────────────────
  let buffer: Buffer;
  let filePath: string;
  if (opts.buffer && opts.filePath) {
    buffer = opts.buffer;
    filePath = opts.filePath;
  } else {
    try {
      if (!accessToken) throw new Error('LINE access token is required');
      const dl = await downloadLineImage(messageId, accessToken);
      buffer = dl.buffer;
      filePath = dl.filePath;
    } catch (err: any) {
      console.error(`[SlipVerify] ❌ Download failed: ${err.message}`);
      return {
        status: 'error', verifiedBy: 'auto',
        message: language === 'lo'
          ? 'ບໍ່ສາມາດດາວໂຫຼດຮູບໄດ້ເຈົ້າ ລົບກວນສົ່ງໃໝ່ອີກຄັ້ງ 🙏'
          : 'ไม่สามารถดาวน์โหลดรูปได้ค่ะ กรุณาส่งใหม่อีกครั้งนะคะ 🙏',
      };
    }
  }

  // ── Step 2: Hash + Duplicate check ──────────────────────────────────────
  const imgHash = hashImage(buffer);
  const dupCheck = await checkDuplicate(tenantId, imgHash, companyId);

  if (dupCheck.isDuplicate && dupCheck.original) {
    const original = dupCheck.original;
    console.log(`[SlipVerify] ⚠️ Duplicate slip detected! original=${original.id} status=${original.status}`);

    const record = await prisma.slipVerification.create({
      data: {
        tenantId, companyId, conversationId, contactId, messageId,
        imageHash: imgHash, imagePath: filePath,
        status: 'duplicate', verifiedBy: 'auto',
        isDuplicate: true, duplicateOfId: original.id,
      },
    });

    emitToTenant(tenantId, 'slip_verified', {
      conversationId, messageId, status: 'duplicate', record,
    });

    return {
      status: 'duplicate', verifiedBy: 'auto',
      message: dupCheck.wasApproved
        ? (language === 'lo'
          ? 'ແອດມິນໄດ້ດຳເນີນການສະລິບນີ້ແລ້ວເຈົ້າ ລົບກວນຢ່າສົ່ງສະລິບເກົ່າຊ້ຳ'
          : 'แอดมินดำเนินการสลิปนี้แล้วครับ รบกวนลูกค้าอย่าส่งสลิปเก่าซ้ำนะครับ')
        : (language === 'lo'
          ? 'ສະລິບນີ້ລູກຄ້າເຄີຍສົ່ງມາແລ້ວເຈົ້າ ລະບົບກຳລັງກວດສອບໃຫ້'
          : 'สลิปนี้ลูกค้าส่งมาแล้วนะครับ ระบบกำลังตรวจสอบให้ครับ'),
      record,
    };
  }

  // ── Step 3: SlipOK verification ─────────────────────────────────────────
  const slipok = await verifyWithSlipOK(filePath);

  // ── Step 4: AI Vision verification ──────────────────────────────────────
  const aiResult = await verifyWithAIVision(buffer);

  // ── Step 5: Determine final verdict ─────────────────────────────────────
  let status: 'verified' | 'fake' | 'duplicate' | 'not_slip' | 'error' | 'pending' = 'error';
  let verifiedBy = 'auto';
  let finalAmount = slipok.amount || aiResult.amount;
  const finalCurrency = slipok.success ? 'THB' : normalizeCurrency(aiResult.currency);
  let finalBankFrom = bankName(slipok.sendingBank) || aiResult.bankFrom || '';
  let finalBankTo = bankName(slipok.receivingBank) || aiResult.bankTo || '';
  let finalTransRef = slipok.transRef || aiResult.transRef || '';
  let message = '';

  // Account allow-list is configured per company in WhatsApp AI settings.
  let configuredAccounts: ReceivingAccount[] = [];
  if (companyId) {
    const config = await prisma.botConfig.findFirst({
      where: { companyId, channel: 'whatsapp' },
      select: { metadata: true },
    });
    try {
      const metadata = JSON.parse(config?.metadata || '{}');
      if (Array.isArray(metadata.receivingAccounts)) configuredAccounts = metadata.receivingAccounts;
    } catch { configuredAccounts = []; }
  }
  const receiverName = slipok.receiverName || aiResult.receiverName || '';
  const receiverAccount = slipok.receiverAccount || aiResult.receiverAccount || '';
  const accountCheck = checkReceivingAccount(configuredAccounts, {
    bank: finalBankTo,
    accountName: receiverName,
    accountRaw: receiverAccount,
    accountPrefix: slipok.receiverAccount ? undefined : aiResult.receiverAccountPrefix,
    accountSuffix: slipok.receiverAccount ? undefined : aiResult.receiverAccountSuffix,
  });
  const accountMismatch = accountCheck.status === 'mismatch';
  const normalizedTransRef = normalizeTransactionRef(finalTransRef);
  if (normalizedTransRef) finalTransRef = normalizedTransRef;

  // A transaction reference catches the same transfer even when the customer
  // crops, recompresses, or screenshots the slip so the image hash changes.
  let transactionDuplicate: any = null;
  if (normalizedTransRef.length >= 6) {
    transactionDuplicate = await prisma.slipVerification.findFirst({
      where: {
        tenantId,
        ...(companyId ? { companyId } : {}),
        normalizedTransRef,
      },
      orderBy: { createdAt: 'asc' },
    });
    // Compatibility for records created before normalizedTransRef existed.
    if (!transactionDuplicate) {
      const legacyRefs = await prisma.slipVerification.findMany({
        where: {
          tenantId,
          ...(companyId ? { companyId } : {}),
          normalizedTransRef: null,
          transRef: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      transactionDuplicate = legacyRefs.find(item =>
        normalizeTransactionRef(item.transRef || '') === normalizedTransRef
      ) || null;
    }
  }

  const isSlipEvidence = slipok.success || (aiResult.success && aiResult.isSlip);
  const requiresBankNotification = await companyRequiresBankNotification(tenantId, companyId);
  const pendingAccountMessage = language === 'lo'
    ? '🧾 ໄດ້ຮັບສະລິບແລ້ວເຈົ້າ ລະບົບຍັງອ່ານບັນຊີຜູ້ຮັບບໍ່ຄົບ ແອດມິນຈະກວດສອບໃຫ້'
    : '🧾 ได้รับสลิปแล้วค่ะ ระบบยังอ่านบัญชีผู้รับได้ไม่ครบ เจ้าหน้าที่จะตรวจสอบให้นะคะ';

  if (isSlipEvidence && accountMismatch) {
    status = 'fake';
    verifiedBy = 'auto';
    message = language === 'lo'
      ? 'ບິນທີ່ລູກຄ້າສົ່ງມາບໍ່ແມ່ນບັນຊີຮ້ານເຮົາເດີ້'
      : 'สลิปที่ลูกค้าส่งมาไม่ใช่บัญชีของร้านเราค่ะ';
  } else if (isSlipEvidence && transactionDuplicate) {
    status = 'duplicate';
    verifiedBy = 'auto';
    message = language === 'lo'
      ? 'ສະລິບນີ້ມີເລກທຸລະກຳຊ້ຳກັບທີ່ເຄີຍສົ່ງມາແລ້ວເຈົ້າ ລົບກວນຢ່າສົ່ງສະລິບເກົ່າຊ້ຳ'
      : 'สลิปนี้มีเลขธุรกรรมซ้ำกับที่เคยส่งมาแล้วค่ะ กรุณาอย่าส่งสลิปเก่าซ้ำนะคะ';
  } else if (slipok.success) {
    // SlipOK only proves that the transfer record is readable. The shop
    // account, transaction reference, and AI tamper check must also pass.
    if (accountCheck.status !== 'match') {
      status = 'pending';
      verifiedBy = 'slipok';
      message = pendingAccountMessage;
    } else if (!normalizedTransRef || aiResult.suspicious || aiResult.confidence === 'low') {
      status = 'pending';
      verifiedBy = 'slipok';
      message = language === 'lo'
        ? `🧾 ໄດ້ຮັບສະລິບແລ້ວເຈົ້າ ຕ້ອງໃຫ້ແອດມິນຢືນຢັນເພີ່ມ\n💰 ${finalAmount?.toLocaleString() || '?'}\n🏦 ${finalBankFrom} → ${finalBankTo}`
        : `🧾 ได้รับสลิปแล้วค่ะ ต้องให้เจ้าหน้าที่ยืนยันเพิ่มเติม\n💰 ${finalAmount?.toLocaleString() || '?'} บาท\n🏦 ${finalBankFrom} → ${finalBankTo}`;
    } else if (requiresBankNotification) {
      status = 'pending';
      verifiedBy = 'bank_notification_pending';
      message = language === 'lo'
        ? `🧾 ກວດສະລິບແລ້ວ ກຳລັງລໍຖ້າຢືນຢັນເງິນເຂົ້າຈາກໂທລະສັບທະນາຄານ\n💰 ${finalAmount?.toLocaleString() || '?'}\n🔖 Ref: ${finalTransRef}`
        : `🧾 ตรวจข้อมูลสลิปแล้ว กำลังรอยืนยันเงินเข้าจากโทรศัพท์ธนาคาร\n💰 ${finalAmount?.toLocaleString() || '?'} บาท\n🔖 Ref: ${finalTransRef}`;
    } else {
      status = 'verified';
      verifiedBy = 'slipok';
      message = language === 'lo'
        ? `✅ ສະລິບຜ່ານການກວດສອບແລ້ວເຈົ້າ\n💰 ${finalAmount?.toLocaleString() || '?'}\n🏦 ${finalBankFrom} → ${finalBankTo}\n🔖 Ref: ${finalTransRef}`
        : `✅ สลิปผ่านการตรวจสอบแล้วค่ะ\n💰 ${finalAmount?.toLocaleString() || '?'} บาท\n🏦 ${finalBankFrom} → ${finalBankTo}\n🔖 Ref: ${finalTransRef}`;
    }
  } else if (aiResult.success) {
    if (!aiResult.isSlip) {
      // AI บอกว่าไม่ใช่สลิป
      status = 'not_slip';
      verifiedBy = 'ai';
      message = '';
    } else if (aiResult.suspicious) {
      // AI คิดว่าน่าสงสัย
      status = 'pending';
      verifiedBy = 'ai';
      message = language === 'lo'
        ? 'ແອດມິນໄດ້ຮັບສະລິບແລ້ວເຈົ້າ ກຳລັງກວດສອບລາຍລະອຽດເພີ່ມເຕີມໃຫ້'
        : 'แอดมินได้รับสลิปแล้วค่ะ กำลังตรวจสอบรายละเอียดเพิ่มเติมให้ รอสักครู่นะคะ';
    } else {
      // AI อ่านรายละเอียดได้ แต่ยังไม่ถือว่าเป็นของจริงจนกว่า SlipOK หรือแอดมินจะยืนยัน
      status = 'pending';
      verifiedBy = 'ai';
      finalAmount = aiResult.amount;
      finalBankFrom = aiResult.bankFrom || '';
      finalBankTo = aiResult.bankTo || '';
      message = language === 'lo'
        ? `🧾 ໄດ້ຮັບສະລິບແລ້ວເຈົ້າ ລໍຖ້າແອດມິນຢືນຢັນ\n💰 ${finalAmount?.toLocaleString() || '?'}\n🏦 ${finalBankFrom} → ${finalBankTo}`
        : `ได้รับสลิปแล้วครับ ระบบกำลังตรวจสอบให้ครับ\n💰 ${finalAmount?.toLocaleString() || '?'} บาท\n🏦 ${finalBankFrom} → ${finalBankTo}`;
      if (aiResult.confidence === 'low') {
        message += language === 'lo'
          ? '\n⚠️ ຮູບບໍ່ຊັດ ແອດມິນຈະກວດສອບເພີ່ມເຕີມໃຫ້ເຈົ້າ'
          : '\n⚠️ คุณภาพรูปต่ำ เจ้าหน้าที่จะตรวจสอบเพิ่มเติมค่ะ';
      }
    }
  } else {
    // ทั้ง 2 ตัวตรวจไม่ได้
    status = 'error';
    verifiedBy = 'auto';
    message = language === 'lo'
      ? '🧾 ໄດ້ຮັບສະລິບແລ້ວເຈົ້າ ແອດມິນກຳລັງກວດສອບໃຫ້ 🙏'
      : '🧾 ได้รับสลิปแล้วค่ะ ระบบยังตรวจสอบไม่ได้ตอนนี้ เจ้าหน้าที่จะตรวจให้นะคะ 🙏';
  }

  // ── Step 6: Save to database ────────────────────────────────────────────
  let record = await prisma.slipVerification.create({
    data: {
      tenantId, companyId, conversationId, contactId, messageId,
      imageHash: imgHash, imagePath: filePath,

      // SlipOK
      slipokSuccess: slipok.success || null,
      transRef: finalTransRef || undefined,
      normalizedTransRef: normalizedTransRef || undefined,
      currency: finalCurrency || undefined,
      sendingBank: slipok.sendingBank,
      receivingBank: slipok.receivingBank, amount: slipok.amount,
      transDate: slipok.transDate, transTime: slipok.transTime,
      senderName: slipok.senderName, receiverName: slipok.receiverName,

      // AI Vision
      aiSuccess: aiResult.success || null,
      aiAmount: aiResult.amount, aiBankFrom: aiResult.bankFrom,
      aiBankTo: aiResult.bankTo, aiTransDate: aiResult.transDate,
      aiTransTime: aiResult.transTime,
      aiConfidence: aiResult.confidence,
      aiSuspicious: aiResult.suspicious || false,
      aiReason: aiResult.reason,

      // Final
      status, verifiedBy,
      isDuplicate: status === 'duplicate',
      duplicateOfId: status === 'duplicate' ? transactionDuplicate?.id : undefined,
      notes: JSON.stringify({
        accountCheck: accountCheck.status,
        accountReason: accountCheck.reason,
        receiverName,
        receiverAccount,
        receiverAccountPrefix: accountCheck.observedPrefix,
        receiverAccountSuffix: accountCheck.observedSuffix,
      }),
    },
  });

  // When a company enrolled a capture phone, the notification becomes the
  // final corroborating source. Auto-approval requires one unconsumed credit
  // event with an exact full reference, amount, currency and company match.
  if (status === 'pending' && companyId && isSlipEvidence && requiresBankNotification) {
    const bankMatch = await matchSlipWithBankNotification({
      slipId: record.id,
      tenantId,
      companyId,
      amount: finalAmount,
      currency: finalCurrency,
      transRef: finalTransRef,
      receivingBank: finalBankTo,
      receiverAccountSuffix: accountCheck.observedSuffix,
      transDate: slipok.transDate || aiResult.transDate,
      transTime: slipok.transTime || aiResult.transTime,
      accountMatched: accountCheck.status === 'match',
      providerValidated: slipok.success,
      aiSuspicious: aiResult.suspicious,
    });
    if (bankMatch.matched) {
      status = 'verified';
      verifiedBy = 'bank_notification';
      record = (await prisma.slipVerification.findUnique({ where: { id: record.id } })) || record;
      message = language === 'lo'
        ? `✅ ກວດພົບເງິນເຂົ້າຈິງແລ້ວເຈົ້າ\n💰 ${finalAmount?.toLocaleString() || '?'}\n🏦 ${finalBankFrom} → ${finalBankTo}\n🔖 Ref: ${finalTransRef}`
        : `✅ ตรวจพบเงินเข้าจริงและยืนยันสลิปแล้ว\n💰 ${finalAmount?.toLocaleString() || '?'} บาท\n🏦 ${finalBankFrom} → ${finalBankTo}\n🔖 Ref: ${finalTransRef}`;
    } else if (bankMatch.duplicate) {
      status = 'duplicate';
      verifiedBy = 'bank_notification';
      record = (await prisma.slipVerification.findUnique({ where: { id: record.id } })) || record;
      message = language === 'lo'
        ? '⚠️ ເລກທຸລະກຳນີ້ຖືກໃຊ້ຢືນຢັນສະລິບອື່ນແລ້ວ ກະລຸນາຢ່າສົ່ງສະລິບເກົ່າຊ້ຳ'
        : '⚠️ เลขธุรกรรมนี้ถูกใช้ยืนยันสลิปอื่นแล้ว กรุณาอย่าส่งสลิปเก่าซ้ำ';
    } else if (bankMatch.conflict) {
      message = language === 'lo'
        ? '⚠️ ເລກທຸລະກຳກົງກັນ ແຕ່ຈຳນວນເງິນ ຫຼື ສະກຸນເງິນບໍ່ກົງ ແອດມິນຈະກວດສອບໃຫ້'
        : '⚠️ เลขธุรกรรมตรงกัน แต่ยอดหรือสกุลเงินไม่ตรง เจ้าหน้าที่จะตรวจสอบให้';
    }
  }

  console.log(`[SlipVerify] 📝 Saved: id=${record.id} status=${status} by=${verifiedBy}`);

  // ── Step 7: Emit socket event ───────────────────────────────────────────
  emitToTenant(tenantId, 'slip_verified', {
    conversationId, messageId, status, verifiedBy,
    amount: finalAmount, bankFrom: finalBankFrom, bankTo: finalBankTo,
    currency: finalCurrency,
    transRef: finalTransRef, record,
  });

  return {
    status, // ⚠️ คงค่า not_slip ไว้ (เดิม map เป็น 'fake' → รูปทั่วไปถูกตอบว่า "สลิปไม่ผ่าน")
    verifiedBy, amount: finalAmount,
    currency: finalCurrency || undefined,
    bankFrom: finalBankFrom, bankTo: finalBankTo,
    transRef: finalTransRef,
    receiverName,
    receiverAccount,
    receiverAccountPrefix: accountCheck.observedPrefix,
    receiverAccountSuffix: accountCheck.observedSuffix,
    accountCheck: accountCheck.status,
    bankNotificationMatched: record.bankMatchConfidence === 'high',
    bankMatchReason: record.bankMatchReason || undefined,
    message, record,
    imagePath: filePath,
  };
}

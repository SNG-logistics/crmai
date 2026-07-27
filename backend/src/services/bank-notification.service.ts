import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { emitToTenant } from '../lib/socket';
import { decryptSecret, encryptSecret } from './backend-api-config.service';

const REQUEST_WINDOW_MS = 5 * 60 * 1000;
const MAX_TEXT_LENGTH = 2_048;
const MATCH_ALGORITHM = 'bank_notification_ref_amount_bank_time_v2';
const EXACT_TIME_WINDOW_MS = 30 * 60 * 1000;
const EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SENSITIVE_RAW_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const eventSchema = z.object({
  eventId: z.string().trim().min(8).max(160),
  packageName: z.string().trim().min(3).max(220),
  signerSha256: z.string().trim().max(128).optional().nullable(),
  appVersion: z.string().trim().max(120).optional().nullable(),
  notificationKey: z.string().max(512).default(''),
  postedAt: z.string().datetime({ offset: true }),
  capturedAt: z.string().datetime({ offset: true }),
  title: z.string().max(MAX_TEXT_LENGTH).nullable().default('').transform(value => value || ''),
  text: z.string().max(MAX_TEXT_LENGTH).nullable().default('').transform(value => value || ''),
  bigText: z.string().max(MAX_TEXT_LENGTH).nullable().default('').transform(value => value || ''),
  textLines: z.array(z.string().max(MAX_TEXT_LENGTH)).max(20).default([]),
  parsed: z.object({
    direction: z.enum(['credit', 'debit', 'unknown']).default('unknown'),
    amount: z.number().finite().nonnegative().nullable().optional(),
    currency: z.string().trim().max(12).nullable().optional(),
    transactionRef: z.string().trim().max(120).nullable().optional(),
    accountSuffix: z.string().trim().max(20).nullable().optional(),
    sender: z.string().trim().max(180).nullable().optional(),
    bankHint: z.string().trim().max(100).nullable().optional(),
  }).default({ direction: 'unknown' }),
  test: z.boolean().default(false),
});

export type BankNotificationPayload = z.infer<typeof eventSchema>;

export type ParsedBankNotification = {
  direction: 'credit' | 'debit' | 'unknown';
  amountMinor: string | null;
  amountDisplay: string | null;
  currency: string | null;
  transRef: string | null;
  accountSuffix: string | null;
  senderName: string | null;
  bankHint: string | null;
  confidence: 'high' | 'medium' | 'low';
  containsOtp: boolean;
};

export type DeviceRequestHeaders = {
  publicId: string;
  timestamp: string;
  nonce: string;
  signature: string;
};

export type MatchInput = {
  slipId: string;
  tenantId: string;
  companyId: string;
  amount?: number | null;
  currency?: string | null;
  transRef?: string | null;
  receivingBank?: string | null;
  receiverAccountSuffix?: string | null;
  transDate?: string | null;
  transTime?: string | null;
  accountMatched: boolean;
  providerValidated?: boolean;
  aiSuspicious?: boolean;
  notifyCustomer?: boolean;
};

export type MatchResult = {
  matched: boolean;
  conflict?: boolean;
  duplicate?: boolean;
  reason: string;
  notificationId?: string;
};

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function timingSafeHexEqual(expectedHex: string, suppliedHex: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const supplied = Buffer.from(suppliedHex, 'hex');
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

export function normalizeBankPackage(value: string): string {
  return value.trim();
}

export function normalizeBankPackages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map(item => normalizeBankPackage(String(item || '')))
    .filter(item => /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/.test(item))
  )].slice(0, 20);
}

function normalizeSignerSha256(value?: string | null): string | null {
  const normalized = (value || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  return normalized.length === 64 ? normalized : null;
}

export function normalizeBankTransactionRef(value?: string | null): string {
  return (value || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeCurrency(value?: string | null): string | null {
  const normalized = (value || '').trim().toUpperCase();
  if (['THB', 'BAHT', '฿'].includes(normalized)) return 'THB';
  if (['LAK', 'KIP', '₭'].includes(normalized)) return 'LAK';
  if (['USD', '$'].includes(normalized)) return 'USD';
  return null;
}

function normalizeBankIdentity(value?: string | null): string | null {
  const source = (value || '').normalize('NFKC').toUpperCase();
  const aliases: Array<[string, string[]]> = [
    ['KBANK', ['KBANK', 'KASIKORN', 'กสิกร', '004']],
    ['SCB', ['SCB', 'SIAM COMMERCIAL', 'ไทยพาณิชย์', '014']],
    ['KTB', ['KTB', 'KRUNGTHAI', 'กรุงไทย', '006']],
    ['BBL', ['BBL', 'BANGKOK BANK', 'กรุงเทพ', '002']],
    ['BAY', ['BAY', 'KRUNGSRI', 'กรุงศรี', '025']],
    ['TTB', ['TTB', 'ทหารไทยธนชาต', '011']],
    ['GSB', ['GSB', 'ออมสิน', '030']],
    ['BCEL', ['BCEL', 'ທະນາຄານການຄ້າຕ່າງປະເທດລາວ']],
    ['JDB', ['JDB', 'JOINT DEVELOPMENT BANK']],
    ['LDB', ['LDB', 'LAO DEVELOPMENT BANK']],
  ];
  return aliases.find(([, values]) => values.some(item => source.includes(item)))?.[0] || null;
}

function normalizeAccountSuffix(value?: string | null): string | null {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length >= 3 ? digits.slice(-6) : null;
}

function parseSlipTransactionTime(dateValue?: string | null, timeValue?: string | null): Date | null {
  const date = (dateValue || '').trim();
  const time = (timeValue || '').trim();
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!timeMatch) return null;

  let year: number;
  let month: number;
  let day: number;
  let match = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
  } else {
    match = date.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (match) {
      year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
    } else {
      match = date.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (!match) return null;
      year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
    }
  }
  if (year >= 2400) year -= 543;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  // Thai and Lao bank slips use ICT (UTC+7).
  const parsed = new Date(Date.UTC(year, month - 1, day, hour - 7, minute, second));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function currencyFractionDigits(currency: string | null): number {
  return currency === 'LAK' ? 0 : 2;
}

export function amountToMinor(amount: number, currency: string | null): string | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const factor = 10 ** currencyFractionDigits(currency);
  const minor = Math.round(amount * factor);
  if (!Number.isSafeInteger(minor)) return null;
  return String(minor);
}

function parseAmountText(raw: string, currency: string | null): { minor: string; display: string } | null {
  const cleaned = raw.replace(/\s/g, '').replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  const minor = amountToMinor(amount, currency);
  if (!minor) return null;
  return { minor, display: cleaned };
}

function currencyFromText(value: string): string | null {
  const found = new Set<string>();
  if (/(?:LAK|KIP|ກີບ|₭)/iu.test(value)) found.add('LAK');
  if (/(?:THB|BAHT|บาท|฿)/iu.test(value)) found.add('THB');
  if (/(?:USD|US\$|\$)/iu.test(value)) found.add('USD');
  return found.size === 1 ? [...found][0] : null;
}

function nearestAmount(
  text: string,
  creditIndex: number,
): { minor: string; display: string; currency: string | null } | null {
  // Prefer the first numeric token immediately following the credit phrase.
  // This avoids selecting a later "available balance" when only that value has
  // a currency marker in the notification.
  if (creditIndex >= 0) {
    const nearby = text.slice(creditIndex, creditIndex + 100);
    const match = nearby.match(
      /(?:เงิน(?:โอน)?เข้า|ยอด(?:เงิน)?เข้า|ได้รับเงิน|รับเงิน|รับโอน|credited|money received|incoming transfer|deposit received|ເງິນເຂົ້າ|ໄດ້ຮັບເງິນ|ຮັບເງິນ|ຮັບໂອນ)[^\d]{0,30}([0-9][0-9,]*(?:\.\d{1,2})?)(?![\d/-])/iu,
    );
    if (match) {
      const amountEnd = (match.index || 0) + match[0].length;
      const localContext = match[0] + nearby.slice(amountEnd, amountEnd + 12);
      const currency = currencyFromText(localContext);
      const parsed = parseAmountText(match[1], currency);
      if (parsed) return { ...parsed, currency };
    }
  }

  const patterns = [
    /(?:THB|BAHT|บาท|฿|LAK|KIP|ກີບ|₭|USD|\$)\s*([0-9][0-9,\s]*(?:\.\d{1,2})?)/giu,
    /([0-9][0-9,\s]*(?:\.\d{1,2})?)\s*(?:THB|BAHT|บาท|฿|LAK|KIP|ກີບ|₭|USD|\$)/giu,
  ];
  const candidates: Array<{ distance: number; raw: string; context: string }> = [];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      candidates.push({
        distance: Math.abs(match.index - creditIndex),
        raw: match[1],
        context: match[0],
      });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  for (const candidate of candidates) {
    const currency = currencyFromText(candidate.context);
    const parsed = parseAmountText(candidate.raw, currency);
    if (parsed) return { ...parsed, currency };
  }

  return null;
}

function extractReference(text: string): string | null {
  const patterns = [
    /(?:เลข(?:ที่)?(?:รายการ|ธุรกรรม|อ้างอิง)|รหัส(?:รายการ|ธุรกรรม)|transaction\s*(?:id|ref(?:erence)?)|reference|ref\.?|ເລກ(?:ທຸລະກ(?:ຳ|ໍາ)|ອ້າງອີງ)|ລະຫັດທຸລະກ(?:ຳ|ໍາ))\s*[:#：-]?\s*([A-Z0-9][A-Z0-9-]{5,80})/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const normalized = normalizeBankTransactionRef(match?.[1]);
    if (normalized.length >= 6 && normalized.length <= 80) return normalized;
  }
  return null;
}

function extractAccountSuffix(text: string): string | null {
  const match = text.match(/(?:บัญชี|account|acct|ບັນຊີ)[^\d*Xx]{0,20}(?:[*Xx\- ]*)(\d{3,6})(?!\d)/iu);
  return match?.[1] || null;
}

function extractSender(text: string): string | null {
  const match = text.match(
    /(?:จาก|ผู้โอน|sender|from|ຈາກ|ຜູ້ໂອນ)\s*[:：-]?\s*(.{2,80}?)(?=\s+(?:เลข|รหัส|ref(?:erence)?|transaction|บัญชี|account|ເລກ|ລະຫັດ|ບັນຊີ)|[\n|,]|$)/iu,
  );
  return match?.[1]?.trim() || null;
}

export function parseBankNotification(payload: BankNotificationPayload): ParsedBankNotification {
  const textLines = Array.isArray(payload.textLines) ? payload.textLines : [];
  const combined = [payload.title, payload.text, payload.bigText, ...textLines]
    .filter(Boolean)
    .join('\n')
    // Keep Thai/Lao composed characters (for example ำ / ຳ) aligned with the
    // regex literals. Compatibility decomposition made valid bank phrases miss.
    .normalize('NFC');
  const lower = combined.toLocaleLowerCase('en-US');

  const otpPattern = /(?:\botp\b|one.?time.?password|รหัส\s*(?:otp|ยืนยัน)|ລະຫັດ\s*(?:otp|ຢືນຢັນ))/iu;
  const containsOtp = otpPattern.test(combined);
  const creditPattern = /(?:เงิน(?:โอน)?เข้า|ยอด(?:เงิน)?เข้า|ได้รับเงิน|รับเงิน|รับโอน|credited|credit alert|money received|incoming transfer|received (?:thb|lak|usd|\$|฿|₭)?|deposit received|ເງິນເຂົ້າ|ໄດ້ຮັບເງິນ|ຮັບເງິນ|ຮັບໂອນ)/iu;
  const debitPattern = /(?:เงิน(?:โอน)?ออก|ยอด(?:เงิน)?ออก|ชำระเงิน|ถอนเงิน|debited|debit alert|payment made|withdrawal|ເງິນອອກ|ໂອນອອກ|ຊຳລະ|ຖອນເງິນ)/iu;
  const creditMatch = creditPattern.exec(combined);
  const debitMatch = debitPattern.exec(combined);
  let direction: ParsedBankNotification['direction'] = 'unknown';
  if (creditMatch && (!debitMatch || creditMatch.index <= debitMatch.index)) direction = 'credit';
  else if (debitMatch) direction = 'debit';

  const amount = nearestAmount(combined, creditMatch?.index ?? -1);
  const currency = amount?.currency || null;
  const transRef = extractReference(combined);
  const parsedPayload = payload.parsed || {};
  const parsedSuffix = normalizeAccountSuffix(parsedPayload.accountSuffix);
  const visibleDigits = combined.replace(/\D/g, '');
  const visibleParsedSuffix = parsedSuffix && visibleDigits.includes(parsedSuffix) ? parsedSuffix : null;
  const accountSuffix = extractAccountSuffix(combined) || visibleParsedSuffix;
  const senderName = extractSender(combined);

  // App parsing is useful diagnostic corroboration only. A reference is adopted
  // only when the same normalized token is visibly present in notification text.
  const appRef = normalizeBankTransactionRef(parsedPayload.transactionRef);
  const visibleAppRef = appRef.length >= 6 && lower.replace(/[^a-z0-9]/g, '').includes(appRef.toLowerCase())
    ? appRef
    : null;

  const confidence: ParsedBankNotification['confidence'] =
    direction === 'credit' && !!amount && !!(transRef || visibleAppRef) && !!currency
      ? 'high'
      : direction !== 'unknown' && !!amount ? 'medium' : 'low';

  return {
    direction,
    amountMinor: amount?.minor || null,
    amountDisplay: amount?.display || null,
    currency,
    transRef: transRef || visibleAppRef,
    accountSuffix,
    senderName,
    bankHint: parsedPayload.bankHint || null,
    confidence,
    containsOtp,
  };
}

export async function companyRequiresBankNotification(tenantId: string, companyId?: string | null): Promise<boolean> {
  if (!companyId) return false;
  // Once a company enrolls a capture phone, suspending or losing that phone
  // must fail closed. Otherwise disabling the listener would silently restore
  // SlipOK-only auto approval.
  return (await prisma.bankCaptureDevice.count({
    where: { tenantId, companyId },
  })) > 0;
}

export async function cleanupBankNotificationSensitiveData(): Promise<void> {
  const cutoff = new Date(Date.now() - SENSITIVE_RAW_RETENTION_MS);
  await prisma.$transaction([
    prisma.bankRequestNonce.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.bankNotification.updateMany({
      where: { receivedAt: { lt: cutoff }, rawPayloadEncrypted: { not: null } },
      data: { rawPayloadEncrypted: null },
    }),
  ]);
}

export async function backfillHistoricalSlipCompanyIds(): Promise<number> {
  // The live installation is a baselined SQLite database and deploys schema
  // changes with `prisma db push`, which does not execute data migrations.
  // Keep this idempotent startup backfill alongside the SQL migration.
  return prisma.$executeRawUnsafe(`
    UPDATE "SlipVerification"
    SET "companyId" = COALESCE(
      (SELECT "companyId" FROM "Conversation"
       WHERE "Conversation"."id" = "SlipVerification"."conversationId"),
      (SELECT "id" FROM "Company"
       WHERE "Company"."tenantId" = "SlipVerification"."tenantId"
       ORDER BY "createdAt" ASC LIMIT 1)
    )
    WHERE "companyId" IS NULL
  `);
}

export function startBankNotificationMaintenance(): void {
  void backfillHistoricalSlipCompanyIds().then(count => {
    if (count > 0) console.log(`[BankNotification] Backfilled company on ${count} historical slips`);
  }).catch(error => {
    console.warn('[BankNotification] Historical slip backfill failed:', error?.message || error);
  });
  void cleanupBankNotificationSensitiveData().catch(error => {
    console.warn('[BankNotification] Initial privacy cleanup failed:', error?.message || error);
  });
  void reconcilePendingBankMatches().catch(error => {
    console.warn('[BankNotification] Initial pending-match reconciliation failed:', error?.message || error);
  });
  const timer = setInterval(() => {
    void cleanupBankNotificationSensitiveData().catch(error => {
      console.warn('[BankNotification] Scheduled privacy cleanup failed:', error?.message || error);
    });
  }, 24 * 60 * 60 * 1000);
  timer.unref();
  const reconcileTimer = setInterval(() => {
    void reconcilePendingBankMatches().catch(error => {
      console.warn('[BankNotification] Scheduled pending-match reconciliation failed:', error?.message || error);
    });
  }, 60 * 1000);
  reconcileTimer.unref();
}

async function notifyLateMatch(slip: {
  id: string;
  tenantId: string;
  conversationId: string;
  amount: number | null;
  aiAmount: number | null;
  normalizedTransRef: string | null;
}) {
  const amount = slip.amount ?? slip.aiAmount;
  const amountText = amount == null ? '?' : amount.toLocaleString('en-US');
  const message = `✅ ກວດພົບເງິນເຂົ້າຈິງແລ້ວເຈົ້າ\n💰 ${amountText}\n🔖 Ref: ${slip.normalizedTransRef || '-'}\nລະບົບໄດ້ຢືນຢັນສະລິບໃຫ້ແລ້ວ`;
  try {
    const whatsapp = await import('./whatsapp.service');
    await whatsapp.sendBankVerificationFollowUp(slip.conversationId, message, slip.id);
  } catch (error: any) {
    console.warn(`[BankNotification] Late WhatsApp follow-up failed slip=${slip.id}:`, error?.message || error);
  }
}

export async function matchSlipWithBankNotification(input: MatchInput): Promise<MatchResult> {
  const normalizedRef = normalizeBankTransactionRef(input.transRef);
  const currency = normalizeCurrency(input.currency);
  const amountMinor = input.amount == null ? null : amountToMinor(input.amount, currency);
  const expectedBank = normalizeBankIdentity(input.receivingBank);
  const expectedSuffix = normalizeAccountSuffix(input.receiverAccountSuffix);
  const expectedTime = parseSlipTransactionTime(input.transDate, input.transTime);

  const stayPending = async (reason: string, confidence = 'none'): Promise<MatchResult> => {
    await prisma.slipVerification.updateMany({
      where: { id: input.slipId, tenantId: input.tenantId, status: 'pending' },
      data: { bankMatchConfidence: confidence, bankMatchReason: reason },
    });
    return { matched: false, reason };
  };
  if (!input.accountMatched) return stayPending('receiving account is not confirmed');
  if (!input.providerValidated) {
    return stayPending('provider-validated slip evidence is required for automatic approval', 'blocked');
  }
  if (input.aiSuspicious) return stayPending('AI marked the slip as suspicious', 'blocked');
  if (normalizedRef.length < 6) return stayPending('full transaction reference is required');
  if (!currency) return stayPending('explicit supported currency is required');
  if (!amountMinor) return stayPending('valid amount is required');

  const activeDevices = await prisma.bankCaptureDevice.findMany({
    where: { tenantId: input.tenantId, companyId: input.companyId, isActive: true },
    select: {
      id: true,
      credentialVersion: true,
      allowedPackages: true,
      signerPins: true,
    },
  });
  const trustedDevices = new Map(activeDevices.map(device => [device.id, device]));
  const isCurrentlyTrusted = (item: {
    deviceId: string;
    credentialVersion: number;
    packageName: string;
    signerSha256: string | null;
  }): boolean => {
    const device = trustedDevices.get(item.deviceId);
    if (!device || item.credentialVersion !== device.credentialVersion) return false;
    let allowedPackages: string[] = [];
    let signerPins: Record<string, string> = {};
    try { allowedPackages = normalizeBankPackages(JSON.parse(device.allowedPackages || '[]')); }
    catch { allowedPackages = []; }
    try { signerPins = JSON.parse(device.signerPins || '{}'); }
    catch { signerPins = {}; }
    const currentPin = normalizeSignerSha256(signerPins[item.packageName]);
    const eventSigner = normalizeSignerSha256(item.signerSha256);
    return allowedPackages.includes(item.packageName)
      && !!currentPin
      && currentPin === eventSigner;
  };

  const refCandidates = await prisma.bankNotification.findMany({
    where: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      direction: 'credit',
      status: { in: ['received', 'matched', 'conflict'] },
      transRef: normalizedRef,
      postedAt: { gte: new Date(Date.now() - EVENT_RETENTION_MS) },
      receivedAt: { gte: new Date(Date.now() - EVENT_RETENTION_MS) },
    },
    orderBy: { receivedAt: 'desc' },
    take: 10,
  });
  const evidenceCompatible = (item: typeof refCandidates[number]) => {
    const eventBank = normalizeBankIdentity(item.bankHint);
    const eventSuffix = normalizeAccountSuffix(item.accountSuffix);
    const bankMatches = !expectedBank || !eventBank || expectedBank === eventBank;
    const accountMatches = !expectedSuffix || !eventSuffix
      || expectedSuffix.endsWith(eventSuffix)
      || eventSuffix.endsWith(expectedSuffix);
    const timeMatches = !expectedTime
      || Math.abs(item.postedAt.getTime() - expectedTime.getTime()) <= EXACT_TIME_WINDOW_MS;
    return bankMatches && accountMatches && timeMatches;
  };
  const eligible = refCandidates.filter(item =>
    ['received', 'conflict'].includes(item.status)
    && item.matchedSlipId === null
    && isCurrentlyTrusted(item)
  );
  const exact = eligible.filter(item =>
    item.amountMinor === amountMinor
    && item.currency === currency
    && item.parseConfidence === 'high'
    && evidenceCompatible(item)
  );

  const sameValue = eligible.filter(item =>
    item.amountMinor === amountMinor && item.currency === currency && evidenceCompatible(item)
  );
  const consumed = refCandidates.find(item =>
    item.matchedSlipId !== null
    && item.amountMinor === amountMinor
    && item.currency === currency
    && evidenceCompatible(item)
  );
  if (consumed?.matchedSlipId) {
    const reason = 'bank transaction was already consumed by another slip';
    await prisma.slipVerification.updateMany({
      where: { id: input.slipId, tenantId: input.tenantId, status: 'pending' },
      data: {
        status: 'duplicate',
        verifiedBy: 'bank_notification',
        isDuplicate: true,
        duplicateOfId: consumed.matchedSlipId,
        bankMatchConfidence: 'duplicate',
        bankMatchReason: reason,
      },
    });
    return { matched: false, duplicate: true, reason, notificationId: consumed.id };
  }
  if (exact.length === 0 && eligible.length > 0 && sameValue.length === 0) {
    const reason = 'notification reference matches but amount/currency conflicts';
    await prisma.slipVerification.updateMany({
      where: { id: input.slipId, tenantId: input.tenantId, status: 'pending' },
      data: { bankMatchConfidence: 'conflict', bankMatchReason: reason },
    });
    await prisma.bankNotification.updateMany({
      where: { id: { in: eligible.map(item => item.id) }, matchedSlipId: null },
      // Keep the evidence eligible for a later legitimate slip. A bogus
      // wrong-amount slip must not be able to poison a real bank event.
      data: { matchReason: reason },
    });
    return { matched: false, conflict: true, reason };
  }
  if (exact.length === 0 && sameValue.length > 0) {
    const reason = 'bank notification parser confidence is insufficient for automatic approval';
    await prisma.slipVerification.updateMany({
      where: { id: input.slipId, tenantId: input.tenantId, status: 'pending' },
      data: { bankMatchConfidence: 'low', bankMatchReason: reason },
    });
    return { matched: false, reason };
  }
  if (exact.length === 0 && refCandidates.length > 0 && eligible.length === 0) {
    return stayPending('matching notification is no longer trusted by the current device enrollment', 'blocked');
  }
  if (exact.length !== 1) {
    const reason = exact.length > 1
      ? 'multiple unconsumed bank notifications match; manual review required'
      : 'no matching bank notification received yet';
    await prisma.slipVerification.updateMany({
      where: { id: input.slipId, tenantId: input.tenantId, status: 'pending' },
      data: { bankMatchConfidence: exact.length > 1 ? 'ambiguous' : 'none', bankMatchReason: reason },
    });
    return { matched: false, reason };
  }

  const candidate = exact[0];
  const atomicClaim = await prisma.$transaction(async tx => {
    const claimed = await tx.bankNotification.updateMany({
      where: { id: candidate.id, matchedSlipId: null },
      data: {
        matchedSlipId: input.slipId,
        status: 'matched',
        matchReason: MATCH_ALGORITHM,
      },
    });
    if (claimed.count !== 1) return 'event_consumed' as const;

    const updated = await tx.slipVerification.updateMany({
      where: { id: input.slipId, tenantId: input.tenantId, status: 'pending' },
      data: {
        status: 'verified',
        verifiedBy: 'bank_notification',
        bankMatchConfidence: 'high',
        bankMatchReason: MATCH_ALGORITHM,
        bankMatchedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      // Returning would commit the first update, so restore it inside the same
      // transaction. Other writers cannot observe the intermediate claim.
      await tx.bankNotification.updateMany({
        where: { id: candidate.id, matchedSlipId: input.slipId },
        data: { matchedSlipId: null, status: 'received', matchReason: null },
      });
      return 'slip_changed' as const;
    }
    return 'matched' as const;
  });
  if (atomicClaim === 'event_consumed') {
    return { matched: false, reason: 'bank notification was already consumed' };
  }
  if (atomicClaim === 'slip_changed') {
    return { matched: false, reason: 'slip status changed before the match was claimed' };
  }

  const slip = await prisma.slipVerification.findUnique({ where: { id: input.slipId } });
  emitToTenant(input.tenantId, 'slip_verified', {
    conversationId: slip?.conversationId,
    messageId: slip?.messageId,
    status: 'verified',
    verifiedBy: 'bank_notification',
    bankNotificationId: candidate.id,
    record: slip,
  });
  emitToTenant(input.tenantId, 'conversation_updated', {
    id: slip?.conversationId,
    conversationId: slip?.conversationId,
    slipId: input.slipId,
    slipStatus: 'verified',
  });

  if (input.notifyCustomer && slip) await notifyLateMatch(slip);
  return { matched: true, reason: MATCH_ALGORITHM, notificationId: candidate.id };
}

async function reconcileIncomingNotification(notification: {
  tenantId: string;
  companyId: string;
  transRef: string | null;
}) {
  if (!notification.transRef) return;
  const candidates = await prisma.slipVerification.findMany({
    where: {
      tenantId: notification.tenantId,
      companyId: notification.companyId,
      normalizedTransRef: notification.transRef,
      status: 'pending',
    },
    orderBy: { createdAt: 'asc' },
    take: 5,
  });
  for (const slip of candidates) {
    let accountMatched = false;
    let accountSuffix: string | null = null;
    try {
      const notes = JSON.parse(slip.notes || '{}');
      accountMatched = notes.accountCheck === 'match';
      accountSuffix = notes.receiverAccountSuffix || null;
    } catch { /* fail closed */ }
    const result = await matchSlipWithBankNotification({
      slipId: slip.id,
      tenantId: slip.tenantId,
      companyId: notification.companyId,
      amount: slip.amount ?? slip.aiAmount,
      currency: slip.currency,
      transRef: slip.normalizedTransRef,
      receivingBank: slip.receivingBank || slip.aiBankTo,
      receiverAccountSuffix: accountSuffix,
      transDate: slip.transDate || slip.aiTransDate,
      transTime: slip.transTime || slip.aiTransTime,
      accountMatched,
      providerValidated: slip.slipokSuccess === true,
      aiSuspicious: slip.aiSuspicious,
      notifyCustomer: true,
    });
    if (result.matched) break;
  }
}

let reconciliationRunning = false;
async function reconcilePendingBankMatches(): Promise<void> {
  if (reconciliationRunning) return;
  reconciliationRunning = true;
  try {
    const notifications = await prisma.bankNotification.findMany({
      where: {
        direction: 'credit',
        status: { in: ['received', 'conflict'] },
        matchedSlipId: null,
        transRef: { not: null },
        postedAt: { gte: new Date(Date.now() - EVENT_RETENTION_MS) },
      },
      orderBy: { receivedAt: 'desc' },
      take: 100,
      select: { tenantId: true, companyId: true, transRef: true },
    });
    for (const notification of notifications) {
      await reconcileIncomingNotification(notification);
    }
  } finally {
    reconciliationRunning = false;
  }
}

export async function authenticateAndIngestBankNotification(
  rawBody: Buffer,
  headers: DeviceRequestHeaders,
): Promise<{ statusCode: number; body: any }> {
  if (!headers.publicId || !headers.timestamp || !headers.nonce || !headers.signature) {
    return { statusCode: 401, body: { success: false, message: 'Missing device signature headers' } };
  }
  if (!/^[A-Za-z0-9_-]{16,160}$/.test(headers.nonce)) {
    return { statusCode: 401, body: { success: false, message: 'Invalid request nonce' } };
  }
  const rawTimestamp = Number(headers.timestamp);
  const timestampMs = rawTimestamp < 10_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > REQUEST_WINDOW_MS) {
    return { statusCode: 401, body: { success: false, message: 'Request timestamp expired' } };
  }

  const device = await prisma.bankCaptureDevice.findUnique({ where: { publicId: headers.publicId } });
  if (!device || !device.isActive) {
    return { statusCode: 401, body: { success: false, message: 'Unknown or inactive device' } };
  }
  const secret = decryptSecret(device.secretEncrypted);
  if (!secret) return { statusCode: 401, body: { success: false, message: 'Device credential is unavailable' } };

  const signingInput = `${headers.timestamp}\n${headers.nonce}\n${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signingInput).digest('hex');
  if (!timingSafeHexEqual(expected, headers.signature)) {
    return { statusCode: 401, body: { success: false, message: 'Invalid device signature' } };
  }

  try {
    await prisma.bankRequestNonce.create({
      data: { tenantId: device.tenantId, deviceId: device.id, nonce: headers.nonce },
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return { statusCode: 409, body: { success: false, message: 'Request replay rejected' } };
    }
    throw error;
  }

  let json: unknown;
  try { json = JSON.parse(rawBody.toString('utf8')); }
  catch { return { statusCode: 400, body: { success: false, message: 'Invalid JSON body' } }; }
  const checked = eventSchema.safeParse(json);
  if (!checked.success) {
    return {
      statusCode: 400,
      body: { success: false, message: 'Invalid notification event', issues: checked.error.issues.map(i => i.path.join('.')) },
    };
  }
  const payload = checked.data;
  const postedAt = new Date(payload.postedAt);
  const capturedAt = new Date(payload.capturedAt);
  const now = Date.now();
  const futureToleranceMs = 5 * 60 * 1000;
  if (
    postedAt.getTime() > now + futureToleranceMs
    || capturedAt.getTime() > now + futureToleranceMs
    || postedAt.getTime() < now - EVENT_RETENTION_MS
    || capturedAt.getTime() < postedAt.getTime() - futureToleranceMs
  ) {
    return {
      statusCode: 422,
      body: { success: false, message: 'Notification timestamps are outside the accepted window' },
    };
  }

  const parsed = parseBankNotification(payload);
  if (parsed.containsOtp) {
    await prisma.bankCaptureDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date(), lastError: 'OTP notification discarded' },
    });
    return { statusCode: 202, body: { success: true, accepted: false, reason: 'sensitive notification discarded' } };
  }
  if (payload.test) {
    await prisma.bankCaptureDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date(), lastError: null },
    });
    return {
      statusCode: 200,
      body: { success: true, accepted: true, test: true, parser: { direction: parsed.direction, confidence: parsed.confidence } },
    };
  }

  // Trust-on-first-use pinning detects a bank app being replaced later. It is
  // not a substitute for Android device integrity, but it prevents silent
  // signer changes during normal operation.
  const signerSha256 = normalizeSignerSha256(payload.signerSha256);
  if (!signerSha256) {
    await prisma.bankCaptureDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date(), lastError: 'Missing bank app signing certificate digest' },
    });
    return { statusCode: 403, body: { success: false, message: 'Bank app signer evidence is required' } };
  }
  const safeRaw = JSON.stringify({
    title: payload.title,
    text: payload.text,
    bigText: payload.bigText,
    textLines: payload.textLines,
  });
  const encryptedRaw = encryptSecret(safeRaw);
  const atomicIngest = await prisma.$transaction(async tx => {
    const currentDevice = await tx.bankCaptureDevice.findUnique({ where: { id: device.id } });
    if (
      !currentDevice
      || !currentDevice.isActive
      || currentDevice.credentialVersion !== device.credentialVersion
    ) {
      return { kind: 'credential_changed' as const };
    }

    let currentPackages: string[] = [];
    try { currentPackages = normalizeBankPackages(JSON.parse(currentDevice.allowedPackages || '[]')); }
    catch { currentPackages = []; }
    if (!currentPackages.includes(payload.packageName)) {
      await tx.bankCaptureDevice.update({
        where: { id: currentDevice.id },
        data: { lastSeenAt: new Date(), lastError: 'Rejected package outside allow-list' },
      });
      return { kind: 'package_rejected' as const };
    }

    let signerPins: Record<string, string> = {};
    try { signerPins = JSON.parse(currentDevice.signerPins || '{}'); }
    catch { signerPins = {}; }
    const pinnedSigner = normalizeSignerSha256(signerPins[payload.packageName]);
    if (pinnedSigner && pinnedSigner !== signerSha256) {
      await tx.bankCaptureDevice.update({
        where: { id: currentDevice.id },
        data: { lastSeenAt: new Date(), lastError: 'Bank app signing certificate changed' },
      });
      return { kind: 'signer_rejected' as const };
    }
    if (!pinnedSigner) signerPins[payload.packageName] = signerSha256;

    const existing = await tx.bankNotification.findUnique({
      where: { deviceId_eventId: { deviceId: currentDevice.id, eventId: payload.eventId } },
    });
    if (existing) {
      await tx.bankCaptureDevice.update({
        where: { id: currentDevice.id },
        data: { lastSeenAt: new Date(), lastError: null, signerPins: JSON.stringify(signerPins) },
      });
      return { kind: 'duplicate' as const, notification: existing };
    }

    const notification = await tx.bankNotification.create({
      data: {
        tenantId: currentDevice.tenantId,
        companyId: currentDevice.companyId,
        deviceId: currentDevice.id,
        credentialVersion: currentDevice.credentialVersion,
        eventId: payload.eventId,
        notificationKeyHash: sha256(payload.notificationKey || payload.eventId),
        packageName: payload.packageName,
        signerSha256,
        appVersion: payload.appVersion || null,
        bankHint: parsed.bankHint,
        direction: parsed.direction,
        amountMinor: parsed.amountMinor,
        amountDisplay: parsed.amountDisplay,
        currency: parsed.currency,
        transRef: parsed.transRef,
        accountSuffix: parsed.accountSuffix,
        senderName: parsed.senderName,
        postedAt,
        capturedAt,
        contentHash: sha256(safeRaw),
        rawPayloadEncrypted: encryptedRaw,
        parseConfidence: parsed.confidence,
        status: parsed.direction === 'credit' ? 'received' : 'ignored',
        matchReason: parsed.direction === 'credit' ? null : `direction=${parsed.direction}`,
      },
    });
    await tx.bankCaptureDevice.update({
      where: { id: currentDevice.id },
      data: { lastSeenAt: new Date(), lastError: null, signerPins: JSON.stringify(signerPins) },
    });
    return { kind: 'created' as const, notification };
  });

  if (atomicIngest.kind === 'credential_changed') {
    return {
      statusCode: 409,
      body: { success: false, message: 'Device enrollment changed while the event was being accepted' },
    };
  }
  if (atomicIngest.kind === 'package_rejected') {
    return { statusCode: 403, body: { success: false, message: 'Package is not allowed for this device' } };
  }
  if (atomicIngest.kind === 'signer_rejected') {
    return {
      statusCode: 403,
      body: { success: false, message: 'Bank app signing certificate does not match the enrolled pin' },
    };
  }
  if (atomicIngest.kind === 'duplicate') {
    if (
      atomicIngest.notification.direction === 'credit'
      && atomicIngest.notification.transRef
    ) {
      await reconcileIncomingNotification(atomicIngest.notification);
    }
    return {
      statusCode: 200,
      body: {
        success: true,
        accepted: true,
        duplicate: true,
        notificationId: atomicIngest.notification.id,
        status: atomicIngest.notification.status,
      },
    };
  }
  const notification = atomicIngest.notification;

  if (notification.direction === 'credit' && notification.transRef) {
    await reconcileIncomingNotification(notification);
  }
  return {
    statusCode: 202,
    body: {
      success: true,
      accepted: true,
      notificationId: notification.id,
      direction: notification.direction,
      parserConfidence: notification.parseConfidence,
      status: notification.status,
    },
  };
}

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import OpenAI from 'openai';
import prisma from '../lib/prisma';
import { emitToTenant } from '../lib/socket';

// ─── Config ──────────────────────────────────────────────────────────────────
const SLIPOK_API_KEY  = process.env.SLIPOK_API_KEY || '';
const SLIPOK_BRANCH   = process.env.SLIPOK_BRANCH_ID || '';
const SLIPS_DIR       = path.resolve(__dirname, '../../uploads/slips');

const aiClient = new OpenAI({
  apiKey:  process.env.COMETAPI_KEY || '',
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
  imageHash: string
): Promise<{ isDuplicate: boolean; originalId?: string; originalDate?: Date }> {
  const existing = await prisma.slipVerification.findFirst({
    where: { tenantId, imageHash, status: { not: 'error' } },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    return {
      isDuplicate: true,
      originalId: existing.id,
      originalDate: existing.createdAt,
    };
  }
  return { isDuplicate: false };
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
  bankFrom?: string;
  bankTo?: string;
  transDate?: string;
  transTime?: string;
  transRef?: string;
  senderName?: string;
  receiverName?: string;
  confidence?: string;
  suspicious?: boolean;
  reason?: string;
  error?: string;
}

const AI_VISION_PROMPT = `วิเคราะห์รูปนี้ ตอบเป็น JSON เท่านั้น (ไม่ต้องมี markdown):
{
  "isSlip": true/false,
  "amount": 0,
  "bankFrom": "ชื่อธนาคารต้นทาง",
  "bankTo": "ชื่อธนาคารปลายทาง",
  "transDate": "DD/MM/YYYY",
  "transTime": "HH:MM",
  "transRef": "เลขอ้างอิง",
  "senderName": "ชื่อผู้โอน",
  "receiverName": "ชื่อผู้รับ",
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
- ตรวจ: ตัวเลขคมชัดหรือเบลอผิดปกติ, font ไม่ตรงกับธนาคาร, ขอบภาพตัดต่อ, โลโก้ผิด
- ถ้ามีสิ่งผิดปกติ suspicious=true พร้อมเหตุผลใน reason
- confidence: high=ชัดเจน, medium=ไม่แน่ใจบาง field, low=คุณภาพต่ำ
- ห้ามถือว่าปี พ.ศ. เป็นความผิดปกติ`;

export async function verifyWithAIVision(imageBuffer: Buffer): Promise<AIVisionResult> {
  try {
    const base64 = imageBuffer.toString('base64');
    const imageUrl = `data:image/jpeg;base64,${base64}`;

    const response = await aiClient.chat.completions.create({
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
      temperature: 0.1,
    });

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

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Main Orchestrator — verifySlip
// ═══════════════════════════════════════════════════════════════════════════════
interface VerifySlipOptions {
  tenantId: string;
  conversationId: string;
  contactId: string;
  messageId: string;
  accessToken: string;
  userId: string; // LINE userId for push response
}

interface VerifySlipResult {
  status: 'verified' | 'fake' | 'duplicate' | 'not_slip' | 'error';
  verifiedBy: string;
  amount?: number;
  bankFrom?: string;
  bankTo?: string;
  transRef?: string;
  message: string; // message to send to customer
  record?: any; // saved DB record
}

export async function verifySlip(opts: VerifySlipOptions): Promise<VerifySlipResult> {
  const { tenantId, conversationId, contactId, messageId, accessToken } = opts;

  console.log(`[SlipVerify] 🔍 Starting verification: tenant=${tenantId} msg=${messageId}`);

  // ── Step 1: Download image ──────────────────────────────────────────────
  let buffer: Buffer;
  let filePath: string;
  try {
    const dl = await downloadLineImage(messageId, accessToken);
    buffer = dl.buffer;
    filePath = dl.filePath;
  } catch (err: any) {
    console.error(`[SlipVerify] ❌ Download failed: ${err.message}`);
    return {
      status: 'error', verifiedBy: 'auto',
      message: 'ไม่สามารถดาวน์โหลดรูปได้ค่ะ กรุณาส่งใหม่อีกครั้งนะคะ 🙏',
    };
  }

  // ── Step 2: Hash + Duplicate check ──────────────────────────────────────
  const imgHash = hashImage(buffer);
  const dupCheck = await checkDuplicate(tenantId, imgHash);

  if (dupCheck.isDuplicate) {
    console.log(`[SlipVerify] ⚠️ Duplicate slip detected! original=${dupCheck.originalId}`);

    const timeAgo = dupCheck.originalDate
      ? Math.round((Date.now() - dupCheck.originalDate.getTime()) / 60000)
      : null;
    const timeStr = timeAgo !== null
      ? (timeAgo < 60 ? `${timeAgo} นาทีก่อน` : `${Math.round(timeAgo / 60)} ชม.ก่อน`)
      : '';

    const record = await prisma.slipVerification.create({
      data: {
        tenantId, conversationId, contactId, messageId,
        imageHash: imgHash, imagePath: filePath,
        status: 'duplicate', verifiedBy: 'auto',
        isDuplicate: true, duplicateOfId: dupCheck.originalId,
      },
    });

    emitToTenant(tenantId, 'slip_verified', {
      conversationId, messageId, status: 'duplicate', record,
    });

    return {
      status: 'duplicate', verifiedBy: 'auto',
      message: `⚠️ สลิปนี้เคยส่งมาแล้วค่ะ (${timeStr}) กรุณาส่งสลิปใหม่ที่ยังไม่เคยใช้นะคะ`,
      record,
    };
  }

  // ── Step 3: SlipOK verification ─────────────────────────────────────────
  const slipok = await verifyWithSlipOK(filePath);

  // ── Step 4: AI Vision verification ──────────────────────────────────────
  const aiResult = await verifyWithAIVision(buffer);

  // ── Step 5: Determine final verdict ─────────────────────────────────────
  let status: 'verified' | 'fake' | 'not_slip' | 'error' = 'error';
  let verifiedBy = 'auto';
  let finalAmount = slipok.amount || aiResult.amount;
  let finalBankFrom = bankName(slipok.sendingBank) || aiResult.bankFrom || '';
  let finalBankTo = bankName(slipok.receivingBank) || aiResult.bankTo || '';
  let finalTransRef = slipok.transRef || aiResult.transRef || '';
  let message = '';

  if (slipok.success) {
    // SlipOK ยืนยันได้ → เชื่อถือสูง
    status = 'verified';
    verifiedBy = 'slipok';

    if (aiResult.suspicious) {
      // SlipOK OK แต่ AI สงสัย → ยังถือว่าผ่านแต่แจ้ง admin
      message = `✅ สลิปผ่านการตรวจสอบแล้วค่ะ\n💰 ${finalAmount?.toLocaleString() || '?'} บาท\n🏦 ${finalBankFrom} → ${finalBankTo}\n🔖 Ref: ${finalTransRef}`;
    } else {
      message = `✅ สลิปผ่านการตรวจสอบแล้วค่ะ\n💰 ${finalAmount?.toLocaleString() || '?'} บาท\n🏦 ${finalBankFrom} → ${finalBankTo}\n🔖 Ref: ${finalTransRef}`;
    }
  } else if (aiResult.success) {
    if (!aiResult.isSlip) {
      // AI บอกว่าไม่ใช่สลิป
      status = 'not_slip';
      verifiedBy = 'ai';
      message = `🖼️ รูปนี้ไม่ใช่สลิปโอนเงินค่ะ กรุณาส่งสลิปจากแอปธนาคารนะคะ 🙏`;
    } else if (aiResult.suspicious) {
      // AI คิดว่าน่าสงสัย
      status = 'fake';
      verifiedBy = 'ai';
      message = `⚠️ สลิปนี้ไม่ผ่านการตรวจสอบค่ะ\nเหตุผล: ${aiResult.reason || 'พบความผิดปกติ'}\nกรุณาส่งสลิปจริงจากแอปธนาคารนะคะ`;
    } else {
      // AI OK แต่ SlipOK ไม่ได้
      status = 'verified';
      verifiedBy = 'ai';
      finalAmount = aiResult.amount;
      finalBankFrom = aiResult.bankFrom || '';
      finalBankTo = aiResult.bankTo || '';
      message = `✅ สลิปผ่านการตรวจสอบแล้วค่ะ (AI)\n💰 ${finalAmount?.toLocaleString() || '?'} บาท\n🏦 ${finalBankFrom} → ${finalBankTo}`;
      if (aiResult.confidence === 'low') {
        message += `\n⚠️ คุณภาพรูปต่ำ เจ้าหน้าที่จะตรวจสอบเพิ่มเติมค่ะ`;
      }
    }
  } else {
    // ทั้ง 2 ตัวตรวจไม่ได้
    status = 'error';
    verifiedBy = 'auto';
    message = `🧾 ได้รับสลิปแล้วค่ะ ระบบยังตรวจสอบไม่ได้ตอนนี้ เจ้าหน้าที่จะตรวจให้นะคะ 🙏`;
  }

  // ── Step 6: Save to database ────────────────────────────────────────────
  const record = await prisma.slipVerification.create({
    data: {
      tenantId, conversationId, contactId, messageId,
      imageHash: imgHash, imagePath: filePath,

      // SlipOK
      slipokSuccess: slipok.success || null,
      transRef: slipok.transRef, sendingBank: slipok.sendingBank,
      receivingBank: slipok.receivingBank, amount: slipok.amount,
      transDate: slipok.transDate, transTime: slipok.transTime,
      senderName: slipok.senderName, receiverName: slipok.receiverName,

      // AI Vision
      aiSuccess: aiResult.success || null,
      aiAmount: aiResult.amount, aiBankFrom: aiResult.bankFrom,
      aiBankTo: aiResult.bankTo, aiTransDate: aiResult.transDate,
      aiConfidence: aiResult.confidence,
      aiSuspicious: aiResult.suspicious || false,
      aiReason: aiResult.reason,

      // Final
      status, verifiedBy,
      isDuplicate: false,
    },
  });

  console.log(`[SlipVerify] 📝 Saved: id=${record.id} status=${status} by=${verifiedBy}`);

  // ── Step 7: Emit socket event ───────────────────────────────────────────
  emitToTenant(tenantId, 'slip_verified', {
    conversationId, messageId, status, verifiedBy,
    amount: finalAmount, bankFrom: finalBankFrom, bankTo: finalBankTo,
    transRef: finalTransRef, record,
  });

  return {
    status: status === 'not_slip' ? 'fake' : status,
    verifiedBy, amount: finalAmount,
    bankFrom: finalBankFrom, bankTo: finalBankTo,
    transRef: finalTransRef, message, record,
  };
}

import prisma from '../lib/prisma';
import { generateAIResponse } from './ai.service';

// ─── Contact Memory — เก็บข้อมูลลูกค้าจากแชทอัตโนมัติ ────────────────────────
//  เมื่อลูกค้าพิมพ์ข้อมูลส่วนตัว (ชื่อ-สกุล, เบอร์, ธนาคาร, เลขบัญชี, ยูสเซอร์)
//  ระบบจะสกัดด้วย AI แล้วบันทึกลง Contact (customFields.crm_profile) อัตโนมัติ
//  → Bot จะไม่ขอข้อมูลซ้ำ และใช้ทวนยืนยันเวลาลูกค้าขอความช่วยเหลือ

export type CrmProfile = {
  fullName?: string;
  phone?: string;
  bankName?: string;
  bankAccount?: string;
  gameUsername?: string;
  updatedAt?: string;
};

export type RegistrationSnapshot = CrmProfile & {
  capturedAt: string;
  completedAt?: string;
  channel?: 'line' | 'whatsapp' | 'telegram';
};

function parseCustomFields(contact: { customFields?: string | null }): any {
  try { return JSON.parse(contact.customFields || '{}'); } catch { return {}; }
}

export function normalizeCustomerPhone(value?: string | null): string | undefined {
  if (!value || typeof value !== 'string' || /@(?:lid|s\.whatsapp\.net)|\blid\b/i.test(value)) return undefined;
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15 || /^(\d)\1+$/.test(digits)) return undefined;
  return digits;
}

export function normalizeBankAccount(value?: string | null): string | undefined {
  if (!value || typeof value !== 'string' || /@(?:lid|s\.whatsapp\.net)|\blid\b/i.test(value)) return undefined;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 24 || /^(\d)\1+$/.test(digits)) return undefined;
  return digits;
}

function cleanTextField(value: unknown, maxLength: number, genericLabels: RegExp): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  if (
    !cleaned
    || cleaned.toLowerCase() === 'null'
    || cleaned === '-'
    || /@(?:lid|s\.whatsapp\.net)|\blid\b/i.test(cleaned)
    || genericLabels.test(cleaned)
    || !/[a-zA-Zก-๙\u0E80-\u0EFF]/.test(cleaned)
  ) return undefined;
  return cleaned;
}

export function readProfile(contact: { customFields?: string | null; phone?: string | null; username?: string | null; firstName?: string | null; lastName?: string | null }): CrmProfile {
  const cf = parseCustomFields(contact);
  const p: CrmProfile = { ...(cf.crm_profile || {}) };
  p.phone = normalizeCustomerPhone(p.phone);
  p.bankAccount = normalizeBankAccount(p.bankAccount);
  p.fullName = cleanTextField(p.fullName, 120, /^(?:ชื่อ|ชื่อ\s*[-–—]?\s*(?:สกุล|นามสกุล)|ຊື່|ຊື່\s*[-–—]?\s*ນາມສະກຸນ)$/i);
  p.bankName = cleanTextField(p.bankName, 80, /^(?:ธนาคาร|ชื่อธนาคาร|ທະນາຄານ)$/i);
  // fields หลักบน Contact เติมช่องว่าง
  if (!p.phone && contact.phone) p.phone = normalizeCustomerPhone(contact.phone);
  if (!p.gameUsername && contact.username) p.gameUsername = contact.username;
  if (!p.fullName && (contact.firstName || contact.lastName)) {
    p.fullName = cleanTextField(
      [contact.firstName, contact.lastName].filter(Boolean).join(' '),
      120,
      /^(?:ชื่อ|ชื่อ\s*[-–—]?\s*(?:สกุล|นามสกุล)|ຊື່|ຊື່\s*[-–—]?\s*ນາມສະກຸນ)$/i,
    );
  }
  return p;
}

export function readRegistrationSnapshot(contact: { customFields?: string | null }): RegistrationSnapshot | null {
  const snapshot = parseCustomFields(contact).registration_snapshot;
  return snapshot && typeof snapshot === 'object' && snapshot.capturedAt ? snapshot : null;
}

// ─── Intent: ลูกค้าต้องการสมัครสมาชิก ─────────────────────────────────────────
export function isRegisterIntent(text: string): boolean {
  return /สมัคร|regis|register|sign\s?up|เปิดยูส|เปิดบัญชี|เปิดid|ສະໝັກ|สมัก/i.test(text || '');
}

// รายการฟิลด์ที่ต้องใช้สมัคร
export const REGISTER_FIELDS: { key: keyof CrmProfile; label: string }[] = [
  { key: 'fullName',    label: 'ชื่อ - นามสกุล' },
  { key: 'phone',       label: 'เบอร์โทรศัพท์ที่ใช้สมัครสมาชิก' },
  { key: 'bankName',    label: 'ธนาคาร' },
  { key: 'bankAccount', label: 'เลขบัญชีธนาคาร' },
];

export function missingRegisterFields(p: CrmProfile): { key: keyof CrmProfile; label: string }[] {
  return REGISTER_FIELDS.filter(f => !p[f.key]);
}

// สร้างข้อความขอข้อมูลสมัคร — ขอเฉพาะที่ยังขาด / ถ้าครบแล้วให้ทวนยืนยัน
export function buildRegisterReply(p: CrmProfile, language: 'th' | 'lo' = 'th'): string {
  const missing = missingRegisterFields(p);
  if (language === 'lo') {
    const labels: Record<string, string> = {
      fullName: 'ຊື່ - ນາມສະກຸນ',
      phone: 'ເບີໂທທີ່ໃຊ້ສະໝັກ',
      bankName: 'ທະນາຄານ',
      bankAccount: 'ເລກບັນຊີທະນາຄານ',
    };
    if (missing.length === REGISTER_FIELDS.length) {
      return `ລົບກວນແຈ້ງຂໍ້ມູນສະໝັກດັ່ງນີ້ເຈົ້າ\n✅ຊື່ - ນາມສະກຸນ:\n✅ເບີໂທທີ່ໃຊ້ສະໝັກ:\n✅ທະນາຄານ:\n✅ເລກບັນຊີທະນາຄານ:\n\nກະລຸນາພິມຂໍ້ມູນເປັນຕົວໜັງສືໃຫ້ແອດມິນເຈົ້າ`;
    }
    if (missing.length > 0) {
      const have = REGISTER_FIELDS.filter(f => p[f.key]).map(f => `✅${labels[f.key]}: ${p[f.key]}`).join('\n');
      const need = missing.map(f => `✅${labels[f.key]}:`).join('\n');
      return `ຂໍ້ມູນທີ່ໄດ້ຮັບແລ້ວເຈົ້າ\n${have}\n\nລົບກວນແຈ້ງເພີ່ມອີກໜ້ອຍເຈົ້າ\n${need}`;
    }
    const all = REGISTER_FIELDS.map(f => `✅${labels[f.key]}: ${p[f.key]}`).join('\n');
    return `ຢືນຢັນຂໍ້ມູນການສະໝັກຂອງລູກຄ້າແມ່ນ\n${all}\n\nລະບົບບັນທຶກຂໍ້ມູນໃຫ້ແລ້ວເຈົ້າ ຖ້າມີຈຸດໃດບໍ່ຖືກ ແຈ້ງແກ້ໄຂໄດ້ເລີຍເຈົ້າ`;
  }
  if (missing.length === REGISTER_FIELDS.length) {
    // ยังไม่มีข้อมูลเลย → ขอทั้งชุด (ฟอร์มมาตรฐาน)
    return `🖌รบกวนลูกค้าแจ้งข้อมูลดังนี้นะคะ🖌\n✅ชื่อ - นามสกุล :\n✅เบอร์โทรศัพท์ที่ใช้สมัครสมาชิก :\n✅ธนาคาร :\n✅เลขบัญชีธนาคาร :\n\nรบกวนคุณลูกค้าพิมพ์ข้อมูลเป็นตัวอักษรให้กับทางทีมงานนะคะ`;
  }
  if (missing.length > 0) {
    // มีบางส่วนแล้ว → โชว์ที่มี + ขอเฉพาะที่ขาด
    const have = REGISTER_FIELDS.filter(f => p[f.key]).map(f => `✅${f.label} : ${p[f.key]}`).join('\n');
    const need = missing.map(f => `✅${f.label} :`).join('\n');
    return `ข้อมูลที่ได้รับแล้วค่ะ🖌\n${have}\n\nรบกวนขอเพิ่มอีกนิดนะคะ🙏\n${need}`;
  }
  // ครบแล้ว → ทวนยืนยัน ไม่ขอซ้ำ
  const all = REGISTER_FIELDS.map(f => `✅${f.label} : ${p[f.key]}`).join('\n');
  return `ยืนยันข้อมูลการสมัครของลูกค้าดังนี้ค่ะ\n${all}\n\nระบบบันทึกข้อมูลให้แล้วนะคะ หากมีจุดไหนไม่ถูกต้องแจ้งแก้ไขได้เลยค่ะ`;
}

// ข้อความนี้น่าจะมี "ข้อมูลจริง" ของลูกค้าไหม — เข้มงวด: ต้องมีตัวเลขยาว (เบอร์/บัญชี)
// หรือมีคีย์เวิร์ดฟิลด์+เนื้อหา (เช่น "ชื่อ สมชาย ใจดี") — คำถามเฉยๆ เช่น "สมัครยังไง" จะไม่จับ
export function mightContainCustomerInfo(text: string): boolean {
  if (!text) return false;
  const digitRuns = text.match(/\d[\d\s-]{7,}/g); // ตัวเลขต่อเนื่อง ≥8 หลัก (เบอร์/เลขบัญชี)
  if (digitRuns) return true;
  // คีย์เวิร์ดฟิลด์ + มีเนื้อหาตามหลัง (มี : หรือช่องว่างตามด้วยตัวอักษร ≥2 คำ)
  const kw = /(ชื่อ|สกุล|นามสกุล|ธนาคาร|บัญชี|ยูสเซอร์|ยูส|กสิกร|ไทยพาณิชย์|กรุงไทย|กรุงเทพ|กรุงศรี|ออมสิน|ttb|scb|kbank|ktb|bbl|bay|ຊື່|ນາມສະກຸນ|ທະນາຄານ|ບັນຊີ)/i;
  if (!kw.test(text)) return false;
  // ต้องดูเหมือน "ให้ข้อมูล" ไม่ใช่ "ถามคำถาม"
  if (/ยังไง|อย่างไร|ไหม|มั้ย|\?|ได้บ่|แນວໃດ/i.test(text) && !text.includes(':')) return false;
  return true;
}

function labeledValue(text: string, label: RegExp): string | undefined {
  const lines = (text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(label);
    if (!match) continue;
    const sameLine = lines[i]
      .slice((match.index || 0) + match[0].length)
      .replace(/^[\s:：=\-–—]+/, '')
      .trim();
    if (sameLine) return sameLine;
    const nextLine = lines[i + 1]?.replace(/^[\s:：=\-–—]+/, '').trim();
    const looksLikeAnotherField = /^(?:[✅✔☑•*_-]\s*)?(?:ชื่อ|นามสกุล|สกุล|เบอร์|โทรศัพท์|ธนาคาร|บัญชี|เลข\s*บัญชี|ยูส|username|ຊື່|ນາມສະກຸນ|ເບີໂທ|ທະນາຄານ|ເລກ\s*ບັນຊີ|ຢູສເຊີ)/i.test(nextLine || '');
    if (nextLine && !/[:：]$/.test(nextLine) && !looksLikeAnotherField) return nextLine;
  }
  return undefined;
}

/**
 * Deterministic fallback for the common registration form pasted into chat.
 * This keeps customer data capture working even when the extraction model is
 * temporarily unavailable or returns invalid JSON.
 */
export function extractStructuredCustomerInfo(text: string): CrmProfile {
  const fullName = labeledValue(
    text,
    /(?:ชื่อ\s*(?:-|–|—)?\s*นามสกุล|ชื่อ\s*[-–—]?\s*สกุล|ຊື່\s*(?:-|–|—)?\s*ນາມສະກຸນ)/i,
  );
  const phoneRaw = labeledValue(
    text,
    /(?:เบอร์(?:โทรศัพท์|โทร)?(?:ที่ใช้สมัครสมาชิก)?|โทรศัพท์|ເບີໂທ(?:ທີ່ໃຊ້ສະໝັກ)?)/i,
  );
  const bankName = labeledValue(
    text,
    /^(?:[✅✔☑•*_-]\s*)?(?:ธนาคาร|ທະນາຄານ)(?!\s*(?:บัญชี|ບັນຊີ))/i,
  );
  const bankAccountRaw = labeledValue(
    text,
    /(?:เลข\s*บัญชี(?:ธนาคาร)?|บัญชีธนาคาร|ເລກ\s*ບັນຊີ(?:ທະນາຄານ)?)/i,
  );
  const gameUsername = labeledValue(
    text,
    /(?:ยูสเซอร์(?:เนม)?|ยูสเกม|ชื่อผู้ใช้|username|user\s*id|ຢູສເຊີ|ຊື່ຜູ້ໃຊ້)/i,
  );
  return {
    fullName: cleanTextField(fullName, 120, /^(?:ชื่อ|ชื่อ\s*[-–—]?\s*(?:สกุล|นามสกุล)|ຊື່|ຊື່\s*[-–—]?\s*ນາມສະກຸນ)$/i),
    phone: normalizeCustomerPhone(phoneRaw),
    bankName: cleanTextField(bankName, 80, /^(?:ธนาคาร|ชื่อธนาคาร|ທະນາຄານ)$/i),
    bankAccount: normalizeBankAccount(bankAccountRaw),
    gameUsername: cleanTextField(gameUsername, 100, /^(?:ยูส|ยูสเซอร์|username|ຢູສເຊີ)$/i),
  };
}

// ─── สกัดข้อมูลจากบทสนทนาล่าสุดด้วย AI แล้วบันทึก ────────────────────────────
export async function captureCustomerInfo(opts: {
  tenantId: string;
  contactId: string;
  // ประวัติล่าสุด (รวมข้อความล่าสุดของลูกค้า) — ใช้ ~6 ข้อความพอ
  recentMessages: { role: 'user' | 'assistant'; content: string }[];
  registrationFlow?: boolean;
  channel?: 'line' | 'whatsapp' | 'telegram';
}): Promise<CrmProfile | null> {
  const { tenantId, contactId, recentMessages, registrationFlow = false, channel } = opts;
  try {
    const contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) return null;
    const existing = readProfile(contact as any);

    const recent = recentMessages.slice(-10);
    const convo = recent
      .map(m => `${m.role === 'user' ? 'ลูกค้า' : 'แอดมิน'}: ${m.content}`)
      .join('\n');
    const customerMessages = recent.filter(message => message.role === 'user');
    const customerOnlyText = customerMessages.map(message => message.content).join('\n');
    const deterministic = customerMessages.reduce<CrmProfile>((result, message) => ({
      ...result,
      ...extractStructuredCustomerInfo(message.content),
    }), {});

    let parsed: any = {};
    try {
      const raw = await generateAIResponse([
        {
          role: 'system',
          content: `สกัดข้อมูลส่วนตัวของ "ลูกค้า" จากบทสนทนา ตอบ JSON เท่านั้น:
{"fullName":"ชื่อ-นามสกุลจริง หรือ null","phone":"เบอร์โทร (ตัวเลขล้วน) หรือ null","bankName":"ชื่อธนาคาร หรือ null","bankAccount":"เลขบัญชี (ตัวเลขล้วน) หรือ null","gameUsername":"ยูสเซอร์เนม หรือ null"}
กฎ:
- เอาเฉพาะข้อมูลที่ลูกค้าพิมพ์เอง ห้ามเดา และห้ามคัดค่าจากข้อความของแอดมิน/บอท
- ใช้ข้อความของแอดมินได้เพียงเพื่อรู้ว่ากำลังถามช่องใด
- ข้อมูลที่บันทึกไว้แล้วคือ ${JSON.stringify(existing)} ให้ใช้เพื่อรู้ว่าช่องใดยังขาดเท่านั้น ห้ามส่งค่าชุดนี้กลับมาเป็นผลการสกัด
- ตัวเลขที่ไม่แน่ใจว่าเป็นเบอร์โทรหรือเลขบัญชีให้ใส่ null
- ห้ามเอา LINE display, WhatsApp JID, ค่า @lid หรือหัวข้อฟอร์มเปล่ามาเป็นข้อมูล
- ถ้าไม่มีหลักฐานชัดเจนให้ใส่ null`,
        },
        { role: 'user', content: convo },
      ], process.env.COMETAPI_LIGHT_MODEL || 'gpt-4o-mini', 0.1, 200);
      try {
        parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      } catch {
        console.warn('[ContactMemory] AI returned invalid JSON; using deterministic registration parser');
      }
    } catch (error: any) {
      console.warn('[ContactMemory] AI extraction unavailable; using deterministic registration parser:', error.message);
    }

    const normalizedEvidence = customerOnlyText.toLowerCase().replace(/\s+/g, '');
    const hasTextEvidence = (value: unknown) => {
      if (!value || typeof value !== 'string') return false;
      const needle = value.toLowerCase().replace(/\s+/g, '');
      return needle.length >= 2 && normalizedEvidence.includes(needle);
    };
    const hasDigitEvidence = (value: unknown) => {
      if (!value || typeof value !== 'string') return false;
      const digits = value.replace(/\D/g, '');
      return digits.length >= 6 && customerOnlyText.replace(/\D/g, '').includes(digits);
    };
    const aiFullName = hasTextEvidence(parsed.fullName)
      ? cleanTextField(parsed.fullName, 120, /^(?:ชื่อ|ชื่อ\s*[-–—]?\s*(?:สกุล|นามสกุล)|ຊື່|ຊື່\s*[-–—]?\s*ນາມສະກຸນ)$/i)
      : undefined;
    const aiBankName = hasTextEvidence(parsed.bankName)
      ? cleanTextField(parsed.bankName, 80, /^(?:ธนาคาร|ชื่อธนาคาร|ທະນາຄານ)$/i)
      : undefined;
    const aiGameUsername = hasTextEvidence(parsed.gameUsername)
      ? cleanTextField(parsed.gameUsername, 100, /^(?:ยูส|ยูสเซอร์|username|ຢູສເຊີ)$/i)
      : undefined;
    const found: CrmProfile = {
      fullName: deterministic.fullName || aiFullName,
      phone: deterministic.phone || (hasDigitEvidence(parsed.phone) ? normalizeCustomerPhone(parsed.phone) : undefined),
      bankName: deterministic.bankName || aiBankName,
      bankAccount: deterministic.bankAccount || (hasDigitEvidence(parsed.bankAccount) ? normalizeBankAccount(parsed.bankAccount) : undefined),
      gameUsername: deterministic.gameUsername || aiGameUsername,
    };
    // ไม่เจออะไรใหม่เลย → จบ
    if (!found.fullName && !found.phone && !found.bankName && !found.bankAccount && !found.gameUsername) return null;

    // ค่า AI ที่ไม่มี label เติมเฉพาะช่องว่าง เพื่อลดโอกาสเลขชุดใหม่ไปทับเบอร์/บัญชีเดิมผิดช่อง
    // ค่า deterministic มาจาก label ที่ลูกค้าพิมพ์ชัดเจน จึงอนุญาตให้แก้ค่าปัจจุบันได้
    const merged: CrmProfile = { ...existing };
    let changed = false;
    (['fullName', 'phone', 'bankName', 'bankAccount', 'gameUsername'] as const).forEach(k => {
      const explicitlyLabeled = Boolean(deterministic[k]);
      if (found[k] && (!merged[k] || explicitlyLabeled) && found[k] !== merged[k]) {
        merged[k] = found[k];
        changed = true;
      }
    });
    // เขียนกลับ: โปรไฟล์ล่าสุด + snapshot การสมัครที่ผ่าน validation
    const cf = parseCustomFields(contact as any);
    let snapshotChanged = false;
    if (changed) merged.updatedAt = new Date().toISOString();
    cf.crm_profile = merged;
    if (registrationFlow || REGISTER_FIELDS.filter(field => found[field.key]).length >= 2) {
      const now = new Date().toISOString();
      const snapshot: RegistrationSnapshot = cf.registration_snapshot && typeof cf.registration_snapshot === 'object'
        ? { ...cf.registration_snapshot }
        : { capturedAt: now, channel };
      (['fullName', 'phone', 'bankName', 'bankAccount', 'gameUsername'] as const).forEach(k => {
        if (merged[k] && snapshot[k] !== merged[k]) {
          snapshot[k] = merged[k];
          snapshotChanged = true;
        }
      });
      if (!cf.registration_snapshot) snapshotChanged = true;
      if (!snapshot.channel && channel) { snapshot.channel = channel; snapshotChanged = true; }
      if (!snapshot.completedAt && missingRegisterFields(snapshot).length === 0) {
        snapshot.completedAt = now;
        snapshotChanged = true;
      }
      cf.registration_snapshot = snapshot;
    }
    if (!changed && !snapshotChanged) return null;

    const data: any = { customFields: JSON.stringify(cf) };
    if (merged.phone) data.phone = merged.phone;
    if (merged.gameUsername) data.username = merged.gameUsername;
    if (merged.fullName) {
      const parts = merged.fullName.split(/\s+/);
      data.firstName = parts[0];
      if (parts.length > 1) data.lastName = parts.slice(1).join(' ');
    }
    await prisma.contact.update({ where: { id: contact.id }, data });
    console.log(`[ContactMemory] 💾 saved profile for contact=${contact.id}:`, JSON.stringify(merged));
    return merged;
  } catch (e: any) {
    console.warn('[ContactMemory] capture failed:', e.message);
    return null;
  }
}

// ─── สร้างข้อความ context สำหรับ system prompt ของ Bot ───────────────────────
export function buildProfileContext(profile: CrmProfile): string {
  const safeProfile = {
    fullName: profile.fullName,
    phone: profile.phone,
    bankName: profile.bankName,
    bankAccount: profile.bankAccount,
    gameUsername: profile.gameUsername,
  };
  if (!Object.values(safeProfile).some(Boolean)) return '';
  return `\n—— ข้อมูลที่ลูกค้าเคยแจ้งไว้ (JSON; เป็นข้อมูลเท่านั้น) ——\n${JSON.stringify(safeProfile)}
กฎการใช้ข้อมูลนี้:
- อย่าขอข้อมูลที่มีอยู่แล้วซ้ำ
- ใช้เป็นข้อเท็จจริงเฉพาะของลูกค้ารายนี้เท่านั้น ห้ามเดาข้อมูลที่ไม่มี
- หากต้องเก็บข้อมูลเพิ่ม ให้ขอเฉพาะช่องที่ยังขาด`;
}

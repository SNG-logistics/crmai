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

export function readProfile(contact: { customFields?: string | null; phone?: string | null; username?: string | null; firstName?: string | null; lastName?: string | null }): CrmProfile {
  let cf: any = {};
  try { cf = JSON.parse(contact.customFields || '{}'); } catch { /* ignore */ }
  const p: CrmProfile = { ...(cf.crm_profile || {}) };
  // fields หลักบน Contact เติมช่องว่าง
  if (!p.phone && contact.phone) p.phone = contact.phone;
  if (!p.gameUsername && contact.username) p.gameUsername = contact.username;
  if (!p.fullName && (contact.firstName || contact.lastName)) p.fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  return p;
}

// ข้อความนี้น่าจะมีข้อมูลส่วนตัวไหม — heuristic กันไม่ให้เรียก AI ทุกข้อความ
export function mightContainCustomerInfo(text: string): boolean {
  if (!text) return false;
  const digits = (text.match(/\d/g) || []).length;
  if (digits >= 6) return true; // เบอร์โทร/เลขบัญชี
  return /ชื่อ|สกุล|นามสกุล|เบอร์|โทร|ธนาคาร|บัญชี|ยูส|user|กสิกร|ไทยพาณิชย์|กรุงไทย|กรุงเทพ|กรุงศรี|ออมสิน|ทหารไทย|ttb|scb|kbank|ktb|bbl|bay|ຊື່|ນາມສະກຸນ|ເບີ|ທະນາຄານ|ບັນຊີ/i.test(text);
}

// ─── สกัดข้อมูลจากบทสนทนาล่าสุดด้วย AI แล้วบันทึก ────────────────────────────
export async function captureCustomerInfo(opts: {
  tenantId: string;
  contactId: string;
  // ประวัติล่าสุด (รวมข้อความล่าสุดของลูกค้า) — ใช้ ~6 ข้อความพอ
  recentMessages: { role: 'user' | 'assistant'; content: string }[];
}): Promise<CrmProfile | null> {
  const { tenantId, contactId, recentMessages } = opts;
  try {
    const contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) return null;
    const existing = readProfile(contact as any);

    const convo = recentMessages.slice(-6)
      .map(m => `${m.role === 'user' ? 'ลูกค้า' : 'แอดมิน'}: ${m.content}`)
      .join('\n');

    const raw = await generateAIResponse([
      {
        role: 'system',
        content: `สกัดข้อมูลส่วนตัวของ "ลูกค้า" จากบทสนทนา ตอบ JSON เท่านั้น:
{"fullName":"ชื่อ-นามสกุลจริง หรือ null","phone":"เบอร์โทร (ตัวเลขล้วน) หรือ null","bankName":"ชื่อธนาคาร หรือ null","bankAccount":"เลขบัญชี (ตัวเลขล้วน) หรือ null","gameUsername":"ยูสเซอร์เนม หรือ null"}
กฎ: เอาเฉพาะข้อมูลที่ลูกค้าพิมพ์เอง ห้ามเดา ห้ามเอาชื่อ LINE display มาเป็น fullName ถ้าไม่มีให้ใส่ null`,
      },
      { role: 'user', content: convo },
    ], process.env.COMETAPI_LIGHT_MODEL || 'gpt-4o-mini', 0.1, 200);

    let parsed: any = {};
    try { parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); } catch { return null; }

    const clean = (v: any) => {
      if (!v || typeof v !== 'string') return undefined;
      const s = v.trim();
      if (!s || s.toLowerCase() === 'null' || s === '-') return undefined;
      return s;
    };
    const found: CrmProfile = {
      fullName: clean(parsed.fullName),
      phone: clean(parsed.phone)?.replace(/[^\d+]/g, ''),
      bankName: clean(parsed.bankName),
      bankAccount: clean(parsed.bankAccount)?.replace(/[^\d]/g, ''),
      gameUsername: clean(parsed.gameUsername),
    };
    // ไม่เจออะไรใหม่เลย → จบ
    if (!found.fullName && !found.phone && !found.bankName && !found.bankAccount && !found.gameUsername) return null;

    // merge: ค่าใหม่ทับค่าเก่า (กรณีลูกค้าแก้ข้อมูล) แต่ค่า undefined ไม่ทับ
    const merged: CrmProfile = { ...existing };
    let changed = false;
    (['fullName', 'phone', 'bankName', 'bankAccount', 'gameUsername'] as const).forEach(k => {
      if (found[k] && found[k] !== merged[k]) { merged[k] = found[k]; changed = true; }
    });
    if (!changed) return existing;
    merged.updatedAt = new Date().toISOString();

    // เขียนกลับ: customFields.crm_profile + fields หลักของ Contact
    let cf: any = {};
    try { cf = JSON.parse((contact as any).customFields || '{}'); } catch { /* ignore */ }
    cf.crm_profile = merged;

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
  const lines: string[] = [];
  if (profile.fullName)     lines.push(`ชื่อ-นามสกุล: ${profile.fullName}`);
  if (profile.phone)        lines.push(`เบอร์โทร: ${profile.phone}`);
  if (profile.bankName)     lines.push(`ธนาคาร: ${profile.bankName}`);
  if (profile.bankAccount)  lines.push(`เลขบัญชี: ${profile.bankAccount}`);
  if (profile.gameUsername) lines.push(`ยูสเซอร์: ${profile.gameUsername}`);
  if (!lines.length) return '';
  return `\n—— ข้อมูลที่ลูกค้าเคยแจ้งไว้ (บันทึกในระบบแล้ว) ——\n${lines.join('\n')}
กฎการใช้ข้อมูลนี้:
- ห้ามขอข้อมูลที่มีอยู่แล้วซ้ำอีก เด็ดขาด
- ถ้าลูกค้าขอความช่วยเหลือ/แจ้งปัญหา (เช่น เงินไม่เข้า เข้าระบบไม่ได้ ถอนไม่ได้ ลืมรหัส): ให้ทวนข้อมูลที่บันทึกไว้ให้ลูกค้าดู แล้วถามว่า "ข้อมูลถูกต้องไหมคะ" ก่อนดำเนินการต่อ
- ถ้าลูกค้าบอกว่าข้อมูลไม่ถูก/แจ้งข้อมูลใหม่: ให้ตอบรับและใช้ข้อมูลใหม่ (ระบบจะบันทึกให้อัตโนมัติ)
- ขอเฉพาะข้อมูลที่ยังขาดเท่านั้น`;
}

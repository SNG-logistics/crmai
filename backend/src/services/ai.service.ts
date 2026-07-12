import OpenAI from 'openai';
import prisma from '../lib/prisma';

const client = new OpenAI({
  apiKey: process.env.COMETAPI_KEY || '',
  baseURL: process.env.COMETAPI_BASE_URL || 'https://api.cometapi.com/v1',
});

const DEFAULT_MODEL = process.env.COMETAPI_MODEL || 'gpt-4o';
const LIGHT_MODEL   = process.env.COMETAPI_LIGHT_MODEL || 'gpt-4o-mini';

// ─── Handoff — ต้องเป็นคำสั่งชัดเจน ไม่ใช่แค่คำเดียว ──────────────────────────
const EXPLICIT_HANDOFF_PHRASES = [
  'ขอคุยกับเจ้าหน้าที่', 'ขอคุยกับคนจริงๆ', 'ติดต่อพนักงาน', 'ไม่เอา AI',
  'อยากคุยกับแอดมิน', 'ต้องการพนักงาน', 'speak to agent', 'human agent',
  'โอนให้คนดูแล', 'ขอพูดกับคน',
];

function checkHandoff(userMessage: string, aiReply: string, extraKeywords?: string): boolean {
  return false;
}

// ─── Smart KB Matching — รองรับภาษาไทย/ลาว (ไม่มีช่องว่างระหว่างคำ) ────────────
//  ปัญหาเดิม: split(/\s+/) ใช้ไม่ได้กับไทย/ลาว เพราะทั้งประโยคกลายเป็น 1 คำ → FAQ ไม่เคยแมตช์
//  แก้: ใช้ (1) n-gram ตัวอักษร (bigram) วัดความคล้าย + (2) แมตช์คำ/วลีที่ทับซ้อนกัน
function cleanKB(s: string): string {
  return (s || '').toLowerCase().replace(/[^ก-๙຀-໿a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// bigram ของตัวอักษร (ตัด emoji/สัญลักษณ์ก่อน) — ใช้เทียบไทย/ลาวที่ไม่มีเว้นวรรค
function charBigrams(s: string): Set<string> {
  const t = cleanKB(s).replace(/\s+/g, '');
  const set = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}
function bigramOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.min(a.size, b.size); // 0-1 : สัดส่วนที่ประโยคสั้นกว่าถูกครอบคลุม
}

function scoreKB(kb: { question: string; answer: string }, userMessage: string): number {
  const msg = cleanKB(userMessage);
  const q   = cleanKB(kb.question);
  if (!msg || !q) return 0;
  let score = 0;
  // 1) ความคล้ายของตัวอักษร (ครอบคลุมไทย/ลาวที่ไม่มีเว้นวรรค) — น้ำหนักหลัก
  score += bigramOverlap(charBigrams(userMessage), charBigrams(kb.question)) * 10; // 0-10
  // 2) คำ/วลีของ FAQ ปรากฏในข้อความลูกค้า (เช่น "ถอน", "สมัคร", "โปร") — เจตนาที่ชัด
  for (const w of new Set(q.split(' ').filter(w => w.length >= 2))) if (msg.includes(w)) score += 3;
  // 3) คำของลูกค้าปรากฏในคำถาม FAQ
  for (const w of new Set(msg.split(' ').filter(w => w.length >= 2))) if (q.includes(w)) score += 1;
  return score;
}

const PROMOTION_INFO = `
—— โปรโมชั่นที่มีอยู่ (ข้อมูลจริง ห้ามเปลี่ยนแปลง) ——

📌 โปรสมาชิกใหม่ รับโบนัส 50%
• ฝาก 100 บาท → รับโบนัสเพิ่ม 50 บาท (รวม 150 บาท)
• ฝาก 200 บาท → รับโบนัสเพิ่ม 100 บาท (รวม 300 บาท)
• ฝาก 300 บาท → รับโบนัสเพิ่ม 150 บาท (รวม 450 บาท)
• ยอดเทิร์น: 3 เท่าของ (ยอดฝาก + โบนัส) ถึงจะถอนได้
• ถอนสูงสุด: 10 เท่าของ (ยอดฝาก + โบนัส)

ตัวอย่างเทิร์น: ฝาก 100 + โบนัส 50 = 150 บาท → เทิร์น 150×3 = 450 บาท
ตัวอย่างถอนสูงสุด: ฝาก 100 + โบนัส 50 = 150 บาท → ถอนได้สูงสุด 1,500 บาท

กฎตอบโปร:
- ถ้าลูกค้าถามโปรโมชั่น ให้ตอบตามข้อมูลข้างบนเป๊ะๆ ห้ามประดิษฐ์ข้อมูลเอง
- ถ้าลูกค้าถามว่ารับโปรได้ไหม ให้แจ้งว่าสมัครใหม่รับได้เลยค่ะ
- ถ้าลูกค้าถามเรื่องเทิร์น ให้อธิบายสั้นๆ ตามตัวอย่างข้างบน`;

const SYSTEM_BASE = `กฎสำคัญ:
- ตอบภาษาไทยเสมอ ไม่เกิน 2 ประโยคสั้นๆ
- ใช้ภาษาพูดธรรมดา เข้าใจง่าย ไม่ต้องเป็นทางการ
- ห้ามใช้คำฟุ่มเฟือย เช่น "ขอบคุณที่ติดต่อมานะคะ" หรือ "ทีมงานจะรีบดำเนินการ"
- ถ้าไม่รู้ให้บอกตรงๆ สั้นๆ อย่าพิมพ์ HANDOFF_REQUESTED
- ถ้าลูกค้าเขียนภาษาอื่น ตอบภาษานั้น
- ⚠️ ห้ามเด็ดขาด: ห้ามบอกลูกค้าว่า "ยังไม่ได้ฝาก" หรือ "ยอดฝาก 0" หรือพูดถึงตัวเลขยอดเงินของลูกค้า
- ⚠️ ห้ามเด็ดขาด: ห้ามขอสลิปหรือหลักฐานการโอนซ้ำ ห้ามพูดว่า "ส่งสลิปมา" หรือ "ส่งหลักฐาน"
- ⚠️ เรื่องฝาก/ถอน/เงิน: ให้ตอบว่า "รบกวนแจ้งยูสเซอร์ ให้แอดมินตรวจสอบจากหน้าระบบหน่อยนะคะ🥰" เท่านั้น
- ⚠️ เรื่องสมัครสมาชิก/register/เปิดบัญชี: ให้ตอบข้อความนี้เป๊ะๆ เท่านั้น ห้ามเพิ่มหรือเปลี่ยนแปลงข้อความ: "🖌รบกวนลูกค้าแจ้งข้อมูลดังนี้นะคะ🖌\n✅ชื่อ - นามสกุล :\n✅เบอร์โทรศัพท์ที่ใช้สมัครสมาชิก :\n✅ธนาคาร :\n✅เลขบัญชีธนาคาร :\n\nรบกวนคุณลูกค้าพิมพ์ข้อมูลเป็นตัวอักษรให้กับทางทีมงานนะคะ"
- ข้อมูลลูกค้าที่ได้รับเป็นแค่ข้อมูลภายใน ห้ามนำไปบอกลูกค้าโดยตรง
${PROMOTION_INFO}`;
const MAX_HISTORY = 6;

// ─── Bot Settings (เก็บใน BotConfig.metadata เป็น JSON) ───────────────────────
export type BotSettings = {
  botName?: string;          // ชื่อที่บอทใช้แทนตัวเอง
  greeting?: string;         // ข้อความทักทาย/แนวการเปิดบทสนทนา
  language?: 'th' | 'lo' | 'auto'; // ภาษาหลักในการตอบ
  tone?: 'formal' | 'friendly' | 'playful'; // โทนการตอบ
  maxSentences?: number;     // ความยาวคำตอบสูงสุด (ประโยค)
  useEmoji?: boolean;        // ใช้อีโมจิ
  handoffKeywords?: string;  // คำที่ต้องโอนให้แอดมิน (คั่นด้วย ,)
  businessInfo?: string;     // ข้อมูลจริงของธุรกิจ (โปรโมชั่น เวลาทำการ ช่องทางฝากถอน ฯลฯ)
  forbidden?: string;        // สิ่งที่ห้ามบอทตอบ/ทำ
  collectCustomerInfo?: boolean; // เก็บข้อมูลลูกค้าอัตโนมัติ
};

export function parseBotSettings(metadata: any): BotSettings {
  let m: any = metadata;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch { m = {}; } }
  if (!m || typeof m !== 'object') m = {};
  return {
    botName: m.botName || '',
    greeting: m.greeting || '',
    language: m.language || 'auto',
    tone: m.tone || 'friendly',
    maxSentences: Number(m.maxSentences) || 3,
    useEmoji: m.useEmoji !== false,
    handoffKeywords: m.handoffKeywords || '',
    businessInfo: m.businessInfo || '',
    forbidden: m.forbidden || '',
    collectCustomerInfo: m.collectCustomerInfo !== false,
  };
}

// สร้างกฎ system prompt จากการตั้งค่า (แทน SYSTEM_BASE แบบตายตัว)
function buildSystemRules(s: BotSettings): string {
  const langRule = s.language === 'th' ? 'ตอบภาษาไทยเสมอ'
    : s.language === 'lo' ? 'ตอบภาษาลาวเสมอ'
    : 'ตอบภาษาเดียวกับที่ลูกค้าใช้ (หลักๆ คือไทย)';
  const toneRule = s.tone === 'formal' ? 'สุภาพ เป็นทางการ'
    : s.tone === 'playful' ? 'สนุก เป็นกันเองมาก'
    : 'เป็นกันเอง อบอุ่น สุภาพ';
  const rules: string[] = [
    `- ${langRule} ไม่เกิน ${s.maxSentences || 3} ประโยคสั้นๆ โทน${toneRule}`,
    s.useEmoji ? '- ใส่อีโมจิได้เล็กน้อย (1-2 ตัว)' : '- ห้ามใช้อีโมจิ',
    s.botName ? `- ถ้าลูกค้าถามชื่อ ให้บอกว่าชื่อ "${s.botName}"` : '',
    s.greeting ? `- เมื่อลูกค้าทักทายครั้งแรก ให้ทักตามแนวนี้: "${s.greeting}"` : '',
    '- ⚠️ ตอบตามความจริงเท่านั้น: ใช้ข้อมูลจาก "ข้อมูลธุรกิจ", "FAQ" และ "ข้อมูลลูกค้า" ที่ให้มา ห้ามเดา ห้ามแต่งตัวเลข/โปรโมชั่น/ขั้นตอนขึ้นเอง',
    '- ตอบลูกค้าให้ได้ทุกคำถามด้วยตัวเอง ห้ามบอกให้รอแอดมิน/เจ้าหน้าที่ และห้ามพิมพ์ HANDOFF_REQUESTED — ถ้าไม่มีข้อมูลให้ตอบเท่าที่รู้อย่างสุภาพ',
    '- ข้อมูลภายใน (ยอดฝาก สถิติ) ห้ามบอกลูกค้าโดยตรง',
    '- ⚠️ ห้ามบอกลูกค้าว่า "ยังไม่ได้ฝาก" หรือพูดถึงตัวเลขยอดเงินของลูกค้า',
    '- ⚠️ ห้ามขอสลิปหรือหลักฐานการโอนซ้ำ',
    s.forbidden ? `- ข้อห้ามเพิ่มเติมจากร้าน: ${s.forbidden}` : '',
  ].filter(Boolean);
  return `กฎสำคัญ:\n${rules.join('\n')}`;
}

// ─── Core: Generate AI response ───────────────────────────────────────────────
export async function generateAIResponse(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  model: string = DEFAULT_MODEL,
  temperature: number = 0.7,
  maxTokens: number = 200
): Promise<string> {
  const response = await client.chat.completions.create({
    model, messages, temperature,
    max_tokens: maxTokens,
  });
  return response.choices[0]?.message?.content?.trim() || '';
}

// ─── Bot Message Processor v2 ─────────────────────────────────────────────────
export async function processBotMessage(
  tenantId: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  contactContext?: {
    displayName?: string;
    memberType?: string;
    totalDeposit?: number;
    depositCount?: number;
  },
  companyId?: string | null,
  opts?: { bonusTimeActive?: boolean; profileContext?: string }
): Promise<{ reply: string; shouldHandoff: boolean }> {

  // per-company AI: ถ้ามี companyId → โหลด config ของบริษัทนั้น ; ไม่มี → fallback ระดับ tenant
  const botConfig = await prisma.botConfig.findFirst({
    where: companyId ? { companyId } : { tenantId },
    include: { knowledgeBase: { where: { isActive: true }, take: 30 } },
  });

  // ─ Default system prompt ─
  const basePrompt = botConfig?.systemPrompt ||
    'คุณเป็น AI Assistant ผู้ช่วยลูกค้า เป็นมิตร สุภาพ และสามารถช่วยเหลือได้หลายเรื่อง';

  // ─ Smart KB matching ─
  const allKb = botConfig?.knowledgeBase || [];
  const relevantKb = allKb
    .map(kb => ({ ...kb, score: scoreKB(kb, userMessage) }))
    .filter(kb => kb.score >= 2)          // ตัด noise ที่คล้ายเล็กน้อย เก็บเฉพาะที่เกี่ยวจริง
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const kbContext = relevantKb.length > 0
    ? `\n\n—— FAQ ที่เกี่ยวข้อง (เรียงจากตรงที่สุด — ใช้ตอบก่อนเสมอ) ——\n${relevantKb.map((kb, i) => `${i + 1}. Q: ${kb.question}\n   A: ${kb.answer}`).join('\n')}\n\n⚠️ ถ้าคำถามลูกค้าตรงกับ FAQ ข้อใด ให้ตอบตามคำตอบของ FAQ ข้อนั้นเป็นหลัก และตอบให้ตรงกับสิ่งที่ลูกค้าถามจริงๆ ห้ามตอบนอกเรื่อง`
    : '';

  // ─ Contact context ─
  const contactInfo = contactContext?.displayName
    ? `\n—— ข้อมูลลูกค้า ——\nชื่อ: ${contactContext.displayName} | ประเภท: ${contactContext.memberType || 'ใหม่'} | รวมฝาก ${contactContext.totalDeposit || 0} บาท`
    : '';

  // ─ BONUS TIME: ให้ AI เรียกระบบเองด้วยโทเคนพิเศษ ─
  const bonusTimeInstr = opts?.bonusTimeActive
    ? `\n\n—— ระบบ BONUS TIME (สำคัญ) ——
ถ้าลูกค้าอยากดู "BONUSTIME" / อัตราชนะเกม / ค่ายไหนแตก / ค่ายไหนดี / เกมไหนน่าเล่น / ระบบวิเคราะห์ AI / winrate / เปอร์เซ็นต์เกม
ให้ตอบกลับด้วยข้อความว่า [[BONUSTIME]] เพียงอย่างเดียวเท่านั้น ห้ามพิมพ์ข้อความอื่นปนมา (ระบบจะแสดงการ์ดค่ายเกมให้เอง)`
    : '';

  // ─ การตั้งค่าละเอียดของบอท (จากหน้า AI Bot) ─
  const settings = parseBotSettings(botConfig?.metadata);
  const rules = buildSystemRules(settings);

  // ─ ข้อมูลธุรกิจ: ถ้าตั้งค่าเองใช้ของบริษัท ; ไม่ตั้ง → ใช้ข้อมูลกลางเดิม ─
  const businessContext = settings.businessInfo
    ? `\n\n—— ข้อมูลธุรกิจ (ข้อเท็จจริง ใช้ตอบลูกค้า ห้ามแต่งเพิ่ม) ——\n${settings.businessInfo}`
    : `\n${PROMOTION_INFO}`;

  // ─ ข้อมูลลูกค้าที่บันทึกไว้ + กฎห้ามขอซ้ำ/ทวนยืนยัน ─
  const profileContext = opts?.profileContext || '';
  const registrationRule = profileContext
    ? `\n- เรื่องสมัครสมาชิก/ขอข้อมูล: ขอเฉพาะข้อมูลที่ยังขาดจากรายการ (ชื่อ-นามสกุล, เบอร์โทร, ธนาคาร, เลขบัญชี) เท่านั้น ห้ามขอทั้งชุดซ้ำ`
    : `\n- เรื่องสมัครสมาชิก/register/เปิดบัญชี: ให้ตอบข้อความนี้: "🖌รบกวนลูกค้าแจ้งข้อมูลดังนี้นะคะ🖌\n✅ชื่อ - นามสกุล :\n✅เบอร์โทรศัพท์ที่ใช้สมัครสมาชิก :\n✅ธนาคาร :\n✅เลขบัญชีธนาคาร :\n\nรบกวนคุณลูกค้าพิมพ์ข้อมูลเป็นตัวอักษรให้กับทางทีมงานนะคะ"`;

  const systemPrompt = `${basePrompt}${kbContext}${contactInfo}${profileContext}\n\n${rules}${registrationRule}${businessContext}${bonusTimeInstr}`;

  const msgs: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-MAX_HISTORY),
    { role: 'user', content: userMessage },
  ];

  try {
    const raw = await generateAIResponse(
      msgs,
      botConfig?.model || LIGHT_MODEL,
      botConfig?.temperature ?? 0.7,
      200
    );

    const cleanReply = raw
      .replace(/HANDOFF_REQUESTED/gi, '')
      .trim() || 'ได้รับข้อความแล้วนะคะ สอบถามเพิ่มเติมได้เลยค่ะ 🙏';
    const shouldHandoff = checkHandoff(userMessage, raw, settings.handoffKeywords);

    return { reply: cleanReply || 'ได้รับข้อความแล้วนะคะ 🙏', shouldHandoff };
  } catch (e: any) {
    console.error('[AI] ❌ processBotMessage failed:', e?.response?.status, e?.response?.data?.error?.message || e?.response?.data?.message || e?.message);
    return {
      reply: 'ได้รับข้อความแล้วนะคะ 🙏 รบกวนพิมพ์คำถามอีกครั้งได้เลยค่ะ',
      shouldHandoff: false, // AI ล่มก็ไม่สลับ human — บอทดูแลต่อ
    };
  }
}

// ─── AI Reply Suggestion ──────────────────────────────────────────────────────
export async function generateReplySuggestion(
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  tenantId: string
): Promise<string> {
  const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
    { role: 'system', content: 'คุณช่วยแอดมิน CRM แนะนำตอบลูกค้า ตอบแค่ 1 ประโยคสั้นๆ ภาษาไทย' },
    ...conversationHistory.slice(-3),
    { role: 'user', content: 'แนะนำประโยคตอบ (ตอบแค่ประโยคตอบเท่านั้น)' },
  ];
  return await generateAIResponse(messages, LIGHT_MODEL, 0.5, 80);
}

// ─── AI Draft 3 ตัวเลือก ─────────────────────────────────────────────────────
export async function generateContextualReply(opts: {
  lastCustomerMessage: string;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
  contactProfile: {
    displayName: string;
    username?: string;
    totalDeposit?: number;
    depositCount?: number;
    memberType?: string;
  };
  tone: 'formal' | 'friendly' | 'urgent';
  purpose: 'reply' | 'followup' | 'promotion' | 'apology';
  tenantId: string;
}): Promise<{ suggestions: string[] }> {
  const { lastCustomerMessage, conversationHistory, contactProfile, tone, purpose } = opts;

  const toneMap    = { formal: 'สุภาพ', friendly: 'เป็นกันเอง', urgent: 'กระชับ' };
  const purposeMap = { reply: 'ตอบคำถาม', followup: 'ติดตาม', promotion: 'แนะนำโปรโมชั่น', apology: 'ขอโทษ' };

  const systemPrompt = `แอดมิน CRM ไทย ร่างข้อความตอบลูกค้า
โทน: ${toneMap[tone]} | เป้าหมาย: ${purposeMap[purpose]}
ลูกค้า: ${contactProfile.displayName} ฝากแล้ว ${contactProfile.depositCount || 0} ครั้ง
กฎ: ตอบ 3 ตัวเลือก คั่นด้วย --- แต่ละตัวไม่เกิน 2 ประโยค ภาษาไทย`;

  const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-2),
    { role: 'user', content: `ลูกค้าพูดว่า: "${lastCustomerMessage}" — ร่างตอบ 3 แบบ:` },
  ];

  const raw = await generateAIResponse(messages, LIGHT_MODEL, 0.8, 300);

  const suggestions = raw.split('---')
    .map(s => s.trim())
    .filter(s => s.length > 3)
    .slice(0, 3);

  return { suggestions: suggestions.length > 0 ? suggestions : [raw.trim()] };
}

// ─── สรุปบทสนทนา ─────────────────────────────────────────────────────────────
export async function summarizeConversation(
  messages: { role: 'user' | 'assistant'; content: string }[],
  contactName: string
): Promise<{ summary: string; sentiment: 'positive' | 'neutral' | 'negative'; intent: string; urgency: 'low' | 'medium' | 'high' }> {
  const history = messages.slice(-6).map(m =>
    `${m.role === 'user' ? contactName : 'แอดมิน'}: ${m.content}`
  ).join('\n');

  const msgs: any[] = [
    { role: 'system', content: 'วิเคราะห์บทสนทนา ตอบ JSON: {"summary":"1 ประโยค","sentiment":"positive|neutral|negative","intent":"ต้องการอะไร","urgency":"low|medium|high"}' },
    { role: 'user', content: history },
  ];

  try {
    const raw = await generateAIResponse(msgs, LIGHT_MODEL, 0.2, 120);
    return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch {
    return { summary: 'ไม่สามารถสรุปได้', sentiment: 'neutral', intent: 'ไม่ระบุ', urgency: 'low' };
  }
}

// ─── ตรวจสอบภาษาและแปล ───────────────────────────────────────────────────────
export async function detectAndTranslate(text: string): Promise<{ lang: string; thai: string }> {
  const msgs: any[] = [
    { role: 'system', content: 'แปลเป็นไทย ตอบ JSON: {"lang":"ชื่อภาษา","thai":"ข้อความไทย"}' },
    { role: 'user', content: text.slice(0, 500) },
  ];
  try {
    const raw = await generateAIResponse(msgs, LIGHT_MODEL, 0.1, 200);
    return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch {
    return { lang: 'ไทย', thai: text };
  }
}

// ─── Enchant — แปลร่างของแอดมิน (ลาว→ไทย) + แนะนำคำตอบ 3 โทน ──────────────────
//  แอดมิน (คนลาว) พิมพ์ร่างคำตอบสั้นๆ เป็นภาษาลาว → กดปุ่ม Enchant
//  AI จะ (1) แปลร่างเป็นไทยให้ดู (2) เขียนคำตอบลูกค้าเป็นไทย 3 แบบ คนละโทน
//  โดยยึดความหมายจากร่างของแอดมิน + เรียนรู้สไตล์จากคำตอบเดิมของแอดมิน
const ENCHANT_TONES = ['formal', 'friendly', 'urgent'] as const;
type EnchantTone = (typeof ENCHANT_TONES)[number];

export async function enchantReply(opts: {
  adminDraft: string;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
  contactProfile?: { displayName?: string; depositCount?: number; memberType?: string };
  styleSamples?: string[]; // คำตอบเดิมของแอดมินทั่วทั้ง tenant — ใช้เลียนแบบสไตล์ทีม
  tenantId: string;
}): Promise<{ lang: string; thai: string; suggestions: { tone: EnchantTone; text: string }[] }> {
  const { adminDraft, conversationHistory, contactProfile, styleSamples = [] } = opts;

  // ข้อความลูกค้าล่าสุด (บริบทของสิ่งที่กำลังตอบ)
  const lastCustomer = [...conversationHistory].reverse().find(m => m.role === 'user')?.content || '';
  // คำตอบเดิมในห้องนี้ (style reference ระดับ conversation) + ตัวอย่างทั่ว tenant
  const inThreadStyle = conversationHistory.filter(m => m.role === 'assistant').slice(-3).map(m => m.content);
  const styleRef = [...inThreadStyle, ...styleSamples]
    .map(s => (s || '').trim())
    .filter(s => s.length > 2 && !s.startsWith('[SYNC_NOTE]'))
    .slice(0, 6);

  const systemPrompt = `คุณเป็นผู้ช่วยทีมแอดมิน CRM ที่ตอบลูกค้าภาษาไทย แอดมินเป็นคนลาว พิมพ์ "ร่างคำตอบ" สั้นๆ (มักเป็นภาษาลาว)
หน้าที่ของคุณ:
1. ตรวจภาษาของร่าง แล้วแปลความหมายของร่างเป็นภาษาไทย
2. เขียนข้อความ "ตอบลูกค้า" เป็นภาษาไทย 3 แบบ แบบละโทน:
   - formal = สุภาพทางการ
   - friendly = เป็นกันเอง อบอุ่น
   - urgent = กระชับ รวดเร็ว

กฎเหล็ก:
- ทั้ง 3 คำตอบต้องสื่อ "ความหมายเดียวกับร่างของแอดมิน" ห้ามแต่งข้อมูล ตัวเลข โปรโมชั่น หรือเนื้อหาที่ร่างไม่ได้พูดถึง
- เขียนภาษาพูดธรรมชาติ แต่ละแบบไม่เกิน 2-3 ประโยค ใส่ emoji ได้เล็กน้อย
- เลียนแบบสไตล์การตอบของทีมจากตัวอย่างคำตอบเดิม (ถ้ามี)
- ตอบกลับเป็น JSON เท่านั้น รูปแบบ:
{"lang":"ชื่อภาษาต้นฉบับของร่าง","thai":"คำแปลร่างเป็นไทย","suggestions":[{"tone":"formal","text":"..."},{"tone":"friendly","text":"..."},{"tone":"urgent","text":"..."}]}`;

  const userParts: string[] = [];
  if (lastCustomer) userParts.push(`ข้อความล่าสุดจากลูกค้า: "${lastCustomer}"`);
  if (styleRef.length) userParts.push(`ตัวอย่างสไตล์การตอบของทีม (เลียนแบบโทน/คำลงท้าย):\n${styleRef.map(s => `- ${s}`).join('\n')}`);
  if (contactProfile?.displayName) userParts.push(`ลูกค้า: ${contactProfile.displayName}`);
  userParts.push(`ร่างคำตอบของแอดมิน (ภาษาต้นฉบับ): "${adminDraft}"`);
  userParts.push('โปรดแปลร่างเป็นไทย และสร้างคำตอบ 3 โทน ตามรูปแบบ JSON');

  try {
    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userParts.join('\n\n') },
      ],
      temperature: 0.7,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    });
    const raw = (response.choices[0]?.message?.content || '{}')
      .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(raw);

    const suggestions: { tone: EnchantTone; text: string }[] = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .filter((s: any) => s && typeof s.text === 'string' && s.text.trim().length > 1)
      .map((s: any) => ({
        tone: (ENCHANT_TONES as readonly string[]).includes(s.tone) ? s.tone : 'friendly',
        text: s.text.trim(),
      }))
      .slice(0, 3);

    return {
      lang: parsed.lang || 'ลาว',
      thai: (parsed.thai || adminDraft).trim(),
      suggestions: suggestions.length
        ? suggestions
        : [{ tone: 'friendly', text: (parsed.thai || adminDraft).trim() }],
    };
  } catch {
    // fallback: แปลอย่างเดียว ถ้า AI/JSON ล่ม
    const t = await detectAndTranslate(adminDraft);
    return { lang: t.lang, thai: t.thai, suggestions: [{ tone: 'friendly', text: t.thai }] };
  }
}

// ─── Quick Reply Compose — Key ลัด ────────────────────────────────────────────
//  แอดมินกด key ลัด → AI เอา "เนื้อหา" ที่บันทึกไว้ มาแต่งเป็นคำตอบใหม่
//  ให้เข้ากับบริบทบทสนทนา/คำถามล่าสุดของลูกค้า แล้วส่งกลับไปใส่ช่องพิมพ์
export async function composeQuickReply(opts: {
  content: string;    // เนื้อหาดิบของ key ลัด
  title?: string;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
  contactProfile?: { displayName?: string; memberType?: string; depositCount?: number };
  styleSamples?: string[];
}): Promise<string> {
  const { content, title, conversationHistory, contactProfile, styleSamples = [] } = opts;

  const lastCustomer = [...conversationHistory].reverse().find(m => m.role === 'user')?.content || '';
  const inThreadStyle = conversationHistory.filter(m => m.role === 'assistant').slice(-3).map(m => m.content);
  const styleRef = [...inThreadStyle, ...styleSamples]
    .map(s => (s || '').trim())
    .filter(s => s.length > 2 && !s.startsWith('[SYNC_NOTE]'))
    .slice(0, 6);

  const systemPrompt = `คุณเป็นผู้ช่วยแอดมิน CRM ตอบลูกค้าภาษาไทย
แอดมินกด "key ลัด" ที่บันทึก "เนื้อหาคำตอบ" ไว้ล่วงหน้า หน้าที่ของคุณคือเอาเนื้อหานั้นมาเรียบเรียงเป็นข้อความตอบลูกค้า 1 ข้อความ ให้เข้ากับคำถาม/บริบทล่าสุดของลูกค้า

กฎเหล็ก:
- ยึดข้อเท็จจริงจาก "เนื้อหา key ลัด" เท่านั้น ห้ามแต่งเติมข้อมูล ตัวเลข ขั้นตอน หรือโปรโมชั่นที่ไม่ได้อยู่ในเนื้อหา
- ถ้าลูกค้าถามเจาะจง ให้ตอบส่วนที่ตรงคำถามก่อน ไม่ต้องเทเนื้อหาทั้งหมด
- ภาษาพูดสุภาพ เป็นธรรมชาติ ไม่เกิน 3-4 ประโยค ใส่ emoji ได้เล็กน้อย
- เลียนแบบสไตล์/คำลงท้ายจากตัวอย่างคำตอบเดิมของทีม (ถ้ามี)
- ตอบเป็นข้อความเดียว ไม่ต้องมีคำอธิบายอื่น`;

  const userParts: string[] = [];
  if (lastCustomer) userParts.push(`ข้อความล่าสุดจากลูกค้า: "${lastCustomer}"`);
  if (contactProfile?.displayName) userParts.push(`ลูกค้า: ${contactProfile.displayName}`);
  if (styleRef.length) userParts.push(`ตัวอย่างสไตล์การตอบของทีม:\n${styleRef.map(s => `- ${s}`).join('\n')}`);
  userParts.push(`เนื้อหา key ลัด${title ? ` (${title})` : ''}:\n"""${content}"""`);
  userParts.push('เรียบเรียงเป็นข้อความตอบลูกค้า 1 ข้อความ:');

  const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-4).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userParts.join('\n\n') },
  ];

  try {
    const reply = await generateAIResponse(messages, DEFAULT_MODEL, 0.7, 300);
    return reply || content;
  } catch {
    return content; // AI ล่ม → คืนเนื้อหาดิบให้แอดมินแก้เอง
  }
}

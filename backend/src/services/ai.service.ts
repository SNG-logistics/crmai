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

function checkHandoff(userMessage: string, aiReply: string): boolean {
  const msg   = userMessage.toLowerCase();
  const reply = aiReply.toLowerCase();
  if (reply.includes('handoff_requested')) return true;
  return EXPLICIT_HANDOFF_PHRASES.some(phrase => msg.includes(phrase));
}

// ─── Smart KB Matching — keyword overlap scoring ─────────────────────────────
function scoreKB(kb: { question: string; answer: string }, userMessage: string): number {
  const clean = (s: string) => s.toLowerCase().replace(/[^ก-๙a-z0-9\s]/g, '');
  const msgWords = new Set(clean(userMessage).split(/\s+/).filter(w => w.length > 1));
  const qWords   = new Set(clean(kb.question).split(/\s+/).filter(w => w.length > 1));
  let score = 0;
  msgWords.forEach(w => { if (qWords.has(w)) score += 2; });
  qWords.forEach(qw   => { if (userMessage.toLowerCase().includes(qw)) score += 1; });
  msgWords.forEach(mw  => { if (kb.question.toLowerCase().includes(mw)) score += 1; });
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
  companyId?: string | null
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
    .filter(kb => kb.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const kbContext = relevantKb.length > 0
    ? `\n\n—— FAQ ที่เกี่ยวข้อง (ใช้ก่อนตอบ) ——\n${relevantKb.map(kb => `Q: ${kb.question}\nA: ${kb.answer}`).join('\n')}`
    : '';

  // ─ Contact context ─
  const contactInfo = contactContext?.displayName
    ? `\n—— ข้อมูลลูกค้า ——\nชื่อ: ${contactContext.displayName} | ประเภท: ${contactContext.memberType || 'ใหม่'} | รวมฝาก ${contactContext.totalDeposit || 0} บาท`
    : '';

  const systemPrompt = `${basePrompt}${kbContext}${contactInfo}\n\n${SYSTEM_BASE}`;

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
      .replace(/HANDOFF_REQUESTED/gi, 'กรุณารอสักครู่นะคะ กำลังโอนให้เจ้าหน้าที่ดูแล 🙏');
    const shouldHandoff = checkHandoff(userMessage, raw);

    return { reply: cleanReply || 'ได้รับข้อความแล้วนะคะ 🙏', shouldHandoff };
  } catch {
    return {
      reply: 'ได้รับข้อความแล้วนะคะ 🙏 ทีมงานจะรีบตอบกลับโดยเร็วที่สุดค่ะ',
      shouldHandoff: true,
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

import OpenAI from 'openai';
import prisma from '../lib/prisma';

const client = new OpenAI({
  apiKey: process.env.COMETAPI_KEY || '',
  baseURL: process.env.COMETAPI_BASE_URL || 'https://api.cometapi.com/v1',
});

const DEFAULT_MODEL      = process.env.COMETAPI_MODEL || 'gpt-4o';
const LIGHT_MODEL        = process.env.COMETAPI_LIGHT_MODEL || 'gpt-4o-mini'; // ★ ใช้งานทั่วไปประหยัดกว่า

// ─── Core: Generate AI response ───────────────────────────────────────────────
export async function generateAIResponse(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  model: string = DEFAULT_MODEL,
  temperature: number = 0.7,
  maxTokens: number = 200   // ★ ลดจาก 1000 → 200 ค่า default
): Promise<string> {
  const response = await client.chat.completions.create({
    model, messages, temperature,
    max_tokens: maxTokens,
  });
  return response.choices[0]?.message?.content?.trim() || '';
}

// ─── Bot Message Processor ────────────────────────────────────────────────────
// ใช้ตอบลูกค้าใน LINE/Telegram อัตโนมัติ — ต้องประหยัดที่สุด
export async function processBotMessage(
  tenantId: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string
): Promise<{ reply: string; shouldHandoff: boolean }> {
  const botConfig = await prisma.botConfig.findUnique({
    where: { tenantId },
    include: { knowledgeBase: { where: { isActive: true }, take: 10 } }, // ★ จำกัด KB 10 รายการ
  });

  if (!botConfig || !botConfig.isActive) {
    try {
      const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
        { role: 'system', content: 'คุณเป็นผู้ช่วยบริการลูกค้า ตอบภาษาไทย สั้น กระชับ เป็นมิตร ไม่เกิน 2 ประโยค' },
        ...conversationHistory.slice(-4),
        { role: 'user', content: userMessage },
      ];
      const defaultReply = await generateAIResponse(messages, LIGHT_MODEL, 0.7, 150);
      const shouldHandoff = defaultReply.includes('HANDOFF_REQUESTED') ||
        userMessage.includes('เจ้าหน้าที่') ||
        userMessage.includes('คนจริงๆ') ||
        userMessage.includes('ขอคุยกับคน') ||
        userMessage.includes('admin') ||
        userMessage.includes('แอดมิน');
      return {
        reply: defaultReply || 'ขออภัยค่ะ มีข้อขัดข้องชั่วคราว กรุณาติดต่อแอดมินนะคะ',
        shouldHandoff,
      };
    } catch (err) {
      return { reply: 'ขอโทษค่ะ กรุณาติดต่อเจ้าหน้าที่', shouldHandoff: true };
    }
  }

  // ★ เอาเฉพาะ KB ที่เกี่ยวข้องกับคำถาม (ไม่ส่งทั้งหมด)
  const kbContext = botConfig.knowledgeBase
    .filter((kb: any) =>
      kb.question.toLowerCase().includes(userMessage.toLowerCase().slice(0, 10)) ||
      userMessage.toLowerCase().includes(kb.question.toLowerCase().slice(0, 10))
    )
    .slice(0, 3) // ★ ส่งแค่ 3 รายการที่ตรง
    .map((kb: any) => `Q: ${kb.question}\nA: ${kb.answer}`)
    .join('\n\n');

  // ★ System prompt สั้นลงมาก
  const systemPrompt = `${botConfig.systemPrompt}
${kbContext ? `\nFAQ:\n${kbContext}` : ''}
กฎ: ตอบไทยสั้นๆ 1-2 ประโยค ถ้าไม่รู้ให้ตอบว่า "HANDOFF_REQUESTED"`;

  const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-4), // ★ ลด history จาก 10 → 4 ข้อความ
    { role: 'user', content: userMessage },
  ];

  // ★ ใช้ LIGHT_MODEL + max_tokens 150
  const reply = await generateAIResponse(messages, LIGHT_MODEL, botConfig.temperature, 150);

  const shouldHandoff = reply.includes('HANDOFF_REQUESTED') ||
    userMessage.includes('เจ้าหน้าที่') ||
    userMessage.includes('คนจริงๆ') ||
    userMessage.includes('ขอคุยกับคน') ||
    userMessage.includes('admin') ||
    userMessage.includes('แอดมิน');

  return {
    reply: reply.replace('HANDOFF_REQUESTED', 'กรุณารอสักครู่ค่ะ กำลังโอนให้เจ้าหน้าที่ 😊'),
    shouldHandoff,
  };
}

// ─── AI Reply Suggestion (แนะนำแอดมิน 1 ประโยค) ──────────────────────────────
export async function generateReplySuggestion(
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  tenantId: string
): Promise<string> {
  const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
    { role: 'system', content: 'คุณช่วยแอดมิน CRM แนะนำตอบลูกค้า ตอบแค่ 1 ประโยคสั้นๆ ภาษาไทย' },
    ...conversationHistory.slice(-3), // ★ แค่ 3 ข้อความล่าสุด
    { role: 'user', content: 'แนะนำประโยคตอบ (ตอบแค่ประโยคตอบเท่านั้น)' },
  ];
  // ★ LIGHT_MODEL + 80 tokens
  return await generateAIResponse(messages, LIGHT_MODEL, 0.5, 80);
}

// ─── AI Draft (Admin Panel) — ร่างข้อความสั้น 3 ตัวเลือก ────────────────────
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

  const toneMap = { formal: 'สุภาพ', friendly: 'เป็นกันเอง', urgent: 'กระชับ' };
  const purposeMap = { reply: 'ตอบคำถาม', followup: 'ติดตาม', promotion: 'แนะนำโปรโมชั่น', apology: 'ขอโทษ' };

  // ★ System prompt กระชับ
  const systemPrompt = `แอดมิน CRM ไทย ร่างข้อความตอบลูกค้า
โทน: ${toneMap[tone]} | เป้าหมาย: ${purposeMap[purpose]}
ลูกค้า: ${contactProfile.displayName} ฝากแล้ว ${contactProfile.depositCount || 0} ครั้ง
กฎ: ตอบ 3 ตัวเลือก คั่นด้วย --- แต่ละตัวไม่เกิน 2 ประโยค ภาษาไทย`;

  const messages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-2), // ★ แค่ 2 ข้อความล่าสุด
    { role: 'user', content: `ลูกค้าพูดว่า: "${lastCustomerMessage}" — ร่างตอบ 3 แบบ:` },
  ];

  // ★ LIGHT_MODEL + 300 tokens (3 ตัวเลือก × 100)
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
  // ★ เอาแค่ 6 ข้อความล่าสุด
  const history = messages.slice(-6).map(m =>
    `${m.role === 'user' ? contactName : 'แอดมิน'}: ${m.content}`
  ).join('\n');

  const msgs: any[] = [
    { role: 'system', content: 'วิเคราะห์บทสนทนา ตอบ JSON: {"summary":"1 ประโยค","sentiment":"positive|neutral|negative","intent":"ต้องการอะไร","urgency":"low|medium|high"}' },
    { role: 'user', content: history },
  ];

  try {
    // ★ LIGHT_MODEL + 120 tokens
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
    { role: 'user', content: text.slice(0, 200) }, // ★ จำกัดข้อความที่ส่ง 200 ตัวอักษร
  ];
  try {
    // ★ LIGHT_MODEL + 100 tokens
    const raw = await generateAIResponse(msgs, LIGHT_MODEL, 0.1, 100);
    return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch {
    return { lang: 'ไทย', thai: text };
  }
}

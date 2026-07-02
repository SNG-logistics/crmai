/**
 * bot-guard — กันการสแปม/ปั่นถามซ้ำความหมายเดิมเพื่อ "เผา token"
 *
 * แนวคิด: ตรวจจับจากประวัติข้อความในฐานข้อมูลล้วนๆ (ไม่เรียก AI → ไม่เสีย token)
 * ถ้าลูกค้าถามข้อความเดิม/คล้ายเดิมซ้ำหลายครั้งในช่วงสั้นๆ → ถือว่าน่าสงสัย
 * ให้ผู้เรียกใช้ตอบข้อความสำเร็จรูป (auto) ครั้งเดียว แล้วสลับบทสนทนาเป็น Human
 * (isBot=false) เพื่อหยุดบอทไม่ให้เรียก AI ต่อ
 *
 * ปรับค่าได้ผ่าน .env:
 *   BOT_REPEAT_GUARD=false        ปิดฟีเจอร์นี้ (ค่าเริ่มต้น: เปิด)
 *   BOT_REPEAT_THRESHOLD=3        ถามซ้ำครบกี่ครั้ง → สลับ human
 *   BOT_REPEAT_WINDOW=6           ดูข้อความลูกค้าย้อนหลังกี่ข้อความ
 *   BOT_REPEAT_MINLEN=6           ข้อความ (หลัง normalize) สั้นกว่านี้ไม่นับ (กันคำทักทาย/ตอบรับสั้นๆ)
 *   BOT_REPEAT_SIMILARITY=0.8     เกณฑ์ความคล้าย 0-1 (trigram Jaccard)
 *   BOT_REPEAT_REPLY="..."        ข้อความ auto ที่ตอบก่อนสลับเป็น human
 */
import prisma from '../lib/prisma';

const GUARD_ENABLED   = process.env.BOT_REPEAT_GUARD !== 'false';
const REPEAT_THRESHOLD = parseInt(process.env.BOT_REPEAT_THRESHOLD || '3', 10);
const REPEAT_WINDOW    = parseInt(process.env.BOT_REPEAT_WINDOW || '6', 10);
const MIN_LEN          = parseInt(process.env.BOT_REPEAT_MINLEN || '6', 10);
const SIMILARITY       = parseFloat(process.env.BOT_REPEAT_SIMILARITY || '0.8');

// ข้อความ auto ที่ตอบครั้งเดียวก่อนสลับเป็น human (เป็นกลาง — ลูกค้าจริงได้คนดูแลต่อ, มือบ่อนก็แค่ถูกส่งต่อ)
export const REPEAT_HANDOFF_REPLY =
  process.env.BOT_REPEAT_REPLY || 'ขอโอนให้เจ้าหน้าที่ดูแลต่อนะคะ รอสักครู่ค่ะ 🙏😊';

// ตัดช่องว่าง/emoji/เครื่องหมาย เหลือแต่ตัวอักษร-ตัวเลข เพื่อเทียบความหมายเดิม
function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function trigrams(s: string): Set<string> {
  const set = new Set<string>();
  const t = `  ${s} `;
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}

// ความคล้ายแบบ trigram Jaccard (0-1) — ถูก ไม่ต้องใช้ AI
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const A = trigrams(a), B = trigrams(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function isSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  // ข้อความหนึ่งเป็นส่วนหนึ่งของอีกข้อความ (พิมพ์ซ้ำ/ต่อท้ายเล็กน้อย)
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 4 && long.includes(short)) return true;
  return similarity(a, b) >= SIMILARITY;
}

export interface RepeatCheck {
  repeat: boolean; // ถึงเกณฑ์ควรสลับเป็น human หรือยัง
  count: number;   // จำนวนข้อความที่ซ้ำ/คล้ายในหน้าต่างที่ดู (รวมข้อความปัจจุบัน)
}

/**
 * ตรวจว่าลูกค้าถามความหมายเดิมซ้ำๆ หรือไม่ (นับรวมข้อความปัจจุบันที่ถูกบันทึกไปแล้ว)
 * เรียก "หลัง" บันทึกข้อความลูกค้าลง DB แล้ว และ "ก่อน" เรียก AI
 */
export async function checkRepeatAbuse(conversationId: string, currentText: string): Promise<RepeatCheck> {
  if (!GUARD_ENABLED) return { repeat: false, count: 0 };

  const cur = normalize(currentText);
  if (cur.length < MIN_LEN) return { repeat: false, count: 0 }; // สั้นเกินไป ไม่นับ

  const recent = await prisma.message.findMany({
    where: { conversationId, senderType: 'customer' },
    orderBy: { createdAt: 'desc' },
    take: REPEAT_WINDOW,
    select: { content: true },
  });

  let count = 0;
  for (const m of recent) {
    if (isSimilar(normalize(m.content), cur)) count++;
  }

  return { repeat: count >= REPEAT_THRESHOLD, count };
}

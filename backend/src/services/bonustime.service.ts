/**
 * BONUS TIME — AI Winrate System
 * ────────────────────────────────────────────────────────────────────────────
 * ระบบให้ลูกค้าถามหา "BONUSTIME" ทาง LINE OA แล้วบอทตอบเป็น LINE Flex:
 *   1) การ์ดตารางค่ายเกม (PG, JILI, PRAGMATIC ...) — กดเลือกค่ายได้ (postback)
 *   2) กดค่าย → การ์ดเกมในค่ายนั้น พร้อม % (อัตราชนะ / ฟรีสปิน / WILD)
 *
 * ค่า % ตั้งฐานใน CRM แล้วสุ่มขยับเล็กน้อย (liveJitter) ให้ดูเป็น LIVE Real-Time
 * ทุกอย่างตั้งค่าได้จากหน้า CRM › ตั้งค่า › BONUS TIME
 */

// ─── Types (โครงหลวมๆ ให้ตรงกับ prisma models) ───────────────────────────────
export interface BTConfig {
  isActive: boolean;
  headerTitle: string;
  headerSubtitle: string;
  intro: string;
  gamesIntro: string;
  footerNote: string;
  aiTrigger: boolean;
  keywords: string;        // JSON array (string)
  liveJitter: number;
  accent: string;
}

export interface BTCamp {
  id: string;
  name: string;
  code: string;
  logo?: string | null;
  accent?: string | null;
}

export interface BTGame {
  id: string;
  name: string;
  image?: string | null;
  winRate: number;
  freeSpinRate: number;
  wildRate: number;
  provider?: string | null;
  languages?: string | null; // JSON array (string)
  link?: string | null;
}

// ─── คีย์เวิร์ด default (fast-path ไม่เปลืองโทเคน AI) ─────────────────────────
export const DEFAULT_BONUS_KEYWORDS = [
  'bonustime', 'bonus time', 'โบนัสไทม์', 'โบนัส ไทม์', 'บอนัสไทม์', 'บอนัดไทม์',
  'winrate', 'win rate', 'วินเรท', 'อัตราชนะ', 'อัตราการชนะ',
  'ai winrate', 'ระบบวิเคราะห์', 'ระบบ ai', 'เปอร์เซ็นต์เกม', '% เกม',
  'ค่ายไหนแตก', 'ค่ายไหนดี', 'ดูอัตราชนะ', 'เช็คเกม',
];

// ─── ตัวช่วย ─────────────────────────────────────────────────────────────────
export function parseJsonArray(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

/** สุ่มขยับค่า % ให้ดู LIVE — ยึดฐานจาก CRM ±jitter, clamp 1..99 */
export function jitter(base: number, amount: number): number {
  const b = Math.round(Number(base) || 0);
  const j = Math.max(0, Math.round(Number(amount) || 0));
  if (j === 0) return Math.min(99, Math.max(1, b));
  const delta = Math.floor(Math.random() * (j * 2 + 1)) - j; // -j .. +j
  return Math.min(99, Math.max(1, b + delta));
}

const LANG_FLAG: Record<string, string> = {
  TH: '🇹🇭', EN: '🇬🇧', LO: '🇱🇦', CN: '🇨🇳', ZH: '🇨🇳', MY: '🇲🇲', VN: '🇻🇳', ID: '🇮🇩', KR: '🇰🇷',
};
function langLine(raw?: string | null): string {
  const langs = parseJsonArray(raw);
  if (!langs.length) return '🇹🇭';
  return langs.map((l) => LANG_FLAG[l.toUpperCase()] || l).join(' ');
}

/** ตรวจว่าข้อความลูกค้าตรงกับคีย์เวิร์ด BONUSTIME ไหม (default + ที่ตั้งใน CRM) */
export function matchBonusTimeKeyword(text: string, config?: Pick<BTConfig, 'keywords'> | null): boolean {
  const t = (text || '').toLowerCase().trim();
  if (!t) return false;
  const extra = parseJsonArray(config?.keywords).map((k) => k.toLowerCase());
  const all = [...DEFAULT_BONUS_KEYWORDS, ...extra];
  return all.some((k) => k && t.includes(k));
}

// ─── LINE Flex: เมนูตารางค่ายเกม ─────────────────────────────────────────────
function campCell(camp: BTCamp): any {
  const accent = camp.accent || '#00D4AA';
  const inner: any[] = [];
  if (camp.logo) {
    inner.push({
      type: 'image', url: camp.logo, size: 'full', aspectMode: 'fit', aspectRatio: '2:1',
    });
  } else {
    inner.push({
      type: 'box', layout: 'vertical', height: '30px', justifyContent: 'center',
      contents: [{ type: 'text', text: camp.name.slice(0, 2).toUpperCase(), align: 'center', weight: 'bold', size: 'lg', color: accent }],
    });
  }
  inner.push({ type: 'text', text: camp.name, size: 'xs', color: '#F3F4F6', align: 'center', weight: 'bold', wrap: true, maxLines: 2, margin: 'sm' });

  return {
    type: 'box', layout: 'vertical', flex: 1, backgroundColor: '#1F2937', cornerRadius: '10px',
    paddingAll: '8px', spacing: 'none', justifyContent: 'center',
    action: { type: 'postback', label: camp.name.slice(0, 20), data: `bt=camp&id=${camp.id}`, displayText: `ดูอัตราชนะค่าย ${camp.name}` },
    contents: inner,
  };
}

function emptyCell(): any {
  return { type: 'box', layout: 'vertical', flex: 1, contents: [{ type: 'filler' }] };
}

/** สร้างข้อความ LINE (array) สำหรับเมนูค่ายเกม */
export function buildBonusTimeMenuMessages(config: BTConfig, camps: BTCamp[]): any[] {
  const accent = config.accent || '#F59E0B';
  const rows: any[] = [];
  const perRow = 3;
  for (let i = 0; i < camps.length; i += perRow) {
    const slice = camps.slice(i, i + perRow);
    const cells = slice.map(campCell);
    while (cells.length < perRow) cells.push(emptyCell());
    rows.push({ type: 'box', layout: 'horizontal', spacing: 'sm', margin: i === 0 ? 'md' : 'sm', contents: cells });
  }

  const bubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#0F172A', paddingAll: '16px', spacing: 'xs',
      contents: [
        { type: 'text', text: config.headerTitle, weight: 'bold', size: 'xl', color: accent, align: 'center', wrap: true },
        { type: 'text', text: config.headerSubtitle, size: 'xxs', color: '#9CA3AF', align: 'center', wrap: true },
        {
          type: 'box', layout: 'baseline', margin: 'md', justifyContent: 'center', spacing: 'sm',
          contents: [{ type: 'text', text: '🟢 LIVE • อัปเดตเรียลไทม์', size: 'xs', color: '#10B981', weight: 'bold', align: 'center' }],
        },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', backgroundColor: '#0B1220', paddingAll: '12px', spacing: 'sm',
      contents: [
        { type: 'text', text: config.intro, size: 'sm', color: '#E5E7EB', wrap: true },
        ...rows,
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', backgroundColor: '#0B1220', paddingAll: '10px',
      contents: [{ type: 'text', text: config.footerNote, size: 'xxs', color: '#6B7280', wrap: true, align: 'center' }],
    },
    styles: { header: { separator: false }, footer: { separator: true } },
  };

  return [{ type: 'flex', altText: '⚡ BONUS TIME — เลือกค่ายเกมเพื่อดูอัตราชนะ', contents: bubble }];
}

// ─── LINE Flex: การ์ดเกมในค่าย (carousel) ────────────────────────────────────
function statBox(label: string, value: number): any {
  return {
    type: 'box', layout: 'vertical', flex: 1, backgroundColor: '#111827', cornerRadius: '8px', paddingAll: '8px', spacing: 'none',
    contents: [
      { type: 'text', text: `${value}%`, size: 'md', weight: 'bold', color: '#10B981', align: 'center' },
      { type: 'text', text: label, size: 'xxs', color: '#9CA3AF', align: 'center', wrap: true },
    ],
  };
}

function gameBubble(config: BTConfig, game: BTGame): any {
  const accent = config.accent || '#F59E0B';
  const win = jitter(game.winRate, config.liveJitter);
  const free = jitter(game.freeSpinRate, config.liveJitter);
  const wild = jitter(game.wildRate, config.liveJitter);

  const body: any[] = [
    { type: 'text', text: game.name, weight: 'bold', size: 'lg', color: '#F9FAFB', wrap: true, maxLines: 2 },
  ];
  if (game.provider) body.push({ type: 'text', text: String(game.provider), size: 'xs', color: '#9CA3AF' });

  // แถบอัตราชนะ + progress bar
  body.push({
    type: 'box', layout: 'baseline', margin: 'md',
    contents: [
      { type: 'text', text: '🔥 อัตราชนะ', size: 'sm', color: '#E5E7EB', flex: 0 },
      { type: 'text', text: `${win}%`, size: 'sm', weight: 'bold', color: accent, align: 'end' },
    ],
  });
  body.push({
    type: 'box', layout: 'vertical', height: '10px', backgroundColor: '#374151', cornerRadius: '5px', margin: 'sm',
    contents: [
      { type: 'box', layout: 'vertical', width: `${win}%`, height: '10px', backgroundColor: accent, cornerRadius: '5px', contents: [{ type: 'filler' }] },
    ],
  });

  // 3 สถิติ
  body.push({
    type: 'box', layout: 'horizontal', margin: 'md', spacing: 'sm',
    contents: [statBox('โอกาสชนะ', win), statBox('ฟรีสปิน', free), statBox('WILD', wild)],
  });

  // ภาษาที่รองรับ
  body.push({
    type: 'box', layout: 'baseline', margin: 'md',
    contents: [
      { type: 'text', text: 'ภาษาที่รองรับ', size: 'xxs', color: '#9CA3AF', flex: 0 },
      { type: 'text', text: langLine(game.languages), size: 'sm', align: 'end' },
    ],
  });

  const footerBtns: any[] = [];
  if (game.link) {
    footerBtns.push({
      type: 'button', style: 'primary', color: accent, height: 'sm',
      action: { type: 'uri', label: '🎮 เข้าเล่นเลย', uri: game.link },
    });
  }
  footerBtns.push({
    type: 'button', style: 'secondary', height: 'sm',
    action: { type: 'postback', label: '⬅️ เลือกค่ายอื่น', data: 'bt=menu', displayText: 'ดูค่ายเกมอื่น' },
  });

  const bubble: any = {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box', layout: 'vertical', backgroundColor: '#0B1220', paddingAll: '14px', spacing: 'sm',
      contents: body,
    },
    footer: {
      type: 'box', layout: 'vertical', backgroundColor: '#0B1220', paddingAll: '10px', spacing: 'sm',
      contents: footerBtns,
    },
  };
  if (game.image) {
    bubble.hero = { type: 'image', url: game.image, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' };
  }
  return bubble;
}

/** สร้างข้อความ LINE (array) สำหรับการ์ดเกมในค่าย */
export function buildBonusTimeGamesMessages(config: BTConfig, camp: BTCamp, games: BTGame[]): any[] {
  if (!games.length) {
    return [{ type: 'text', text: `ค่าย ${camp.name} ยังไม่มีข้อมูลเกมในระบบนะคะ 🙏 ลองเลือกค่ายอื่นได้เลยค่ะ` }];
  }
  const bubbles = games.slice(0, 12).map((g) => gameBubble(config, g));
  const carousel = { type: 'carousel', contents: bubbles };
  return [{ type: 'flex', altText: `อัตราชนะค่าย ${camp.name} (LIVE)`, contents: carousel }];
}

// ─── parse postback data: "bt=camp&id=xxx" | "bt=menu" ───────────────────────
export function parseBonusPostback(data?: string | null): { action: 'menu' | 'camp'; id?: string } | null {
  if (!data) return null;
  const params = new URLSearchParams(data);
  if (params.get('bt') === 'menu') return { action: 'menu' };
  if (params.get('bt') === 'camp') return { action: 'camp', id: params.get('id') || undefined };
  return null;
}

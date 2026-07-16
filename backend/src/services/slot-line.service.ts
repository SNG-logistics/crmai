// ─── Slot Bot — LINE Flex Message builders ────────────────────────────────────
// สร้าง Flex Message สำหรับ BONUS TIME บน LINE OA
// ใช้ข้อมูลจาก SlotProvider / SlotGame (ตั้งค่า % ผ่านหน้า /slot/games ใน dashboard)

export interface LineSlotProvider {
  id: string;
  code: string;
  name: string;
  logoUrl?: string | null;
}

export interface LineSlotGame {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  playUrl?: string | null;
  tags: string[];
  isRecommended: boolean;
  popularityScore: number; // อัตราชนะ / โอกาสชนะ
  bonusScore: number;      // เข้าฟรีสปิน
  featureScore: number;    // WILD
  providerName: string;
  providerCode: string;
}

const GOLD = '#FFC400';
const BG_DARK = '#101010';
const BG_CARD = '#1C1C1C';
const BG_HEADER = '#2B0000';
const TEXT_MUTED = '#9E9E9E';
const GREEN = '#22C55E';

// LINE รับเฉพาะรูป https เท่านั้น
function httpsUrl(url?: string | null): string | null {
  if (url && url.startsWith('https://')) return url;
  return null;
}

function clampPercent(v: number): number {
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
}

// ─── Provider grid (ตอบเมื่อลูกค้าพิมพ์ BONUS TIME) ──────────────────────────

function providerCell(p: LineSlotProvider) {
  const logo = httpsUrl(p.logoUrl);
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    backgroundColor: BG_CARD,
    cornerRadius: 'md',
    paddingAll: '10px',
    justifyContent: 'center',
    alignItems: 'center',
    action: { type: 'message', label: p.name.slice(0, 40), text: `เลือกค่าย ${p.code}` },
    contents: [
      logo
        ? { type: 'image', url: logo, size: '52px', aspectRatio: '1:1', aspectMode: 'cover' }
        : { type: 'text', text: '🎰', size: 'xxl', align: 'center' },
      { type: 'text', text: p.name, size: 'xxs', color: '#EDEDED', align: 'center', margin: 'sm' },
    ],
  };
}

export function buildBonusTimeProvidersFlex(providers: LineSlotProvider[]) {
  const rows: any[] = [];
  for (let i = 0; i < providers.length; i += 3) {
    const cells: any[] = providers.slice(i, i + 3).map(providerCell);
    while (cells.length < 3) {
      cells.push({ type: 'box', layout: 'vertical', flex: 1, contents: [{ type: 'filler' }] });
    }
    rows.push({ type: 'box', layout: 'horizontal', spacing: 'sm', contents: cells });
  }

  return {
    type: 'flex',
    altText: '⚡ BONUS TIME — เลือกค่ายเกมที่สนใจได้เลยค่ะ',
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: BG_HEADER,
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '⚡ BONUS TIME ⚡', size: 'xl', weight: 'bold', color: GOLD, align: 'center' },
          { type: 'text', text: 'AI WINRATE SYSTEM', size: 'xs', color: '#C9A0A0', align: 'center', margin: 'sm' },
          { type: 'text', text: '🟢 LIVE · อัปเดต Real-Time', size: 'xs', color: GREEN, align: 'center', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: BG_DARK,
        paddingAll: '12px',
        spacing: 'sm',
        contents: rows.length > 0
          ? rows
          : [{ type: 'text', text: 'ยังไม่มีค่ายเกมเปิดให้บริการค่ะ', size: 'sm', color: TEXT_MUTED, align: 'center' }],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: BG_DARK,
        paddingAll: '10px',
        contents: [
          { type: 'text', text: 'แตะค่ายเกมเพื่อดูเกมแตก + เปอร์เซ็นต์ล่าสุด 👆', size: 'xxs', color: TEXT_MUTED, align: 'center' },
        ],
      },
    },
  };
}

// ─── Game cards (ตอบเมื่อลูกค้ากด "เลือกค่าย XXX") ───────────────────────────

function progressBar(percent: number) {
  return {
    type: 'box',
    layout: 'vertical',
    margin: 'sm',
    height: '8px',
    backgroundColor: '#333333',
    cornerRadius: 'md',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: `${Math.max(clampPercent(percent), 2)}%`,
        height: '8px',
        backgroundColor: GOLD,
        cornerRadius: 'md',
        contents: [{ type: 'filler' }],
      },
    ],
  };
}

function statColumn(value: number, label: string) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    contents: [
      { type: 'text', text: `${clampPercent(value)}%`, size: 'lg', weight: 'bold', color: GOLD, align: 'center' },
      { type: 'text', text: label, size: 'xxs', color: TEXT_MUTED, align: 'center' },
    ],
  };
}

function gameBubble(g: LineSlotGame) {
  const img = httpsUrl(g.imageUrl);
  const play = httpsUrl(g.playUrl);
  const winRate = clampPercent(g.popularityScore);

  const footerButtons: any[] = [];
  if (play) {
    footerButtons.push({
      type: 'button', style: 'primary', color: '#C08A00', height: 'sm',
      action: { type: 'uri', label: '🎮 เข้าเล่นเลย', uri: play },
    });
  }
  footerButtons.push({
    type: 'button', style: play ? 'secondary' : 'primary', ...(play ? {} : { color: '#C08A00' }), height: 'sm',
    action: { type: 'message', label: '👩‍💻 ทักแอดมิน', text: `สนใจเกม ${g.name}` },
  });

  return {
    type: 'bubble',
    size: 'kilo',
    ...(img ? { hero: { type: 'image', url: img, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' } } : {}),
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: BG_DARK,
      paddingAll: '14px',
      spacing: 'sm',
      contents: [
        { type: 'text', text: g.name, size: 'lg', weight: 'bold', color: '#FFFFFF', align: 'center', wrap: true },
        { type: 'text', text: 'สูตรมาจากสถิติลูกค้าเล่นจริง', size: 'xxs', color: TEXT_MUTED, align: 'center' },
        { type: 'separator', margin: 'md', color: '#2A2A2A' },
        {
          type: 'box', layout: 'horizontal', margin: 'md',
          contents: [
            { type: 'text', text: '🎯 อัตราชนะ', size: 'sm', color: '#EDEDED', flex: 1 },
            { type: 'text', text: `${winRate}%`, size: 'sm', weight: 'bold', color: GOLD, align: 'end' },
          ],
        },
        progressBar(winRate),
        {
          type: 'box', layout: 'horizontal', margin: 'lg',
          contents: [
            statColumn(g.popularityScore, 'โอกาสชนะ'),
            statColumn(g.bonusScore, 'เข้าฟรีสปิน'),
            statColumn(g.featureScore, 'WILD'),
          ],
        },
        {
          type: 'box', layout: 'horizontal', margin: 'md',
          contents: [
            { type: 'text', text: `🏢 ${g.providerName}`, size: 'xxs', color: TEXT_MUTED, flex: 1 },
            ...(g.isRecommended
              ? [{ type: 'text', text: '🔥 แนะนำ', size: 'xxs', color: '#F97316', align: 'end' }]
              : []),
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: BG_DARK,
      paddingAll: '12px',
      spacing: 'sm',
      contents: footerButtons,
    },
  };
}

export function buildProviderGamesFlex(providerName: string, games: LineSlotGame[]) {
  // LINE carousel รองรับสูงสุด 12 bubbles — เอาเกมแนะนำ/คะแนนสูงสุด 10 อันแรก
  const bubbles = games.slice(0, 10).map(gameBubble);
  return {
    type: 'flex',
    altText: `🎰 เกมแตกค่าย ${providerName} — เปอร์เซ็นต์อัปเดตล่าสุด`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles },
  };
}

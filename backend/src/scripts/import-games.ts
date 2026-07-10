/**
 * Import games — สแกนรูปใน uploads/games/<campCode>/ แล้วสร้างค่าย (BonusTimeCamp)
 * + เกม (BonusTimeGame) ให้อัตโนมัติ แยกตาม provider
 *
 * รัน:  npm run import-games
 * รันซ้ำได้ปลอดภัย (skip เกม/ค่ายที่มีอยู่แล้ว)
 *
 * ENV: PUBLIC_BASE_URL (default https://khodtuengai.com) — ใช้สร้าง URL รูปแบบ absolute
 *      เพื่อให้ LINE Flex แสดงรูปได้ (LINE ต้องการ https URL เต็ม)
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';

const BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://khodtuengai.com').replace(/\/$/, '');
const GAMES_DIR = path.join(process.cwd(), 'uploads', 'games');

// ค่าย (โฟลเดอร์ใน uploads/games) → ชื่อแสดงผล + สี
const PROVIDERS: { code: string; name: string; accent: string }[] = [
  { code: 'jili',       name: 'JILI',          accent: '#FFB300' },
  { code: 'joker',      name: 'JOKER',         accent: '#7C4DFF' },
  { code: 'slotxo',     name: 'SLOTXO',        accent: '#00E5FF' },
  { code: 'redtiger',   name: 'RED TIGER',     accent: '#FF1744' },
  { code: 'yggdrasil',  name: 'YGGDRASIL',     accent: '#76FF03' },
  { code: 'netent',     name: 'NETENT',        accent: '#18FFFF' },
  { code: 'nolimit',    name: 'NOLIMIT CITY',  accent: '#FF9100' },
  { code: 'relax',      name: 'RELAX GAMING',  accent: '#69F0AE' },
  { code: 'wazdan',     name: 'WAZDAN',        accent: '#FFD740' },
  { code: 'playngo',    name: "PLAY'N GO",     accent: '#FF4081' },
  { code: 'evoplay',    name: 'EVOPLAY',       accent: '#536DFE' },
  { code: 'cq9',        name: 'CQ9',           accent: '#FF6E40' },
  { code: 'cg',         name: 'CG',            accent: '#B388FF' },
  { code: 'fachai',     name: 'FA CHAI',       accent: '#FFAB40' },
  { code: 'simpleplay', name: 'SIMPLE PLAY',   accent: '#64FFDA' },
  { code: 'rich88',     name: 'RICH88',        accent: '#EEFF41' },
  { code: 'askmebet',   name: 'ASKMEBET',      accent: '#40C4FF' },
  { code: 'amb',        name: 'AMB',           accent: '#E040FB' },
  { code: '5g',         name: '5G GAME',       accent: '#00B0FF' },
  { code: 'ygr',        name: 'YGR',           accent: '#F50057' },
];

// ── แปลงชื่อไฟล์ → ชื่อเกมอ่านง่าย ──────────────────────────────────────────
function splitCamel(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function titleCase(s: string): string {
  return s.split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

function gameName(code: string, stem: string): string {
  switch (code) {
    case 'jili': {
      // 001_276_1020_276_FortuneGaruda500 | 006_4_GameID_32_EN | 116_85_en
      const parts = stem.split('_');
      const last = parts[parts.length - 1];
      if (/^en$/i.test(last) && parts.length >= 2) {
        const gi = parts.indexOf('GameID');
        const id = gi >= 0 ? parts[gi + 1] : parts[parts.length - 2];
        return `JILI Game ${id}`;
      }
      if (/[A-Za-z]/.test(last)) return titleCase(splitCamel(last));
      return `JILI Game ${last}`;
    }
    case 'cg':
      return titleCase(splitCamel(stem));
    case 'rich88':
      return titleCase(splitCamel(stem.replace(/^Slot/, '')));
    case 'playngo':
      return titleCase(splitCamel(stem.replace(/^PNG-?/i, '')));
    case 'nolimit':
      return titleCase(splitCamel(stem.replace(/^NLC-?/i, '')));
    case 'wazdan':
      return titleCase(splitCamel(stem.replace(/^WAZ-?/i, '')));
    case 'netent':
    case 'redtiger': {
      // ชื่อ pad ด้วย 0 ท้ายไฟล์ เช่น silverback000000
      const cleaned = stem.replace(/0+$/, '') || stem;
      return titleCase(splitCamel(cleaned));
    }
    // ชื่อไฟล์เป็นรหัส/hash — ใช้ตามเดิม ไม่ต้องแยกคำ
    case 'joker':
    case 'slotxo':
    case 'simpleplay':
    case '5g':
      return stem;
    default:
      return /[A-Za-z]/.test(stem) ? titleCase(splitCamel(stem)) : stem;
  }
}

// สุ่มแบบ deterministic จากชื่อไฟล์ (รันซ้ำได้ค่าเดิม)
function seededPct(key: string, min: number, max: number): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const r = (h >>> 0) / 4294967295;
  return Math.round(min + r * (max - min));
}

async function importForCompany(tenantId: string, companyId: string) {
  let campsAdded = 0, gamesAdded = 0, skipped = 0;

  for (let i = 0; i < PROVIDERS.length; i++) {
    const p = PROVIDERS[i];
    const dir = path.join(GAMES_DIR, p.code);
    if (!fs.existsSync(dir)) { console.log(`⏭  ไม่มีโฟลเดอร์ ${p.code} — ข้าม`); continue; }

    let camp = await prisma.bonusTimeCamp.findFirst({ where: { companyId, code: p.code } });
    if (!camp) {
      camp = await prisma.bonusTimeCamp.create({
        data: { tenantId, companyId, name: p.name, code: p.code, accent: p.accent, order: i },
      });
      campsAdded++;
    }

    const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
    // เกมที่มีอยู่แล้ว (dedupe ด้วย image URL)
    const existing = await prisma.bonusTimeGame.findMany({ where: { campId: camp.id }, select: { image: true } });
    const existingImages = new Set(existing.map((g: { image: string | null }) => g.image));

    let order = existing.length;
    for (const f of files) {
      const image = `${BASE_URL}/uploads/games/${p.code}/${f}`;
      if (existingImages.has(image)) { skipped++; continue; }
      const stem = f.replace(/\.(png|jpe?g)$/i, '');
      await prisma.bonusTimeGame.create({
        data: {
          tenantId, companyId, campId: camp.id,
          name: gameName(p.code, stem),
          image,
          winRate: seededPct(p.code + stem + 'w', 78, 96),
          freeSpinRate: seededPct(p.code + stem + 'f', 60, 85),
          wildRate: seededPct(p.code + stem + 'x', 62, 88),
          provider: p.name,
          languages: JSON.stringify(['TH', 'EN']),
          order: order++,
        },
      });
      gamesAdded++;
    }
    console.log(`✅ ${p.name}: ${files.length} รูป (เพิ่มใหม่จนถึงตอนนี้ ${gamesAdded} เกม)`);
  }
  return { campsAdded, gamesAdded, skipped };
}

async function main() {
  if (!fs.existsSync(GAMES_DIR)) {
    console.error(`❌ ไม่พบโฟลเดอร์ ${GAMES_DIR}`);
    process.exit(1);
  }
  // import ให้บริษัทแรกของแต่ละ tenant (ตรงกับ resolveCompanyId ใน routes)
  const tenants = await prisma.tenant.findMany({ where: { slug: { not: 'system' } } });
  for (const t of tenants) {
    const company = await prisma.company.findFirst({ where: { tenantId: t.id }, orderBy: { createdAt: 'asc' } });
    if (!company) { console.log(`⏭  tenant ${t.slug} ไม่มีบริษัท — ข้าม`); continue; }
    console.log(`\n🏢 Tenant: ${t.name} → Company: ${company.name}`);
    const r = await importForCompany(t.id, company.id);
    console.log(`\n🎰 สรุป ${t.name}: ค่ายใหม่ ${r.campsAdded} | เกมใหม่ ${r.gamesAdded} | ข้าม (มีอยู่แล้ว) ${r.skipped}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Game {
  id: string; campId: string; name: string; image?: string | null; banner?: string | null;
  winRate: number; freeSpinRate: number; wildRate: number;
  provider?: string; languages?: string; link?: string | null; order: number; isActive: boolean;
}
interface Camp {
  id: string; name: string; code: string; logo?: string | null;
  accent?: string; order: number; isActive: boolean; games: Game[];
}
interface Config {
  isActive: boolean; headerTitle: string; headerSubtitle: string;
  intro: string; gamesIntro: string; footerNote: string;
  aiTrigger: boolean; keywords: string; liveJitter: number; accent: string;
}

const LANG_OPTS = ['TH', 'EN', 'LO', 'CN', 'MY', 'VN'];

// ─── Luxury theme CSS ─────────────────────────────────────────────────────────
const LUX_CSS = `
/* เวอร์ชันเบา: ตัด blur/backdrop-filter/animation ที่กิน GPU+RAM ออก โหลดเร็วขึ้นมาก */
.bt-lux{position:relative;min-height:calc(100vh - 40px);padding:26px 30px;background:#12101b}
.bt-bg{display:none}
.bt-orb{display:none}
.bt-inner{position:relative;z-index:1;max-width:1060px;margin:0 auto}
.bt-title{margin:0;font-weight:900;letter-spacing:.5px;font-size:2rem;line-height:1.1;color:#ffd700}
.bt-sub{color:#c9b98e;font-size:.82rem;margin-top:6px;max-width:640px}
.bt-panel{background:#1a1726;border:1px solid rgba(255,215,0,.16);border-radius:12px;padding:18px;margin-bottom:18px}
.bt-panel-h{font-weight:800;margin-bottom:12px;color:#f6e7bd;letter-spacing:.3px}
.bt-gold{color:#ffd700}
.bt-camp{border:1px solid rgba(255,215,0,.35);border-radius:12px;padding:16px;margin-bottom:16px;background:#211b30}
.bt-in{width:100%;background:#0e0d15;border:1px solid rgba(255,215,0,.18);border-radius:9px;padding:8px 10px;font-size:.85rem;color:#f4ecd6;outline:none}
.bt-in:focus{border-color:rgba(255,215,0,.6)}
.bt-lbl{font-size:.72rem;font-weight:700;color:#b7a578;margin-bottom:4px;letter-spacing:.3px}
.bt-game{display:flex;gap:14px;flex-wrap:wrap;align-items:center;padding:12px;border-radius:12px;margin-top:10px;background:rgba(255,255,255,.02);border:1px solid rgba(255,215,0,.10)}
.bt-thumb{width:52px;height:40px;border-radius:8px;overflow:hidden;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;background:#0e0d15;border:1px solid rgba(255,215,0,.25);color:#8a7a4e;font-size:.6rem}
.bt-stat{min-width:120px;flex:1}
.bt-stat-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
.bt-stat-lbl{font-size:.66rem;color:#b7a578;font-weight:700;letter-spacing:.4px}
.bt-stat-val{font-size:.9rem;font-weight:900}
.bt-bar{position:relative;height:9px;border-radius:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,215,0,.14);overflow:hidden}
.bt-bar-fill{position:absolute;left:0;top:0;bottom:0;border-radius:6px}
.bt-bar-shine{display:none}
.bt-num{width:52px;text-align:center;margin-top:5px;background:#0e0d15;border:1px solid rgba(255,215,0,.18);border-radius:7px;padding:3px 4px;font-size:.78rem;color:#f4ecd6;outline:none}
.bt-pill{font-size:.62rem;padding:2px 6px;border-radius:5px;cursor:pointer;border:1px solid rgba(255,215,0,.25);background:transparent;color:#b7a578}
.bt-pill.on{background:#e8b923;color:#231a06;border-color:transparent;font-weight:800}
.bt-btn{border:1px solid rgba(255,215,0,.4);background:rgba(255,215,0,.12);color:#ffe9a8;border-radius:9px;padding:7px 14px;font-size:.82rem;font-weight:700;cursor:pointer}
.bt-btn:hover{background:#e8b923;color:#231a06}
.bt-btn-solid{border:none;background:linear-gradient(135deg,#ffe9a8,#ffd700,#e8b923);color:#231a06;border-radius:10px;padding:9px 18px;font-weight:900;cursor:pointer}
.bt-btn-solid:hover{filter:brightness(1.05)}
.bt-btn-danger{border:1px solid rgba(239,68,68,.35);background:transparent;color:#f87171;border-radius:8px;padding:5px 9px;cursor:pointer}
<<<<<<< HEAD
.bt-toggle{display:flex;align-items:center;gap:9px;cursor:pointer;padding:9px 16px;border-radius:12px;font-weight:800;border:1px solid rgba(255,215,0,.3)}
=======
.bt-toggle{display:flex;align-items:center;gap:9px;cursor:pointer;padding:9px 16px;border-radius:12px;font-weight:800;
  border:1px solid rgba(255,215,0,.3)}

/* ── Preview Modal ────────────────────────────────────────── */
.bt-pv-overlay{position:fixed;inset:0;z-index:9999;background:rgba(5,4,10,.82);
  backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;
  animation:bt-pv-fadein .25s ease}
@keyframes bt-pv-fadein{from{opacity:0}to{opacity:1}}
@keyframes bt-pv-slidein{from{transform:translateY(60px) scale(.96);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
.bt-pv-wrap{display:flex;flex-direction:column;align-items:center;gap:16px;animation:bt-pv-slidein .3s cubic-bezier(.2,.9,.2,1)}
.bt-pv-label{font-size:.72rem;color:#b7a578;letter-spacing:1px;text-transform:uppercase;font-weight:700}
/* Phone frame */
.bt-phone{width:340px;background:#0d0c14;border-radius:40px;border:2px solid rgba(255,215,0,.25);
  box-shadow:0 0 0 6px rgba(255,215,0,.06),0 30px 80px rgba(0,0,0,.8),inset 0 0 0 1px rgba(255,255,255,.04);
  overflow:hidden;position:relative}
.bt-phone-bar{height:36px;background:linear-gradient(180deg,#1a1626,#120f1e);display:flex;align-items:center;
  justify-content:space-between;padding:0 20px;border-bottom:1px solid rgba(255,215,0,.08)}
.bt-phone-notch{width:80px;height:20px;background:#0a0912;border-radius:0 0 14px 14px;margin:0 auto;
  position:absolute;top:0;left:50%;transform:translateX(-50%)}
.bt-phone-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,215,0,.25)}
.bt-phone-body{height:560px;overflow-y:auto;background:#f0f0f0;scrollbar-width:thin}
.bt-phone-body::-webkit-scrollbar{width:3px}
.bt-phone-body::-webkit-scrollbar-thumb{background:rgba(184,134,11,.4);border-radius:6px}
/* LINE-style chat bg */
.bt-line-bg{min-height:100%;background:#acb5be url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/svg%3E");
  padding:10px 8px 16px}
/* Bubble styles */
.bt-bubble-wrap{display:flex;align-items:flex-end;gap:6px;margin-bottom:8px}
.bt-bot-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#c8941a,#ffd700);
  display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.bt-bubble{border-radius:14px 14px 14px 4px;overflow:hidden;max-width:270px;
  box-shadow:0 3px 12px rgba(0,0,0,.22)}
/* Camp menu bubble */
.bt-bub-header{padding:14px 16px 10px;
  background:linear-gradient(135deg,#1a1626,#241d38)}
.bt-bub-title{font-weight:900;font-size:1rem;
  background:linear-gradient(90deg,#9c6b12,#ffe9a8,#ffd700);
  background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
  animation:bt-shimmer 4s linear infinite}
.bt-bub-sub{font-size:.68rem;color:#a89060;margin-top:3px}
.bt-bub-intro{font-size:.72rem;color:#d4c49a;padding:8px 16px;background:#1e1930;border-top:1px solid rgba(255,215,0,.12)}
.bt-camp-row{display:flex;align-items:center;gap:8px;padding:8px 14px;border-top:1px solid rgba(255,215,0,.08);
  cursor:pointer;transition:.15s;background:#16131f}
.bt-camp-row:hover{background:#201c30}
.bt-camp-logo{width:28px;height:28px;border-radius:6px;object-fit:contain;background:#0d0c14;
  border:1px solid rgba(255,215,0,.2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#8a7a4e}
.bt-camp-name{font-size:.78rem;font-weight:800;color:#ffe9a8;flex:1}
.bt-camp-cnt{font-size:.62rem;color:#8a7a4e}
.bt-camp-arrow{color:#ffd700;font-size:.7rem}
.bt-bub-footer{padding:6px 16px 10px;background:#120f1e;font-size:.62rem;color:#7a6a48;text-align:center}
/* Game bubble */
.bt-game-banner{width:100%;height:90px;object-fit:cover;display:block;background:#0d0c14}
.bt-game-banner-ph{width:100%;height:90px;background:linear-gradient(135deg,#1a1626,#251e3a);
  display:flex;align-items:center;justify-content:center;color:#4a4060;font-size:.65rem}
.bt-game-card{background:#16131f;border-top:1px solid rgba(255,215,0,.1);padding:10px 12px}
.bt-game-card-top{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.bt-game-icon{width:36px;height:36px;border-radius:8px;object-fit:cover;background:#0d0c14;
  border:1px solid rgba(255,215,0,.2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#8a7a4e}
.bt-game-name{font-size:.82rem;font-weight:800;color:#ffe9a8}
.bt-game-provider{font-size:.6rem;color:#8a7a4e}
.bt-pv-bar-wrap{margin-bottom:5px}
.bt-pv-bar-row{display:flex;justify-content:space-between;font-size:.6rem;font-weight:700;margin-bottom:2px}
.bt-pv-bar{height:6px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden;position:relative}
.bt-pv-bar-fill{height:100%;border-radius:4px;transition:width .5s cubic-bezier(.2,.9,.2,1)}
/* Tab bar */
.bt-pv-tabs{display:flex;gap:0;background:rgba(10,9,14,.6);border:1px solid rgba(255,215,0,.18);
  border-radius:12px;overflow:hidden}
.bt-pv-tab{flex:1;padding:8px 0;font-size:.76rem;font-weight:700;cursor:pointer;border:none;
  background:transparent;color:#8a7a4e;transition:.18s;letter-spacing:.2px}
.bt-pv-tab.active{background:linear-gradient(135deg,rgba(255,215,0,.2),rgba(184,134,11,.16));color:#ffe9a8}
/* Camp selector dropdown */
.bt-pv-select{width:100%;background:rgba(10,9,14,.8);border:1px solid rgba(255,215,0,.25);
  border-radius:10px;padding:8px 10px;color:#f4ecd6;font-size:.82rem;font-weight:700;outline:none;margin-bottom:12px}
/* Preview button */
.bt-btn-preview{border:1px solid rgba(100,180,255,.4);background:linear-gradient(135deg,rgba(100,180,255,.12),rgba(50,130,220,.1));
  color:#a8d4ff;border-radius:9px;padding:7px 14px;font-size:.82rem;font-weight:700;cursor:pointer;transition:.18s;
  display:flex;align-items:center;gap:6px}
.bt-btn-preview:hover{background:linear-gradient(135deg,rgba(100,180,255,.28),rgba(50,130,220,.22));
  box-shadow:0 6px 18px rgba(80,160,255,.25);color:#dceeff}
/* Close button */
.bt-pv-close{position:absolute;top:12px;right:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,215,0,.2);
  color:#b7a578;border-radius:8px;padding:4px 10px;font-size:.8rem;font-weight:700;cursor:pointer;transition:.15s;z-index:10}
.bt-pv-close:hover{background:rgba(255,80,80,.18);color:#f87171;border-color:rgba(239,68,68,.35)}

/* ── Camp Dropdown Selector ───────────────────────────────── */
.bt-camp-dd-wrap{position:relative;margin-bottom:14px}
.bt-camp-dd-btn{width:100%;display:flex;align-items:center;gap:10px;padding:12px 16px;
  background:linear-gradient(180deg,rgba(38,31,17,.72),rgba(18,16,26,.72));
  border:1px solid rgba(255,215,0,.35);border-radius:14px;cursor:pointer;transition:.18s;
  color:#ffe9a8;font-weight:800;font-size:.95rem;text-align:left}
.bt-camp-dd-btn:hover{border-color:rgba(255,215,0,.65);box-shadow:0 4px 18px rgba(255,196,66,.18)}
.bt-camp-dd-btn.open{border-color:rgba(255,215,0,.65);border-radius:14px 14px 0 0;
  box-shadow:0 4px 18px rgba(255,196,66,.18)}
.bt-camp-dd-arrow{margin-left:auto;color:#ffd700;font-size:.9rem;transition:transform .22s}
.bt-camp-dd-arrow.open{transform:rotate(180deg)}
.bt-camp-dd-panel{position:absolute;top:100%;left:0;right:0;z-index:200;
  background:linear-gradient(180deg,rgba(22,17,38,.98),rgba(12,10,22,.98));
  border:1px solid rgba(255,215,0,.35);border-top:none;border-radius:0 0 14px 14px;
  max-height:320px;overflow-y:auto;box-shadow:0 16px 40px rgba(0,0,0,.65);
  scrollbar-width:thin;scrollbar-color:rgba(184,134,11,.4) transparent}
.bt-camp-dd-panel::-webkit-scrollbar{width:4px}
.bt-camp-dd-panel::-webkit-scrollbar-thumb{background:rgba(184,134,11,.4);border-radius:6px}
.bt-camp-dd-search{padding:10px 12px;border-bottom:1px solid rgba(255,215,0,.12);
  background:rgba(10,9,14,.6);position:sticky;top:0;z-index:1}
.bt-camp-dd-search input{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,215,0,.2);
  border-radius:8px;padding:6px 10px;color:#f4ecd6;font-size:.82rem;outline:none}
.bt-camp-dd-search input::placeholder{color:#6a5e42}
.bt-camp-dd-item{display:flex;align-items:center;gap:10px;padding:10px 14px;
  cursor:pointer;transition:.14s;border-bottom:1px solid rgba(255,215,0,.06)}
.bt-camp-dd-item:hover{background:rgba(255,215,0,.07)}
.bt-camp-dd-item.selected{background:rgba(255,215,0,.12)}
.bt-camp-dd-item-logo{width:30px;height:30px;border-radius:7px;object-fit:contain;
  background:#0d0c14;border:1px solid rgba(255,215,0,.2);flex-shrink:0;
  display:flex;align-items:center;justify-content:center;font-size:11px;color:#8a7a4e}
.bt-camp-dd-item-name{flex:1;font-weight:800;font-size:.88rem;color:#f6e7bd}
.bt-camp-dd-item-meta{font-size:.7rem;color:#8a7a4e}
.bt-camp-dd-item-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
>>>>>>> 9389793 (feat: BonusTime camp dropdown selector + slot bot + various updates)
`;

// ─── Animated gold % bar (admin editor) ───────────────────────────────────────
function GoldBar({ percent, from, to }: { percent: number; from: string; to: string }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="bt-bar">
      <div className="bt-bar-fill" style={{ width: `${p}%`, background: `linear-gradient(90deg, ${from}, ${to})` }}>
        <span className="bt-bar-shine" />
      </div>
    </div>
  );
}

const STAT_META = {
  winRate: { label: 'อัตราชนะ', from: '#8a5a0b', to: '#ffd700', val: '#ffd700', barFrom: '#c8940a', barTo: '#ffd700' },
  freeSpinRate: { label: 'ฟรีสปิน', from: '#9c5a12', to: '#ffb347', val: '#ffc266', barFrom: '#b8621a', barTo: '#ffb347' },
  wildRate: { label: 'WILD', from: '#8a3d2e', to: '#ff9e7a', val: '#ff9e7a', barFrom: '#a04030', barTo: '#ff9e7a' },
} as const;

// ─── Preview: mini bar for LINE bubble ───────────────────────────────────────
function PvBar({ pct, colorFrom, colorTo }: { pct: number; colorFrom: string; colorTo: string }) {
  return (
    <div className="bt-pv-bar">
      <div className="bt-pv-bar-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: `linear-gradient(90deg,${colorFrom},${colorTo})` }} />
    </div>
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────
function PreviewModal({
  config, camps, onClose,
}: {
  config: Config; camps: Camp[]; onClose: () => void;
}) {
  const [tab, setTab] = useState<'camps' | 'games'>('camps');
  const [campIdx, setCampIdx] = useState(0);
  const [jitter, setJitter] = useState<Record<string, { w: number; f: number; wi: number }>>({});

  const activeCamps = camps.filter(c => c.isActive);
  const selectedCamp = activeCamps[campIdx] ?? activeCamps[0];
  const activeGames = selectedCamp?.games.filter(g => g.isActive) ?? [];

  // Build initial jitter from actual values
  const buildJitter = useCallback(() => {
    const map: Record<string, { w: number; f: number; wi: number }> = {};
    camps.forEach(camp => camp.games.forEach(g => {
      const j = config.liveJitter;
      const rnd = (base: number) => Math.max(0, Math.min(100, base + (j > 0 ? Math.floor(Math.random() * (j * 2 + 1)) - j : 0)));
      map[g.id] = { w: rnd(g.winRate), f: rnd(g.freeSpinRate), wi: rnd(g.wildRate) };
    }));
    return map;
  }, [camps, config.liveJitter]);

  useEffect(() => {
    setJitter(buildJitter());
    if (config.liveJitter === 0) return;
    const id = setInterval(() => setJitter(buildJitter()), 3000);
    return () => clearInterval(id);
  }, [buildJitter, config.liveJitter]);

  return (
    <div className="bt-pv-overlay" onClick={onClose}>
      <div className="bt-pv-wrap" onClick={e => e.stopPropagation()}>
        {/* Label */}
        <div className="bt-pv-label">👁 ตัวอย่างที่ลูกค้าเห็นใน LINE</div>

        {/* Tab bar */}
        <div className="bt-pv-tabs">
          <button className={`bt-pv-tab${tab === 'camps' ? ' active' : ''}`} onClick={() => setTab('camps')}>
            🏠 เมนูค่ายเกม
          </button>
          <button className={`bt-pv-tab${tab === 'games' ? ' active' : ''}`} onClick={() => setTab('games')}>
            🎮 เกมในค่าย
          </button>
        </div>

        {/* Camp selector (only on games tab) */}
        {tab === 'games' && activeCamps.length > 0 && (
          <select
            className="bt-pv-select"
            value={campIdx}
            onChange={e => setCampIdx(Number(e.target.value))}
          >
            {activeCamps.map((c, i) => (
              <option key={c.id} value={i}>{c.name} ({c.games.filter(g => g.isActive).length} เกม)</option>
            ))}
          </select>
        )}

        {/* Phone frame */}
        <div style={{ position: 'relative' }}>
          <button className="bt-pv-close" onClick={onClose}>✕ ปิด</button>
          <div className="bt-phone">
            {/* Top bar */}
            <div className="bt-phone-bar">
              <div className="bt-phone-dot" />
              <div style={{ fontSize: '.65rem', color: '#8a7a4e', fontWeight: 700 }}>LINE Preview</div>
              <div className="bt-phone-dot" />
            </div>
            <div className="bt-phone-notch" />

            {/* Chat body */}
            <div className="bt-phone-body">
              <div className="bt-line-bg">

                {/* ── Tab: เมนูค่าย ─────────────────────────────── */}
                {tab === 'camps' && (
                  <div className="bt-bubble-wrap">
                    <div className="bt-bot-avatar">⚡</div>
                    <div className="bt-bubble">
                      {/* Header card */}
                      <div className="bt-bub-header">
                        <div className="bt-bub-title">{config.headerTitle || '⚡ BONUS TIME'}</div>
                        <div className="bt-bub-sub">{config.headerSubtitle || 'AI WINRATE SYSTEM'}</div>
                      </div>
                      <div className="bt-bub-intro">{config.intro || 'เลือกค่ายเกมด้านล่างได้เลยค่ะ 👇'}</div>

                      {/* Camp list */}
                      {activeCamps.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#8a7a4e', fontSize: '.72rem', background: '#16131f' }}>
                          ยังไม่มีค่ายเกมที่เปิดใช้งาน
                        </div>
                      ) : activeCamps.map(camp => (
                        <div key={camp.id} className="bt-camp-row">
                          {camp.logo
                            ? <img src={camp.logo} alt="" className="bt-camp-logo" style={{ width: 28, height: 28 }} />
                            : <div className="bt-camp-logo">{camp.name.slice(0, 2)}</div>
                          }
                          <span className="bt-camp-name">{camp.name}</span>
                          <span className="bt-camp-cnt">{camp.games.filter(g => g.isActive).length} เกม</span>
                          <span className="bt-camp-arrow">›</span>
                        </div>
                      ))}

                      <div className="bt-bub-footer">{config.footerNote || '✦ ข้อมูล LIVE อัพเดทแบบ Real-time'}</div>
                    </div>
                  </div>
                )}

                {/* ── Tab: เกมในค่าย ────────────────────────────── */}
                {tab === 'games' && (
                  <>
                    {!selectedCamp ? (
                      <div style={{ textAlign: 'center', color: '#8a7a4e', padding: 24, fontSize: '.78rem' }}>
                        ยังไม่มีค่ายเกมที่เปิดใช้งาน
                      </div>
                    ) : (
                      <div className="bt-bubble-wrap">
                        <div className="bt-bot-avatar">⚡</div>
                        <div className="bt-bubble" style={{ maxWidth: 280 }}>
                          {/* Camp header */}
                          <div className="bt-bub-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {selectedCamp.logo
                                ? <img src={selectedCamp.logo} alt="" style={{ width: 24, height: 24, borderRadius: 5, objectFit: 'contain', background: '#0d0c14' }} />
                                : <span style={{ fontSize: 16 }}>🎰</span>
                              }
                              <div>
                                <div className="bt-bub-title" style={{ fontSize: '.9rem' }}>{selectedCamp.name}</div>
                                <div className="bt-bub-sub">{config.gamesIntro || 'เกมแนะนำ อัตราชนะสูง'}</div>
                              </div>
                            </div>
                          </div>

                          {/* Games */}
                          {activeGames.length === 0 ? (
                            <div style={{ padding: 12, color: '#8a7a4e', fontSize: '.7rem', background: '#16131f', textAlign: 'center' }}>
                              ยังไม่มีเกมในค่ายนี้
                            </div>
                          ) : activeGames.map(g => {
                            const jv = jitter[g.id] ?? { w: g.winRate, f: g.freeSpinRate, wi: g.wildRate };
                            return (
                              <div key={g.id} className="bt-game-card">
                                {/* Banner */}
                                {g.banner
                                  ? <img src={g.banner} alt="" className="bt-game-banner" />
                                  : <div className="bt-game-banner-ph">ไม่มีรูปแบนเนอร์</div>
                                }
                                {/* Icon + name */}
                                <div className="bt-game-card-top" style={{ marginTop: 8 }}>
                                  {g.image
                                    ? <img src={g.image} alt="" className="bt-game-icon" style={{ width: 36, height: 36 }} />
                                    : <div className="bt-game-icon">{g.name.slice(0, 2)}</div>
                                  }
                                  <div>
                                    <div className="bt-game-name">{g.name}</div>
                                    <div className="bt-game-provider">{g.provider || selectedCamp.name}</div>
                                  </div>
                                </div>
                                {/* Stats */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div className="bt-pv-bar-wrap">
                                    <div className="bt-pv-bar-row">
                                      <span style={{ color: '#b7a578' }}>อัตราชนะ</span>
                                      <span style={{ color: '#ffd700', fontWeight: 900 }}>{jv.w}%</span>
                                    </div>
                                    <PvBar pct={jv.w} colorFrom={STAT_META.winRate.barFrom} colorTo={STAT_META.winRate.barTo} />
                                  </div>
                                  <div className="bt-pv-bar-wrap">
                                    <div className="bt-pv-bar-row">
                                      <span style={{ color: '#b7a578' }}>ฟรีสปิน</span>
                                      <span style={{ color: '#ffb347', fontWeight: 900 }}>{jv.f}%</span>
                                    </div>
                                    <PvBar pct={jv.f} colorFrom={STAT_META.freeSpinRate.barFrom} colorTo={STAT_META.freeSpinRate.barTo} />
                                  </div>
                                  <div className="bt-pv-bar-wrap">
                                    <div className="bt-pv-bar-row">
                                      <span style={{ color: '#b7a578' }}>WILD</span>
                                      <span style={{ color: '#ff9e7a', fontWeight: 900 }}>{jv.wi}%</span>
                                    </div>
                                    <PvBar pct={jv.wi} colorFrom={STAT_META.wildRate.barFrom} colorTo={STAT_META.wildRate.barTo} />
                                  </div>
                                </div>
                                {/* Link button */}
                                {g.link && (
                                  <div style={{ marginTop: 8, textAlign: 'center' }}>
                                    <span style={{ fontSize: '.65rem', background: 'linear-gradient(135deg,#ffe9a8,#e8b923)', color: '#231a06',
                                      borderRadius: 6, padding: '4px 12px', fontWeight: 800, cursor: 'pointer' }}>
                                      🎮 เข้าเล่น
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          <div className="bt-bub-footer">{config.footerNote || '✦ ข้อมูล LIVE อัพเดทแบบ Real-time'}</div>
                        </div>
                      </div>
                    )}
                  </>
                )}

              </div>
            </div>

            {/* Bottom bar */}
            <div style={{ height: 20, background: 'linear-gradient(180deg,#120f1e,#0a0912)', borderTop: '1px solid rgba(255,215,0,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 80, height: 4, borderRadius: 2, background: 'rgba(255,215,0,.2)' }} />
            </div>
          </div>
        </div>

        {/* Footer note */}
        {config.liveJitter > 0 && (
          <div style={{ fontSize: '.68rem', color: '#8a7a4e', textAlign: 'center' }}>
            ⚡ Live Jitter ±{config.liveJitter}% — ตัวเลขจะขยับทุก 3 วิ
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// ─── Camp Dropdown Component ─────────────────────────────────────────────────
function CampDropdown({
  camps, selectedId, onSelect,
}: {
  camps: Camp[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = camps.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const selected = camps.find(c => c.id === selectedId);

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="bt-camp-dd-wrap" ref={ref}>
      <button
        className={`bt-camp-dd-btn${open ? ' open' : ''}`}
        onClick={() => { setOpen(o => !o); setSearch(''); }}
      >
        {selected ? (
          <>
            {selected.logo
              ? <img src={selected.logo} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain', background: '#0d0c14', border: '1px solid rgba(255,215,0,.2)' }} />
              : <span style={{ width: 28, height: 28, borderRadius: 6, background: '#1a1626', border: '1px solid rgba(255,215,0,.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🎰</span>
            }
            <span>{selected.name}</span>
            <span style={{ fontSize: '.72rem', color: '#8a7a4e', fontWeight: 400 }}>({selected.games.length} เกม)</span>
            {!selected.isActive && <span style={{ fontSize: '.68rem', color: '#f87171', border: '1px solid rgba(239,68,68,.3)', borderRadius: 4, padding: '1px 5px' }}>ซ่อน</span>}
          </>
        ) : (
          <><span>🏆</span><span style={{ color: '#b7a578', fontWeight: 700 }}>— เลือกค่ายเกม —</span></>
        )}
        <span className={`bt-camp-dd-arrow${open ? ' open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="bt-camp-dd-panel">
          <div className="bt-camp-dd-search">
            <input
              autoFocus
              placeholder="🔍 ค้นหาค่ายเกม..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#8a7a4e', fontSize: '.78rem' }}>ไม่พบค่ายเกม</div>
          ) : filtered.map(c => (
            <div
              key={c.id}
              className={`bt-camp-dd-item${c.id === selectedId ? ' selected' : ''}`}
              onClick={() => { onSelect(c.id); setOpen(false); setSearch(''); }}
            >
              <span
                className="bt-camp-dd-item-dot"
                style={{ background: c.isActive ? '#4ade80' : '#6b7280' }}
              />
              {c.logo
                ? <img src={c.logo} alt="" className="bt-camp-dd-item-logo" style={{ width: 30, height: 30 }} />
                : <div className="bt-camp-dd-item-logo">{c.name.slice(0, 2)}</div>
              }
              <span className="bt-camp-dd-item-name">{c.name}</span>
              <span className="bt-camp-dd-item-meta">{c.games.length} เกม</span>
              {c.id === selectedId && <span style={{ color: '#ffd700', fontSize: '.8rem' }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BonusTimePage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [selectedCampId, setSelectedCampId] = useState<string | null>(null);
  const [defaultKeywords, setDefaultKeywords] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCfg, setSavingCfg] = useState(false);
  const [testId, setTestId] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const uploadRef = useRef<{ cb: (url: string) => void } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const r = await api.get('/bonustime');
      const cfg = r.data.config;
      setConfig({
        isActive: cfg.isActive, headerTitle: cfg.headerTitle, headerSubtitle: cfg.headerSubtitle,
        intro: cfg.intro, gamesIntro: cfg.gamesIntro, footerNote: cfg.footerNote,
        aiTrigger: cfg.aiTrigger,
        keywords: (() => { try { return (JSON.parse(cfg.keywords) || []).join(', '); } catch { return ''; } })(),
        liveJitter: cfg.liveJitter, accent: cfg.accent,
      });
      setCamps(r.data.camps || []);
      setDefaultKeywords(r.data.defaultKeywords || []);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // ─── image upload ───────────────────────────────────────────────────────────
  const pickImage = (cb: (url: string) => void) => { uploadRef.current = { cb }; fileInput.current?.click(); };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append('image', f);
    const t = toast.loading('กำลังอัปโหลด...');
    try {
      const r = await api.post('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      uploadRef.current?.cb(r.data.url); toast.success('อัปโหลดรูปแล้ว', { id: t });
    } catch (err: any) { toast.error(err.response?.data?.message || 'อัปโหลดไม่สำเร็จ', { id: t }); }
    finally { if (fileInput.current) fileInput.current.value = ''; }
  };

  // ─── config ──────────────────────────────────────────────────────────────────
  const saveConfig = async () => {
    if (!config) return;
    setSavingCfg(true);
    try {
      await api.put('/bonustime/config', { ...config, keywords: config.keywords });
      toast.success('✅ บันทึกการตั้งค่าแล้ว'); load();
    } catch (e: any) { toast.error(e.response?.data?.message || 'บันทึกไม่สำเร็จ'); }
    finally { setSavingCfg(false); }
  };
  const setCfg = (k: keyof Config, v: any) => setConfig(c => c ? { ...c, [k]: v } : c);

  const seed = async () => {
    const t = toast.loading('กำลังเพิ่มค่าย/เกมตัวอย่าง...');
    try { const r = await api.post('/bonustime/seed'); toast.success(r.data.message, { id: t }); load(); }
    catch (e: any) { toast.error(e.response?.data?.message || 'ไม่สำเร็จ', { id: t }); }
  };

  // ─── camp ops ──────────────────────────────────────────────────────────────
  const addCamp = async () => {
    const name = prompt('ชื่อค่ายเกม (เช่น JILI)'); if (!name) return;
    try { await api.post('/bonustime/camps', { name, order: camps.length }); load(); }
    catch (e: any) { toast.error(e.response?.data?.message || 'เพิ่มไม่สำเร็จ'); }
  };
  const updateCamp = async (id: string, data: Partial<Camp>) => {
    try { await api.put(`/bonustime/camps/${id}`, data); load(); }
    catch (e: any) { toast.error(e.response?.data?.message || 'แก้ไขไม่สำเร็จ'); }
  };
  const delCamp = async (c: Camp) => {
    if (!confirm(`ลบค่าย "${c.name}" และเกมทั้งหมดในค่าย?`)) return;
    try { await api.delete(`/bonustime/camps/${c.id}`); load(); }
    catch (e: any) { toast.error('ลบไม่สำเร็จ'); }
  };

  // ─── game ops ──────────────────────────────────────────────────────────────
  const addGame = async (camp: Camp) => {
    const name = prompt(`ชื่อเกมในค่าย ${camp.name}`); if (!name) return;
    try { await api.post('/bonustime/games', { campId: camp.id, name, provider: camp.name, order: camp.games.length }); load(); }
    catch (e: any) { toast.error(e.response?.data?.message || 'เพิ่มเกมไม่สำเร็จ'); }
  };
  const updateGame = async (id: string, data: Partial<Game>) => {
    try { await api.put(`/bonustime/games/${id}`, data); load(); }
    catch (e: any) { toast.error(e.response?.data?.message || 'แก้ไขไม่สำเร็จ'); }
  };
  const delGame = async (g: Game) => {
    if (!confirm(`ลบเกม "${g.name}"?`)) return;
    try { await api.delete(`/bonustime/games/${g.id}`); load(); }
    catch { toast.error('ลบไม่สำเร็จ'); }
  };

  const testSend = async () => {
    if (!testId.trim()) { toast.error('ใส่ LINE User ID ก่อนนะคะ'); return; }
    const t = toast.loading('กำลังส่ง...');
    try { const r = await api.post('/bonustime/test-send', { lineUserId: testId.trim() }); toast.success(r.data.message, { id: t }); }
    catch (e: any) { toast.error(e.response?.data?.message || 'ส่งไม่สำเร็จ', { id: t }); }
  };

  if (loading || !config) return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LUX_CSS }} />
      <div className="bt-lux"><div className="bt-bg"><span className="bt-orb bt-o1" /><span className="bt-orb bt-o2" /></div>
        <div className="bt-inner" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div className="bt-title" style={{ fontSize: '1.4rem' }}>⚡ BONUS TIME</div>
          <div style={{ color: '#b7a578', marginTop: 10 }}>กำลังโหลด...</div>
        </div>
      </div>
    </>
  );

  const totalGames = camps.reduce((n, c) => n + c.games.length, 0);

  return (
    <div className="bt-lux">
      <style dangerouslySetInnerHTML={{ __html: LUX_CSS }} />
      <div className="bt-bg">
        <span className="bt-orb bt-o1" /><span className="bt-orb bt-o2" /><span className="bt-orb bt-o3" />
      </div>
      <input ref={fileInput} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />

      {/* Preview Modal */}
      {previewOpen && config && (
        <PreviewModal config={config} camps={camps} onClose={() => setPreviewOpen(false)} />
      )}

      <div className="bt-inner">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <h1 className="bt-title">⚡ BONUS TIME</h1>
            <div className="bt-sub">AI WINRATE SYSTEM — ลูกค้าถามหา BONUSTIME ทาง LINE แล้วบอทโชว์ค่ายเกม + อัตราชนะแบบ LIVE ✦ ระดับพรีเมียม</div>
          </div>
          <label className="bt-toggle" style={{ background: config.isActive ? 'linear-gradient(135deg,rgba(255,215,0,.16),rgba(184,134,11,.14))' : 'rgba(148,163,184,.08)', color: config.isActive ? '#ffe9a8' : '#8a7a4e' }}>
            <input type="checkbox" checked={config.isActive} onChange={e => setCfg('isActive', e.target.checked)} />
            {config.isActive ? '✦ เปิดใช้งาน' : 'ปิดอยู่'}
          </label>
        </div>

        {/* Stats + seed + preview */}
        <div className="bt-panel" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 30 }}>
            <div><div style={{ fontSize: '1.7rem', fontWeight: 900 }} className="bt-gold">{camps.length}</div><div style={{ fontSize: '.72rem', color: '#b7a578' }}>ค่ายเกม</div></div>
            <div><div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#ffc266' }}>{totalGames}</div><div style={{ fontSize: '.72rem', color: '#b7a578' }}>เกมทั้งหมด</div></div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* ── Preview Button ── */}
            <button className="bt-btn-preview" onClick={() => setPreviewOpen(true)}>
              <span>👁</span> พรีวิว
            </button>
            <button className="bt-btn" onClick={seed}>✨ เพิ่มค่าย/เกมตัวอย่าง</button>
            <button className="bt-btn-solid" onClick={addCamp}>+ เพิ่มค่าย</button>
          </div>
        </div>

        {/* Trigger */}
        <div className="bt-panel">
          <div className="bt-panel-h">🤖 การเรียกใช้งาน (Trigger)</div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={config.aiTrigger} onChange={e => setCfg('aiTrigger', e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ fontSize: '.85rem', color: '#e7d9b4' }}>ให้ AI ตัดสินใจเรียกเอง — AI จะเข้าใจเจตนาลูกค้า (เช่น "ค่ายไหนแตก", "ขอดูอัตราชนะ") แล้วโชว์ BONUS TIME ให้อัตโนมัติ</span>
          </label>
          <div className="bt-lbl">คีย์เวิร์ดเพิ่มเติม (คั่นด้วยจุลภาค)</div>
          <input className="bt-in" value={config.keywords} onChange={e => setCfg('keywords', e.target.value)} placeholder="bonustime, โบนัสไทม์, อัตราชนะ, ..." />
          <div style={{ fontSize: '.7rem', color: '#8a7a4e', marginTop: 6 }}>มีอยู่แล้วในระบบ: {defaultKeywords.slice(0, 10).join(' · ')} …</div>
          <div style={{ marginTop: 16, display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div className="bt-lbl">สุ่มขยับ % ให้ดู LIVE (±)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="range" min={0} max={15} value={config.liveJitter} onChange={e => setCfg('liveJitter', parseInt(e.target.value))} style={{ accentColor: '#e8b923' }} />
                <span style={{ fontWeight: 800 }} className="bt-gold">±{config.liveJitter}%</span>
              </div>
            </div>
            <div>
              <div className="bt-lbl">สีธีมในการ์ด LINE</div>
              <input type="color" value={config.accent} onChange={e => setCfg('accent', e.target.value)} style={{ width: 54, height: 34, background: 'none', border: '1px solid rgba(255,215,0,.3)', borderRadius: 8 }} />
            </div>
          </div>
        </div>

        {/* Message texts */}
        <div className="bt-panel">
          <div className="bt-panel-h">💬 ข้อความในการ์ด</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
            <div><div className="bt-lbl">หัวข้อ</div><input className="bt-in" value={config.headerTitle} onChange={e => setCfg('headerTitle', e.target.value)} /></div>
            <div><div className="bt-lbl">หัวข้อรอง</div><input className="bt-in" value={config.headerSubtitle} onChange={e => setCfg('headerSubtitle', e.target.value)} /></div>
            <div><div className="bt-lbl">ข้อความเมนูค่าย</div><input className="bt-in" value={config.intro} onChange={e => setCfg('intro', e.target.value)} /></div>
            <div><div className="bt-lbl">ข้อความหน้าเกม</div><input className="bt-in" value={config.gamesIntro} onChange={e => setCfg('gamesIntro', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><div className="bt-lbl">หมายเหตุท้ายการ์ด</div><input className="bt-in" value={config.footerNote} onChange={e => setCfg('footerNote', e.target.value)} /></div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 26 }}>
          <button className="bt-btn-solid" onClick={saveConfig} disabled={savingCfg}>{savingCfg ? 'กำลังบันทึก...' : '💾 บันทึกการตั้งค่า'}</button>
        </div>

        {/* Camps & games */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#f6e7bd' }}>🎰 ค่ายเกม &amp; อัตราชนะ</div>
          <div style={{ fontSize: '.75rem', color: '#8a7a4e' }}>{camps.length} ค่าย · {camps.reduce((n, c) => n + c.games.length, 0)} เกมทั้งหมด</div>
        </div>

        {camps.length === 0 ? (
          <div className="bt-panel" style={{ textAlign: 'center', color: '#b7a578' }}>
            ยังไม่มีค่ายเกม — กด <b className="bt-gold">✨ เพิ่มค่าย/เกมตัวอย่าง</b> เพื่อเริ่มต้น
          </div>
        ) : (
          <>
            {/* ── Dropdown Selector ── */}
            <CampDropdown
              camps={camps}
              selectedId={selectedCampId}
              onSelect={id => setSelectedCampId(id === selectedCampId ? null : id)}
            />

            {/* ── Selected Camp Detail ── */}
            {(() => {
              const camp = camps.find(c => c.id === selectedCampId);
              if (!camp) return (
                <div className="bt-panel" style={{ textAlign: 'center', color: '#b7a578', padding: '28px 16px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>☝️</div>
                  <div style={{ fontSize: '.88rem' }}>เลือกค่ายเกมด้านบนเพื่อแก้ไข</div>
                </div>
              );
              return (
                <div className="bt-camp" style={{ opacity: camp.isActive ? 1 : 0.55 }}>
                  {/* camp header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
                    <div className="bt-thumb" style={{ width: 48, height: 48 }} onClick={() => pickImage(url => updateCamp(camp.id, { logo: url }))} title="อัปโหลดโลโก้ค่าย">
                      {camp.logo ? <img src={camp.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span>+โลโก้</span>}
                    </div>
                    <input defaultValue={camp.name} onBlur={e => e.target.value !== camp.name && updateCamp(camp.id, { name: e.target.value })}
                      className="bt-in" style={{ width: 190, fontWeight: 800, color: '#ffe9a8' }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.78rem', color: '#b7a578' }}>
                      <input type="checkbox" checked={camp.isActive} onChange={e => updateCamp(camp.id, { isActive: e.target.checked })} /> แสดง
                    </label>
                    <span style={{ fontSize: '.75rem', color: '#8a7a4e', marginLeft: 'auto' }}>{camp.games.length} เกม</span>
                    <button className="bt-btn" onClick={() => addGame(camp)} style={{ padding: '5px 12px' }}>+ เกม</button>
                    <button className="bt-btn-danger" onClick={() => { delCamp(camp); setSelectedCampId(null); }}>🗑</button>
                  </div>

                  {/* games */}
                  {camp.games.map(g => {
                    let langs: string[] = []; try { langs = JSON.parse(g.languages || '[]'); } catch { langs = []; }
                    return (
                      <div className="bt-game" key={g.id} style={{ opacity: g.isActive ? 1 : 0.5 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div className="bt-thumb" onClick={() => pickImage(url => updateGame(g.id, { image: url }))} title="ไอคอนเกม (แสดงข้างชื่อ)">
                            {g.image ? <img src={g.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>+ไอคอน</span>}
                          </div>
                          <div className="bt-thumb" style={{ width: 78, height: 42 }} onClick={() => pickImage(url => updateGame(g.id, { banner: url }))} title="แบนเนอร์ (รูปกราฟิกใหญ่ด้านบน)">
                            {g.banner ? <img src={g.banner} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>+แบนเนอร์</span>}
                          </div>
                        </div>

                        <div style={{ flex: 1, minWidth: 170 }}>
                          <input defaultValue={g.name} onBlur={e => e.target.value !== g.name && updateGame(g.id, { name: e.target.value })} className="bt-in" style={{ fontWeight: 700 }} />
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                            {LANG_OPTS.map(l => (
                              <button key={l} className={`bt-pill ${langs.includes(l) ? 'on' : ''}`} onClick={() => {
                                const next = langs.includes(l) ? langs.filter(x => x !== l) : [...langs, l];
                                updateGame(g.id, { languages: JSON.stringify(next) });
                              }}>{l}</button>
                            ))}
                          </div>
                        </div>

                        {/* animated gold % bars */}
                        {(['winRate', 'freeSpinRate', 'wildRate'] as const).map(f => {
                          const m = STAT_META[f];
                          return (
                            <div className="bt-stat" key={f}>
                              <div className="bt-stat-top">
                                <span className="bt-stat-lbl">{m.label}</span>
                                <span className="bt-stat-val" style={{ color: m.val }}>{g[f]}%</span>
                              </div>
                              <GoldBar percent={g[f]} from={m.from} to={m.to} />
                              <input type="number" min={0} max={100} defaultValue={g[f]} className="bt-num"
                                onBlur={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v !== g[f]) updateGame(g.id, { [f]: v } as any); }} />
                            </div>
                          );
                        })}

                        <div style={{ minWidth: 150, flex: 1 }}>
                          <div className="bt-lbl">ลิงก์เข้าเล่น</div>
                          <input defaultValue={g.link || ''} placeholder="(ไม่บังคับ)" className="bt-in" onBlur={e => e.target.value !== (g.link || '') && updateGame(g.id, { link: e.target.value })} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <label title="แสดง/ซ่อน"><input type="checkbox" checked={g.isActive} onChange={e => updateGame(g.id, { isActive: e.target.checked })} /></label>
                          <button className="bt-btn-danger" onClick={() => delGame(g)}>🗑</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        )}

        {/* Test send */}
        <div className="bt-panel">
          <div className="bt-panel-h">🧪 ทดสอบส่งเข้า LINE</div>
          <div style={{ fontSize: '.78rem', color: '#b7a578', marginBottom: 8 }}>ใส่ LINE User ID (Uxxxx…) เพื่อส่งเมนู BONUS TIME ไปทดสอบ</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="bt-in" style={{ flex: 1 }} value={testId} onChange={e => setTestId(e.target.value)} placeholder="U1234567890abcdef..." />
            <button className="bt-btn" onClick={testSend}>ส่งทดสอบ</button>
          </div>
        </div>
      </div>
    </div>
  );
}

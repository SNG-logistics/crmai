'use client';
import { useEffect, useRef, useState } from 'react';
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

// ─── Luxury theme CSS (animated bg, shimmer text, gold bars) ───────────────────
const LUX_CSS = `
.bt-lux{position:relative;overflow:hidden;min-height:calc(100vh - 40px);padding:26px 30px;
  background:radial-gradient(1200px 600px at 15% -10%,rgba(197,138,32,.18),transparent 60%),
             radial-gradient(1000px 700px at 110% 10%,rgba(255,196,66,.12),transparent 55%),
             linear-gradient(160deg,#0b0a10 0%,#12101b 45%,#0c0b12 100%);}
.bt-bg{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.bt-bg:before{content:"";position:absolute;inset:-40%;
  background:conic-gradient(from 0deg,transparent 0deg,rgba(255,205,80,.06) 60deg,transparent 120deg,rgba(255,180,40,.05) 200deg,transparent 300deg);
  animation:bt-spin 26s linear infinite}
.bt-orb{position:absolute;border-radius:50%;filter:blur(70px);opacity:.5;mix-blend-mode:screen}
.bt-o1{width:340px;height:340px;left:-60px;top:-40px;background:radial-gradient(circle,#e8b923,transparent 68%);animation:bt-float 15s ease-in-out infinite}
.bt-o2{width:300px;height:300px;right:-40px;top:120px;background:radial-gradient(circle,#ffcf5c,transparent 70%);animation:bt-float 19s ease-in-out infinite reverse}
.bt-o3{width:260px;height:260px;left:40%;bottom:-80px;background:radial-gradient(circle,#b8860b,transparent 72%);animation:bt-float2 22s ease-in-out infinite}
.bt-inner{position:relative;z-index:1;max-width:1060px;margin:0 auto}
@keyframes bt-spin{to{transform:rotate(360deg)}}
@keyframes bt-float{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,30px) scale(1.12)}}
@keyframes bt-float2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-50px,-24px) scale(1.15)}}
@keyframes bt-shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes bt-glow{0%,100%{box-shadow:0 0 0 1px rgba(255,215,0,.30),0 8px 26px rgba(0,0,0,.5),0 0 22px rgba(255,196,66,.10)}50%{box-shadow:0 0 0 1px rgba(255,215,0,.55),0 8px 26px rgba(0,0,0,.5),0 0 34px rgba(255,196,66,.28)}}
@keyframes bt-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes bt-shine{0%{left:-45%}100%{left:130%}}
.bt-title{margin:0;font-weight:900;letter-spacing:.5px;font-size:2rem;line-height:1.1;
  background:linear-gradient(90deg,#9c6b12,#ffe9a8,#ffd700,#fff7db,#ffd700,#e8b923,#9c6b12);
  background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
  animation:bt-shimmer 5s linear infinite;filter:drop-shadow(0 2px 10px rgba(255,196,66,.25))}
.bt-sub{color:#c9b98e;font-size:.82rem;margin-top:6px;max-width:640px}
.bt-panel{position:relative;background:linear-gradient(180deg,rgba(30,26,44,.72),rgba(18,16,26,.72));
  backdrop-filter:blur(8px);border:1px solid rgba(255,215,0,.16);border-radius:16px;padding:18px;margin-bottom:18px}
.bt-panel-h{font-weight:800;margin-bottom:12px;color:#f6e7bd;letter-spacing:.3px}
.bt-gold{color:#ffd700}
.bt-camp{position:relative;border:1px solid rgba(255,215,0,.45);border-radius:16px;padding:16px;margin-bottom:16px;
  background:linear-gradient(180deg,rgba(38,31,17,.55),rgba(18,16,26,.72));animation:bt-glow 3.4s ease-in-out infinite}
.bt-camp:before{content:"";position:absolute;inset:0;border-radius:16px;padding:1px;
  background:linear-gradient(135deg,rgba(255,231,168,.9),rgba(184,134,11,.2),rgba(255,215,0,.7));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;opacity:.7}
.bt-in{width:100%;background:rgba(10,9,14,.75);border:1px solid rgba(255,215,0,.18);border-radius:9px;
  padding:8px 10px;font-size:.85rem;color:#f4ecd6;outline:none;transition:border-color .2s,box-shadow .2s}
.bt-in:focus{border-color:rgba(255,215,0,.6);box-shadow:0 0 0 3px rgba(255,196,66,.12)}
.bt-lbl{font-size:.72rem;font-weight:700;color:#b7a578;margin-bottom:4px;letter-spacing:.3px}
.bt-game{display:flex;gap:14px;flex-wrap:wrap;align-items:center;padding:12px;border-radius:12px;margin-top:10px;
  background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01));border:1px solid rgba(255,215,0,.10)}
.bt-thumb{width:52px;height:40px;border-radius:8px;overflow:hidden;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;
  background:rgba(10,9,14,.8);border:1px solid rgba(255,215,0,.25);color:#8a7a4e;font-size:.6rem}
.bt-stat{min-width:120px;flex:1}
.bt-stat-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
.bt-stat-lbl{font-size:.66rem;color:#b7a578;font-weight:700;letter-spacing:.4px}
.bt-stat-val{font-size:.9rem;font-weight:900}
.bt-bar{position:relative;height:9px;border-radius:6px;background:rgba(255,255,255,.06);
  border:1px solid rgba(255,215,0,.14);overflow:hidden}
.bt-bar-fill{position:absolute;left:0;top:0;bottom:0;border-radius:6px;transform-origin:left;
  animation:bt-fill 1.15s cubic-bezier(.2,.9,.2,1) both;box-shadow:0 0 12px rgba(255,196,66,.45)}
.bt-bar-shine{position:absolute;top:0;bottom:0;width:38%;left:-45%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);animation:bt-shine 2.4s linear infinite}
.bt-num{width:52px;text-align:center;margin-top:5px;background:rgba(10,9,14,.75);border:1px solid rgba(255,215,0,.18);
  border-radius:7px;padding:3px 4px;font-size:.78rem;color:#f4ecd6;outline:none}
.bt-pill{font-size:.62rem;padding:2px 6px;border-radius:5px;cursor:pointer;border:1px solid rgba(255,215,0,.25);background:transparent;color:#b7a578;transition:.15s}
.bt-pill.on{background:linear-gradient(135deg,#ffe9a8,#e8b923);color:#231a06;border-color:transparent;font-weight:800}
.bt-btn{border:1px solid rgba(255,215,0,.4);background:linear-gradient(135deg,rgba(255,215,0,.14),rgba(184,134,11,.14));
  color:#ffe9a8;border-radius:9px;padding:7px 14px;font-size:.82rem;font-weight:700;cursor:pointer;transition:.18s}
.bt-btn:hover{background:linear-gradient(135deg,#ffe9a8,#e8b923);color:#231a06;box-shadow:0 6px 18px rgba(255,196,66,.3)}
.bt-btn-solid{border:none;background:linear-gradient(135deg,#ffe9a8,#ffd700,#e8b923);color:#231a06;border-radius:10px;
  padding:9px 18px;font-weight:900;cursor:pointer;box-shadow:0 6px 18px rgba(255,196,66,.35);transition:.18s}
.bt-btn-solid:hover{filter:brightness(1.08);transform:translateY(-1px)}
.bt-btn-danger{border:1px solid rgba(239,68,68,.35);background:transparent;color:#f87171;border-radius:8px;padding:5px 9px;cursor:pointer}
.bt-toggle{display:flex;align-items:center;gap:9px;cursor:pointer;padding:9px 16px;border-radius:12px;font-weight:800;
  border:1px solid rgba(255,215,0,.3)}
`;

// ─── Animated gold % bar ───────────────────────────────────────────────────────
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
  winRate: { label: 'อัตราชนะ', from: '#8a5a0b', to: '#ffd700', val: '#ffd700' },
  freeSpinRate: { label: 'ฟรีสปิน', from: '#9c5a12', to: '#ffb347', val: '#ffc266' },
  wildRate: { label: 'WILD', from: '#8a3d2e', to: '#ff9e7a', val: '#ff9e7a' },
} as const;

export default function BonusTimePage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [defaultKeywords, setDefaultKeywords] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCfg, setSavingCfg] = useState(false);
  const [testId, setTestId] = useState('');
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

        {/* Stats + seed */}
        <div className="bt-panel" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 30 }}>
            <div><div style={{ fontSize: '1.7rem', fontWeight: 900 }} className="bt-gold">{camps.length}</div><div style={{ fontSize: '.72rem', color: '#b7a578' }}>ค่ายเกม</div></div>
            <div><div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#ffc266' }}>{totalGames}</div><div style={{ fontSize: '.72rem', color: '#b7a578' }}>เกมทั้งหมด</div></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
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
        <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 12, color: '#f6e7bd' }}>🎰 ค่ายเกม &amp; อัตราชนะ</div>
        {camps.length === 0 && (
          <div className="bt-panel" style={{ textAlign: 'center', color: '#b7a578' }}>
            ยังไม่มีค่ายเกม — กด <b className="bt-gold">✨ เพิ่มค่าย/เกมตัวอย่าง</b> เพื่อเริ่มต้น
          </div>
        )}

        {camps.map(camp => (
          <div className="bt-camp" key={camp.id} style={{ opacity: camp.isActive ? 1 : 0.5 }}>
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
              <button className="bt-btn-danger" onClick={() => delCamp(camp)}>🗑</button>
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
        ))}

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

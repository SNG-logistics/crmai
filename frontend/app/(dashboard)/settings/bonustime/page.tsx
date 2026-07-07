'use client';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Game {
  id: string; campId: string; name: string; image?: string | null;
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

// ─── small card wrapper ───────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--bg-secondary, #111827)', border: '1px solid var(--border, #1f2937)', borderRadius: 12, padding: 18, marginBottom: 18, ...style }}>
      {children}
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted, #9ca3af)', marginBottom: 4 }}>{children}</div>;
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-tertiary, #0b1220)', border: '1px solid var(--border, #1f2937)',
  borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem', color: 'var(--text-primary, #f3f4f6)',
};

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
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
      <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} /> กำลังโหลด...
    </div>
  );

  const totalGames = camps.reduce((n, c) => n + c.games.length, 0);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1040, margin: '0 auto' }}>
      <input ref={fileInput} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>⚡ BONUS TIME — AI Winrate System</h1>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
            ลูกค้าถามหา BONUSTIME ทาง LINE → บอทโชว์ตารางค่ายเกม กดเลือกแล้วเห็นอัตราชนะแต่ละเกม (อัปเดตแบบ LIVE)
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: config.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.1)', padding: '8px 14px', borderRadius: 10, border: `1px solid ${config.isActive ? 'rgba(16,185,129,0.4)' : 'var(--border)'}` }}>
          <input type="checkbox" checked={config.isActive} onChange={e => setCfg('isActive', e.target.checked)} />
          <span style={{ fontWeight: 700, color: config.isActive ? '#10b981' : 'var(--text-muted)' }}>{config.isActive ? 'เปิดใช้งาน' : 'ปิดอยู่'}</span>
        </label>
      </div>

      {/* Stats + seed */}
      <Card style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 26 }}>
          <div><div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--teal, #00d4aa)' }}>{camps.length}</div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ค่ายเกม</div></div>
          <div><div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>{totalGames}</div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>เกมทั้งหมด</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={seed}>✨ เพิ่มค่าย/เกมตัวอย่าง</button>
          <button className="btn btn-primary btn-sm" onClick={addCamp}>+ เพิ่มค่าย</button>
        </div>
      </Card>

      {/* ── Trigger settings ── */}
      <Card>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>🤖 การเรียกใช้งาน (Trigger)</div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={config.aiTrigger} onChange={e => setCfg('aiTrigger', e.target.checked)} style={{ marginTop: 3 }} />
          <span style={{ fontSize: '0.85rem' }}>ให้ AI ตัดสินใจเรียกเอง — AI จะเข้าใจเจตนาลูกค้า (เช่น "ค่ายไหนแตก", "ขอดูอัตราชนะ") แล้วโชว์ BONUS TIME ให้อัตโนมัติ</span>
        </label>
        <Label>คีย์เวิร์ดเพิ่มเติม (คั่นด้วยจุลภาค) — พิมพ์ตรงคำนี้จะเด้งทันทีไม่เปลือง token</Label>
        <input style={inputStyle} value={config.keywords} onChange={e => setCfg('keywords', e.target.value)} placeholder="bonustime, โบนัสไทม์, อัตราชนะ, ..." />
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6 }}>
          คีย์เวิร์ดที่มีอยู่แล้วในระบบ: {defaultKeywords.slice(0, 10).join(' · ')} …
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <Label>สุ่มขยับ % ให้ดู LIVE (±)</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="range" min={0} max={15} value={config.liveJitter} onChange={e => setCfg('liveJitter', parseInt(e.target.value))} />
              <span style={{ fontWeight: 700, color: '#f59e0b', minWidth: 42 }}>±{config.liveJitter}%</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>0 = ปิด (โชว์ค่าคงที่)</div>
          </div>
          <div>
            <Label>สีธีม (Accent)</Label>
            <input type="color" value={config.accent} onChange={e => setCfg('accent', e.target.value)} style={{ width: 54, height: 34, background: 'none', border: '1px solid var(--border)', borderRadius: 8 }} />
          </div>
        </div>
      </Card>

      {/* ── Message texts ── */}
      <Card>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>💬 ข้อความในการ์ด</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
          <div><Label>หัวข้อ</Label><input style={inputStyle} value={config.headerTitle} onChange={e => setCfg('headerTitle', e.target.value)} /></div>
          <div><Label>หัวข้อรอง</Label><input style={inputStyle} value={config.headerSubtitle} onChange={e => setCfg('headerSubtitle', e.target.value)} /></div>
          <div><Label>ข้อความเมนูค่าย</Label><input style={inputStyle} value={config.intro} onChange={e => setCfg('intro', e.target.value)} /></div>
          <div><Label>ข้อความหน้าเกม</Label><input style={inputStyle} value={config.gamesIntro} onChange={e => setCfg('gamesIntro', e.target.value)} /></div>
          <div style={{ gridColumn: '1 / -1' }}><Label>หมายเหตุท้ายการ์ด</Label><input style={inputStyle} value={config.footerNote} onChange={e => setCfg('footerNote', e.target.value)} /></div>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button className="btn btn-primary" onClick={saveConfig} disabled={savingCfg}>{savingCfg ? 'กำลังบันทึก...' : '💾 บันทึกการตั้งค่า'}</button>
      </div>

      {/* ── Camps & games ── */}
      <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 10 }}>🎰 ค่ายเกม & อัตราชนะ</div>
      {camps.length === 0 && (
        <Card style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          ยังไม่มีค่ายเกม — กด <b>✨ เพิ่มค่าย/เกมตัวอย่าง</b> เพื่อเริ่มต้นด้วยรายชื่อค่ายยอดนิยม
        </Card>
      )}

      {camps.map(camp => (
        <Card key={camp.id} style={{ opacity: camp.isActive ? 1 : 0.55 }}>
          {/* camp header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, cursor: 'pointer', border: '1px solid var(--border)' }}
              onClick={() => pickImage(url => updateCamp(camp.id, { logo: url }))} title="อัปโหลดโลโก้ค่าย">
              {camp.logo ? <img src={camp.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>+โลโก้</span>}
            </div>
            <input defaultValue={camp.name} onBlur={e => e.target.value !== camp.name && updateCamp(camp.id, { name: e.target.value })}
              style={{ ...inputStyle, width: 180, fontWeight: 700 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={camp.isActive} onChange={e => updateCamp(camp.id, { isActive: e.target.checked })} /> แสดง
            </label>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{camp.games.length} เกม</span>
            <button className="btn btn-secondary btn-sm" onClick={() => addGame(camp)}>+ เกม</button>
            <button className="btn btn-sm" style={{ color: '#ef4444' }} onClick={() => delCamp(camp)}>🗑</button>
          </div>

          {/* games table */}
          {camp.games.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 720 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 6px', fontWeight: 600 }}>รูป</th>
                    <th style={{ padding: '6px 6px', fontWeight: 600 }}>ชื่อเกม</th>
                    <th style={{ padding: '6px 6px', fontWeight: 600, width: 78 }}>ชนะ %</th>
                    <th style={{ padding: '6px 6px', fontWeight: 600, width: 78 }}>ฟรีสปิน %</th>
                    <th style={{ padding: '6px 6px', fontWeight: 600, width: 78 }}>WILD %</th>
                    <th style={{ padding: '6px 6px', fontWeight: 600, width: 120 }}>ภาษา</th>
                    <th style={{ padding: '6px 6px', fontWeight: 600 }}>ลิงก์เข้าเล่น</th>
                    <th style={{ padding: '6px 6px', fontWeight: 600, width: 70 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {camp.games.map(g => {
                    let langs: string[] = []; try { langs = JSON.parse(g.languages || '[]'); } catch { langs = []; }
                    return (
                      <tr key={g.id} style={{ borderTop: '1px solid var(--border)', opacity: g.isActive ? 1 : 0.5 }}>
                        <td style={{ padding: '6px 6px' }}>
                          <div style={{ width: 40, height: 30, borderRadius: 6, background: 'var(--bg-tertiary)', overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}
                            onClick={() => pickImage(url => updateGame(g.id, { image: url }))} title="อัปโหลดรูปเกม">
                            {g.image ? <img src={g.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>+รูป</span>}
                          </div>
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <input defaultValue={g.name} onBlur={e => e.target.value !== g.name && updateGame(g.id, { name: e.target.value })} style={{ ...inputStyle, minWidth: 130 }} />
                        </td>
                        {(['winRate', 'freeSpinRate', 'wildRate'] as const).map(f => (
                          <td key={f} style={{ padding: '6px 6px' }}>
                            <input type="number" min={0} max={100} defaultValue={g[f]}
                              onBlur={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v !== g[f]) updateGame(g.id, { [f]: v } as any); }}
                              style={{ ...inputStyle, width: 62, textAlign: 'center' }} />
                          </td>
                        ))}
                        <td style={{ padding: '6px 6px' }}>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {LANG_OPTS.map(l => (
                              <button key={l} onClick={() => {
                                const next = langs.includes(l) ? langs.filter(x => x !== l) : [...langs, l];
                                updateGame(g.id, { languages: JSON.stringify(next) });
                              }} style={{
                                fontSize: '0.65rem', padding: '2px 5px', borderRadius: 4, cursor: 'pointer',
                                border: '1px solid var(--border)',
                                background: langs.includes(l) ? 'var(--teal, #00d4aa)' : 'transparent',
                                color: langs.includes(l) ? '#04121a' : 'var(--text-muted)',
                              }}>{l}</button>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <input defaultValue={g.link || ''} placeholder="(ไม่บังคับ)" onBlur={e => e.target.value !== (g.link || '') && updateGame(g.id, { link: e.target.value })} style={{ ...inputStyle, minWidth: 140 }} />
                        </td>
                        <td style={{ padding: '6px 6px', whiteSpace: 'nowrap' }}>
                          <label style={{ marginRight: 6 }}><input type="checkbox" checked={g.isActive} onChange={e => updateGame(g.id, { isActive: e.target.checked })} /></label>
                          <button className="btn btn-sm" style={{ color: '#ef4444' }} onClick={() => delGame(g)}>🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}

      {/* ── Test send ── */}
      <Card>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>🧪 ทดสอบส่งเข้า LINE</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>ใส่ LINE User ID (Uxxxx…) เพื่อส่งเมนู BONUS TIME ไปทดสอบ</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...inputStyle, flex: 1 }} value={testId} onChange={e => setTestId(e.target.value)} placeholder="U1234567890abcdef..." />
          <button className="btn btn-secondary" onClick={testSend}>ส่งทดสอบ</button>
        </div>
      </Card>
    </div>
  );
}

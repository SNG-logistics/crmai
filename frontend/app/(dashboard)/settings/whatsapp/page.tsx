'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';
import { useSocket } from '../../../../lib/socket';

type WaStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';
type Tab = 'connect' | 'ai';

interface Company {
  id: string;
  name: string;
  isActive?: boolean;
  _count?: { whatsappAccounts?: number; conversations?: number; members?: number };
}

interface WaAccount {
  id: string;
  companyId: string;
  company?: { id: string; name: string };
  label: string;
  phone?: string | null;
  sessionId?: string;
  status?: WaStatus;
  isActive?: boolean;
  liveStatus?: WaStatus;
  livePhone?: string | null;
  hasQr?: boolean;
}

const MODEL_OPTIONS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini — เร็ว/ประหยัด (แนะนำ)' },
  { value: 'gpt-4o', label: 'GPT-4o — ฉลาดกว่า' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
];

const STATUS_MAP: Record<WaStatus, { color: string; label: string }> = {
  disconnected: { color: '#EF4444', label: 'ยังไม่ได้เชื่อมต่อ' },
  connecting: { color: '#F59E0B', label: 'กำลังเชื่อมต่อ...' },
  qr: { color: '#3B82F6', label: 'รอสแกน QR Code' },
  connected: { color: '#10B981', label: 'เชื่อมต่อแล้ว 🟢' },
};

function accStatus(a: WaAccount): WaStatus {
  return (a.liveStatus || a.status || 'disconnected') as WaStatus;
}

export default function WhatsAppSettingsPage() {
  const [tab, setTab] = useState<Tab>('connect');

  // ── Companies ──────────────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [companiesLoading, setCompaniesLoading] = useState(true);

  // ── WhatsApp accounts (per company) ──────────────────────────────────────────
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [accLoading, setAccLoading] = useState(false);
  const [qrMap, setQrMap] = useState<Record<string, string>>({}); // accountId -> qr dataURL
  const [qrForAccount, setQrForAccount] = useState<string | null>(null); // which account's QR panel is open
  const [busyId, setBusyId] = useState<string | null>(null); // account currently doing connect/disconnect/delete
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [countdown, setCd] = useState(0);
  const cdRef = useRef<NodeJS.Timeout | null>(null);

  // keep a ref of current account ids so socket handlers can filter without re-subscribing
  const accIdsRef = useRef<Set<string>>(new Set());

  // ── AI settings state (per company) ──────────────────────────────────────────
  const [ai, setAi] = useState({ isActive: true, model: 'gpt-4o-mini', temperature: 0.7, systemPrompt: '' });
  const [ext, setExt] = useState({ welcomeMessage: '', handoffKeywords: '' });
  const [aiLoading, setAiLoading] = useState(true);
  const [aiSaving, setAiSaving] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [testReply, setTestReply] = useState('');
  const [testing, setTesting] = useState(false);

  // ── Load companies ───────────────────────────────────────────────────────────
  const loadCompanies = useCallback(async () => {
    setCompaniesLoading(true);
    try {
      const r = await api.get('/companies');
      const list: Company[] = r.data.companies || [];
      setCompanies(list);
      setCompanyId(prev => (prev && list.some(c => c.id === prev) ? prev : (list[0]?.id || '')));
    } catch {
      setCompanies([]);
    } finally {
      setCompaniesLoading(false);
    }
  }, []);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  // ── Countdown for QR expiry ──────────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    if (cdRef.current) clearInterval(cdRef.current);
    setCd(60);
    cdRef.current = setInterval(() => {
      setCd(p => { if (p <= 1) { clearInterval(cdRef.current!); return 0; } return p - 1; });
    }, 1000);
  }, []);

  useEffect(() => () => { if (cdRef.current) clearInterval(cdRef.current); }, []);

  // ── Load accounts for selected company ───────────────────────────────────────
  const loadAccounts = useCallback(async (cid: string) => {
    if (!cid) { setAccounts([]); accIdsRef.current = new Set(); return; }
    setAccLoading(true);
    try {
      const r = await api.get('/whatsapp/accounts', { params: { companyId: cid } });
      const list: WaAccount[] = r.data.accounts || [];
      setAccounts(list);
      accIdsRef.current = new Set(list.map(a => a.id));
    } catch {
      setAccounts([]);
      accIdsRef.current = new Set();
    } finally {
      setAccLoading(false);
    }
  }, []);

  // ── Load AI config for selected company ──────────────────────────────────────
  const loadAi = useCallback(async (cid: string) => {
    if (!cid) { setAiLoading(false); return; }
    setAiLoading(true);
    try {
      const [b, e] = await Promise.all([
        api.get('/bot', { params: { companyId: cid } }),
        api.get('/bot/extended', { params: { companyId: cid } }),
      ]);
      const bot = b.data.bot;
      setAi(bot ? {
        isActive: bot.isActive ?? true,
        model: bot.model || 'gpt-4o-mini',
        temperature: typeof bot.temperature === 'number' ? bot.temperature : 0.7,
        systemPrompt: bot.systemPrompt || '',
      } : { isActive: true, model: 'gpt-4o-mini', temperature: 0.7, systemPrompt: '' });
      const ex = e.data.extended || {};
      setExt({
        welcomeMessage: ex.welcomeMessage || '',
        handoffKeywords: Array.isArray(ex.handoffKeywords) ? ex.handoffKeywords.join(', ') : (ex.handoffKeywords || ''),
      });
    } catch {
      setAi({ isActive: true, model: 'gpt-4o-mini', temperature: 0.7, systemPrompt: '' });
      setExt({ welcomeMessage: '', handoffKeywords: '' });
    } finally {
      setAiLoading(false);
    }
  }, []);

  // Reload account + AI data whenever the selected company changes.
  useEffect(() => {
    // reset transient QR state on company switch
    setQrMap({}); setQrForAccount(null);
    loadAccounts(companyId);
    loadAi(companyId);
    setTestReply(''); setTestMsg('');
  }, [companyId, loadAccounts, loadAi]);

  // ── Real-time WhatsApp events (per account) ──────────────────────────────────
  useSocket('whatsapp:qr', (d: any) => {
    if (d.companyId !== companyId && !accIdsRef.current.has(d.accountId)) return;
    setQrMap(m => ({ ...m, [d.accountId]: d.qr }));
    setQrForAccount(d.accountId);
    setAccounts(list => list.map(a => a.id === d.accountId ? { ...a, liveStatus: 'qr', hasQr: true } : a));
    startCountdown();
  });
  useSocket('whatsapp:connected', (d: any) => {
    if (d.companyId !== companyId && !accIdsRef.current.has(d.accountId)) return;
    setQrMap(m => { const n = { ...m }; delete n[d.accountId]; return n; });
    setQrForAccount(f => (f === d.accountId ? null : f));
    toast.success('✅ WhatsApp เชื่อมต่อสำเร็จ!');
    loadAccounts(companyId);
  });
  useSocket('whatsapp:disconnected', (d: any) => {
    if (d.companyId !== companyId && !accIdsRef.current.has(d.accountId)) return;
    setQrMap(m => { const n = { ...m }; delete n[d.accountId]; return n; });
    setQrForAccount(f => (f === d.accountId ? null : f));
    toast.error('⚠️ WhatsApp ตัดการเชื่อมต่อ');
    loadAccounts(companyId);
  });

  // ── Account actions ──────────────────────────────────────────────────────────
  const addAccount = async () => {
    const label = newLabel.trim();
    if (!label) { toast.error('กรุณาระบุชื่อเบอร์'); return; }
    if (!companyId) return;
    setAdding(true);
    try {
      await api.post('/whatsapp/accounts', { companyId, label });
      toast.success('✅ เพิ่มเบอร์แล้ว');
      setNewLabel(''); setShowAdd(false);
      await loadAccounts(companyId);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เพิ่มเบอร์ไม่สำเร็จ');
    } finally {
      setAdding(false);
    }
  };

  const connectAccount = async (a: WaAccount) => {
    setBusyId(a.id);
    setAccounts(list => list.map(x => x.id === a.id ? { ...x, liveStatus: 'connecting' } : x));
    setQrForAccount(a.id);
    try {
      await api.post(`/whatsapp/accounts/${a.id}/connect`);
      toast('🔄 กำลังสร้าง QR... รอสักครู่', { icon: '⏳' });
      // try to fetch an already-available QR (in case socket event was missed)
      try {
        const r = await api.get(`/whatsapp/accounts/${a.id}/qr`);
        if (r.data?.qr) {
          setQrMap(m => ({ ...m, [a.id]: r.data.qr }));
          setAccounts(list => list.map(x => x.id === a.id ? { ...x, liveStatus: 'qr', hasQr: true } : x));
          startCountdown();
        }
      } catch { /* QR will arrive via socket */ }
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เชื่อมต่อไม่ได้');
      setAccounts(list => list.map(x => x.id === a.id ? { ...x, liveStatus: 'disconnected' } : x));
    } finally {
      setBusyId(null);
    }
  };

  const disconnectAccount = async (a: WaAccount) => {
    if (!confirm(`ตัดการเชื่อมต่อ "${a.label}"?`)) return;
    setBusyId(a.id);
    try {
      await api.post(`/whatsapp/accounts/${a.id}/disconnect`);
      setQrMap(m => { const n = { ...m }; delete n[a.id]; return n; });
      setQrForAccount(f => (f === a.id ? null : f));
      toast.success('ตัดการเชื่อมต่อแล้ว');
      await loadAccounts(companyId);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setBusyId(null);
    }
  };

  const deleteAccount = async (a: WaAccount) => {
    if (!confirm(`ลบเบอร์ "${a.label}" ออกจากระบบ? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    setBusyId(a.id);
    try {
      await api.delete(`/whatsapp/accounts/${a.id}`);
      setQrMap(m => { const n = { ...m }; delete n[a.id]; return n; });
      setQrForAccount(f => (f === a.id ? null : f));
      toast.success('🗑️ ลบเบอร์แล้ว');
      await loadAccounts(companyId);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'ลบไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  const refreshQR = async (a: WaAccount) => {
    setQrMap(m => { const n = { ...m }; delete n[a.id]; return n; });
    await connectAccount(a);
  };

  // ── AI actions ───────────────────────────────────────────────────────────────
  const saveAi = async () => {
    if (!companyId) return;
    setAiSaving(true);
    try {
      await api.put('/bot', { companyId, systemPrompt: ai.systemPrompt, model: ai.model, temperature: ai.temperature, isActive: ai.isActive });
      await api.put('/bot/extended', {
        companyId,
        welcomeMessage: ext.welcomeMessage,
        handoffKeywords: ext.handoffKeywords.split(',').map(s => s.trim()).filter(Boolean),
      });
      toast.success('✅ บันทึกการตั้งค่า AI แล้ว');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setAiSaving(false);
    }
  };

  const runTest = async () => {
    if (!testMsg.trim() || !companyId) return;
    setTesting(true); setTestReply('');
    try {
      const r = await api.post('/bot/test', { companyId, message: testMsg });
      setTestReply(r.data.reply || '(ไม่มีคำตอบ)');
    } catch (e: any) {
      setTestReply('❌ ' + (e.response?.data?.message || 'เกิดข้อผิดพลาด'));
    } finally {
      setTesting(false);
    }
  };

  const selectedCompany = companies.find(c => c.id === companyId);
  const qrAccount = qrForAccount ? accounts.find(a => a.id === qrForAccount) : null;
  const activeQr = qrForAccount ? qrMap[qrForAccount] : null;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 28px', maxWidth: 980, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.8rem' }}>💚</span> WhatsApp + AI
        </h1>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
          เชื่อมต่อ WhatsApp หลายเบอร์ต่อบริษัท และตั้งค่าผู้ช่วย AI ตอบลูกค้าอัตโนมัติ
        </div>
      </div>

      {/* Companies loading */}
      {companiesLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : companies.length === 0 ? (
        // No companies → friendly message
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12, opacity: 0.4 }}>🏢</div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 6 }}>ยังไม่มีบริษัทในระบบ</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.6 }}>
            ต้องสร้างบริษัทก่อน จึงจะเพิ่มเบอร์ WhatsApp และตั้งค่า AI แยกตามบริษัทได้
          </div>
          <a href="/settings/companies" className="btn btn-primary" style={{ display: 'inline-flex', justifyContent: 'center', textDecoration: 'none' }}>
            ➕ สร้างบริษัทใหม่
          </a>
        </div>
      ) : (
        <>
          {/* Company selector */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
              <span style={{ fontSize: '1.3rem' }}>🏢</span>
              <div style={{ flex: 1 }}>
                <label className="label" style={{ marginBottom: 4 }}>บริษัท</label>
                <select className="input" value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ maxWidth: 380 }}>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c._count?.whatsappAccounts != null ? ` (${c._count.whatsappAccounts} เบอร์)` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {selectedCompany?._count && (
              <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span>💬 {selectedCompany._count.conversations ?? 0} แชท</span>
                <span>👥 {selectedCompany._count.members ?? 0} สมาชิก</span>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
            {([['connect', '🔗 การเชื่อมต่อ'], ['ai', '🤖 ตั้งค่า AI']] as [Tab, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                style={{
                  padding: '10px 18px', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 700,
                  color: tab === k ? 'var(--teal)' : 'var(--text-muted)',
                  borderBottom: tab === k ? '2px solid var(--teal)' : '2px solid transparent',
                  marginBottom: -1,
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* ── TAB: CONNECT ─────────────────────────────────────────────────── */}
          {tab === 'connect' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, alignItems: 'start' }}>
              {/* Left: accounts list */}
              <div>
                <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>📱 เบอร์ WhatsApp ของบริษัทนี้</div>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}
                      style={{ background: '#25D366', border: 'none' }}>
                      ➕ เพิ่มเบอร์
                    </button>
                  </div>

                  {/* Inline add form */}
                  {showAdd && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 10 }}>
                      <input className="input" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                        placeholder="ชื่อเบอร์ เช่น: ฝ่ายขาย, CS หลัก" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') addAccount(); }} style={{ flex: 1 }} />
                      <button className="btn btn-primary btn-sm" onClick={addAccount} disabled={adding} style={{ justifyContent: 'center', minWidth: 72 }}>
                        {adding ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'บันทึก'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(false); setNewLabel(''); }}>ยกเลิก</button>
                    </div>
                  )}

                  {accLoading ? (
                    <div style={{ textAlign: 'center', padding: 30 }}><span className="spinner" style={{ width: 28, height: 28 }} /></div>
                  ) : accounts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '2.4rem', marginBottom: 8, opacity: 0.35 }}>💚</div>
                      <div style={{ fontSize: '0.85rem' }}>ยังไม่มีเบอร์ในบริษัทนี้ — กด "➕ เพิ่มเบอร์" เพื่อเริ่มต้น</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {accounts.map(a => {
                        const s = accStatus(a);
                        const st = STATUS_MAP[s];
                        const isBusy = busyId === a.id;
                        const displayPhone = a.livePhone || a.phone;
                        return (
                          <div key={a.id} style={{
                            border: qrForAccount === a.id ? '1px solid var(--teal)' : '1px solid var(--border)',
                            borderRadius: 12, padding: '12px 14px',
                            background: qrForAccount === a.id ? 'rgba(0,212,170,0.05)' : 'var(--bg-tertiary)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{
                                width: 12, height: 12, borderRadius: '50%', background: st.color, flexShrink: 0,
                                boxShadow: s === 'connected' ? `0 0 8px ${st.color}` : 'none',
                                animation: s === 'connecting' || s === 'qr' ? 'livePulse 1.5s infinite' : 'none',
                              }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.label}</div>
                                <div style={{ fontSize: '0.75rem', color: st.color, marginTop: 1 }}>
                                  {st.label}{displayPhone ? ` · 📞 +${displayPhone}` : ''}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                              {s !== 'connected' && (
                                <button className="btn btn-secondary btn-sm" onClick={() => connectAccount(a)} disabled={isBusy}
                                  style={{ justifyContent: 'center' }}>
                                  {isBusy ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '📷'} เชื่อมต่อ / สแกน QR
                                </button>
                              )}
                              {(s === 'connected' || s === 'qr' || s === 'connecting') && (
                                <button className="btn btn-ghost btn-sm" onClick={() => disconnectAccount(a)} disabled={isBusy}>
                                  ตัดการเชื่อมต่อ
                                </button>
                              )}
                              <button className="btn btn-danger btn-sm" onClick={() => deleteAccount(a)} disabled={isBusy}
                                style={{ marginLeft: 'auto' }}>
                                🗑️ ลบ
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* How-to guide */}
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.9rem' }}>📖 วิธีเชื่อมต่อ</div>
                  {[
                    ['1', 'กด "➕ เพิ่มเบอร์" แล้วตั้งชื่อเบอร์ (เช่น ฝ่ายขาย)'],
                    ['2', 'กด "เชื่อมต่อ / สแกน QR" ที่เบอร์นั้น'],
                    ['3', 'รอ QR Code ปรากฏด้านขวา (~5 วินาที)'],
                    ['4', 'เปิด WhatsApp บนมือถือ → ⋮ → Linked Devices'],
                    ['5', 'กด "Link a Device" แล้วสแกน QR → เชื่อมต่อสำเร็จ ✅'],
                  ].map(([n, t]) => (
                    <div key={n} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#25D36620', border: '1px solid #25D36640', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#25D366', flexShrink: 0 }}>{n}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t}</div>
                    </div>
                  ))}
                  <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6, borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
                    ℹ️ ตอนนี้รองรับ <b>หลายเบอร์ต่อบริษัท</b> — แต่ละเบอร์เชื่อมต่อและตั้งค่าแยกกันได้
                  </div>
                </div>
              </div>

              {/* Right: QR panel */}
              <div>
                <div className="card" style={{ padding: 24, textAlign: 'center', minHeight: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'sticky', top: 20 }}>
                  {qrAccount && accStatus(qrAccount) === 'connected' ? (
                    <div>
                      <div style={{ fontSize: '4rem', marginBottom: 12 }}>✅</div>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#10B981' }}>เชื่อมต่อสำเร็จ!</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 8 }}>
                        {qrAccount.label}{(qrAccount.livePhone || qrAccount.phone) ? ` · 📞 +${qrAccount.livePhone || qrAccount.phone}` : ''}
                      </div>
                    </div>
                  ) : activeQr ? (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 4, color: '#3B82F6' }}>📱 สแกน QR นี้ด้วย WhatsApp</div>
                      {qrAccount && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12 }}>{qrAccount.label}</div>}
                      <div style={{ background: '#fff', borderRadius: 16, padding: 12, display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                        <img src={activeQr} alt="WhatsApp QR Code" style={{ width: 220, height: 220, display: 'block' }} />
                      </div>
                      {countdown > 0 && (
                        <div style={{ marginTop: 12, fontSize: '0.78rem', color: countdown < 20 ? '#EF4444' : 'var(--text-muted)' }}>⏱️ QR หมดอายุใน {countdown} วินาที</div>
                      )}
                      {qrAccount && (
                        <button className="btn btn-ghost btn-sm" onClick={() => refreshQR(qrAccount)} style={{ marginTop: 8, fontSize: '0.75rem' }}>🔄 สร้าง QR ใหม่</button>
                      )}
                    </div>
                  ) : qrAccount && accStatus(qrAccount) === 'connecting' ? (
                    <div>
                      <span className="spinner" style={{ width: 40, height: 40 }} />
                      <div style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.88rem' }}>กำลังสร้าง QR Code...</div>
                      {qrAccount && <div style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{qrAccount.label}</div>}
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '4rem', marginBottom: 12, opacity: 0.3 }}>💚</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>เลือกเบอร์แล้วกด "เชื่อมต่อ / สแกน QR"</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: AI ──────────────────────────────────────────────────────── */}
          {tab === 'ai' && (
            aiLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" style={{ width: 32, height: 32 }} /></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
                {/* Left: settings form */}
                <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: -4 }}>
                    ⚙️ ตั้งค่า AI สำหรับบริษัท <b style={{ color: 'var(--teal)' }}>{selectedCompany?.name}</b>
                  </div>

                  {/* Enable toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>🤖 AI ตอบอัตโนมัติ</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ให้ AI ตอบลูกค้าใน WhatsApp/LINE/Telegram อัตโนมัติ</div>
                    </div>
                    <input type="checkbox" checked={ai.isActive} onChange={e => setAi({ ...ai, isActive: e.target.checked })}
                      style={{ width: 44, height: 24, cursor: 'pointer' }} />
                  </label>

                  {/* Model */}
                  <div>
                    <label className="label">โมเดล AI</label>
                    <input list="wa-models" className="input" value={ai.model} onChange={e => setAi({ ...ai, model: e.target.value })} placeholder="gpt-4o-mini" />
                    <datalist id="wa-models">
                      {MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </datalist>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>เลือกจากรายการหรือพิมพ์ชื่อโมเดลเอง (ต้องเป็นโมเดลที่ COMETAPI รองรับ)</div>
                  </div>

                  {/* Temperature */}
                  <div>
                    <label className="label">ความสร้างสรรค์ (temperature): <b>{ai.temperature.toFixed(2)}</b></label>
                    <input type="range" min={0} max={1} step={0.05} value={ai.temperature}
                      onChange={e => setAi({ ...ai, temperature: parseFloat(e.target.value) })} style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      <span>0 = ตรงประเด็น แม่นยำ</span><span>1 = หลากหลาย สร้างสรรค์</span>
                    </div>
                  </div>

                  {/* System prompt */}
                  <div>
                    <label className="label">บุคลิก / คำสั่งระบบ (System Prompt)</label>
                    <textarea className="input" rows={6} value={ai.systemPrompt}
                      onChange={e => setAi({ ...ai, systemPrompt: e.target.value })}
                      placeholder="เช่น: คุณเป็นแอดมินของ Happy77 ตอบลูกค้าด้วยความเป็นมิตร สุภาพ ตอบสั้นกระชับ ภาษาไทย..."
                      style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
                  </div>

                  {/* Welcome message */}
                  <div>
                    <label className="label">ข้อความต้อนรับ (Welcome Message)</label>
                    <textarea className="input" rows={2} value={ext.welcomeMessage}
                      onChange={e => setExt({ ...ext, welcomeMessage: e.target.value })}
                      placeholder="สวัสดีค่ะ ยินดีให้บริการ มีอะไรให้ช่วยไหมคะ 😊" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>

                  {/* Handoff keywords */}
                  <div>
                    <label className="label">คำที่ส่งต่อให้แอดมิน (คั่นด้วย ,)</label>
                    <input className="input" value={ext.handoffKeywords}
                      onChange={e => setExt({ ...ext, handoffKeywords: e.target.value })}
                      placeholder="ขอคุยกับเจ้าหน้าที่, ติดต่อพนักงาน, ร้องเรียน" />
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>ถ้าลูกค้าพิมพ์คำเหล่านี้ ระบบจะหยุด AI แล้วส่งต่อให้แอดมิน</div>
                  </div>

                  <button className="btn btn-primary" onClick={saveAi} disabled={aiSaving} style={{ justifyContent: 'center' }}>
                    {aiSaving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '💾'} บันทึกการตั้งค่า AI
                  </button>
                </div>

                {/* Right: test box */}
                <div>
                  <div className="card" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>🧪 ทดสอบ AI</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 14 }}>พิมพ์ข้อความเหมือนลูกค้า แล้วดูว่า AI ตอบยังไง (บันทึกการตั้งค่าก่อนทดสอบ)</div>
                    <textarea className="input" rows={3} value={testMsg} onChange={e => setTestMsg(e.target.value)}
                      placeholder="เช่น: มีโปรอะไรบ้างครับ" style={{ resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }} />
                    <button className="btn btn-secondary" onClick={runTest} disabled={testing || !testMsg.trim()} style={{ width: '100%', justifyContent: 'center' }}>
                      {testing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '▶️'} ทดสอบ
                    </button>
                    {testReply && (
                      <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 10, fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>🤖 AI ตอบ:</div>
                        {testReply}
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.25)', borderRadius: 10 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      💡 การตั้งค่า AI นี้แยกตามบริษัท <b>{selectedCompany?.name}</b> — จัดการฐานความรู้ (FAQ) เพิ่มเติมได้ที่เมนู <b>🤖 AI Bot</b>
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

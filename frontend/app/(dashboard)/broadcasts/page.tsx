'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '../../../lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────────
type Broadcast = {
  id: string; name: string; channels: string[]; message: string;
  targetTags: string[]; status: string; sentAt?: string;
  sentCount: number; failedCount: number; createdAt: string; scheduledAt?: string;
};
type Template = { id: string; name: string; category: string; icon: string; message: string };

const STATUS: any = {
  draft:     { label: 'แบบร่าง',   color: 'var(--text-muted)', icon: '📝' },
  scheduled: { label: 'กำหนดเวลา', color: 'var(--warning)',    icon: '⏰' },
  sending:   { label: 'กำลังส่ง',  color: 'var(--info)',       icon: '🔄' },
  sent:      { label: 'ส่งแล้ว',   color: 'var(--success)',    icon: '✅' },
  failed:    { label: 'ล้มเหลว',   color: 'var(--danger)',     icon: '❌' },
};

const CAT_LABELS: any = { onboarding: '🚀 Onboarding', deposit: '💰 ฝากเงิน', retention: '🔙 Retention', marketing: '🎁 Marketing', vip: '👑 VIP', reward: '💸 Reward', engagement: '❤️ Engagement' };

// ─── Create/Edit Modal ─────────────────────────────────────────────────────────
function BroadcastModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: '', channels: ['line'] as string[], message: '',
    targetTags: [] as string[], targetStatus: '', targetType: 'all',
    scheduledAt: '',
  });
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(0); // 0=LINE, 1=Telegram

  useEffect(() => {
    api.get('/automation/templates').then(r => setTemplates(r.data.templates || []));
    api.get('/contacts').then(r => {/* tags from contacts */ });
    api.get('/contacts?limit=1').then(() => { /* preload */ });
  }, []);

  const useTemplate = (t: Template) => {
    setForm(f => ({ ...f, message: t.message, name: f.name || t.name }));
    setStep(2);
  };

  const send = async () => {
    if (!form.name || !form.message || form.channels.length === 0) { toast.error('กรุณากรอกข้อมูลให้ครบ'); return; }
    setSending(true);
    const tid = toast.loading(form.scheduledAt ? 'กำหนดเวลาส่ง...' : 'กำลังส่ง Broadcast...');
    try {
      await api.post('/broadcasts', {
        name: form.name, channels: form.channels, message: form.message,
        targetTags: form.targetTags, scheduledAt: form.scheduledAt || null,
      });
      toast.success(form.scheduledAt ? '⏰ กำหนดเวลาส่งแล้ว!' : '✅ ส่ง Broadcast สำเร็จ!', { id: tid });
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid }); }
    finally { setSending(false); }
  };

  const toggleChannel = (ch: string) =>
    setForm(f => ({ ...f, channels: f.channels.includes(ch) ? f.channels.filter(x => x !== ch) : [...f.channels, ch] }));

  const categorized = templates.reduce((acc: any, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t); return acc;
  }, {});

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680, width: '95vw' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">📣 สร้าง Broadcast ใหม่</div>
            {/* Step indicator */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[{ n: 1, l: 'เลือก Template' }, { n: 2, l: 'แก้ไขข้อความ' }, { n: 3, l: 'กำหนดเป้าหมาย' }].map(s => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: step >= s.n ? 'var(--teal)' : 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: step >= s.n ? '#000' : 'var(--text-muted)', transition: 'background 0.2s' }}>{s.n}</div>
                  <span style={{ fontSize: '0.72rem', color: step === s.n ? 'var(--teal)' : 'var(--text-muted)', fontWeight: step === s.n ? 600 : 400 }}>{s.l}</span>
                  {s.n < 3 && <div style={{ width: 24, height: 1, background: 'var(--border)' }} />}
                </div>
              ))}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Step 1: Templates */}
        {step === 1 && (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>เลือก template หรือสร้างเองจากศูนย์</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setStep(2)}>✏️ สร้างเอง →</button>
            </div>
            {Object.entries(categorized).map(([cat, tmps]: any) => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.05em' }}>{CAT_LABELS[cat] || cat}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {tmps.map((t: Template) => (
                    <button key={t.id} onClick={() => useTemplate(t)}
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.2s, background 0.2s' }}
                      onMouseEnter={e => { (e.currentTarget as any).style.borderColor = 'var(--teal)'; (e.currentTarget as any).style.background = 'rgba(0,212,170,0.04)'; }}
                      onMouseLeave={e => { (e.currentTarget as any).style.borderColor = 'var(--border)'; (e.currentTarget as any).style.background = 'var(--bg-tertiary)'; }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '1.2rem' }}>{t.icon}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{t.name}</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.message}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Message editor */}
        {step === 2 && (
          <div>
            <div className="form-group">
              <label className="label">ชื่อ Broadcast *</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="เช่น โปรโมชั่น 6.6 / Winback May" />
            </div>
            <div className="form-group">
              <label className="label">ช่องทาง *</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[{ k: 'line', l: '💚 LINE', c: '#00B900' }, { k: 'telegram', l: '💙 Telegram', c: '#2AABEE' }].map(({ k, l, c }) => (
                  <button key={k} onClick={() => toggleChannel(k)}
                    style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: `2px solid ${form.channels.includes(k) ? c : 'var(--border)'}`, background: form.channels.includes(k) ? c + '18' : 'transparent', color: form.channels.includes(k) ? c : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.2s' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>ข้อความ *</span>
                <span style={{ fontSize: '0.72rem', color: form.message.length > 1000 ? 'var(--danger)' : 'var(--text-muted)' }}>{form.message.length} / 1000</span>
              </label>
              <textarea className="input" rows={6} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="พิมพ์ข้อความที่ต้องการส่ง..." maxLength={1000} />
              {/* Variable hints */}
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {['{ชื่อ}', '{ยูเซอร์เนม}', '{ยอดฝาก}'].map(v => (
                  <button key={v} className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                    onClick={() => setForm(f => ({ ...f, message: f.message + v }))}>+ {v}</button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {['LINE Preview', 'Telegram Preview'].map((l, i) => (
                  <button key={i} className={`btn btn-sm ${preview === i ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPreview(i)}>{l}</button>
                ))}
              </div>
              <div style={{ background: preview === 0 ? '#A8D8A8' : '#17212B', borderRadius: 10, padding: 12, minHeight: 60 }}>
                <div style={{ background: preview === 0 ? '#fff' : '#2B5278', borderRadius: 10, padding: '8px 14px', display: 'inline-block', maxWidth: '80%', fontSize: '0.85rem', color: preview === 0 ? '#333' : '#fff', lineHeight: 1.5, wordBreak: 'break-word' }}>
                  {form.message || <span style={{ opacity: 0.4 }}>ข้อความจะแสดงที่นี่...</span>}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>← Template</button>
              <button className="btn btn-primary btn-sm" onClick={() => setStep(3)} disabled={!form.message || !form.name}>กำหนดเป้าหมาย →</button>
            </div>
          </div>
        )}

        {/* Step 3: Target + Schedule */}
        {step === 3 && (
          <div>
            <div className="form-group">
              <label className="label">กลุ่มเป้าหมาย</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { k: 'all',        l: '👥 ทุกคน',                   desc: 'ส่งหาสมาชิกทั้งหมด' },
                  { k: 'no_deposit', l: '⚠️ สมัครไม่ฝาก',             desc: 'สมาชิกที่ยังไม่ฝากครั้งแรก' },
                  { k: 'line_only',  l: '💚 มี LINE เท่านั้น',         desc: 'ส่ง LINE เฉพาะคนที่เชื่อมต่อ' },
                  { k: 'telegram',   l: '💙 มี Telegram เท่านั้น',     desc: 'ส่ง Telegram เฉพาะคน' },
                ].map(opt => (
                  <button key={opt.k} onClick={() => setForm(f => ({ ...f, targetType: opt.k }))}
                    style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${form.targetType === opt.k ? 'var(--teal)' : 'var(--border)'}`, background: form.targetType === opt.k ? 'rgba(0,212,170,0.08)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.2s' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: form.targetType === opt.k ? 'var(--teal)' : 'var(--text-primary)', marginBottom: 2 }}>{opt.l}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="label">กำหนดเวลาส่ง (ปล่อยว่าง = ส่งทันที)</label>
              <input type="datetime-local" className="input" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} />
            </div>

            {/* Estimate */}
            <div style={{ background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: 'var(--teal)' }}>📊 สรุปการส่ง</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.82rem' }}>
                <div><span style={{ color: 'var(--text-muted)' }}>ชื่อ:</span> <strong>{form.name}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>ช่องทาง:</span> <strong>{form.channels.join(', ')}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>เป้าหมาย:</span> <strong>{['all', 'no_deposit', 'line_only', 'telegram'][['all', 'no_deposit', 'line_only', 'telegram'].indexOf(form.targetType)]}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>เวลา:</span> <strong>{form.scheduledAt ? new Date(form.scheduledAt).toLocaleString('th-TH') : 'ส่งทันที'}</strong></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setStep(2)}>← แก้ข้อความ</button>
              <button className="btn btn-primary" onClick={send} disabled={sending}>
                {sending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : form.scheduledAt ? '⏰ กำหนดเวลา' : '📤 ส่งเดี๋ยวนี้'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/broadcasts').then(r => { setBroadcasts(r.data.broadcasts || []); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = broadcasts.filter(b => !filter || b.status === filter);

  const stats = broadcasts.reduce((s, b) => ({
    total: s.total + 1,
    sent: s.sent + (b.status === 'sent' ? 1 : 0),
    totalSent: s.totalSent + b.sentCount,
    scheduled: s.scheduled + (b.status === 'scheduled' ? 1 : 0),
  }), { total: 0, sent: 0, totalSent: 0, scheduled: 0 });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 4 }}>📣 Broadcast Manager</h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ส่งข้อความ LINE / Telegram หาสมาชิกแบบ Bulk</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/automation" className="btn btn-secondary btn-sm">⚡ Automation</Link>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ สร้าง Broadcast</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'ทั้งหมด',       value: stats.total,     color: 'var(--text-primary)', icon: '📣' },
          { label: 'ส่งแล้ว',       value: stats.sent,      color: 'var(--success)',       icon: '✅' },
          { label: 'กำหนดเวลา',     value: stats.scheduled, color: 'var(--warning)',       icon: '⏰' },
          { label: 'ส่งรวม (ข้อความ)', value: stats.totalSent, color: 'var(--teal)',       icon: '📨' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.label}</div>
              <div style={{ fontSize: '1.2rem' }}>{s.icon}</div>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color }}>{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[{ k: '', l: 'ทั้งหมด' }, { k: 'sent', l: '✅ ส่งแล้ว' }, { k: 'scheduled', l: '⏰ กำหนดเวลา' }, { k: 'draft', l: '📝 แบบร่าง' }, { k: 'sending', l: '🔄 กำลังส่ง' }].map(f => (
          <button key={f.k} className={`btn btn-sm ${filter === f.k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(f.k)}>{f.l}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ชื่อ Broadcast</th>
                <th>ช่องทาง</th>
                <th>สถานะ</th>
                <th>ข้อความ</th>
                <th style={{ textAlign: 'right' }}>ส่งสำเร็จ</th>
                <th style={{ textAlign: 'right' }}>ล้มเหลว</th>
                <th>วันที่ส่ง</th>
                <th>สร้างเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(3)].map((_, i) => <tr key={i}>{[...Array(8)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}</tr>)}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 50 }}>
                  ยังไม่มี Broadcast — <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(true)}>สร้างเลย</button>
                </td></tr>
              )}
              {!loading && filtered.map(b => {
                const st = STATUS[b.status] || STATUS.draft;
                const chList = Array.isArray(b.channels) ? b.channels : JSON.parse(b.channels || '[]');
                return (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}>{b.name}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {chList.map((c: string) => (
                          <span key={c} style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 12, background: c === 'line' ? '#00B90022' : '#2AABEE22', color: c === 'line' ? '#00B900' : '#2AABEE', border: `1px solid ${c === 'line' ? '#00B90044' : '#2AABEE44'}`, fontWeight: 600 }}>
                            {c === 'line' ? '💚 LINE' : '💙 Telegram'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span style={{ color: st.color, fontWeight: 600, fontSize: '0.82rem' }}>{st.icon} {st.label}</span>
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {b.message}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{b.sentCount.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{b.failedCount.toLocaleString()}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {b.sentAt ? new Date(b.sentAt).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : b.scheduledAt ? '⏰ ' + new Date(b.scheduledAt).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {new Date(b.createdAt).toLocaleDateString('th-TH')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <BroadcastModal onClose={() => setShowForm(false)} onSaved={load} />}
    </div>
  );
}

'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';
import { useAuthStore } from '../../../../store/auth';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────
type Contact = {
  id: string; displayName: string; phone?: string; username?: string;
  lineUserId?: string; telegramId?: string;
  tsStatus: string; tsAssignedToId?: string;
  affiliateCode?: string; totalDeposit: number;
  memberType: string; createdAt: string;
  callLogs: Array<{ status: string; calledAt: string; notes?: string; agent: { displayName: string } }>;
};

const TS_STATUS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:   { label: 'ยังไม่โทรหา', color: 'var(--info)',    bg: 'rgba(59,130,246,0.1)',  icon: '🔵' },
  calling:   { label: 'กำลังโทร',   color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)',  icon: '🟡' },
  answered:  { label: 'รับสาย',     color: 'var(--success)', bg: 'rgba(16,185,129,0.1)',  icon: '🟢' },
  no_answer: { label: 'ไม่รับสาย', color: 'var(--danger)',  bg: 'rgba(239,68,68,0.1)',   icon: '🔴' },
  done:      { label: 'ของแล้ว',   color: 'var(--text-muted)', bg: 'rgba(100,116,139,0.1)', icon: '⚫' },
  callback:  { label: 'นัดโทรกลับ', color: 'var(--purple)', bg: 'rgba(124,58,237,0.1)',  icon: '🟣' },
};

// ─── Call Modal ───────────────────────────────────────────────────────────────
function CallModal({ contact, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState('answered');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [deposited, setDeposited] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const tid = toast.loading('บันทึกการโทร...');
    try {
      await api.post('/telesales/call', {
        contactId: contact.id,
        status,
        duration: duration ? parseInt(duration) : null,
        notes,
        depositedAfter: deposited,
        depositAmount: deposited && depositAmount ? parseFloat(depositAmount) : null,
        scheduledAt: scheduledAt || null,
      });
      toast.success('✅ บันทึกการโทรแล้ว', { id: tid });
      onSaved();
      onClose();
    } catch (e: any) { toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid }); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">📞 บันทึกการโทร</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {contact.displayName} {contact.phone ? `· ${contact.phone}` : ''}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Status */}
        <div className="form-group">
          <label className="label">ผลการโทร *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {['answered', 'no_answer', 'busy', 'callback', 'done'].map(s => {
              const cfg = TS_STATUS[s] || { label: s, color: 'var(--text-muted)', bg: 'transparent', icon: '●' };
              return (
                <button key={s} onClick={() => setStatus(s)}
                  style={{ padding: '8px 6px', borderRadius: 8, border: `1px solid ${status === s ? cfg.color : 'var(--border)'}`, background: status === s ? cfg.bg : 'transparent', color: status === s ? cfg.color : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: status === s ? 700 : 400, textAlign: 'center' }}>
                  {cfg.icon} {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {status === 'callback' && (
          <div className="form-group">
            <label className="label">นัดโทรกลับ</label>
            <input type="datetime-local" className="input" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label className="label">ระยะเวลาโทร (วินาที)</label>
            <input type="number" className="input" value={duration} onChange={e => setDuration(e.target.value)} placeholder="120" min={0} />
          </div>
        </div>

        <div className="form-group">
          <label className="label">หมายเหตุ</label>
          <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="บันทึกผลการสนทนา..." />
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={deposited} onChange={e => setDeposited(e.target.checked)} style={{ accentColor: 'var(--teal)', width: 16, height: 16 }} />
            <span>💰 ลูกค้าฝากเงินหลังการโทร</span>
          </label>
          {deposited && (
            <div style={{ marginTop: 8 }}>
              <label className="label">ยอดฝาก (บาท)</label>
              <input type="number" className="input" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="500.00" min={0} step={0.01} />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '📞 บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── History Modal ─────────────────────────────────────────────────────────────
function HistoryModal({ contactId, contactName, onClose }: { contactId: string; contactName: string; onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/telesales/call-history/${contactId}`).then(r => { setLogs(r.data.logs || []); setLoading(false); });
  }, [contactId]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-title">📋 ประวัติการโทร — {contactName}</div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>✕</button>
        </div>
        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
          : logs.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>ยังไม่มีประวัติการโทร</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
              {logs.map((l, i) => {
                const s = TS_STATUS[l.status] || TS_STATUS.done;
                return (
                  <div key={i} style={{ background: 'var(--bg-tertiary)', border: `1px solid ${s.color}33`, borderLeft: `3px solid ${s.color}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ color: s.color, fontWeight: 600, fontSize: '0.85rem' }}>{s.icon} {s.label}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {formatDistanceToNow(new Date(l.calledAt), { locale: th, addSuffix: true })}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      👤 {l.agent?.displayName} · {l.duration ? `${l.duration} วินาที` : '—'}
                      {l.depositedAfter && l.depositAmount && <span style={{ color: 'var(--teal)', marginLeft: 8 }}>💰 ฝาก ฿{l.depositAmount.toLocaleString()}</span>}
                    </div>
                    {l.notes && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4, padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>{l.notes}</div>}
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TelesalesMembersPage() {
  const { user } = useAuthStore();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'new' | 'old'>('new');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [callModal, setCallModal] = useState<Contact | null>(null);
  const [histModal, setHistModal] = useState<Contact | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<any[]>([]);
  const [assignAgent, setAssignAgent] = useState('');
  const LIMIT = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab, page: String(page), limit: String(LIMIT), ...(statusFilter ? { status: statusFilter } : {}), ...(search ? { search } : {}) });
      const r = await api.get(`/telesales/members?${params}`);
      setContacts(r.data.contacts || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('โหลดข้อมูลไม่ได้'); }
    finally { setLoading(false); }
  }, [tab, page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/users').then(r => setAgents(r.data.users || [])); }, []);

  const bulkAssign = async () => {
    if (!assignAgent || selected.size === 0) { toast.error('กรุณาเลือกสมาชิกและ Agent'); return; }
    const tid = toast.loading('กำลังมอบหมาย...');
    try {
      await api.post('/telesales/assign', { contactIds: [...selected], agentId: assignAgent });
      toast.success(`✅ มอบหมาย ${selected.size} คน แล้ว`, { id: tid });
      setSelected(new Set()); load();
    } catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Link href="/telesales" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.85rem' }}>📞 Telesales</Link>
            <span style={{ color: 'var(--text-muted)' }}>›</span>
            <span style={{ fontSize: '0.85rem' }}>ติดตามสมาชิก</span>
          </div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700 }}>👥 ติดตามสมาชิก</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {selected.size > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--teal)', borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--teal)' }}>เลือก {selected.size} คน</span>
              <select className="input" style={{ fontSize: '0.8rem', padding: '4px 8px', width: 150 }} value={assignAgent} onChange={e => setAssignAgent(e.target.value)}>
                <option value="">— เลือก Agent —</option>
                {agents.filter(a => a.isActive).map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={bulkAssign}>✅ มอบหมาย</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>ยกเลิก</button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[{ key: 'new', label: '🆕 สมาชิกใหม่' }, { key: 'old', label: '👤 สมาชิกเก่า' }].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key as any); setPage(1); }}
            className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'} btn-sm`}>{t.label}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" placeholder="🔍 ค้นหาชื่อ/เบอร์/Username..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ maxWidth: 280 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ value: '', label: 'ทั้งหมด' }, { value: 'pending', label: '🔵 ยังไม่โทร' }, { value: 'calling', label: '🟡 กำลังโทร' }, { value: 'answered', label: '🟢 รับสาย' }, { value: 'no_answer', label: '🔴 ไม่รับ' }, { value: 'done', label: '⚫ ของแล้ว' }].map(f => (
            <button key={f.value} className={`btn ${statusFilter === f.value ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => { setStatusFilter(f.value); setPage(1); }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
        รายการสมาชิก {tab === 'new' ? 'ใหม่' : 'เก่า'} — <strong style={{ color: 'var(--teal)' }}>{total}</strong> คน
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" style={{ accentColor: 'var(--teal)' }}
                    checked={selected.size === contacts.length && contacts.length > 0}
                    onChange={e => setSelected(e.target.checked ? new Set(contacts.map(c => c.id)) : new Set())} />
                </th>
                <th>จัดการ</th>
                <th>ดำเนินการโดย</th>
                <th>วันที่สมัคร</th>
                <th>ระยะเวลาสมัคร</th>
                <th>ยูเซอร์เนม</th>
                <th>ชื่อ-นามสกุล</th>
                <th>ช่องทาง</th>
                <th>สถานะ</th>
                <th>หมายเหตุล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(5)].map((_, i) => (
                <tr key={i}>{[...Array(10)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}</tr>
              ))}
              {!loading && contacts.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 50 }}>ไม่พบสมาชิก</td></tr>
              )}
              {!loading && contacts.map(c => {
                const lastLog = c.callLogs?.[0];
                const s = TS_STATUS[c.tsStatus] || TS_STATUS.pending;
                const elapsed = formatDistanceToNow(new Date(c.createdAt), { locale: th, addSuffix: false });
                return (
                  <tr key={c.id} style={{ background: selected.has(c.id) ? 'rgba(0,212,170,0.04)' : undefined }}>
                    <td>
                      <input type="checkbox" style={{ accentColor: 'var(--teal)' }}
                        checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" title="โทรหา" style={{ fontSize: '0.8rem', padding: '4px 8px', color: 'var(--teal)', borderColor: 'rgba(0,212,170,0.3)' }}
                          onClick={() => setCallModal(c)}>
                          📞 โทรหา
                        </button>
                        <button className="btn btn-ghost btn-sm" title="ประวัติ" style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                          onClick={() => setHistModal(c)}>
                          📋
                        </button>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {lastLog?.agent?.displayName ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="avatar avatar-sm">{lastLog.agent.displayName[0]}</div>
                          <span style={{ color: 'var(--text-secondary)' }}>{lastLog.agent.displayName}</span>
                        </div>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(c.createdAt).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.78rem', color: 'var(--warning)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        ⚠️ {elapsed}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--teal)' }}>{c.username || '—'}</div>
                      {c.phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.phone}</div>}
                    </td>
                    <td style={{ fontWeight: 500, fontSize: '0.875rem' }}>{c.displayName}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {c.lineUserId && <span style={{ fontSize: '1.1rem' }} title="LINE">💚</span>}
                        {c.telegramId && <span style={{ fontSize: '1.1rem' }} title="Telegram">💙</span>}
                        {!c.lineUserId && !c.telegramId && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>}
                      </div>
                    </td>
                    <td>
                      <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}44`, borderRadius: 20, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {s.icon} {s.label}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lastLog?.notes || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← ก่อนหน้า</button>
          <div style={{ display: 'flex', gap: 4 }}>
            {[...Array(Math.min(totalPages, 7))].map((_, i) => {
              const p = i + 1;
              return <button key={p} className={`btn btn-sm ${page === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPage(p)}>{p}</button>;
            })}
          </div>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>ถัดไป →</button>
        </div>
      )}

      {/* Modals */}
      {callModal && <CallModal contact={callModal} onClose={() => setCallModal(null)} onSaved={load} />}
      {histModal && <HistoryModal contactId={histModal.id} contactName={histModal.displayName} onClose={() => setHistModal(null)} />}
    </div>
  );
}

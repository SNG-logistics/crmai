'use client';
import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../../lib/api';

// ─── Bank Logos ────────────────────────────────────────────────────────────────
const BANKS: Record<string, { name: string; color: string; icon: string }> = {
  kbank:    { name: 'ธนาคารกสิกรไทย',     color: '#00A850', icon: '🟢' },
  scb:      { name: 'ธนาคารไทยพาณิชย์',   color: '#4E2E8F', icon: '🟣' },
  bbl:      { name: 'ธนาคารกรุงเทพ',       color: '#1E3A8A', icon: '🔵' },
  ktb:      { name: 'ธนาคารกรุงไทย',       color: '#1E90FF', icon: '🔵' },
  bay:      { name: 'ธนาคารกรุงศรีฯ',      color: '#FFC107', icon: '🟡' },
  tmb:      { name: 'ธนาคารทหารไทยธนชาต',  color: '#0033A0', icon: '🔵' },
  gsb:      { name: 'ธนาคารออมสิน',         color: '#E91E63', icon: '🔴' },
  baac:     { name: 'ธนาคาร ธ.ก.ส.',       color: '#2E7D32', icon: '🟢' },
  tbank:    { name: 'ธนาคารธนชาต',         color: '#FF5722', icon: '🟠' },
  cimb:     { name: 'ธนาคาร CIMB',         color: '#D32F2F', icon: '🔴' },
  lh:       { name: 'ธนาคารแลนด์แอนด์เฮ้าส์', color: '#00838F', icon: '🔵' },
  truewallet: { name: 'TrueMoney Wallet', color: '#FF6600', icon: '🟠' },
};

const MEMBER_TYPES: Record<string, { label: string; color: string }> = {
  new:     { label: 'ใหม่',   color: '#22D3EE' },
  regular: { label: 'ปกติ',   color: '#10B981' },
  vip:     { label: 'VIP',    color: '#F59E0B' },
  churned: { label: 'หายไป',  color: '#EF4444' },
};

function parseCustom(raw: any) {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

function fmtNumber(n: number) {
  return n?.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00';
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Add Contact Modal ────────────────────────────────────────────────────────
function AddContactModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    displayName: '', phone: '', email: '', username: '',
    affiliateCode: '', memberType: 'new',
    bankCode: '', bankAccount: '',
    totalDeposit: '', totalWithdraw: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.displayName) return toast.error('กรุณาใส่ชื่อลูกค้า');
    setSaving(true);
    try {
      const customFields: any = {};
      if (form.bankCode) customFields.bankCode = form.bankCode;
      if (form.bankAccount) customFields.bankAccount = form.bankAccount;

      await api.post('/contacts', {
        displayName: form.displayName,
        phone: form.phone || undefined,
        email: form.email || undefined,
        username: form.username || undefined,
        affiliateCode: form.affiliateCode || undefined,
        memberType: form.memberType,
        totalDeposit: form.totalDeposit ? parseFloat(form.totalDeposit) : 0,
        totalWithdraw: form.totalWithdraw ? parseFloat(form.totalWithdraw) : 0,
        customFields,
        notes: form.notes || undefined,
      });
      toast.success('✅ เพิ่มลูกค้าสำเร็จ');
      setForm({ displayName: '', phone: '', email: '', username: '', affiliateCode: '', memberType: 'new', bankCode: '', bankAccount: '', totalDeposit: '', totalWithdraw: '', notes: '' });
      onSaved();
      onClose();
    } catch {
      toast.error('เพิ่มลูกค้าไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>➕ เพิ่มสมาชิกใหม่</h3>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Row 1: Name + Phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">ชื่อ-นามสกุล *</label>
              <input className="input" placeholder="ชื่อสมาชิก" value={form.displayName} onChange={e => set('displayName', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">เบอร์โทร</label>
              <input className="input" placeholder="0812345678" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
          </div>

          {/* Row 2: Username + Affiliate */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">ยูเซอร์เนม (ระบบเกม)</label>
              <input className="input" placeholder="username" value={form.username} onChange={e => set('username', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">รหัสพาร์ทเนอร์</label>
              <input className="input" placeholder="รหัสแนะนำ" value={form.affiliateCode} onChange={e => set('affiliateCode', e.target.value)} />
            </div>
          </div>

          {/* Row 3: Bank */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">🏦 ธนาคาร</label>
              <select className="input" value={form.bankCode} onChange={e => set('bankCode', e.target.value)}>
                <option value="">-- เลือกธนาคาร --</option>
                {Object.entries(BANKS).map(([code, b]) => (
                  <option key={code} value={code}>{b.icon} {b.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="label">เลขบัญชี</label>
              <input className="input" placeholder="1234567890" value={form.bankAccount} onChange={e => set('bankAccount', e.target.value)} />
            </div>
          </div>

          {/* Row 4: Deposit / Withdraw */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">💰 ยอดฝาก</label>
              <input className="input" type="number" placeholder="0.00" value={form.totalDeposit} onChange={e => set('totalDeposit', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">💸 ยอดถอน</label>
              <input className="input" type="number" placeholder="0.00" value={form.totalWithdraw} onChange={e => set('totalWithdraw', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">ระดับสมาชิก</label>
              <select className="input" value={form.memberType} onChange={e => set('memberType', e.target.value)}>
                {Object.entries(MEMBER_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 5: Email + Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="label">อีเมล</label>
              <input className="input" type="email" placeholder="email@example.com" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">📝 หมายเหตุ</label>
              <input className="input" placeholder="หมายเหตุ" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ กำลังบันทึก...' : '✅ บันทึกลูกค้า'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Contacts Page ───────────────────────────────────────────────────────
export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/contacts', { params: { search, page, limit } });
      setContacts(r.data.contacts || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('โหลดข้อมูลไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #818CF8 100%)',
        borderRadius: '16px', padding: '24px 28px', marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.5rem' }}>👥</span>
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontSize: '1.25rem', fontWeight: 700 }}>สมาชิก {total} รายการ</h2>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>ระบบจัดการข้อมูลลูกค้า</span>
          </div>
          <button onClick={load} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 32, height: 32,
            cursor: 'pointer', color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>🔄</button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input className="input" style={{ width: 250, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
            placeholder="🔍 ค้นหาชื่อ / เบอร์..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}
            style={{ background: '#fff', color: '#4F46E5', fontWeight: 600, whiteSpace: 'nowrap' }}>
            ➕ เพิ่มสมาชิก
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap" style={{ borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)' }}>
              <th style={{ width: 40, textAlign: 'center' }}>#</th>
              <th>สมาชิก</th>
              <th>ยูเซอร์ / แนะนำ</th>
              <th>🏦 ธนาคาร</th>
              <th style={{ textAlign: 'right' }}>เครดิต</th>
              <th style={{ textAlign: 'right' }}>ฝาก / ถอน / ดุล</th>
              <th>ระดับ</th>
              <th>วันที่สมัคร</th>
            </tr>
          </thead>
          <tbody>
            {loading ? [...Array(8)].map((_, i) => (
              <tr key={i}>
                <td colSpan={8}><div className="skeleton" style={{ height: 22, borderRadius: 4 }} /></td>
              </tr>
            )) : contacts.map((c, idx) => {
              const cf = parseCustom(c.customFields);
              const bank = BANKS[cf.bankCode];
              const deposit = c.totalDeposit || 0;
              const withdraw = c.totalWithdraw || 0;
              const balance = deposit - withdraw;
              const mt = MEMBER_TYPES[c.memberType] || MEMBER_TYPES.new;

              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* # */}
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{(page - 1) * limit + idx + 1}</td>
                  
                  {/* สมาชิก */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(135deg, #6366F1, #818CF8)', color: '#fff', fontWeight: 600, fontSize: '0.85rem',
                      }}>
                        {c.displayName?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '0.85rem' }}>{c.displayName}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.phone || '—'}</div>
                        {c.username && <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>ID: {c.username}</div>}
                      </div>
                    </div>
                  </td>

                  {/* ยูเซอร์ / แนะนำ */}
                  <td>
                    <div style={{ fontSize: '0.8rem' }}>
                      {c.affiliateCode ? (
                        <span style={{ background: '#FF6B3520', color: '#FF6B35', padding: '2px 8px', borderRadius: 6, fontWeight: 500, fontSize: '0.75rem' }}>
                          {c.affiliateCode}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </div>
                  </td>

                  {/* ธนาคาร */}
                  <td>
                    {bank ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: bank.color + '20', fontSize: '0.9rem',
                        }}>{bank.icon}</span>
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 500 }}>{bank.name}</div>
                          {cf.bankAccount && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{cf.bankAccount}</div>}
                        </div>
                      </div>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}
                  </td>

                  {/* เครดิต */}
                  <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>{fmtNumber(balance)}</td>

                  {/* ฝาก / ถอน / ดุล */}
                  <td style={{ textAlign: 'right', fontSize: '0.78rem' }}>
                    <div style={{ color: '#10B981' }}>ฝาก : {fmtNumber(deposit)}</div>
                    <div style={{ color: '#EF4444' }}>ถอน : {fmtNumber(withdraw)}</div>
                    <div style={{ color: '#6366F1', fontWeight: 600 }}>ดุล : {fmtNumber(balance)}</div>
                  </td>

                  {/* ระดับ */}
                  <td>
                    <span style={{
                      background: mt.color + '18', color: mt.color, padding: '3px 10px', borderRadius: 8,
                      fontSize: '0.75rem', fontWeight: 600,
                    }}>
                      {mt.label}
                    </span>
                  </td>

                  {/* วันที่สมัคร */}
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {fmtDate(c.registeredAt || c.createdAt)}
                  </td>
                </tr>
              );
            })}
            {!loading && contacts.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 50 }}>ไม่พบสมาชิก</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ fontSize: '0.8rem' }}>← ก่อนหน้า</button>
          {[...Array(Math.min(totalPages, 10))].map((_, i) => {
            const p = i + 1;
            return (
              <button key={p} className={`btn ${page === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPage(p)}
                style={{ minWidth: 34, fontSize: '0.8rem', padding: '4px 8px' }}>
                {p}
              </button>
            );
          })}
          {totalPages > 10 && <span style={{ padding: '6px', color: 'var(--text-muted)' }}>...</span>}
          <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ fontSize: '0.8rem' }}>ถัดไป →</button>
        </div>
      )}

      {/* Add Modal */}
      <AddContactModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={load} />
    </div>
  );
}

'use client';
import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../lib/api';

// ─── ฟอร์ม import สมาชิก 1 คน ────────────────────────────────────────────────
const EMPTY = {
  displayName: '', phone: '', username: '',
  bank: '', bankAccount: '',
  credit: '', balance: '',
  depositTotal: '', withdrawTotal: '',
  registeredAt: '', memberType: 'สมาชิกทั่วไป',
  affiliateCode: '', status: 'ปกติ',
};

// ─── เมนูธนาคาร ───────────────────────────────────────────────────────────────
const BANKS = [
  'ธนาคารกรุงไทย', 'ธนาคารกสิกรไทย', 'ธนาคารไทยพาณิชย์',
  'ธนาคารกรุงเทพ', 'ธนาคารกรุงศรีอยุธยา', 'ธนาคารออมสิน',
  'ธนาคารทหารไทยธนชาต', 'ธนาคารซีไอเอ็มบีไทย',
  'ทรูมันนี่วอลเล็ท', 'พร้อมเพย์',
];

export default function PKMMemberPage() {
  const [form, setForm]         = useState({ ...EMPTY });
  const [loading, setLoading]   = useState(false);
  const [lookupQ, setLookupQ]   = useState('');
  const [results, setResults]   = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [promoName, setPromoName] = useState('');
  const [promoAmt, setPromoAmt] = useState('');
  const [tab, setTab]           = useState<'import' | 'lookup'>('lookup');
  const [bulkText, setBulkText] = useState('');
  const [bulkMode, setBulkMode] = useState(false);

  // ─── Import 1 คน ────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!form.username && !form.phone)
      return toast.error('ต้องระบุ Username หรือเบอร์โทร');
    setLoading(true);
    try {
      const r = await api.post('/pkm/import-member', form);
      toast.success(`✅ ${r.data.action === 'created' ? 'เพิ่ม' : 'อัปเดต'}สมาชิกสำเร็จ: ${r.data.contact.displayName}`);
      setForm({ ...EMPTY });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally { setLoading(false); }
  };

  // ─── Lookup ──────────────────────────────────────────────────────────────────
  const handleLookup = async () => {
    if (!lookupQ.trim()) return;
    setLoading(true);
    try {
      const r = await api.get('/pkm/lookup', { params: { q: lookupQ } });
      setResults(r.data.contacts);
      if (r.data.contacts.length === 0) toast('ไม่พบสมาชิก', { icon: '🔍' });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally { setLoading(false); }
  };

  // ─── Add Promotion ───────────────────────────────────────────────────────────
  const handleAddPromo = async () => {
    if (!selected || !promoName) return;
    try {
      await api.post('/pkm/add-promotion', {
        username: selected.username, phone: selected.phone,
        promotionName: promoName, amount: promoAmt,
      });
      toast.success(`✅ เพิ่มโปรโมชั่น "${promoName}" แล้ว`);
      setPromoName(''); setPromoAmt('');
      // refresh selected
      const r = await api.get('/pkm/lookup', { params: { q: selected.username || selected.phone } });
      if (r.data.contacts[0]) setSelected(r.data.contacts[0]);
    } catch (e: any) { toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด'); }
  };

  const F = (field: keyof typeof EMPTY, label: string, type = 'text', options?: string[]) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</label>
      {options ? (
        <select value={form[field]} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
          style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'inherit' }}>
          <option value="">-- เลือก --</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={form[field]}
          onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
          style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }}
        />
      )}
    </div>
  );

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.6rem' }}>🎰</span> PKM Member Manager
          <span style={{ fontSize: '0.7rem', padding: '3px 10px', background: 'rgba(0,212,170,0.15)', color: 'var(--teal)', borderRadius: 20, fontWeight: 500 }}>
            pkm-bo.gamingcenter.club
          </span>
        </h1>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
          จัดการข้อมูลสมาชิก happy77.app — ค้นหา, เพิ่ม, บันทึกโปรโมชั่น
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'lookup', label: '🔍 ค้นหาสมาชิก' },
          { key: 'import', label: '➕ เพิ่ม/อัปเดตสมาชิก' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            style={{ padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: tab === t.key ? 700 : 400,
              background: tab === t.key ? 'var(--teal)' : 'var(--bg-tertiary)',
              color: tab === t.key ? '#000' : 'var(--text-muted)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 20 }}>
        {/* Left Panel */}
        <div>
          {/* ── LOOKUP TAB ── */}
          {tab === 'lookup' && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: '0.95rem' }}>🔍 ค้นหาสมาชิก</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  value={lookupQ} onChange={e => setLookupQ(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLookup()}
                  placeholder="Username / เบอร์โทร / ชื่อ..."
                  style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.9rem' }}
                />
                <button onClick={handleLookup} disabled={loading} className="btn btn-primary">
                  {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '🔍'} ค้นหา
                </button>
              </div>

              {results.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {results.map(c => (
                    <div key={c.id} onClick={() => setSelected(c)}
                      style={{ padding: '14px 16px', background: selected?.id === c.id ? 'rgba(0,212,170,0.1)' : 'var(--bg-tertiary)',
                        border: `1px solid ${selected?.id === c.id ? 'var(--teal)' : 'var(--border)'}`,
                        borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{c.displayName}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {c.username && <span>👤 {c.username}</span>}
                            {c.phone && <span style={{ marginLeft: 10 }}>📞 {c.phone}</span>}
                            {c.bank && <span style={{ marginLeft: 10 }}>🏦 {c.bank}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '0.78rem' }}>
                          <div style={{ color: '#10B981', fontWeight: 700 }}>฿{(c.totalDeposit || 0).toLocaleString()}</div>
                          <div style={{ color: 'var(--text-muted)' }}>ฝาก {c.depositCount || 0} ครั้ง</div>
                        </div>
                      </div>
                      {(c.totalDeposit > 0 || c.totalWithdraw > 0) && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
                          {[
                            { l: 'ฝากรวม',   v: c.totalDeposit,  color: '#10B981' },
                            { l: 'ถอนรวม',   v: c.totalWithdraw, color: '#EF4444' },
                            { l: 'กำไรสุทธิ', v: c.totalProfit,  color: (c.totalProfit||0) >= 0 ? '#10B981' : '#EF4444' },
                          ].map(s => (
                            <div key={s.l} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '6px 10px', textAlign: 'center' }}>
                              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: s.color }}>฿{(s.v || 0).toLocaleString()}</div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{s.l}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── IMPORT TAB ── */}
          {tab === 'import' && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: '0.95rem' }}>➕ เพิ่ม / อัปเดต ข้อมูลสมาชิก</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16, padding: '8px 12px', background: 'rgba(59,130,246,0.1)', borderRadius: 8 }}>
                💡 Copy ข้อมูลจากหน้า PKM แล้วกรอกที่นี่ — ระบบจะจำยูส เบอร์ ธนาคาร ยอดฝาก/ถอน ไว้ในโปรไฟล์ลูกค้า
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ข้อมูลส่วนตัว</div>
                  {F('displayName', 'ชื่อ-นามสกุล')}
                  {F('phone', 'เบอร์โทรศัพท์')}
                  {F('username', 'Username (เช่น LAG0866666666)')}
                  {F('affiliateCode', 'รหัสพาร์ทเนอร์ (ถ้ามี)')}
                  {F('registeredAt', 'วันที่สมัคร', 'datetime-local')}
                  {F('memberType', 'ประเภทสมาชิก', 'text', ['สมาชิกทั่วไป', 'VIP', 'สมาชิกใหม่', 'สมาชิกเก่า'])}
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ธนาคาร & ยอดเงิน</div>
                  {F('bank', 'ธนาคาร', 'text', BANKS)}
                  {F('bankAccount', 'เลขบัญชี')}
                  {F('credit', 'เครดิตปัจจุบัน')}
                  {F('balance', 'ดุลปัจจุบัน')}
                  {F('depositTotal', 'ยอดฝากรวม (บาท)')}
                  {F('withdrawTotal', 'ยอดถอนรวม (บาท)')}
                </div>
              </div>
              <button onClick={handleImport} disabled={loading} className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '12px' }}>
                {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '💾'} บันทึกข้อมูลสมาชิก
              </button>
            </div>
          )}
        </div>

        {/* ── Right: Member Detail Panel ── */}
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Profile */}
            <div className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>👤 โปรไฟล์สมาชิก</div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem' }}>✕</button>
              </div>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', margin: '0 auto 8px' }}>
                  {selected.displayName?.[0] || '?'}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selected.displayName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {selected.memberType && <span style={{ padding: '2px 8px', background: 'var(--teal-glow)', color: 'var(--teal)', borderRadius: 10, fontSize: '0.7rem' }}>{selected.memberType}</span>}
                </div>
              </div>

              {[
                { icon: '👤', label: 'Username',     value: selected.username },
                { icon: '📞', label: 'เบอร์โทร',    value: selected.phone },
                { icon: '🏦', label: 'ธนาคาร',      value: selected.bank },
                { icon: '💳', label: 'เลขบัญชี',   value: selected.bankAccount },
                { icon: '🪙', label: 'เครดิต',      value: selected.credit != null ? `${selected.credit}` : null },
                { icon: '💰', label: 'ดุล',          value: selected.balance != null ? `฿${selected.balance}` : null },
              ].filter(r => r.value).map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{row.icon} {row.label}</span>
                  <span style={{ fontWeight: 500 }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Financial Summary */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>💰 ยอดเงิน</div>
              {[
                { l: 'ยอดฝากรวม',   v: selected.totalDeposit,  c: '#10B981', icon: '📈' },
                { l: 'ยอดถอนรวม',   v: selected.totalWithdraw, c: '#EF4444', icon: '📉' },
                { l: 'กำไรสุทธิ',    v: selected.totalProfit,   c: (selected.totalProfit||0) >= 0 ? '#10B981' : '#EF4444', icon: '💹' },
                { l: 'จำนวนฝาก',    v: `${selected.depositCount || 0} ครั้ง`, c: 'var(--text-primary)', icon: '🔢' },
              ].map(s => (
                <div key={s.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{s.icon} {s.l}</span>
                  <span style={{ fontWeight: 700, color: s.c }}>
                    {typeof s.v === 'number' ? `฿${s.v.toLocaleString()}` : s.v}
                  </span>
                </div>
              ))}
            </div>

            {/* Promotions */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>🎁 โปรโมชั่นที่ใช้</div>
              {(selected.promotions || []).length === 0
                ? <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ยังไม่มีโปรโมชั่น</div>
                : (selected.promotions || []).map((p: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.78rem' }}>
                    <span>🎁 {p.name}</span>
                    <span style={{ color: '#F59E0B' }}>฿{p.amount}</span>
                  </div>
                ))
              }
              {/* Add promo */}
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input value={promoName} onChange={e => setPromoName(e.target.value)}
                  placeholder="ชื่อโปรโมชั่น..."
                  style={{ padding: '6px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.78rem' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={promoAmt} onChange={e => setPromoAmt(e.target.value)} placeholder="จำนวนเงิน (บาท)"
                    style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.78rem' }} />
                  <button onClick={handleAddPromo} className="btn btn-primary btn-sm">+ เพิ่ม</button>
                </div>
              </div>
            </div>

            {/* Quick copy for AI */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>🤖 ข้อมูลสำหรับ AI</div>
              <div style={{
                fontSize: '0.72rem', background: 'var(--bg-tertiary)', borderRadius: 8,
                padding: '10px 12px', lineHeight: 1.8, color: 'var(--text-secondary)',
                fontFamily: 'monospace', whiteSpace: 'pre-wrap',
              }}>
{`ชื่อ: ${selected.displayName}
ยูส: ${selected.username || '-'}
เบอร์: ${selected.phone || '-'}
ธนาคาร: ${selected.bank || '-'} ${selected.bankAccount || ''}
ยอดฝากรวม: ฿${(selected.totalDeposit||0).toLocaleString()}
ยอดถอนรวม: ฿${(selected.totalWithdraw||0).toLocaleString()}
กำไรสุทธิ: ฿${(selected.totalProfit||0).toLocaleString()}
จำนวนฝาก: ${selected.depositCount || 0} ครั้ง
ประเภท: ${selected.memberType || '-'}
โปรโมชั่น: ${(selected.promotions||[]).map((p:any)=>p.name).join(', ') || 'ยังไม่มี'}`}
              </div>
              <button
                onClick={() => {
                  const text = `ชื่อ: ${selected.displayName}\nยูส: ${selected.username||'-'}\nเบอร์: ${selected.phone||'-'}\nธนาคาร: ${selected.bank||'-'} ${selected.bankAccount||''}\nยอดฝากรวม: ฿${(selected.totalDeposit||0).toLocaleString()}\nยอดถอนรวม: ฿${(selected.totalWithdraw||0).toLocaleString()}\nกำไรสุทธิ: ฿${(selected.totalProfit||0).toLocaleString()}`;
                  navigator.clipboard.writeText(text);
                  toast.success('✅ Copy ข้อมูลแล้ว');
                }}
                className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8, fontSize: '0.78rem' }}>
                📋 Copy ข้อมูลทั้งหมด
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

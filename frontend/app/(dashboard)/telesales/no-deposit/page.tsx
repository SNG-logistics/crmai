'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';

export default function NoDepositPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [blasting, setBlasting] = useState(false);
  const LIMIT = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/telesales/no-deposit?from=${dateFrom}&to=${dateTo}&page=${page}&limit=${LIMIT}`);
      setContacts(r.data.contacts || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('โหลดข้อมูลไม่ได้'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const exportCSV = () => {
    const rows = [['วันที่สมัคร', 'ยูเซอร์เนม', 'ชื่อ-นามสกุล', 'เบอร์โทร', 'LINE', 'Telegram', 'สถานะ']];
    contacts.forEach(c => rows.push([
      new Date(c.createdAt).toLocaleDateString('th-TH'),
      c.username || '', c.displayName, c.phone || '',
      c.lineUserId ? 'มี' : '', c.telegramId ? 'มี' : '', c.tsStatus,
    ]));
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `no-deposit-${dateTo}.csv`; a.click();
    toast.success('📥 Export สำเร็จ');
  };

  const mockSendSMS = async () => {
    if (selected.size === 0) { toast.error('กรุณาเลือกสมาชิกก่อน'); return; }
    setBlasting(true);
    const tid = toast.loading(`กำลังส่ง SMS ไปยัง ${selected.size} เบอร์...`);
    await new Promise(r => setTimeout(r, 1500));
    toast.success(`✅ ส่ง SMS ${selected.size} เบอร์สำเร็จ`, { id: tid });
    setBlasting(false);
    setSelected(new Set());
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href="/telesales" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>📞 Telesales</Link>
            <span>›</span><span>สมาชิกสมัครไม่ฝาก</span>
          </div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 4 }}>💳 สมาชิกใหม่สมัครไม่ฝาก</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--danger)', fontWeight: 600 }}>{total} คน รอการติดตาม</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}>📥 Export CSV</button>
          {selected.size > 0 && (
            <button className="btn btn-primary btn-sm" onClick={mockSendSMS} disabled={blasting}>
              {blasting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : `📱 ส่ง SMS (${selected.size})`}
            </button>
          )}
        </div>
      </div>

      {/* Alert Banner */}
      <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius)', padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ fontSize: '1.5rem' }}>⚠️</div>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: 2 }}>ลูกค้าเหล่านี้ยังไม่ทำการฝากเงิน</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>ส่ง SMS, โทรติดตาม หรือมอบหมาย Agent เพื่อ Convert ให้เร็วที่สุด</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label className="label">เริ่มต้น</label>
          <input type="date" className="input" style={{ width: 150 }} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="label">สิ้นสุด</label>
          <input type="date" className="input" style={{ width: 150 }} value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
        </div>
        <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }} onClick={load}>🔍 ค้นหา</button>
        {/* Quick filters */}
        {[{ label: 'วันนี้', d: 0 }, { label: '7 วัน', d: 7 }, { label: '30 วัน', d: 30 }].map(({ label, d }) => (
          <button key={label} className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }}
            onClick={() => { setDateFrom(new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)); setDateTo(new Date().toISOString().slice(0, 10)); }}>
            {label}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'ทั้งหมด', value: total, color: 'var(--text-primary)', icon: '👥' },
          { label: 'มี LINE', value: contacts.filter(c => c.lineUserId).length, color: 'var(--line-green)', icon: '💚' },
          { label: 'มี Telegram', value: contacts.filter(c => c.telegramId).length, color: 'var(--telegram-blue)', icon: '💙' },
          { label: 'เลือกแล้ว', value: selected.size, color: 'var(--teal)', icon: '✅' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: '1.6rem' }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            แสดง {Math.min((page - 1) * LIMIT + 1, total)}–{Math.min(page * LIMIT, total)} จาก {total} รายการ
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(selected.size === contacts.length ? new Set() : new Set(contacts.map(c => c.id)))}>
            {selected.size === contacts.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" style={{ accentColor: 'var(--teal)' }} checked={selected.size === contacts.length && contacts.length > 0} onChange={e => setSelected(e.target.checked ? new Set(contacts.map(c => c.id)) : new Set())} /></th>
                <th>วันที่</th>
                <th>ยูเซอร์เนม</th>
                <th>ชื่อ-นามสกุล</th>
                <th>พาร์ทเนอร์</th>
                <th>เบอร์โทร</th>
                <th>ช่องทาง</th>
                <th>สถานะ</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(5)].map((_, i) => <tr key={i}>{[...Array(9)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}</tr>)}
              {!loading && contacts.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 50 }}>🎉 ไม่มีสมาชิกที่สมัครไม่ฝาก!</td></tr>}
              {!loading && contacts.map(c => (
                <tr key={c.id} style={{ background: selected.has(c.id) ? 'rgba(0,212,170,0.04)' : undefined }}>
                  <td><input type="checkbox" style={{ accentColor: 'var(--teal)' }} checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                  <td>
                    <div style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{new Date(c.createdAt).toLocaleDateString('th-TH')}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--warning)' }}>⚠️ {formatDistanceToNow(new Date(c.createdAt), { locale: th, addSuffix: false })}</div>
                  </td>
                  <td style={{ color: 'var(--teal)', fontWeight: 500, fontSize: '0.875rem' }}>{c.username || '—'}</td>
                  <td style={{ fontWeight: 500 }}>{c.displayName}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.affiliateCode || '—'}</td>
                  <td style={{ fontSize: '0.85rem' }}>{c.phone || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {c.lineUserId  && <span title="LINE"     style={{ fontSize: '1.2rem' }}>💚</span>}
                      {c.telegramId  && <span title="Telegram" style={{ fontSize: '1.2rem' }}>💙</span>}
                      {!c.lineUserId && !c.telegramId && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>SMS</span>}
                    </div>
                  </td>
                  <td>
                    <span style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>
                      ยังไม่ฝาก
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Link href={`/contacts/${c.id}`} className="btn btn-ghost btn-sm btn-icon" title="ดูข้อมูล">👤</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← ก่อนหน้า</button>
          <span style={{ padding: '6px 12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{page} / {totalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>ถัดไป →</button>
        </div>
      )}
    </div>
  );
}

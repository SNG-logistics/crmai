'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '../../../lib/api';

type Member = {
  id: string; displayName: string; username?: string; phone?: string;
  affiliateCode?: string; lineUserId?: string; telegramId?: string;
  totalDeposit: number; totalWithdraw: number; depositCount: number; withdrawCount: number;
  netProfit: number; createdAt: string; firstDepositAt?: string;
  gameBreakdown: { lottery: number; slot: number; casino: number; fishing: number; sport: number; other: number };
};

const GAMES = [
  { key: 'lottery', label: 'หวย',    icon: '🎱', color: '#EF4444' },
  { key: 'slot',    label: 'สล็อต',  icon: '🎰', color: '#F59E0B' },
  { key: 'casino',  label: 'คาสิโน', icon: '🃏', color: '#8B5CF6' },
  { key: 'fishing', label: 'ยิงปลา', icon: '🐠', color: '#06B6D4' },
  { key: 'sport',   label: 'กีฬา',   icon: '⚽', color: '#10B981' },
  { key: 'other',   label: 'อื่นๆ',  icon: '🎯', color: '#64748B' },
];

const fmt  = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
const fmtB = (n: number) => '฿' + n.toLocaleString('th-TH', { maximumFractionDigits: 2 });

export default function MembersNewPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [affiliateCode, setAffiliateCode] = useState('');
  const LIMIT = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ from: dateFrom, to: dateTo, page: String(page), limit: String(LIMIT), ...(affiliateCode ? { affiliateCode } : {}) });
      const r = await api.get(`/analytics/members/new?${q}`);
      setMembers(r.data.members || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('โหลดข้อมูลไม่ได้'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, page, affiliateCode]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    const headers = ['วันที่', 'ยูเซอร์เนม', 'ชื่อ-นามสกุล', 'พาร์ทเนอร์', 'ฝากรวม', 'ถอนรวม', 'จำนวนฝาก', 'จำนวนถอน', 'กำไร', 'หวย', 'สล็อต', 'คาสิโน', 'ยิงปลา', 'กีฬา', 'อื่นๆ'];
    const rows = members.map(m => [
      new Date(m.createdAt).toLocaleDateString('th-TH'), m.username || '', m.displayName, m.affiliateCode || '',
      m.totalDeposit, m.totalWithdraw, m.depositCount, m.withdrawCount, m.netProfit,
      m.gameBreakdown.lottery, m.gameBreakdown.slot, m.gameBreakdown.casino,
      m.gameBreakdown.fishing, m.gameBreakdown.sport, m.gameBreakdown.other,
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `new-members-${dateFrom}-${dateTo}.csv`; a.click();
    toast.success('📥 Export สำเร็จ');
  };

  const totalPages = Math.ceil(total / LIMIT);

  // totals row
  const totals = members.reduce((s, m) => ({
    totalDeposit: s.totalDeposit + m.totalDeposit,
    totalWithdraw: s.totalWithdraw + m.totalWithdraw,
    netProfit: s.netProfit + m.netProfit,
    depositCount: s.depositCount + m.depositCount,
    withdrawCount: s.withdrawCount + m.withdrawCount,
  }), { totalDeposit: 0, totalWithdraw: 0, netProfit: 0, depositCount: 0, withdrawCount: 0 });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href="/analytics" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>📊 Analytics</Link>
            <span>›</span><span>รายงานสมาชิกใหม่</span>
          </div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 4 }}>👥 รายงาน สมัคร-ฝากถอน-การเล่น สมาชิกใหม่</h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ประจำวันที่ {new Date(dateFrom).toLocaleDateString('th-TH')} — {new Date(dateTo).toLocaleDateString('th-TH')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/analytics/daily" className="btn btn-secondary btn-sm">📊 รายวัน</Link>
          <Link href="/analytics/partners" className="btn btn-secondary btn-sm">🤝 พาร์ทเนอร์</Link>
          <button className="btn btn-primary btn-sm" onClick={exportCSV}>📥 Export CSV</button>
        </div>
      </div>

      {/* Game type legend */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {GAMES.map(g => (
          <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 5, background: g.color + '18', border: `1px solid ${g.color}44`, borderRadius: 20, padding: '4px 12px' }}>
            <span style={{ fontSize: '1rem' }}>{g.icon}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: g.color }}>{g.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div><label className="label">เริ่มต้น</label><input type="date" className="input" style={{ width: 145 }} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} /></div>
        <div><label className="label">สิ้นสุด</label><input type="date" className="input" style={{ width: 145 }} value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} /></div>
        <div><label className="label">พาร์ทเนอร์</label>
          <input className="input" style={{ width: 180 }} value={affiliateCode} onChange={e => { setAffiliateCode(e.target.value); setPage(1); }} placeholder="ทั้งหมด" /></div>
        <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }} onClick={load}>🔍 ค้นหา</button>
        <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end' }}>
          {[{ l: 'วันนี้', d: 0 }, { l: 'เดือนนี้', d: -1 }, { l: '7 วัน', d: 7 }].map(({ l, d }) => (
            <button key={l} className="btn btn-ghost btn-sm" onClick={() => {
              const now = new Date();
              if (d === -1) { setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)); setDateTo(now.toISOString().slice(0, 10)); }
              else if (d === 0) { const s = now.toISOString().slice(0, 10); setDateFrom(s); setDateTo(s); }
              else { setDateFrom(new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)); setDateTo(now.toISOString().slice(0, 10)); }
              setPage(1);
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
        แสดง <strong style={{ color: 'var(--teal)' }}>{total}</strong> รายการ
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>ยูเซอร์เนม</th>
                <th>ชื่อ-นามสกุล</th>
                <th>พาร์ทเนอร์</th>
                <th>ช่องทาง</th>
                <th style={{ textAlign: 'right' }}>ฝากรวม</th>
                <th style={{ textAlign: 'right' }}>ถอนรวม</th>
                <th style={{ textAlign: 'right' }}>จำนวนฝาก</th>
                <th style={{ textAlign: 'right' }}>จำนวนถอน</th>
                <th style={{ textAlign: 'right' }}>กำไร</th>
                {GAMES.map(g => <th key={g.key} style={{ textAlign: 'right', color: g.color }}>{g.icon}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(5)].map((_, i) => (
                <tr key={i}>{[...Array(16)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}</tr>
              ))}
              {!loading && members.length === 0 && (
                <tr><td colSpan={16} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 50 }}>ไม่มีข้อมูลในช่วงวันที่เลือก</td></tr>
              )}
              {!loading && members.map(m => (
                <tr key={m.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    <div>{new Date(m.createdAt).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{new Date(m.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td>
                    <div style={{ color: 'var(--teal)', fontWeight: 500, fontSize: '0.875rem' }}>{m.username || '—'}</div>
                    {m.phone && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.phone}</div>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="avatar avatar-sm">{m.displayName[0]}</div>
                      <Link href={`/contacts/${m.id}`} style={{ fontWeight: 500, fontSize: '0.875rem', color: 'inherit', textDecoration: 'none' }}
                        className="hover-teal">{m.displayName}</Link>
                    </div>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.affiliateCode || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {m.lineUserId  && <span title="LINE"     style={{ fontSize: '1.1rem' }}>💚</span>}
                      {m.telegramId  && <span title="Telegram" style={{ fontSize: '1.1rem' }}>💙</span>}
                      {!m.lineUserId && !m.telegramId && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>—</span>}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: m.totalDeposit > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{fmtB(m.totalDeposit)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{fmtB(m.totalWithdraw)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{m.depositCount}</td>
                  <td style={{ textAlign: 'right' }}>{m.withdrawCount}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: m.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtB(m.netProfit)}</td>
                  {GAMES.map(g => (
                    <td key={g.key} style={{ textAlign: 'right', fontSize: '0.8rem', color: (m.gameBreakdown as any)[g.key] > 0 ? g.color : 'var(--text-muted)' }}>
                      {(m.gameBreakdown as any)[g.key] > 0 ? fmtB((m.gameBreakdown as any)[g.key]) : <span style={{ opacity: 0.4 }}>0.00</span>}
                    </td>
                  ))}
                </tr>
              ))}

              {/* Totals row */}
              {!loading && members.length > 0 && (
                <tr style={{ background: 'rgba(0,212,170,0.05)', fontWeight: 700, borderTop: '2px solid var(--teal)' }}>
                  <td colSpan={5} style={{ color: 'var(--teal)' }}>รวมหน้านี้ ({members.length} รายการ)</td>
                  <td style={{ textAlign: 'right', color: 'var(--success)' }}>{fmtB(totals.totalDeposit)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{fmtB(totals.totalWithdraw)}</td>
                  <td style={{ textAlign: 'right' }}>{totals.depositCount}</td>
                  <td style={{ textAlign: 'right' }}>{totals.withdrawCount}</td>
                  <td style={{ textAlign: 'right', color: totals.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtB(totals.netProfit)}</td>
                  {GAMES.map(g => <td key={g.key} />)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← ก่อนหน้า</button>
          <span style={{ padding: '6px 12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{page} / {totalPages} ({total} รายการ)</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>ถัดไป →</button>
        </div>
      )}
    </div>
  );
}

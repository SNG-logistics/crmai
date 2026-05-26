'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '../../../lib/api';

type Partner = { code: string; members: number; withDeposit: number; totalDeposit: number; totalWithdraw: number; netProfit: number; conversionRate: number };

const fmtB = (n: number) => '฿' + n.toLocaleString('th-TH', { maximumFractionDigits: 2 });

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 7, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color, minWidth: 40 }}>{pct}%</span>
    </div>
  );
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/analytics/partners?from=${dateFrom}&to=${dateTo}`);
      setPartners(r.data.partners || []);
    } catch { toast.error('โหลดข้อมูลไม่ได้'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const totals = partners.reduce((s, p) => ({
    members: s.members + p.members, withDeposit: s.withDeposit + p.withDeposit,
    totalDeposit: s.totalDeposit + p.totalDeposit, totalWithdraw: s.totalWithdraw + p.totalWithdraw,
    netProfit: s.netProfit + p.netProfit,
  }), { members: 0, withDeposit: 0, totalDeposit: 0, totalWithdraw: 0, netProfit: 0 });

  const maxDeposit = partners[0]?.totalDeposit || 1;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href="/analytics" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>📊 Analytics</Link>
            <span>›</span><span>รายงานพาร์ทเนอร์</span>
          </div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700 }}>🤝 รายงานพาร์ทเนอร์ / Affiliate</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/analytics/daily"   className="btn btn-secondary btn-sm">📊 รายวัน</Link>
          <Link href="/analytics/members" className="btn btn-secondary btn-sm">👥 สมาชิก</Link>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div><label className="label">เริ่มต้น</label><input type="date" className="input" style={{ width: 150 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><label className="label">สิ้นสุด</label><input type="date" className="input" style={{ width: 150 }} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }} onClick={load}>🔍 ค้นหา</button>
        <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end' }}>
          {[{ l: 'วันนี้', d: 0 }, { l: 'เดือนนี้', d: -1 }, { l: '30 วัน', d: 30 }].map(({ l, d }) => (
            <button key={l} className="btn btn-ghost btn-sm" onClick={() => {
              const now = new Date();
              if (d === -1) { setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)); setDateTo(now.toISOString().slice(0, 10)); }
              else if (d === 0) { const s = now.toISOString().slice(0, 10); setDateFrom(s); setDateTo(s); }
              else { setDateFrom(new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)); setDateTo(now.toISOString().slice(0, 10)); }
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Summary KPI */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'พาร์ทเนอร์ทั้งหมด',   value: partners.length, unit: 'ราย',   color: 'var(--text-primary)', icon: '🤝' },
            { label: 'สมาชิกทั้งหมด',       value: totals.members, unit: 'คน',    color: 'var(--teal)',         icon: '👥' },
            { label: 'สมาชิกที่ฝาก',        value: totals.withDeposit, unit: 'คน', color: 'var(--success)',      icon: '✅' },
            { label: 'ยอดฝากรวม',           value: fmtB(totals.totalDeposit), unit: '', color: 'var(--success)', icon: '💰' },
            { label: 'ยอดถอนรวม',           value: fmtB(totals.totalWithdraw), unit: '', color: 'var(--danger)', icon: '📤' },
            { label: 'กำไรสุทธิ',            value: fmtB(totals.netProfit), unit: '', color: totals.netProfit >= 0 ? 'var(--success)' : 'var(--danger)', icon: '📈' },
          ].map((c, i) => (
            <div key={i} className="stat-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.label}</div>
                <span style={{ fontSize: '1.2rem' }}>{c.icon}</span>
              </div>
              <div style={{ fontSize: c.unit ? '1.5rem' : '1.1rem', fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
              {c.unit && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{c.unit}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Top Partners (visual bars) */}
      {!loading && partners.length > 0 && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>🏆 Top พาร์ทเนอร์ตามยอดฝาก</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {partners.slice(0, 10).map((p, i) => (
              <div key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: i < 3 ? ['var(--warning)', 'var(--text-muted)', '#CD7F32'][i] : 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, color: i < 3 ? '#000' : 'var(--text-muted)', flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ minWidth: 120, fontSize: '0.85rem', fontWeight: 500 }}>{p.code}</div>
                <div style={{ flex: 1, height: 18, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ height: '100%', width: `${(p.totalDeposit / maxDeposit) * 100}%`, background: `linear-gradient(90deg, var(--teal), var(--purple))`, borderRadius: 4, transition: 'width 0.8s ease' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: '0.72rem', fontWeight: 600 }}>
                    {fmtB(p.totalDeposit)}
                  </div>
                </div>
                <div style={{ minWidth: 60, textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.members} คน</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Table */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
          ตาราง — ผลงานพาร์ทเนอร์ทั้งหมด ({partners.length} ราย)
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>รหัสพาร์ทเนอร์</th>
                <th style={{ textAlign: 'right' }}>สมาชิก (คน)</th>
                <th style={{ textAlign: 'right' }}>สมาชิกที่ฝาก (คน)</th>
                <th>Conversion Rate</th>
                <th style={{ textAlign: 'right' }}>ยอดฝากรวม</th>
                <th style={{ textAlign: 'right' }}>ยอดถอนรวม</th>
                <th style={{ textAlign: 'right' }}>กำไรสุทธิ</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(5)].map((_, i) => <tr key={i}>{[...Array(9)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}</tr>)}
              {!loading && partners.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 50 }}>ยังไม่มีข้อมูลพาร์ทเนอร์</td></tr>}
              {!loading && partners.map((p, i) => (
                <tr key={p.code}>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>#{i + 1}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {i < 3 && <span style={{ fontSize: '1rem' }}>{['🥇', '🥈', '🥉'][i]}</span>}
                      <span style={{ fontWeight: 600, color: 'var(--teal)' }}>{p.code}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.members.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{p.withDeposit.toLocaleString()}</td>
                  <td style={{ minWidth: 160 }}>
                    <MiniBar pct={p.conversionRate} color={p.conversionRate >= 50 ? 'var(--success)' : p.conversionRate >= 30 ? 'var(--warning)' : 'var(--danger)'} />
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{fmtB(p.totalDeposit)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{fmtB(p.totalWithdraw)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: p.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtB(p.netProfit)}</td>
                  <td>
                    <Link href={`/analytics/members?affiliateCode=${encodeURIComponent(p.code)}&from=${dateFrom}&to=${dateTo}`}
                      className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }}>ดูสมาชิก →</Link>
                  </td>
                </tr>
              ))}
              {/* Total row */}
              {!loading && partners.length > 0 && (
                <tr style={{ background: 'rgba(0,212,170,0.05)', fontWeight: 700, borderTop: '2px solid var(--teal)' }}>
                  <td colSpan={2} style={{ color: 'var(--teal)' }}>รวมทั้งหมด</td>
                  <td style={{ textAlign: 'right', color: 'var(--teal)' }}>{totals.members.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: 'var(--success)' }}>{totals.withDeposit.toLocaleString()}</td>
                  <td>
                    <MiniBar pct={totals.members > 0 ? +(totals.withDeposit / totals.members * 100).toFixed(1) : 0} color="var(--teal)" />
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--success)' }}>{fmtB(totals.totalDeposit)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{fmtB(totals.totalWithdraw)}</td>
                  <td style={{ textAlign: 'right', color: totals.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtB(totals.netProfit)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

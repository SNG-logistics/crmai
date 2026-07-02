'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '@/lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────────
type DailyRow = {
  date: string; registered: number; withDeposit: number; withDepositPct: number;
  noDeposit: number; noDepositPct: number; totalDeposit: number;
  avgDepositPerPerson: number; totalWithdraw: number; netProfit: number;
  depositTransactions: number; withdrawTransactions: number;
};
type Summary = { registered: number; withDeposit: number; noDeposit: number; totalDeposit: number; totalWithdraw: number; netProfit: number };
type Funnel  = { stage: string; count: number; pct: number };
type Cohort  = { date: string; total: number; depositCohort: { round: number; count: number; pct: number }[] };

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 });
const fmtB = (n: number) => '฿' + fmt(n);

// ─── Funnel Bar ─────────────────────────────────────────────────────────────────
function FunnelBar({ stages }: { stages: Funnel[] }) {
  const COLORS = ['var(--teal)', 'var(--purple)', 'var(--warning)', 'var(--info)'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {stages.map((s, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{s.stage}</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: COLORS[i] }}>{s.count.toLocaleString()} คน</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', minWidth: 50, textAlign: 'right' }}>{s.pct}%</span>
            </div>
          </div>
          <div style={{ height: 10, background: 'var(--bg-tertiary)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${s.pct}%`, background: COLORS[i], borderRadius: 5, transition: 'width 0.8s ease' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Cohort Table ───────────────────────────────────────────────────────────────
function CohortTable({ rows, type }: { rows: Cohort[]; type: 'deposit' | 'withdraw' }) {
  const [activeRound, setActiveRound] = useState(0); // 0 = ครั้งที่ 1
  const key = type === 'deposit' ? 'depositCohort' : 'withdrawCohort';

  const nonEmpty = rows.filter(r => (r as any).total > 0);
  if (nonEmpty.length === 0) return <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>ยังไม่มีข้อมูล</div>;

  return (
    <div>
      {/* Round selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[...Array(10)].map((_, i) => (
          <button key={i} className={`btn btn-sm ${activeRound === i ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveRound(i)}>
            {type === 'deposit' ? 'ฝาก' : 'ถอน'}ครั้งที่ {i + 1}{i === 9 ? '+' : ''}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>วันที่สมัคร</th>
              <th>สมัครทั้งหมด (คน)</th>
              <th>{type === 'deposit' ? 'ฝาก' : 'ถอน'}ครั้งที่ {activeRound + 1}{activeRound === 9 ? '+' : ''} (คน)</th>
              <th>{type === 'deposit' ? 'ฝาก' : 'ถอน'}ครั้งที่ {activeRound + 1}{activeRound === 9 ? '+' : ''} (%)</th>
              <th>แถบ</th>
            </tr>
          </thead>
          <tbody>
            {nonEmpty.map(r => {
              const cohort = (r as any)[key][activeRound];
              const color = type === 'deposit'
                ? (cohort.pct >= 50 ? 'var(--success)' : cohort.pct >= 30 ? 'var(--warning)' : 'var(--danger)')
                : (cohort.pct >= 30 ? 'var(--danger)' : cohort.pct >= 15 ? 'var(--warning)' : 'var(--success)');
              return (
                <tr key={r.date}>
                  <td style={{ fontWeight: 500 }}>{new Date(r.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                  <td style={{ fontWeight: 600 }}>{r.total.toLocaleString()}</td>
                  <td style={{ fontWeight: 600, color }}>{cohort.count.toLocaleString()}</td>
                  <td>
                    <span style={{ color, fontWeight: 700 }}>{cohort.pct}%</span>
                  </td>
                  <td>
                    <div style={{ width: 120, height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(cohort.pct, 100)}%`, background: color, borderRadius: 4 }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function DailyReportPage() {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [funnel, setFunnel] = useState<Funnel[]>([]);
  const [cohort, setCohort] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [cohortTab, setCohortTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [dateFrom, setDateFrom] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [affiliateCode, setAffiliateCode] = useState('');
  const [activeTableTab, setActiveTableTab] = useState<'date-tag' | 'normal'>('date-tag');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ from: dateFrom, to: dateTo, ...(affiliateCode ? { affiliateCode } : {}) });
      const [dr, fr, cr] = await Promise.all([
        api.get(`/analytics/daily?${q}`),
        api.get(`/analytics/funnel?${q}`),
        api.get(`/analytics/cohort?${q}`),
      ]);
      setRows(dr.data.rows || []);
      setSummary(dr.data.summary || null);
      setFunnel(fr.data.funnel || []);
      setCohort(cr.data.rows || []);
    } catch { toast.error('โหลดข้อมูลไม่ได้'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, affiliateCode]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    const headers = ['วันที่', 'สมัคร(คน)', 'สมัคร+ฝาก(คน)', 'สมัคร+ฝาก(%)', 'สมัครไม่ฝาก(คน)', 'สมัครไม่ฝาก(%)', 'ยอดฝากรวม(บาท)', 'เฉลี่ยฝาก/คน', 'ยอดถอนรวม(บาท)', 'กำไรสุทธิ(บาท)'];
    const csvRows = rows.map(r => [r.date, r.registered, r.withDeposit, r.withDepositPct, r.noDeposit, r.noDepositPct, r.totalDeposit, r.avgDepositPerPerson, r.totalWithdraw, r.netProfit].join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `daily-report-${dateFrom}-${dateTo}.csv`; a.click();
    toast.success('📥 Export สำเร็จ');
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 4 }}>📊 รายงาน สมัคร-ฝากถอน รายวัน</h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ประจำวันที่ {new Date(dateTo).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/analytics/members" className="btn btn-secondary btn-sm">👥 รายงานสมาชิก</Link>
          <Link href="/analytics/partners" className="btn btn-secondary btn-sm">🤝 พาร์ทเนอร์</Link>
          <button className="btn btn-primary btn-sm" onClick={exportCSV}>📥 Export CSV</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div><label className="label">เริ่มต้น</label><input type="date" className="input" style={{ width: 150 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><label className="label">สิ้นสุด</label><input type="date" className="input" style={{ width: 150 }} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        <div><label className="label">พาร์ทเนอร์ (Affiliate Code)</label>
          <input className="input" style={{ width: 200 }} value={affiliateCode} onChange={e => setAffiliateCode(e.target.value)} placeholder="ทั้งหมด (รวมผู้ไม่มีพาร์ทเนอร์)" /></div>
        <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }} onClick={load}>🔍 ค้นหา</button>
        <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end' }}>
          {[{ l: 'วันนี้', d: 0 }, { l: 'เดือนนี้', d: -1 }, { l: '7 วัน', d: 7 }, { l: '30 วัน', d: 30 }].map(({ l, d }) => (
            <button key={l} className="btn btn-ghost btn-sm" onClick={() => {
              const now = new Date();
              if (d === -1) { setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)); setDateTo(now.toISOString().slice(0, 10)); }
              else if (d === 0) { const s = now.toISOString().slice(0, 10); setDateFrom(s); setDateTo(s); }
              else { setDateFrom(new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)); setDateTo(now.toISOString().slice(0, 10)); }
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'สมัครรวม',           value: summary.registered.toLocaleString(),        unit: 'คน',  color: 'var(--text-primary)', icon: '👥' },
            { label: 'สมัคร+ฝาก',          value: summary.withDeposit.toLocaleString(),        unit: 'คน',  color: 'var(--teal)',          icon: '✅' },
            { label: 'สมัครไม่ฝาก',        value: summary.noDeposit.toLocaleString(),          unit: 'คน',  color: 'var(--warning)',       icon: '⚠️' },
            { label: 'ยอดฝากรวม',          value: fmtB(summary.totalDeposit),                  unit: '',    color: 'var(--success)',       icon: '💰' },
            { label: 'ยอดถอนรวม',          value: fmtB(summary.totalWithdraw),                 unit: '',    color: 'var(--danger)',        icon: '📤' },
            { label: 'กำไรสุทธิ',           value: fmtB(summary.netProfit),                    unit: '',    color: summary.netProfit >= 0 ? 'var(--success)' : 'var(--danger)', icon: '📈' },
          ].map((c, i) => (
            <div key={i} className="stat-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>{c.label}</div>
                <div style={{ fontSize: '1.2rem' }}>{c.icon}</div>
              </div>
              <div style={{ fontSize: c.unit ? '1.6rem' : '1.2rem', fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
              {c.unit && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{c.unit}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Funnel + Conversion Rate */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🔽</span> Member Funnel: สมัคร → ฝากซ้ำ
          </div>
          {loading ? <div className="skeleton" style={{ height: 160 }} /> : <FunnelBar stages={funnel} />}
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>📊 อัตราแปลง (Conversion Rate)</div>
          {loading ? <div className="skeleton" style={{ height: 160 }} /> : summary && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { label: 'สมัคร → ฝากครั้งแรก', val: summary.registered > 0 ? (summary.withDeposit / summary.registered * 100).toFixed(1) : '0', color: 'var(--teal)' },
                { label: 'สมัคร → ไม่ฝาก',      val: summary.registered > 0 ? (summary.noDeposit / summary.registered * 100).toFixed(1) : '0', color: 'var(--warning)' },
                { label: 'เฉลี่ยฝาก/คน',        val: summary.withDeposit > 0 ? fmtB(summary.totalDeposit / summary.withDeposit) : '฿0', color: 'var(--purple)', isText: true },
                { label: 'Profit Margin',          val: summary.totalDeposit > 0 ? (summary.netProfit / summary.totalDeposit * 100).toFixed(1) : '0', color: summary.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                  <span style={{ fontSize: '0.85rem' }}>{item.label}</span>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem', color: item.color }}>{item.isText ? item.val : `${item.val}%`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Table 1: รายงานสมาชิกใหม่รายวัน ─── */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600 }}>ตารางที่ 1 — รายงานข้อมูลสมาชิกใหม่</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ k: 'date-tag', l: 'รายงานฝากถอนแบบ Date Tagging' }, { k: 'normal', l: 'รายงานฝากถอนแบบปกติ' }].map(t => (
              <button key={t.k} className={`btn btn-sm ${activeTableTab === t.k ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTableTab(t.k as any)}>{t.l}</button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th style={{ textAlign: 'right' }}>สมัคร (คน)</th>
                <th style={{ textAlign: 'right' }}>สมัคร+ฝาก (คน)</th>
                <th style={{ textAlign: 'right' }}>สมัคร+ฝาก (%)</th>
                <th style={{ textAlign: 'right' }}>สมัครไม่ฝาก (คน)</th>
                <th style={{ textAlign: 'right' }}>สมัครไม่ฝาก (%)</th>
                <th style={{ textAlign: 'right' }}>ยอดฝากรวม (บาท)</th>
                <th style={{ textAlign: 'right' }}>เฉลี่ยฝาก/คน</th>
                <th style={{ textAlign: 'right' }}>ยอดถอนรวม (บาท)</th>
                <th style={{ textAlign: 'right' }}>กำไรสุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(5)].map((_, i) => <tr key={i}>{[...Array(10)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}</tr>)}
              {!loading && rows.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>ไม่มีข้อมูลในช่วงวันที่เลือก</td></tr>}
              {!loading && rows.filter(r => r.registered > 0).map(r => (
                <tr key={r.date}>
                  <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{new Date(r.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.registered}</td>
                  <td style={{ textAlign: 'right', color: 'var(--teal)', fontWeight: 600 }}>{r.withDeposit}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <div style={{ width: 40, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${r.withDepositPct}%`, background: 'var(--teal)', borderRadius: 3 }} />
                      </div>
                      <span style={{ color: 'var(--teal)', fontWeight: 600, minWidth: 45 }}>{r.withDepositPct}%</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--warning)', fontWeight: 600 }}>{r.noDeposit}</td>
                  <td style={{ textAlign: 'right', color: 'var(--warning)' }}>{r.noDepositPct}%</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{fmtB(r.totalDeposit)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmtB(r.avgDepositPerPerson)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{fmtB(r.totalWithdraw)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: r.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtB(r.netProfit)}</td>
                </tr>
              ))}
              {/* Summary row */}
              {!loading && summary && rows.some(r => r.registered > 0) && (
                <tr style={{ background: 'rgba(0,212,170,0.05)', fontWeight: 700, borderTop: '2px solid var(--teal)' }}>
                  <td style={{ color: 'var(--teal)' }}>รวม</td>
                  <td style={{ textAlign: 'right', color: 'var(--teal)' }}>{summary.registered}</td>
                  <td style={{ textAlign: 'right', color: 'var(--teal)' }}>{summary.withDeposit}</td>
                  <td style={{ textAlign: 'right', color: 'var(--teal)' }}>{summary.registered > 0 ? (summary.withDeposit / summary.registered * 100).toFixed(1) : 0}%</td>
                  <td style={{ textAlign: 'right', color: 'var(--warning)' }}>{summary.noDeposit}</td>
                  <td style={{ textAlign: 'right', color: 'var(--warning)' }}>{summary.registered > 0 ? (summary.noDeposit / summary.registered * 100).toFixed(1) : 0}%</td>
                  <td style={{ textAlign: 'right', color: 'var(--success)' }}>{fmtB(summary.totalDeposit)}</td>
                  <td style={{ textAlign: 'right' }}>{summary.withDeposit > 0 ? fmtB(summary.totalDeposit / summary.withDeposit) : '฿0'}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{fmtB(summary.totalWithdraw)}</td>
                  <td style={{ textAlign: 'right', color: summary.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtB(summary.netProfit)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Table 2: Cohort ─── */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600 }}>
            ตารางที่ {cohortTab === 'deposit' ? '2' : '3'} — จำนวนการ{cohortTab === 'deposit' ? 'ฝาก' : 'ถอน'}ของลูกค้า <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.82rem' }}>(นับตามวันที่สมัคร)</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`btn btn-sm ${cohortTab === 'deposit' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCohortTab('deposit')}>ฝากครั้งที่ 1-10+</button>
            <button className={`btn btn-sm ${cohortTab === 'withdraw' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCohortTab('withdraw')}>ถอนครั้งที่ 1-10+</button>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {loading ? <div className="skeleton" style={{ height: 200 }} /> : <CohortTable rows={cohort} type={cohortTab} />}
        </div>
      </div>
    </div>
  );
}

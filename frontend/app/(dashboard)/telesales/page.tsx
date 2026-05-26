'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '../../../lib/api';
import { useAuthStore } from '../../../store/auth';

// ─── Types ────────────────────────────────────────────────────────────────────
type KPI = { total: number; answered: number; noAnswer: number; repeated: number; deposited: number; notDeposited: number; noDepositCount: number };
type Performance = {
  agent: { id: string; displayName: string; avatar: string; role: string };
  callTotal: number; answered: number; noAnswer: number;
  depositedCount: number; depositAmount: number;
  callRate: number; depositRate: number;
  score: number; sd: number; grade: string;
  target?: any; lastCallAt?: string;
};

const GRADE_COLOR: any = { A: '#00D4AA', 'B+': '#10B981', B: '#3B82F6', 'C+': '#8B5CF6', C: '#F59E0B', D: '#F97316', F: '#EF4444' };
const STATUS_OPTS = [
  { value: '',          label: 'ทั้งหมด',       color: 'var(--text-muted)' },
  { value: 'answered',  label: 'รับสาย',         color: 'var(--success)' },
  { value: 'no_answer', label: 'ไม่รับสาย',      color: 'var(--danger)' },
  { value: 'pending',   label: 'ยังไม่โทรหา',   color: 'var(--info)' },
  { value: 'done',      label: 'ของแล้ว',        color: 'var(--text-muted)' },
  { value: 'calling',   label: 'กำลังโทร',       color: 'var(--warning)' },
];

// ─── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const pct = Math.min(score, 150) / 150;
  const r = 28; const circ = 2 * Math.PI * r;
  const color = GRADE_COLOR[grade] || '#64748B';
  return (
    <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
      <svg width={72} height={72} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color, lineHeight: 1 }}>{grade}</div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{score.toFixed(0)}</div>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ icon, label, value, color, sub }: any) {
  return (
    <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: '1.4rem' }}>{icon}</div>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color: color || 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

export default function TelesalesPage() {
  const { user } = useAuthStore();
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [perfs, setPerfs] = useState<Performance[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [agentFilter, setAgentFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo, ...(agentFilter ? { agentId: agentFilter } : {}) });
      const [kr, pr] = await Promise.all([
        api.get(`/telesales/kpi?${params}`),
        api.get(`/telesales/performance?period=${period}`),
      ]);
      setKpi(kr.data.kpi);
      setPerfs(pr.data.performances || []);
    } catch { toast.error('โหลดข้อมูลไม่ได้'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, agentFilter, period]);

  useEffect(() => { load(); }, [load]);

  const kpiCards = kpi ? [
    { icon: '📋', label: 'ติดตามสมาชิกรวม',       value: kpi.total,        color: 'var(--text-primary)' },
    { icon: '📞', label: 'สมาชิกที่โทรสาย',        value: kpi.answered,     color: 'var(--success)' },
    { icon: '📵', label: 'สมาชิกไม่รับสาย',        value: kpi.noAnswer,     color: 'var(--danger)' },
    { icon: '🔁', label: 'ติดต่อสมาชิกช้ำ',        value: kpi.repeated,     color: 'var(--warning)' },
    { icon: '💰', label: 'ฝากเงินหลังติดตาม',      value: kpi.deposited,    color: 'var(--teal)' },
    { icon: '❌', label: 'ไม่ฝากเงินหลังติดตาม',  value: kpi.notDeposited, color: 'var(--text-muted)' },
  ] : [];

  const ANSWER_RATE   = kpi && kpi.total > 0 ? ((kpi.answered / kpi.total) * 100).toFixed(1) : '0';
  const DEPOSIT_RATE  = kpi && kpi.answered > 0 ? ((kpi.deposited / kpi.answered) * 100).toFixed(1) : '0';

  return (
    <div>
      {/* ─── Header ─── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 4 }}>📞 Telesales KPI Dashboard</h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ติดตามผลงาน Telesales และ KPI แบบ Real-time</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/telesales/members" className="btn btn-secondary btn-sm">👥 ติดตามสมาชิก</Link>
          <Link href="/telesales/no-deposit" className="btn btn-secondary btn-sm">💳 สมัครไม่ฝาก</Link>
          <button className="btn btn-primary btn-sm" onClick={load}>🔄 รีเฟรช</button>
        </div>
      </div>

      {/* ─── Filters ─── */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="label">เริ่มต้น</label>
          <input type="date" className="input" style={{ width: 150 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">สิ้นสุด</label>
          <input type="date" className="input" style={{ width: 150 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div>
          <label className="label">เดือน (ผลงาน)</label>
          <input type="month" className="input" style={{ width: 150 }} value={period} onChange={e => setPeriod(e.target.value)} />
        </div>
        {/* Quick date buttons */}
        <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end' }}>
          {[
            { label: 'วันนี้',    days: 0 },
            { label: 'เดือนนี้',  days: -1 }, // special
            { label: '7 วันล่าสุด', days: 7 },
          ].map(({ label, days }) => (
            <button key={label} className="btn btn-ghost btn-sm"
              onClick={() => {
                const now = new Date();
                if (days === -1) {
                  setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
                  setDateTo(now.toISOString().slice(0, 10));
                } else if (days === 0) {
                  const d = now.toISOString().slice(0, 10);
                  setDateFrom(d); setDateTo(d);
                } else {
                  setDateFrom(new Date(Date.now() - days * 86400000).toISOString().slice(0, 10));
                  setDateTo(now.toISOString().slice(0, 10));
                }
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--radius)' }} />)}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
            {kpiCards.map((c, i) => <KPICard key={i} {...c} />)}
          </div>
          {/* Rate summary bar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'อัตรารับสาย', value: ANSWER_RATE, icon: '📞', color: 'var(--teal)' },
              { label: 'อัตราฝากหลังติดตาม', value: DEPOSIT_RATE, icon: '💰', color: 'var(--purple)' },
            ].map(({ label, value, icon, color }, i) => (
              <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 20px', display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ fontSize: '2rem' }}>{icon}</div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>{value}%</div>
                </div>
                <div style={{ flex: 1, height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', alignSelf: 'center' }}>
                  <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 4, transition: 'width 0.8s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ─── Agent Performance Table ─── */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600 }}>📊 ผลงานผู้โทรทั้งหมด — {period}</div>
          <Link href="/telesales/targets" className="btn btn-ghost btn-sm">⚙️ ตั้งเป้า</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>ผู้โทร</th>
                <th>วันล่าสุด</th>
                <th>รับสาย (ผล/เป้า)</th>
                <th>ฝากหลังติดตาม (ผล/เป้า)</th>
                <th>โทรออก</th>
                <th>อัตรารับสาย</th>
                <th>อัตราฝาก</th>
                <th>ยอดฝาก (บาท)</th>
                <th style={{ textAlign: 'center' }}>Score</th>
                <th style={{ textAlign: 'center' }}>SD</th>
                <th style={{ textAlign: 'center' }}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(3)].map((_, i) => (
                <tr key={i}><td colSpan={12}><div className="skeleton" style={{ height: 20, margin: '4px 0' }} /></td></tr>
              ))}
              {!loading && perfs.length === 0 && (
                <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>ยังไม่มีข้อมูลการโทร</td></tr>
              )}
              {!loading && perfs.map((p, i) => (
                <tr key={p.agent.id}>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>#{i + 1}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="avatar avatar-sm">{p.agent.displayName[0]}</div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{p.agent.displayName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.agent.role}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {p.lastCallAt ? new Date(p.lastCallAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '—'}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.answered}</div>
                    {p.target && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>เป้า: {Math.round(p.target.callTarget * p.target.answerRateTarget)}</div>}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--teal)' }}>{p.depositedCount}</div>
                    {p.target && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>เป้า: {Math.round(p.target.callTarget * p.target.depositRateTarget)}</div>}
                  </td>
                  <td style={{ fontWeight: 500 }}>{p.callTotal}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 50, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(p.callRate * 100).toFixed(0)}%`, background: 'var(--teal)', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{(p.callRate * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 50, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(p.depositRate * 100).toFixed(0)}%`, background: 'var(--purple)', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{(p.depositRate * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--teal)' }}>฿{p.depositAmount.toLocaleString()}</td>
                  <td style={{ textAlign: 'center' }}>
                    <ScoreRing score={p.score} grade={p.grade} />
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600, color: p.sd > 0 ? 'var(--success)' : p.sd < 0 ? 'var(--danger)' : 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {p.sd > 0 ? '+' : ''}{p.sd.toFixed(2)}σ
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ background: (GRADE_COLOR[p.grade] || '#64748B') + '22', color: GRADE_COLOR[p.grade] || '#64748B', border: `1px solid ${(GRADE_COLOR[p.grade] || '#64748B') + '44'}`, borderRadius: 20, padding: '3px 12px', fontWeight: 700, fontSize: '0.875rem' }}>
                      {p.grade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Quick links ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 20 }}>
        {[
          { href: '/telesales/members', icon: '👥', label: 'ติดตามสมาชิก', desc: 'รายการสมาชิกที่ต้องโทรติดตาม', color: 'var(--teal)' },
          { href: '/telesales/no-deposit', icon: '💳', label: 'สมัครไม่ฝาก', desc: `${kpi?.noDepositCount || 0} คน รอติดตาม`, color: 'var(--warning)' },
          { href: '/telesales/targets', icon: '🎯', label: 'ตั้งเป้าหมาย', desc: 'กำหนด KPI target รายบุคคล', color: 'var(--purple)' },
          { href: '/analytics/daily', icon: '📊', label: 'รายงานการเงิน', desc: 'สมัคร-ฝากถอน รายวัน', color: 'var(--info)' },
        ].map(({ href, icon, label, desc, color }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none' }}>
            <div className="stat-card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 16, cursor: 'pointer' }}>
              <div style={{ fontSize: '1.8rem', width: 44, height: 44, background: color + '22', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${color}33`, flexShrink: 0 }}>{icon}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

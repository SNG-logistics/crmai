'use client';
import { useEffect, useState, useCallback } from 'react';
import api from '../../../../lib/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────
interface InsightData {
  total: number;
  channelBreakdown: { channel: string; count: number; color: string }[];
  memberTypeBreakdown: { type: string; count: number }[];
  inactiveCount: number;
  inactiveBreakdown: { label: string; count: number; color: string }[];
  noDepositCount: number;
  noDepositPct: number;
  blockedCount: number;
  unblockedCount: number;
}

const MEMBER_TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  new:     { label: 'สมาชิกใหม่',  color: '#00D4AA', icon: '🆕' },
  regular: { label: 'สมาชิกทั่วไป', color: '#3B82F6', icon: '👤' },
  vip:     { label: 'VIP',          color: '#F59E0B', icon: '👑' },
  churned: { label: 'หายไป',        color: '#6B7280', icon: '💨' },
};

// ─── Custom Tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: '#1A2540', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem' }}>
        <div style={{ color: '#94A3B8', marginBottom: 2 }}>{label}</div>
        <div style={{ fontWeight: 700, color: '#fff' }}>{payload[0].value?.toLocaleString()} คน</div>
      </div>
    );
  }
  return null;
};

// ─── Donut / Pie Tooltip ──────────────────────────────────────────────────────
const PieTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: '#1A2540', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem' }}>
        <div style={{ color: payload[0].payload.color || '#94A3B8', fontWeight: 600, marginBottom: 2 }}>{payload[0].name}</div>
        <div style={{ color: '#fff', fontWeight: 700 }}>{payload[0].value?.toLocaleString()} คน</div>
      </div>
    );
  }
  return null;
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, highlight }: { icon: string; label: string; value: number | string; sub?: string; color: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? `linear-gradient(135deg, ${color}22, ${color}08)` : 'var(--bg-secondary)',
      border: `1px solid ${highlight ? color + '44' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 6,
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
      onMouseEnter={e => { (e.currentTarget as any).style.transform = 'translateY(-2px)'; (e.currentTarget as any).style.boxShadow = `0 4px 20px ${color}22`; }}
      onMouseLeave={e => { (e.currentTarget as any).style.transform = ''; (e.currentTarget as any).style.boxShadow = ''; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: '1.4rem' }}>{icon}</div>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

// ─── Inactive Filter Buttons ──────────────────────────────────────────────────
const INACTIVE_OPTIONS = [
  { days: 3,  label: '3 วัน' },
  { days: 7,  label: '7 วัน' },
  { days: 14, label: '14 วัน' },
  { days: 30, label: '30 วัน' },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ContactInsightsPage() {
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [inactiveDays, setInactiveDays] = useState(7);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const r = await api.get(`/analytics/contacts?inactiveDays=${days}`);
      setData(r.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(inactiveDays); }, [load, inactiveDays]);

  const total = data?.total || 0;

  // Prepare channel pie data
  const channelPieData = (data?.channelBreakdown || []).filter(d => d.count > 0);

  // Member type chart
  const memberData = (data?.memberTypeBreakdown || []).map(m => {
    const meta = MEMBER_TYPE_LABELS[m.type] || { label: m.type, color: '#6B7280', icon: '👤' };
    return { name: meta.label, value: m.count, color: meta.color, icon: meta.icon };
  });

  // Inactive bar chart
  const inactiveBarData = data?.inactiveBreakdown || [];

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <div className="spinner" style={{ width: 48, height: 48 }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: 4 }}>🎯 Customer Insights</h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>วิเคราะห์ลูกค้าเชิงลึก — ช่องทาง, พฤติกรรม, สถานะ</div>
        </div>
        {loading && <div className="spinner" style={{ width: 20, height: 20, marginTop: 8 }} />}
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard icon="👥" label="ลูกค้าทั้งหมด"   value={total}                      color="var(--teal)"    highlight />
        <StatCard icon="⚠️" label="ไม่ฝากเงิน"      value={data?.noDepositCount ?? 0}  sub={`${data?.noDepositPct ?? 0}% ของทั้งหมด`} color="var(--warning)" highlight />
        <StatCard icon="😴" label={`ไม่ทักใน ${inactiveDays} วัน`} value={data?.inactiveCount ?? 0} color="#EF4444" highlight />
        <StatCard icon="🚫" label="ถูก Block"        value={data?.blockedCount ?? 0}    color="var(--danger)" />
        <StatCard icon="✅" label="ปลด Block แล้ว"  value={data?.unblockedCount ?? 0}  sub="ยังมี conversation" color="#10B981" />
      </div>

      {/* ── Row 1: Channel + Member Type ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Channel Breakdown */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📱 ลูกค้าแยกตามช่องทาง</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>ลูกค้า 1 คนอาจอยู่หลายช่อง</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={channelPieData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="channel" tick={{ fill: '#94A3B8', fontSize: 13 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} label={{ position: 'top', fill: '#94A3B8', fontSize: 11 }}>
                {channelPieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            {channelPieData.map(c => (
              <div key={c.channel} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: c.color }} />
                <span style={{ color: 'var(--text-secondary)' }}>{c.channel}</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>{c.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Member Type Donut */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>🏅 ประเภทสมาชิก</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>จัดกลุ่มตาม member type</div>
          {memberData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={memberData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {memberData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)' }}>ไม่มีข้อมูล</div>
          )}
          {/* Legend */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
            {memberData.map(m => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: m.color }} />
                <span style={{ color: 'var(--text-secondary)' }}>{m.icon} {m.name}</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>{m.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 2: Inactive + No Deposit ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Inactive breakdown */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontWeight: 700 }}>😴 ลูกค้าไม่ทักมาหลายวัน</div>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 14 }}>แยกตามช่วงเวลาที่ไม่มีการสนทนา (จำนวน conversation)</div>

          {/* Filter buttons */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {INACTIVE_OPTIONS.map(opt => (
              <button key={opt.days}
                className={`btn btn-sm ${inactiveDays === opt.days ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setInactiveDays(opt.days)}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.15)' }}>
            <span style={{ fontSize: '2rem' }}>😴</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.6rem', color: '#EF4444', lineHeight: 1 }}>{(data?.inactiveCount ?? 0).toLocaleString()}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>ลูกค้า (หรือ conversation) ไม่ทักใน {inactiveDays}+ วัน</div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={inactiveBarData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {inactiveBarData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* No Deposit + Blocked summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* No Deposit card */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius)', padding: 20, flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>💸 ลูกค้าที่ไม่ฝากเงิน</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
                <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(245,158,11,0.15)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F59E0B" strokeWidth="3"
                    strokeDasharray={`${data?.noDepositPct ?? 0} ${100 - (data?.noDepositPct ?? 0)}`}
                    strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#F59E0B', lineHeight: 1 }}>{data?.noDepositPct ?? 0}%</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>ไม่ฝาก</div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#F59E0B' }}>{(data?.noDepositCount ?? 0).toLocaleString()}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>คนจาก {total.toLocaleString()} คน</div>
                <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-muted)', padding: '6px 10px', background: 'rgba(245,158,11,0.06)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.15)' }}>
                  💡 ส่ง Broadcast ชวนฝากให้กลุ่มนี้
                </div>
              </div>
            </div>
          </div>

          {/* Blocked / Unblocked */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>🚫 สถานะการ Block</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem' }}>🚫</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#EF4444' }}>{(data?.blockedCount ?? 0).toLocaleString()}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>ถูก Block</div>
              </div>
              <div style={{ padding: '12px 14px', background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem' }}>✅</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10B981' }}>{(data?.unblockedCount ?? 0).toLocaleString()}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>ปลด Block แล้ว</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Channel share detail ── */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>📊 สัดส่วนช่องทาง</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {channelPieData.map(ch => {
            const pct = total > 0 ? Math.round((ch.count / total) * 100) : 0;
            return (
              <div key={ch.channel} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ minWidth: 80, fontSize: '0.82rem', fontWeight: 600, color: ch.color }}>{ch.channel}</div>
                <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: ch.color, borderRadius: 5, transition: 'width 0.8s ease' }} />
                </div>
                <div style={{ minWidth: 50, textAlign: 'right', fontSize: '0.82rem', fontWeight: 700 }}>{ch.count.toLocaleString()}</div>
                <div style={{ minWidth: 36, textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{pct}%</div>
              </div>
            );
          })}
          {channelPieData.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>ยังไม่มีข้อมูล</div>
          )}
        </div>
      </div>
    </div>
  );
}

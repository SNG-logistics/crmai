'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '../../../lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function AnalyticsPage() {
  const [stats, setStats] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [channels, setChannels] = useState<any>(null);
  const [daily, setDaily] = useState<any>(null);

  useEffect(() => {
    const now = new Date(); const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    Promise.all([
      api.get('/analytics/dashboard'), api.get('/analytics/agents'),
      api.get('/analytics/channels'), api.get(`/analytics/daily?from=${from}&to=${to}`),
    ]).then(([s, a, c, d]) => {
      setStats(s.data.stats); setAgents(a.data.agents || []);
      setChannels(c.data.channels); setDaily(d.data.summary);
    });
  }, []);

  const channelData = channels ? [
    { name: 'LINE', value: channels.line, fill: '#00B900' },
    { name: 'Telegram', value: channels.telegram, fill: '#2AABEE' },
  ] : [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 700 }}>📊 Analytics & Reports</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/analytics/daily"    className="btn btn-primary btn-sm">📋 รายงานรายวัน</Link>
          <Link href="/analytics/members"  className="btn btn-secondary btn-sm">👥 สมาชิกใหม่</Link>
          <Link href="/analytics/partners" className="btn btn-secondary btn-sm">🤝 พาร์ทเนอร์</Link>
        </div>
      </div>

      {/* CRM Stats */}
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>CRM Overview</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'แชททั้งหมด',    value: stats?.totalConversations ?? '—', color: 'var(--teal)',    icon: '💬' },
          { label: 'กำลังเปิด',     value: stats?.openConversations ?? '—',  color: 'var(--info)',    icon: '🔄' },
          { label: 'แก้ปัญหาวันนี้', value: stats?.resolvedToday ?? '—',     color: 'var(--success)', icon: '✅' },
          { label: 'ลูกค้าทั้งหมด', value: stats?.totalContacts ?? '—',      color: 'var(--purple)',  icon: '👥' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.label}</div>
              <div style={{ fontSize: '1.2rem' }}>{s.icon}</div>
            </div>
            <div className="stat-number" style={{ color: s.color, fontSize: '1.8rem' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Financial Summary (เดือนนี้) */}
      {daily && (
        <>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Financial — เดือนนี้</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'สมัครรวม',      value: daily.registered,  unit: 'คน',  color: 'var(--text-primary)', icon: '🆕' },
              { label: 'สมัคร+ฝาก',    value: daily.withDeposit, unit: 'คน',  color: 'var(--teal)',         icon: '✅' },
              { label: 'สมัครไม่ฝาก',  value: daily.noDeposit,   unit: 'คน',  color: 'var(--warning)',      icon: '⚠️' },
              { label: 'ยอดฝากรวม',    value: '฿' + daily.totalDeposit.toLocaleString('th-TH', { maximumFractionDigits: 0 }),  unit: '', color: 'var(--success)', icon: '💰' },
              { label: 'ยอดถอนรวม',    value: '฿' + daily.totalWithdraw.toLocaleString('th-TH', { maximumFractionDigits: 0 }), unit: '', color: 'var(--danger)',  icon: '📤' },
              { label: 'กำไรสุทธิ',     value: '฿' + daily.netProfit.toLocaleString('th-TH', { maximumFractionDigits: 0 }),    unit: '', color: daily.netProfit >= 0 ? 'var(--success)' : 'var(--danger)', icon: '📈' },
            ].map((c, i) => (
              <div key={i} className="stat-card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.label}</div>
                  <div style={{ fontSize: '1.1rem' }}>{c.icon}</div>
                </div>
                <div style={{ fontSize: c.unit ? '1.4rem' : '1rem', fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
                {c.unit && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{c.unit}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { href: '/analytics/daily',    icon: '📋', label: 'รายงานสมัคร-ฝากถอน รายวัน',       desc: 'ตารางที่ 1 + Cohort Analysis',       color: 'var(--teal)'    },
          { href: '/analytics/members',  icon: '👥', label: 'รายงานสมาชิกใหม่ + การเล่น',       desc: 'ฝากถอน แยกตามเกม (หวย/สล็อต/คาสิโน)', color: 'var(--purple)'  },
          { href: '/analytics/partners', icon: '🤝', label: 'รายงานพาร์ทเนอร์ / Affiliate',     desc: 'สมาชิก Conversion Rate กำไร',          color: 'var(--warning)' },
          { href: '/telesales',          icon: '📞', label: 'Telesales KPI',                     desc: 'Score/SD/Grade ทีม Telesales',          color: 'var(--info)'    },
        ].map(({ href, icon, label, desc, color }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none' }}>
            <div className="stat-card" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 16, cursor: 'pointer', transition: 'border-color 0.2s' }}>
              <div style={{ width: 44, height: 44, background: color + '22', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', border: `1px solid ${color}33`, flexShrink: 0 }}>{icon}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Chart + Agent Performance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>📱 แชทแยกตามช่องทาง</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={channelData}>
              <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#1A2540', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#00D4AA" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>👥 ประสิทธิภาพทีม</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {agents.slice(0, 6).map((a: any) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="avatar avatar-sm">{a.displayName?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{a.displayName}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{a.role}</div>
                </div>
                <span className="badge badge-open">{a._count?.assignedConversations || 0} แชท</span>
              </div>
            ))}
            {agents.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>ไม่มีข้อมูล</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

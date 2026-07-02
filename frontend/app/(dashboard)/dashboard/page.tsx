'use client';
import { useEffect, useState } from 'react';
import api from '../../../lib/api';
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const COLORS = ['#00D4AA', '#7C3AED', '#3B82F6', '#F59E0B'];

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analytics/dashboard').then(r => { setStats(r.data.stats); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const chartData = [
    { h: '00:00', msgs: 12 }, { h: '03:00', msgs: 5 }, { h: '06:00', msgs: 18 },
    { h: '09:00', msgs: 45 }, { h: '12:00', msgs: 67 }, { h: '15:00', msgs: 52 },
    { h: '18:00', msgs: 38 }, { h: '21:00', msgs: 24 },
  ];
  const pieData = [
    { name: 'LINE', value: stats?.lineCount || 0 },
    { name: 'Telegram', value: stats?.telegramCount || 0 },
  ];

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">📊 ภาพรวมระบบ</h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>อัปเดตแบบ Real-time</span>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'แชทที่กำลังดำเนิน', value: stats?.openConversations ?? '—', icon: '💬', color: 'var(--teal)' },
          { label: 'ลูกค้าทั้งหมด', value: stats?.totalContacts ?? '—', icon: '👥', color: 'var(--purple)' },
          { label: 'แก้ปัญหาวันนี้', value: stats?.resolvedToday ?? '—', icon: '✅', color: 'var(--success)' },
          { label: 'Tickets คงค้าง', value: stats?.pendingTickets ?? '—', icon: '🎫', color: 'var(--warning)' },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            {loading ? (
              <><div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 8 }} /><div className="skeleton" style={{ height: 40, width: '40%' }} /></>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="stat-label">{s.label}</div>
                  <span style={{ fontSize: '1.5rem' }}>{s.icon}</span>
                </div>
                <div className="stat-number" style={{ color: s.color }}>{s.value}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 24 }}>
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>📈 ปริมาณแชท 24 ชั่วโมง</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="teal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00E5FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="h" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#141A34', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }} />
              <Area type="monotone" dataKey="msgs" stroke="#00E5FF" fill="url(#teal)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>📱 แยกตามช่องทาง</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#141A34', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Conversations */}
      <div className="glass-card" style={{ padding: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>💬 แชทล่าสุด</div>
        <RecentConversations />
      </div>
    </div>
  );
}

function RecentConversations() {
  const [convs, setConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/conversations?limit=8').then(r => { setConvs(r.data.conversations || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 50, borderRadius: 8 }} />)}</div>;
  if (!convs.length) return <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>ยังไม่มีบทสนทนา</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {convs.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div className="avatar">{c.contact?.displayName?.[0] || '?'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{c.contact?.displayName}</span>
              <span className={`badge badge-${c.channel}`}>{c.channel === 'line' ? '🟢 LINE' : '🔵 TG'}</span>
              <span className={`badge badge-${c.status}`}>{c.status}</span>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.messages?.[0]?.content || 'ไม่มีข้อความ'}
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../store/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function StatCard({ icon, label, value, sub, color }: any) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'center',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '1.5rem',
        background: `${color}22`, border: `1px solid ${color}44`,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color }}>{value ?? '—'}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function SlotDashboardPage() {
  const { token } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/slot/stats/overview`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d.data); })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
        border: '1px solid var(--border)', borderRadius: 16, padding: '24px 28px', marginBottom: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: '1.5rem' }}>🎰</span>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>BONUS TIME — Slot Bot</h2>
            <span style={{
              fontSize: '0.65rem', padding: '2px 8px', borderRadius: 20,
              background: 'rgba(0,255,128,0.15)', color: '#00ff80',
              border: '1px solid rgba(0,255,128,0.3)', display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff80', display: 'inline-block', animation: 'livePulse 1.5s infinite' }} />
              LIVE
            </span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            AI Winrate System — อัปเดต Real-Time
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/slot/providers" style={{
            padding: '8px 16px', background: 'var(--teal)', color: '#000', borderRadius: 8,
            fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
          }}>🏢 จัดการค่าย</a>
          <a href="/slot/games" style={{
            padding: '8px 16px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            borderRadius: 8, fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none',
            border: '1px solid var(--border)',
          }}>🎮 จัดการเกม</a>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto 12px' }} />
          <div>กำลังโหลดสถิติ...</div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
            <StatCard icon="👥" label="Lead ทั้งหมด" value={stats?.totalLeads} color="var(--teal)" />
            <StatCard icon="✅" label="Opted In" value={stats?.optedIn} sub="ยินยอมรับข่าวสาร" color="#22c55e" />
            <StatCard icon="🔥" label="Hot Leads" value={stats?.hotLeads} sub="กดติดต่อแอดมิน" color="#f97316" />
            <StatCard icon="📊" label="Events วันนี้" value={stats?.todayEvents} sub={`รวม ${stats?.totalEvents} events`} color="#a78bfa" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Top Games */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🎮</span> เกมที่กดมากที่สุด
              </div>
              {stats?.topGames?.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>ยังไม่มีข้อมูล</div>
              ) : (
                stats?.topGames?.map((g: any, i: number) => (
                  <div key={g.gameId} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: i < stats.topGames.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', background: 'var(--teal-glow)',
                        color: 'var(--teal)', fontSize: '0.7rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{i + 1}</span>
                      <span style={{ fontSize: '0.85rem' }}>{g.game?.name || g.gameId}</span>
                    </div>
                    <span style={{
                      fontSize: '0.8rem', fontWeight: 600, padding: '2px 8px',
                      background: 'rgba(139,92,246,0.15)', color: '#a78bfa', borderRadius: 6,
                    }}>{g.count} views</span>
                  </div>
                ))
              )}
            </div>

            {/* Top Providers */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🏢</span> ค่ายที่กดมากที่สุด
              </div>
              {stats?.topProviders?.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>ยังไม่มีข้อมูล</div>
              ) : (
                stats?.topProviders?.map((p: any, i: number) => (
                  <div key={p.providerId} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: i < stats.topProviders.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', background: 'var(--teal-glow)',
                        color: 'var(--teal)', fontSize: '0.7rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{i + 1}</span>
                      <span style={{ fontSize: '0.85rem' }}>{p.provider?.name || p.providerId}</span>
                    </div>
                    <span style={{
                      fontSize: '0.8rem', fontWeight: 600, padding: '2px 8px',
                      background: 'rgba(0,212,170,0.15)', color: 'var(--teal)', borderRadius: 6,
                    }}>{p.count} views</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div style={{
            marginTop: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 20,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 14 }}>⚡ จัดการระบบ</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { href: '/slot/providers', icon: '🏢', label: 'จัดการค่ายเกม' },
                { href: '/slot/games', icon: '🎮', label: 'จัดการเกม' },
                { href: '/slot/leads', icon: '👥', label: 'ดู Leads' },
              ].map(({ href, icon, label }) => (
                <a key={href} href={href} style={{
                  padding: '10px 18px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                  borderRadius: 10, textDecoration: 'none', color: 'var(--text-primary)',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 500,
                  transition: 'all 0.2s',
                }}>
                  {icon} {label}
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../../lib/api';
import { useSocket } from '../../../lib/socket';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';

// ─── Types ───────────────────────────────────────────────────────────────────
interface LiveStats {
  openChats: number; botChats: number; pendingChats: number; resolvedToday: number;
  newChatsToday: number; totalChats: number;
  totalContacts: number; newContactsToday: number; msgToday: number; openTickets: number;
  depositToday: number; withdrawToday: number; netToday: number;
  depositCount: number; withdrawCount: number;
  depositYesterday: number; withdrawYesterday: number; netYesterday: number;
  depositChange: number; withdrawChange: number;
}
interface Agent { id: string; displayName: string; role: string; isOnline: boolean; activeChatCount: number; lastLoginAt: string; }
interface RecentConv { id: string; contactName: string; channel: string; status: string; lastMsg: string; lastMsgAt: string; }

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (n: number) => n?.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '0';
const fmtMoney = (n: number) => '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function ChangeChip({ pct }: { pct: number }) {
  if (pct === 0) return null;
  const up = pct > 0;
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20,
      background: up ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
      color: up ? '#10b981' : '#ef4444', border: `1px solid ${up ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function KpiCard({ icon, label, value, sub, color, change, tv }: {
  icon: string; label: string; value: string; sub?: string;
  color: string; change?: number; tv?: boolean;
}) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', borderRadius: tv ? 16 : 12,
      border: `1px solid var(--border)`, padding: tv ? '24px 28px' : '16px 20px',
      position: 'relative', overflow: 'hidden',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}>
      {/* Glow */}
      <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100,
        background: color, borderRadius: '50%', opacity: 0.06, filter: 'blur(20px)' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: tv ? '2rem' : '1.4rem' }}>{icon}</div>
        {change !== undefined && <ChangeChip pct={change} />}
      </div>
      <div style={{ fontSize: tv ? '2.4rem' : '1.7rem', fontWeight: 800, color,
        lineHeight: 1.1, marginBottom: 4, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: tv ? '0.9rem' : '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: tv ? '0.8rem' : '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function AgentBadge({ agent, tv }: { agent: Agent; tv?: boolean }) {
  const statusColor = agent.isOnline
    ? agent.activeChatCount > 0 ? '#f59e0b' : '#10b981'
    : '#6b7280';
  const statusLabel = agent.isOnline
    ? agent.activeChatCount > 0 ? `💬 ${agent.activeChatCount} แชท` : '✅ ว่าง'
    : '⚫ ออฟไลน์';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: tv ? '10px 14px' : '8px 12px',
      background: 'var(--bg-tertiary)', borderRadius: 10, border: `1px solid ${statusColor}30` }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: tv ? 40 : 32, height: tv ? 40 : 32, borderRadius: '50%',
          background: `linear-gradient(135deg, ${statusColor}60, ${statusColor}20)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: tv ? '1.1rem' : '0.9rem', fontWeight: 700, color: 'var(--text-primary)', border: `2px solid ${statusColor}50` }}>
          {agent.displayName[0]}
        </div>
        <div style={{ position: 'absolute', bottom: -1, right: -1, width: tv ? 12 : 10, height: tv ? 12 : 10,
          borderRadius: '50%', background: statusColor, border: '2px solid var(--bg-secondary)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: tv ? '0.95rem' : '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {agent.displayName}
        </div>
        <div style={{ fontSize: tv ? '0.78rem' : '0.68rem', color: statusColor, fontWeight: 600 }}>{statusLabel}</div>
      </div>
    </div>
  );
}

function ChatFeedItem({ conv, tv }: { conv: RecentConv; tv?: boolean }) {
  const chColor = conv.channel === 'line' ? '#00B900' : '#2AABEE';
  const stColor: Record<string, string> = { open: 'var(--teal)', bot: 'var(--purple)', pending: 'var(--warning)' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: tv ? '10px 14px' : '8px 12px',
      borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: chColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontWeight: 600, fontSize: tv ? '0.9rem' : '0.8rem' }}>{conv.contactName}</span>
          <span style={{ fontSize: tv ? '0.72rem' : '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {conv.lastMsgAt ? formatDistanceToNow(new Date(conv.lastMsgAt), { locale: th, addSuffix: true }) : ''}
          </span>
        </div>
        <div style={{ fontSize: tv ? '0.82rem' : '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {conv.lastMsg || 'ไม่มีข้อความ'}
        </div>
      </div>
      <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 20,
        background: (stColor[conv.status] || 'var(--text-muted)') + '18',
        color: stColor[conv.status] || 'var(--text-muted)',
        border: `1px solid ${stColor[conv.status] || 'var(--text-muted)'}40`, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {conv.status === 'bot' ? '🤖' : conv.status === 'pending' ? '⏳' : '💬'} {conv.status}
      </span>
    </div>
  );
}

// ─── Pulse dot ────────────────────────────────────────────────────────────────
function LiveDot() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
        display: 'inline-block', animation: 'pulse 1.5s infinite', boxShadow: '0 0 0 0 rgba(239,68,68,0.4)' }} />
      <style>{`@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)}70%{box-shadow:0 0 0 8px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}`}</style>
      LIVE
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LivePage() {
  const [stats, setStats]       = useState<LiveStats | null>(null);
  const [agents, setAgents]     = useState<Agent[]>([]);
  const [convs, setConvs]       = useState<RecentConv[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [tvMode, setTvMode]     = useState(false);
  const [countdown, setCountdown] = useState(10);
  const intervalRef = useRef<NodeJS.Timeout>();
  const countRef    = useRef<NodeJS.Timeout>();

  const fetchStats = useCallback(async () => {
    try {
      const r = await api.get('/live/stats');
      setStats(r.data.stats);
      setAgents(r.data.agents || []);
      setConvs(r.data.recentConvs || []);
      setLastUpdate(new Date());
      setCountdown(10);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  // Auto-refresh ทุก 10 วินาที
  useEffect(() => {
    fetchStats();
    intervalRef.current = setInterval(fetchStats, 10000);
    return () => clearInterval(intervalRef.current);
  }, [fetchStats]);

  // Countdown display
  useEffect(() => {
    countRef.current = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 10), 1000);
    return () => clearInterval(countRef.current);
  }, []);

  // Socket: real-time push เมื่อมีเหตุการณ์สำคัญ
  useSocket('new_message', () => fetchStats());
  useSocket('conversation_updated', () => fetchStats());
  useSocket('agent_status_change', () => fetchStats());

  // TV fullscreen
  useEffect(() => {
    if (tvMode) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.fullscreenElement && document.exitFullscreen?.().catch(() => {});
    }
  }, [tvMode]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: 'var(--text-muted)' }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
      <span>กำลังโหลด Live Dashboard...</span>
    </div>
  );

  const onlineAgents  = agents.filter(a => a.isOnline);
  const offlineAgents = agents.filter(a => !a.isOnline);

  return (
    <div style={{
      padding: tvMode ? '20px 28px' : '20px 24px',
      minHeight: '100vh',
      background: tvMode ? 'var(--bg-primary)' : undefined,
      position: tvMode ? 'fixed' : undefined,
      inset: tvMode ? 0 : undefined,
      zIndex: tvMode ? 9999 : undefined,
      overflowY: tvMode ? 'auto' : undefined,
    }}>

      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tvMode ? 24 : 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: tvMode ? '1.8rem' : '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#ef4444', fontSize: tvMode ? '1.1rem' : '0.85rem', fontWeight: 700 }}><LiveDot /></span>
            Live Operations Dashboard
          </h1>
          <div style={{ fontSize: tvMode ? '0.9rem' : '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
            อัปเดตทุก 10 วิ · ครั้งถัดไปใน <span style={{ color: 'var(--teal)', fontWeight: 700 }}>{countdown}s</span>
            {lastUpdate && <> · อัปเดตล่าสุด {lastUpdate.toLocaleTimeString('th-TH')}</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={fetchStats} className="btn btn-ghost btn-sm" title="รีเฟรชทันที">🔄</button>
          <button onClick={() => setTvMode(v => !v)}
            className={`btn btn-sm ${tvMode ? 'btn-primary' : 'btn-secondary'}`}>
            {tvMode ? '🪟 ออกจาก TV Mode' : '📺 TV Mode'}
          </button>
        </div>
      </div>

      {/* ─── KPI Row 1: Financial ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: tvMode ? 16 : 12, marginBottom: tvMode ? 16 : 12 }}>
        <KpiCard icon="💰" label="ยอดฝากวันนี้" value={fmtMoney(stats?.depositToday || 0)}
          sub={`${fmt(stats?.depositCount || 0)} รายการ`}
          color="#10b981" change={stats?.depositChange} tv={tvMode} />
        <KpiCard icon="💸" label="ยอดถอนวันนี้" value={fmtMoney(stats?.withdrawToday || 0)}
          sub={`${fmt(stats?.withdrawCount || 0)} รายการ`}
          color="#ef4444" change={stats?.withdrawChange} tv={tvMode} />
        <KpiCard icon="📈" label="กำไรสุทธิวันนี้" value={fmtMoney(stats?.netToday || 0)}
          sub={`เมื่อวาน ${fmtMoney(stats?.netYesterday || 0)}`}
          color={(stats?.netToday || 0) >= 0 ? '#10b981' : '#ef4444'} tv={tvMode} />
      </div>

      {/* ─── KPI Row 2: Chat + Contact ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: tvMode ? 16 : 12, marginBottom: tvMode ? 20 : 16 }}>
        <KpiCard icon="💬" label="แชทเปิดอยู่"    value={fmt(stats?.openChats || 0)}    color="var(--teal)"    tv={tvMode} />
        <KpiCard icon="🤖" label="Bot กำลังตอบ"  value={fmt(stats?.botChats || 0)}     color="var(--purple)"  tv={tvMode} />
        <KpiCard icon="⏳" label="รอตอบ"          value={fmt(stats?.pendingChats || 0)} color="var(--warning)" tv={tvMode} />
        <KpiCard icon="✅" label="ปิดวันนี้"       value={fmt(stats?.resolvedToday || 0)} color="#10b981"      tv={tvMode} />
        <KpiCard icon="👥" label="สมาชิกใหม่วันนี้" value={fmt(stats?.newContactsToday || 0)} color="var(--teal)" sub={`รวม ${fmt(stats?.totalContacts || 0)} คน`} tv={tvMode} />
      </div>

      {/* ─── Bottom Grid: Agents + Live Feed ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: tvMode ? '340px 1fr' : '300px 1fr', gap: tvMode ? 16 : 12 }}>

        {/* Agent Status Board */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: tvMode ? '14px 18px' : '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: tvMode ? '1rem' : '0.88rem' }}>👥 Agent Status Board</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--teal)', fontWeight: 700,
              background: 'rgba(0,212,170,0.1)', padding: '2px 8px', borderRadius: 20 }}>
              {onlineAgents.length}/{agents.length} online
            </span>
          </div>
          <div style={{ padding: tvMode ? 12 : 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {agents.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: '0.85rem' }}>ไม่มีข้อมูล Agent</div>
            )}
            {onlineAgents.map(a => <AgentBadge key={a.id} agent={a} tv={tvMode} />)}
            {offlineAgents.length > 0 && onlineAgents.length > 0 && (
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', padding: '4px 8px' }}>— ออฟไลน์ —</div>
            )}
            {offlineAgents.map(a => <AgentBadge key={a.id} agent={a} tv={tvMode} />)}
          </div>

          {/* Pending alert */}
          {(stats?.pendingChats || 0) > 0 && (
            <div style={{ margin: 10, padding: '10px 14px', background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: tvMode ? '1rem' : '0.82rem', color: 'var(--warning)', fontWeight: 700 }}>
                ⚠️ มี {stats?.pendingChats} แชทรอตอบ!
              </div>
            </div>
          )}
        </div>

        {/* Live Chat Feed */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: tvMode ? '14px 18px' : '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontWeight: 700, fontSize: tvMode ? '1rem' : '0.88rem' }}>📡 แชทที่กำลัง Active</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{convs.length} บทสนทนา</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {convs.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🎉</div>
                <div style={{ fontSize: '0.9rem' }}>ไม่มีแชทค้าง ทุกอย่างเรียบร้อย!</div>
              </div>
            ) : convs.map(c => <ChatFeedItem key={c.id} conv={c} tv={tvMode} />)}
          </div>

          {/* Bottom summary bar */}
          <div style={{ padding: tvMode ? '10px 18px' : '8px 16px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: 16, fontSize: tvMode ? '0.82rem' : '0.72rem', color: 'var(--text-muted)' }}>
            <span>📨 ข้อความวันนี้: <strong style={{ color: 'var(--text-primary)' }}>{fmt(stats?.msgToday || 0)}</strong></span>
            <span>🎫 Ticket เปิด: <strong style={{ color: 'var(--warning)' }}>{fmt(stats?.openTickets || 0)}</strong></span>
            <span>📱 แชทใหม่วันนี้: <strong style={{ color: 'var(--teal)' }}>{fmt(stats?.newChatsToday || 0)}</strong></span>
          </div>
        </div>
      </div>

      {/* TV Mode Leaderboard */}
      {tvMode && agents.filter(a => a.activeChatCount > 0).length > 0 && (
        <div style={{ marginTop: 16, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
            🏆 Leaderboard — Agent ที่ Active มากที่สุดวันนี้
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, padding: 12 }}>
            {[...agents]
              .sort((a, b) => b.activeChatCount - a.activeChatCount)
              .filter(a => a.activeChatCount > 0)
              .map((a, i) => (
                <div key={a.id} style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 10,
                  border: `1px solid ${i === 0 ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.4rem' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{a.displayName}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--teal)' }}>{a.activeChatCount} แชท active</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

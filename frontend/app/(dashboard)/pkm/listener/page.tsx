'use client';
import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';
import { useSocket } from '../../../../lib/socket';

interface PkmEvent {
  event: string; data: any; ts: string;
}
interface TxEvent {
  type: 'withdraw' | 'deposit';
  amount: number; pf: string; username?: string;
  contactId?: string; contactName?: string;
  totalDeposit?: number; totalWithdraw?: number; netProfit?: number;
  ts: string;
}
interface ListenerStatus {
  connected: boolean; connectedAt: string | null;
  reconnects: number; eventsReceived: number;
  withdrawUpdated: number; depositUpdated: number;
  lastEvent: string | null; lastEventAt: string | null;
  recentEvents: PkmEvent[]; socketUrl: string;
}

export default function PKMListenerPage() {
  const [status, setStatus]   = useState<ListenerStatus | null>(null);
  const [txLog, setTxLog]     = useState<TxEvent[]>([]);
  const [rawLog, setRawLog]   = useState<PkmEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState<'live' | 'raw'>('live');
  const socket = useSocket();

  const loadStatus = useCallback(async () => {
    try {
      const r = await api.get('/pkm/listener/status');
      setStatus(r.data.listener);
      setRawLog(r.data.listener.recentEvents || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000); // poll ทุก 5s
    return () => clearInterval(interval);
  }, [loadStatus]);

  // ─── Real-time Socket events ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onTx = (data: TxEvent) => {
      setTxLog(prev => [data, ...prev].slice(0, 100));
      const isW = data.type === 'withdraw';
      const msg = `${isW ? '💸 ถอน' : '💰 ฝาก'} ${data.contactName || data.username || 'Unknown'} ฿${(data.amount || 0).toLocaleString()}`;
      toast[isW ? 'error' : 'success'](msg, { duration: 5000 });
    };

    const onRaw = (data: any) => {
      setRawLog(prev => [{ event: data.event, data: data.data, ts: data.ts }, ...prev].slice(0, 50));
    };

    const onUnknown = (data: any) => {
      toast(`⚠️ Unknown member ${data.type} ฿${data.amount} (${data.pf})`, { icon: '🔔', duration: 4000 });
    };

    socket.on('pkm:transaction',    onTx);
    socket.on('pkm:raw_event',      onRaw);
    socket.on('pkm:unknown_member', onUnknown);
    return () => {
      socket.off('pkm:transaction',    onTx);
      socket.off('pkm:raw_event',      onRaw);
      socket.off('pkm:unknown_member', onUnknown);
    };
  }, [socket]);

  const doStart = async () => {
    setLoading(true);
    try { await api.post('/pkm/listener/start'); toast.success('✅ PKM Listener เริ่มทำงาน'); loadStatus(); }
    catch (e: any) { toast.error(e.response?.data?.message || 'Error'); }
    finally { setLoading(false); }
  };

  const doStop = async () => {
    setLoading(true);
    try { await api.post('/pkm/listener/stop'); toast.success('⏹️ PKM Listener หยุดทำงาน'); loadStatus(); }
    catch (e: any) { toast.error(e.response?.data?.message || 'Error'); }
    finally { setLoading(false); }
  };

  const fmt = (ts: string | null) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.6rem' }}>📡</span> PKM Real-time Listener
        </h1>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
          รับ event ฝาก/ถอนจาก pkm-socket.gamingcenter.club แบบ real-time
        </div>
      </div>

      {/* Status Card */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 16 }}>
          {/* Status dot */}
          <div style={{
            width: 16, height: 16, borderRadius: '50%',
            background: status?.connected ? '#10B981' : '#EF4444',
            boxShadow: status?.connected ? '0 0 10px #10B981' : 'none',
            animation: status?.connected ? 'livePulse 1.5s infinite' : 'none',
          }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>
              {status?.connected ? '🟢 เชื่อมต่อแล้ว' : '🔴 ยังไม่ได้เชื่อมต่อ'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {status?.socketUrl} · reconnects: {status?.reconnects || 0}
              {status?.connectedAt && ` · เชื่อมเมื่อ ${fmt(status.connectedAt)}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!status?.connected
              ? <button className="btn btn-primary" onClick={doStart} disabled={loading} style={{ background: '#10B981', border: 'none' }}>
                  {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '▶️'} เริ่ม Listener
                </button>
              : <button className="btn btn-danger" onClick={doStop} disabled={loading}>
                  {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '⏹️'} หยุด
                </button>
            }
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
          {[
            { label: 'Events รับทั้งหมด', value: status?.eventsReceived || 0, icon: '📥', color: '#3B82F6' },
            { label: 'ถอน (update)',       value: status?.withdrawUpdated || 0, icon: '💸', color: '#EF4444' },
            { label: 'ฝาก (update)',       value: status?.depositUpdated  || 0, icon: '💰', color: '#10B981' },
            { label: 'Event ล่าสุด',       value: status?.lastEvent || '-',     icon: '🔔', color: '#F59E0B' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>
                {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.icon} {s.label}</div>
            </div>
          ))}
        </div>

        {status?.lastEventAt && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 12 }}>
            🕐 Event ล่าสุด: <strong>{status.lastEvent}</strong> เมื่อ {fmt(status.lastEventAt)}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'live', label: '💰 ธุรกรรม Real-time' },
          { key: 'raw',  label: '📋 Raw Events' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            style={{ padding: '7px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: tab === t.key ? 700 : 400,
              background: tab === t.key ? 'var(--teal)' : 'var(--bg-tertiary)',
              color: tab === t.key ? '#000' : 'var(--text-muted)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Transaction Log */}
      {tab === 'live' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>💰 ธุรกรรมที่รับได้ (session นี้)</span>
            {txLog.length > 0 && (
              <button onClick={() => setTxLog([])} className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }}>
                🗑️ ล้าง
              </button>
            )}
          </div>
          {txLog.length === 0
            ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {status?.connected
                  ? '⏳ รอ event จาก PKM... (จะปรากฏเมื่อมีการฝาก/ถอน)'
                  : '⚠️ Listener ยังไม่ได้เชื่อมต่อ — กด "เริ่ม Listener"'
                }
              </div>
            : <div>
                {txLog.map((tx, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '40px 1fr auto auto',
                    alignItems: 'center', gap: 12,
                    padding: '12px 18px',
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}>
                    <div style={{ fontSize: '1.5rem', textAlign: 'center' }}>
                      {tx.type === 'withdraw' ? '💸' : '💰'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                        {tx.contactName || tx.username || 'Unknown Member'}
                        {tx.pf && <span style={{ marginLeft: 8, fontSize: '0.68rem', padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-muted)' }}>pf:{tx.pf}</span>}
                      </div>
                      {tx.contactId && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          ฝากรวม: ฿{(tx.totalDeposit || 0).toLocaleString()} | ถอนรวม: ฿{(tx.totalWithdraw || 0).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: tx.type === 'withdraw' ? '#EF4444' : '#10B981' }}>
                        {tx.type === 'withdraw' ? '-' : '+'}฿{(tx.amount || 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {tx.type === 'withdraw' ? 'ถอน' : 'ฝาก'}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                      {fmt(tx.ts)}
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* Raw Events */}
      {tab === 'raw' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>📋 Raw Socket.IO Events ล่าสุด</span>
          </div>
          {rawLog.length === 0
            ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>ยังไม่มี raw events</div>
            : rawLog.map((e, i) => (
              <div key={i} style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                <span style={{ color: '#F59E0B', marginRight: 8 }}>{fmt(e.ts)}</span>
                <span style={{ color: 'var(--teal)', marginRight: 8 }}>[{e.event}]</span>
                <span style={{ color: 'var(--text-secondary)' }}>{JSON.stringify(e.data).substring(0, 150)}</span>
              </div>
            ))
          }
        </div>
      )}

      {/* Info box */}
      <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10 }}>
        <div style={{ fontSize: '0.78rem', color: '#3B82F6', fontWeight: 700, marginBottom: 6 }}>ℹ️ วิธีการทำงาน</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          • Listener เชื่อมต่อ <code>pkm-socket.gamingcenter.club</code> ตลอดเวลา<br/>
          • เมื่อมี event <code>member_withdraw</code> / <code>member_deposit</code> — ระบบ auto-update ยอดเงินใน CRM<br/>
          • ถ้าพบ username ที่ตรงกับ Contact ใน CRM — อัปเดตโปรไฟล์ทันที<br/>
          • Reconnect อัตโนมัติถ้าหลุด (max 30 วิ)
        </div>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';
import { useSocket } from '../../../../lib/socket';

type WaStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

export default function WhatsAppSettingsPage() {
  const [status, setStatus]   = useState<WaStatus>('disconnected');
  const [qr, setQr]           = useState<string | null>(null);
  const [phone, setPhone]     = useState<string | null>(null);
  const [stats, setStats]     = useState({ received: 0, sent: 0 });
  const [loading, setLoading] = useState(false);
  const [countdown, setCd]    = useState(0);
  const cdRef = useRef<NodeJS.Timeout | null>(null);
  const socket = useSocket();

  // ─── Load current status ───────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    try {
      const r = await api.get('/whatsapp/status');
      setStatus(r.data.status);
      setPhone(r.data.phone || null);
      setQr(r.data.qr || null);
      setStats(r.data.stats || { received: 0, sent: 0 });
    } catch {}
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // ─── Socket events ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onQR  = (d: any) => { setQr(d.qr); setStatus('qr'); startCountdown(); };
    const onCon = (d: any) => { setStatus('connected'); setPhone(d.phone); setQr(null); toast.success('✅ WhatsApp เชื่อมต่อสำเร็จ!'); loadStatus(); };
    const onDis = ()       => { setStatus('disconnected'); setPhone(null); setQr(null); toast.error('⚠️ WhatsApp ตัดการเชื่อมต่อ'); };
    socket.on('whatsapp:qr',           onQR);
    socket.on('whatsapp:connected',    onCon);
    socket.on('whatsapp:disconnected', onDis);
    return () => { socket.off('whatsapp:qr', onQR); socket.off('whatsapp:connected', onCon); socket.off('whatsapp:disconnected', onDis); };
  }, [socket, loadStatus]);

  // ─── QR countdown (QR หมดอายุทุก 60 วิ) ──────────────────────────────────
  const startCountdown = useCallback(() => {
    if (cdRef.current) clearInterval(cdRef.current);
    setCd(60);
    cdRef.current = setInterval(() => {
      setCd(p => {
        if (p <= 1) { clearInterval(cdRef.current!); return 0; }
        return p - 1;
      });
    }, 1000);
  }, []);

  const doConnect = async () => {
    setLoading(true);
    setStatus('connecting');
    setQr(null);
    try {
      await api.post('/whatsapp/connect');
      toast('🔄 กำลังสร้าง QR... รอสักครู่', { icon: '⏳' });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เชื่อมต่อไม่ได้');
      setStatus('disconnected');
    } finally { setLoading(false); }
  };

  const doDisconnect = async () => {
    if (!confirm('ตัดการเชื่อมต่อ WhatsApp?')) return;
    setLoading(true);
    try {
      await api.post('/whatsapp/disconnect');
      setStatus('disconnected'); setPhone(null); setQr(null);
      toast.success('ตัดการเชื่อมต่อแล้ว');
    } catch (e: any) { toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  const doRefreshQR = async () => {
    setQr(null);
    await doConnect();
  };

  // ─── Status color/label ────────────────────────────────────────────────────
  const STATUS_MAP: Record<WaStatus, { color: string; label: string; dot: string }> = {
    disconnected: { color: '#EF4444', label: 'ยังไม่ได้เชื่อมต่อ', dot: '#EF4444' },
    connecting:   { color: '#F59E0B', label: 'กำลังเชื่อมต่อ...', dot: '#F59E0B' },
    qr:           { color: '#3B82F6', label: 'รอสแกน QR Code', dot: '#3B82F6' },
    connected:    { color: '#10B981', label: 'เชื่อมต่อแล้ว 🟢', dot: '#10B981' },
  };
  const st = STATUS_MAP[status];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.8rem' }}>💚</span> WhatsApp Integration
        </h1>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
          เชื่อมต่อ WhatsApp โดยสแกน QR Code — ไม่ต้อง verify เบอร์กับ Meta
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Left: Status + QR */}
        <div>
          {/* Status Card */}
          <div className="card" style={{ padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 14, height: 14, borderRadius: '50%', background: st.dot, flexShrink: 0,
                boxShadow: status === 'connected' ? `0 0 8px ${st.dot}` : 'none',
                animation: status === 'connecting' || status === 'qr' ? 'livePulse 1.5s infinite' : 'none',
              }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: st.color }}>{st.label}</div>
                {phone && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>📞 +{phone}</div>}
              </div>
            </div>

            {/* Connected Stats */}
            {status === 'connected' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'รับวันนี้', value: stats.received, icon: '📥', color: '#10B981' },
                  { label: 'ส่งวันนี้',  value: stats.sent,     icon: '📤', color: '#3B82F6' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.icon} {s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {status === 'disconnected' && (
                <button className="btn btn-primary" onClick={doConnect} disabled={loading}
                  style={{ justifyContent: 'center', background: '#25D366', border: 'none' }}>
                  {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '💚'}
                  สร้าง QR Code เชื่อมต่อ
                </button>
              )}
              {(status === 'qr' || status === 'connecting') && (
                <button className="btn btn-secondary" onClick={doRefreshQR} disabled={loading}
                  style={{ justifyContent: 'center' }}>
                  🔄 สร้าง QR ใหม่
                </button>
              )}
              {status === 'connected' && (
                <button className="btn btn-danger" onClick={doDisconnect} disabled={loading}
                  style={{ justifyContent: 'center' }}>
                  ❌ ตัดการเชื่อมต่อ
                </button>
              )}
              {status !== 'disconnected' && status !== 'connected' && (
                <button className="btn btn-ghost" onClick={doDisconnect} disabled={loading}
                  style={{ justifyContent: 'center', fontSize: '0.8rem' }}>
                  ยกเลิก
                </button>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 12, fontSize: '0.9rem' }}>📖 วิธีเชื่อมต่อ</div>
            {[
              ['1', 'กดปุ่ม "สร้าง QR Code เชื่อมต่อ"'],
              ['2', 'รอ QR Code ปรากฏด้านขวา (~5 วินาที)'],
              ['3', 'เปิด WhatsApp บนมือถือ'],
              ['4', 'ไปที่ ⋮ Menu → Linked Devices'],
              ['5', 'กด "Link a Device"'],
              ['6', 'สแกน QR Code'],
              ['7', 'รอ 5-10 วิ → เชื่อมต่อสำเร็จ! ✅'],
            ].map(([n, t]) => (
              <div key={n} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#25D36620', border: '1px solid #25D36640', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#25D366', flexShrink: 0 }}>{n}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: QR Display */}
        <div>
          <div className="card" style={{ padding: 24, textAlign: 'center', minHeight: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {status === 'connected' ? (
              <div>
                <div style={{ fontSize: '4rem', marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#10B981' }}>เชื่อมต่อสำเร็จ!</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 8 }}>📞 +{phone}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>แชทจะปรากฏใน Inbox ทันที</div>
              </div>
            ) : qr ? (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 12, color: '#3B82F6' }}>
                  📱 สแกน QR นี้ด้วย WhatsApp
                </div>
                {/* QR Image */}
                <div style={{ background: '#fff', borderRadius: 16, padding: 12, display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                  <img src={qr} alt="WhatsApp QR Code" style={{ width: 220, height: 220, display: 'block' }} />
                </div>
                {/* Countdown */}
                {countdown > 0 && (
                  <div style={{ marginTop: 12, fontSize: '0.78rem', color: countdown < 20 ? '#EF4444' : 'var(--text-muted)' }}>
                    ⏱️ QR หมดอายุใน {countdown} วินาที
                  </div>
                )}
                <button className="btn btn-ghost btn-sm" onClick={doRefreshQR} style={{ marginTop: 8, fontSize: '0.75rem' }}>
                  🔄 สร้าง QR ใหม่
                </button>
              </div>
            ) : status === 'connecting' ? (
              <div>
                <span className="spinner" style={{ width: 40, height: 40 }} />
                <div style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.88rem' }}>กำลังสร้าง QR Code...</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '4rem', marginBottom: 12, opacity: 0.3 }}>💚</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>กด "สร้าง QR Code" เพื่อเริ่มต้น</div>
              </div>
            )}
          </div>

          {/* Warning */}
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10 }}>
            <div style={{ fontSize: '0.78rem', color: '#F59E0B', fontWeight: 700, marginBottom: 4 }}>⚠️ ข้อควรระวัง</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              วิธีนี้ใช้ WhatsApp Web Protocol<br />
              • แนะนำใช้เบอร์แยกต่างหาก<br />
              • ใช้ตอบแชท 1-to-1 เป็นหลัก<br />
              • มือถือต้องมีอินเทอร์เน็ตค้างไว้
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

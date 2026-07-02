'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';

interface ChannelInfo {
  channel: string;
  isActive: boolean;
  config: { configured: boolean };
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [webhookUrls, setWebhookUrls] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // LINE form
  const [lineSecret, setLineSecret] = useState('');
  const [lineToken, setLineToken] = useState('');
  const [lineSaving, setLineSaving] = useState(false);
  const [lineVerifying, setLineVerifying] = useState(false);
  const [lineBotInfo, setLineBotInfo] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  // Telegram form
  const [tgToken, setTgToken] = useState('');
  const [tgSaving, setTgSaving] = useState(false);
  const [tgBotInfo, setTgBotInfo] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      api.get('/channels').catch(() => ({ data: { channels: [] } })),
      api.get('/channels/webhook-url').catch(() => ({ data: {} })),
    ]).then(([chRes, whRes]) => {
      setChannels(chRes.data.channels || []);
      setWebhookUrls(whRes.data);
      setLoading(false);
    });
  }, []);

  const isConnected = (ch: string) => channels.some(c => c.channel === ch && c.isActive);

  // ── LINE ───────────────────────────────────────────────────────
  const verifyLine = async () => {
    if (!lineToken.trim()) return toast.error('กรุณาใส่ Access Token ก่อน');
    setLineVerifying(true);
    try {
      const r = await api.post('/channels/line/verify', { accessToken: lineToken });
      setLineBotInfo(r.data);
      toast.success(`✅ ${r.data.botName} — Token ถูกต้อง`);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Token ไม่ถูกต้อง');
    } finally { setLineVerifying(false); }
  };

  const saveLine = async () => {
    if (!lineSecret.trim() || !lineToken.trim()) return toast.error('กรุณาใส่ข้อมูลให้ครบ');
    setLineSaving(true);
    const tid = toast.loading('กำลังบันทึก...');
    try {
      const r = await api.post('/channels/line', { channelSecret: lineSecret, accessToken: lineToken });
      toast.success(r.data.message || 'สำเร็จ', { id: tid });
      setChannels(prev => {
        const existing = prev.filter(c => c.channel !== 'line');
        return [...existing, { channel: 'line', isActive: true, config: { configured: true } }];
      });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid });
    } finally { setLineSaving(false); }
  };

  const syncFollowers = async () => {
    setSyncing(true);
    const tid = toast.loading('กำลังดึงรายชื่อผู้ติดตามจาก LINE OA...');
    try {
      const r = await api.post('/channels/line/sync-followers');
      toast.success(r.data.message || 'ดึงข้อมูลสำเร็จ', { id: tid, duration: 5000 });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาดในการดึงข้อมูล', { id: tid });
    } finally {
      setSyncing(false);
    }
  };

  // ── Telegram ───────────────────────────────────────────────────
  const saveTelegram = async () => {
    if (!tgToken.trim()) return toast.error('กรุณาใส่ Bot Token');
    setTgSaving(true);
    const tid = toast.loading('กำลังเชื่อมต่อ...');
    try {
      const r = await api.post('/channels/telegram', { botToken: tgToken });
      toast.success(r.data.message || 'สำเร็จ', { id: tid });
      setTgBotInfo({ username: r.data.botUsername });
      setChannels(prev => {
        const existing = prev.filter(c => c.channel !== 'telegram');
        return [...existing, { channel: 'telegram', isActive: true, config: { configured: true } }];
      });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid });
    } finally { setTgSaving(false); }
  };

  // ── Disconnect ─────────────────────────────────────────────────
  const disconnect = async (ch: string) => {
    if (!confirm(`ต้องการปิดการเชื่อมต่อ ${ch.toUpperCase()} ใช่ไหม?`)) return;
    try {
      await api.delete(`/channels/${ch}`);
      setChannels(prev => prev.map(c => c.channel === ch ? { ...c, isActive: false } : c));
      toast.success(`ปิดการเชื่อมต่อ ${ch.toUpperCase()} แล้ว`);
    } catch { toast.error('เกิดข้อผิดพลาด'); }
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><div className="spinner" /></div>;

  const sectionStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, marginBottom: 20,
  };
  const labelStyle: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' };
  const inputStyle: React.CSSProperties = { width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 4 }}>📡 ตั้งค่าช่องทาง</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>เชื่อมต่อ LINE OA และ Telegram Bot เพื่อรับ-ส่งข้อความอัตโนมัติ</p>
      </div>

      {/* ── LINE OA ─────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#06C755', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>💚</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>LINE Official Account</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {isConnected('line')
                  ? <span style={{ color: 'var(--success)' }}>● เชื่อมต่อแล้ว</span>
                  : <span style={{ color: 'var(--text-muted)' }}>○ ยังไม่เชื่อมต่อ</span>
                }
              </div>
            </div>
          </div>
          {isConnected('line') && (
            <button className="btn btn-danger btn-sm" onClick={() => disconnect('line')}>ยกเลิกเชื่อมต่อ</button>
          )}
        </div>

        {/* Webhook URL */}
        {webhookUrls?.line && (
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 16, fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Webhook URL: </span>
            <code style={{ color: 'var(--teal)', wordBreak: 'break-all' }}>{webhookUrls.line}</code>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8, fontSize: '0.7rem' }}
              onClick={() => { navigator.clipboard.writeText(webhookUrls.line); toast.success('คัดลอกแล้ว'); }}>📋 Copy</button>
          </div>
        )}

        {/* Sync Followers Section */}
        {isConnected('line') && (
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 8 }}>🔄 ดึงข้อมูลลูกค้าเก่า (Sync Followers)</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: 12, lineHeight: 1.5 }}>
              ระบบจะดึงข้อมูลผู้ติดตาม LINE OA ทั้งหมดที่ยังไม่เคยทักเข้ามา เพื่อสร้างห้องแชทและรายชื่อลูกค้าในระบบ CRM นี้ให้โดยอัตโนมัติ
            </p>
            <button className="btn btn-primary btn-sm" onClick={syncFollowers} disabled={syncing}>
              {syncing ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14, marginRight: 6 }} />
                  กำลังดึงข้อมูล...
                </>
              ) : (
                '🔄 เริ่มดึงข้อมูลลูกค้าเก่า'
              )}
            </button>
          </div>
        )}

        {/* LINE Bot info */}
        {lineBotInfo && (
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            {lineBotInfo.botPicture && <img src={lineBotInfo.botPicture} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>✅ {lineBotInfo.botName}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Followers: {lineBotInfo.followersCount || '-'}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={labelStyle}>Channel Secret</label>
            <input className="input" type="password" value={lineSecret} onChange={e => setLineSecret(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={inputStyle} />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>จาก LINE Developers → Basic settings → Channel secret</div>
          </div>
          <div>
            <label style={labelStyle}>Channel Access Token (Long-lived)</label>
            <textarea className="input" value={lineToken} onChange={e => setLineToken(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" rows={3} style={{ ...inputStyle, resize: 'none' }} />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>จาก LINE Developers → Messaging API → Channel access token (long-lived) → กด Issue</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={verifyLine} disabled={lineVerifying || !lineToken.trim()}>
            {lineVerifying ? <><span className="spinner" style={{ width: 14, height: 14 }} /> ตรวจสอบ...</> : '🔍 ตรวจสอบ Token'}
          </button>
          <button className="btn btn-primary" onClick={saveLine} disabled={lineSaving || !lineSecret.trim() || !lineToken.trim()}>
            {lineSaving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> บันทึก...</> : '💾 บันทึกและเชื่อมต่อ'}
          </button>
        </div>

        {/* Steps */}
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 16, marginTop: 16, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>📘 ขั้นตอนการตั้งค่า:</div>
          <ol style={{ paddingLeft: 16, margin: 0 }}>
            <li>เข้า <a href="https://developers.line.biz/console/" target="_blank" style={{ color: 'var(--teal)' }}>LINE Developers Console</a></li>
            <li>เลือก Provider → Channel ของคุณ (ประเภท Messaging API)</li>
            <li>คัดลอก Channel Secret (Basic settings) → ใส่ในช่องด้านบน</li>
            <li>คัดลอก Channel Access Token (Messaging API → Issue) → ใส่ในช่องด้านบน</li>
            <li>กด &quot;บันทึกและเชื่อมต่อ&quot;</li>
            <li>ใน LINE Console → Webhook settings → ใส่ Webhook URL ด้านบน</li>
            <li>เปิด &quot;Use webhook&quot; ✅ และปิด &quot;Auto-reply messages&quot;</li>
          </ol>
        </div>
      </div>

      {/* ── Telegram ─────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#0088CC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>✈️</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>Telegram Bot</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {isConnected('telegram')
                  ? <span style={{ color: 'var(--success)' }}>● เชื่อมต่อแล้ว {tgBotInfo ? `(@${tgBotInfo.username})` : ''}</span>
                  : <span>○ ยังไม่เชื่อมต่อ</span>
                }
              </div>
            </div>
          </div>
          {isConnected('telegram') && (
            <button className="btn btn-danger btn-sm" onClick={() => disconnect('telegram')}>ยกเลิก</button>
          )}
        </div>

        {webhookUrls?.telegram && (
          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 16, fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Webhook URL: </span>
            <code style={{ color: 'var(--teal)', wordBreak: 'break-all' }}>{webhookUrls.telegram}</code>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8, fontSize: '0.7rem' }}
              onClick={() => { navigator.clipboard.writeText(webhookUrls.telegram); toast.success('คัดลอกแล้ว'); }}>📋</button>
          </div>
        )}

        <div>
          <label style={labelStyle}>Bot Token</label>
          <input className="input" type="password" value={tgToken} onChange={e => setTgToken(e.target.value)} placeholder="123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={inputStyle} />
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>จาก @BotFather → /newbot → คัดลอก token</div>
        </div>

        <button className="btn btn-primary" onClick={saveTelegram} disabled={tgSaving || !tgToken.trim()} style={{ marginTop: 16 }}>
          {tgSaving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> เชื่อมต่อ...</> : '🔗 เชื่อมต่อ Telegram'}
        </button>
      </div>
    </div>
  );
}

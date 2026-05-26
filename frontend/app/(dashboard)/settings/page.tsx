'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../lib/api';

// ─── Step Guide Component ─────────────────────────────────────────────────────
function StepGuide({ steps }: { steps: string[] }) {
  return (
    <div style={{ background: 'rgba(0,212,170,0.04)', border: '1px solid rgba(0,212,170,0.15)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--teal)', fontWeight: 700, minWidth: 18 }}>{i + 1}.</span>
          <span>{s}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Webhook URL Box ──────────────────────────────────────────────────────────
function WebhookBox({ url, label }: { url: string; label: string }) {
  const copy = () => { navigator.clipboard.writeText(url); toast.success('✅ คัดลอกแล้ว!'); };
  const isLocal = url.includes('localhost');
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <code style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: isLocal ? 'var(--warning)' : 'var(--teal)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {url}
        </code>
        <button className="btn btn-secondary btn-sm" onClick={copy} style={{ flexShrink: 0 }}>📋 คัดลอก</button>
      </div>
      {isLocal && (
        <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--warning)' }}>
          ⚠️ localhost ใช้กับ LINE ไม่ได้โดยตรง — ต้องใช้ <strong>ngrok</strong> หรือ deploy บน server จริง
          <br />
          <code style={{ fontSize: '0.72rem', opacity: 0.8 }}>ngrok http 4000</code> แล้วใช้ URL ที่ได้แทน
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<'channels' | 'team' | 'general'>('channels');
  const [lineForm, setLineForm] = useState({ channelSecret: '', accessToken: '' });
  const [tgForm,   setTgForm]   = useState({ botToken: '' });
  const [saving,   setSaving]   = useState(false);
  const [channels, setChannels] = useState<any[]>([]);
  const [webhookUrls, setWebhookUrls] = useState<any>(null);
  const [lineVerify, setLineVerify] = useState<any>(null);
  const [verifying,  setVerifying]  = useState(false);
  const [resultMsg,  setResultMsg]  = useState<{ type: 'ok' | 'err'; text: string; steps?: string[] } | null>(null);

  const loadChannels = () => {
    api.get('/channels').then(r => setChannels(r.data.channels || [])).catch(() => {});
    api.get('/channels/webhook-url').then(r => setWebhookUrls(r.data)).catch(() => {});
  };

  useEffect(() => { loadChannels(); }, []);

  // ─── Verify LINE token ───────────────────────────────────────────────────
  const verifyLine = async () => {
    if (!lineForm.accessToken) return;
    setVerifying(true); setLineVerify(null);
    try {
      const r = await api.post('/channels/line/verify', { accessToken: lineForm.accessToken });
      setLineVerify({ ok: true, ...r.data });
      toast.success(`✅ Token ใช้ได้ — Bot: ${r.data.botName}`);
    } catch (e: any) {
      setLineVerify({ ok: false, msg: e.response?.data?.message || 'Token ไม่ถูกต้อง' });
      toast.error(`❌ ${e.response?.data?.message || 'Token ไม่ถูกต้อง'}`);
    } finally { setVerifying(false); }
  };

  // ─── Save LINE ────────────────────────────────────────────────────────────
  const saveLine = async () => {
    setSaving(true); setResultMsg(null);
    try {
      const r = await api.post('/channels/line', lineForm);
      setResultMsg({ type: 'ok', text: r.data.message, steps: r.data.steps });
      setLineForm({ channelSecret: '', accessToken: '' });
      setLineVerify(null);
      loadChannels();
      toast.success('✅ บันทึก LINE OA สำเร็จ');
    } catch (e: any) {
      const msg = e.response?.data?.message || 'เกิดข้อผิดพลาด';
      setResultMsg({ type: 'err', text: msg });
      toast.error(msg);
    } finally { setSaving(false); }
  };

  // ─── Save Telegram ────────────────────────────────────────────────────────
  const saveTelegram = async () => {
    setSaving(true); setResultMsg(null);
    try {
      const r = await api.post('/channels/telegram', tgForm);
      setResultMsg({ type: 'ok', text: r.data.message });
      setTgForm({ botToken: '' });
      loadChannels();
      toast.success(r.data.message);
    } catch (e: any) {
      const msg = e.response?.data?.message || 'Bot Token ไม่ถูกต้อง';
      setResultMsg({ type: 'err', text: msg });
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const lineConnected = channels.some(c => c.channel === 'line' && c.config?.configured);
  const tgConnected   = channels.some(c => c.channel === 'telegram' && c.config?.configured);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>⚙️ ตั้งค่าระบบ</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {([['channels', '📱 ช่องทาง'], ['general', '⚙️ ทั่วไป'], ['team', '👥 ทีมงาน']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '10px 18px', border: 'none', borderBottom: tab === k ? '2px solid var(--teal)' : '2px solid transparent', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: tab === k ? 700 : 500, color: tab === k ? 'var(--teal)' : 'var(--text-muted)', marginBottom: -1, transition: 'all 0.2s' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Result Message */}
      {resultMsg && (
        <div style={{ padding: '12px 16px', background: resultMsg.type === 'ok' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${resultMsg.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 10, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: resultMsg.steps ? 8 : 0, color: resultMsg.type === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
            {resultMsg.type === 'ok' ? '✅' : '❌'} {resultMsg.text}
          </div>
          {resultMsg.steps && resultMsg.steps.map((s, i) => (
            <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '2px 0', paddingLeft: 20 }}>• {s}</div>
          ))}
        </div>
      )}

      {/* ─── CHANNELS TAB ────────────────────────────────────────────────────── */}
      {tab === 'channels' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* LINE OA */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.8rem' }}>🟢</span>
                <div>
                  <div style={{ fontWeight: 700 }}>LINE Official Account</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Messaging API</div>
                </div>
              </div>
              {lineConnected && (
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--success)', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, padding: '3px 10px' }}>
                  ✅ เชื่อมต่อแล้ว
                </span>
              )}
            </div>

            {/* Webhook URL */}
            {webhookUrls && <WebhookBox url={webhookUrls.line} label="Webhook URL (นำไปใส่ใน LINE Developers)" />}

            <StepGuide steps={[
              'เข้า https://developers.line.biz/console/',
              'เลือก Provider → Channel → Messaging API',
              'คัดลอก Channel Secret ด้านบน',
              'Issue Long-lived Access Token',
              'วาง URL ในช่อง Webhook URL แล้วกด Verify',
              'เปิด "Use webhook" และปิด Auto-reply',
            ]} />

            <div className="form-group">
              <label className="label">Channel Secret <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="input" type="password" value={lineForm.channelSecret}
                onChange={e => setLineForm(f => ({ ...f, channelSecret: e.target.value }))}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </div>

            <div className="form-group">
              <label className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Channel Access Token <span style={{ color: 'var(--danger)' }}>*</span></span>
                {lineForm.accessToken && (
                  <button onClick={verifyLine} disabled={verifying}
                    style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit' }}>
                    {verifying ? '⏳ กำลังตรวจสอบ...' : '🔍 ตรวจสอบ Token'}
                  </button>
                )}
              </label>
              <input className="input" type="password" value={lineForm.accessToken}
                onChange={e => { setLineForm(f => ({ ...f, accessToken: e.target.value })); setLineVerify(null); }}
                placeholder="Long-lived Access Token" />
              {lineVerify && (
                <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, fontSize: '0.78rem',
                  background: lineVerify.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${lineVerify.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  color: lineVerify.ok ? 'var(--success)' : 'var(--danger)' }}>
                  {lineVerify.ok
                    ? `✅ ใช้ได้! Bot: ${lineVerify.botName} (Followers: ${lineVerify.followersCount?.toLocaleString() || '?'})`
                    : `❌ ${lineVerify.msg}`}
                </div>
              )}
            </div>

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
              onClick={saveLine}
              disabled={saving || !lineForm.channelSecret || !lineForm.accessToken}>
              {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> กำลังบันทึก...</> : '🔗 บันทึก LINE OA'}
            </button>

            {lineConnected && (
              <button className="btn btn-danger btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={async () => {
                  const tid = toast.loading('กำลังยกเลิก...');
                  try { await api.delete('/channels/line'); loadChannels(); toast.success('ยกเลิกการเชื่อมต่อแล้ว', { id: tid }); }
                  catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); }
                }}>
                🔌 ยกเลิกการเชื่อมต่อ LINE
              </button>
            )}
          </div>

          {/* Telegram */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.8rem' }}>🔵</span>
                <div>
                  <div style={{ fontWeight: 700 }}>Telegram Bot</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bot API</div>
                </div>
              </div>
              {tgConnected && (
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--success)', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, padding: '3px 10px' }}>
                  ✅ เชื่อมต่อแล้ว
                </span>
              )}
            </div>

            {webhookUrls && <WebhookBox url={webhookUrls.telegram} label="Webhook URL (ตั้งค่าอัตโนมัติ)" />}

            <StepGuide steps={[
              'เปิด Telegram → คุย @BotFather',
              'ส่ง /newbot แล้วตั้งชื่อ Bot',
              'Copy Token ที่ได้มาวางด้านล่าง',
              'กด "บันทึก" — Webhook จะตั้งค่าให้อัตโนมัติ',
            ]} />

            <div className="form-group">
              <label className="label">Bot Token <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="input" type="password" value={tgForm.botToken}
                onChange={e => setTgForm({ botToken: e.target.value })}
                placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ" />
            </div>

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
              onClick={saveTelegram}
              disabled={saving || !tgForm.botToken}>
              {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> กำลังเชื่อมต่อ...</> : '🔗 เชื่อมต่อ Telegram'}
            </button>

            {tgConnected && (
              <button className="btn btn-danger btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={async () => {
                  const tid = toast.loading('กำลังยกเลิก...');
                  try { await api.delete('/channels/telegram'); loadChannels(); toast.success('ยกเลิกการเชื่อมต่อแล้ว', { id: tid }); }
                  catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); }
                }}>
                🔌 ยกเลิกการเชื่อมต่อ Telegram
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── GENERAL TAB ─────────────────────────────────────────────────────── */}
      {tab === 'general' && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 16 }}>⚙️ ตั้งค่าทั่วไป</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '14px 16px', background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.88rem' }}>🔧 BACKEND_URL</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                URL สาธารณะของ backend สำหรับรับ webhook จาก LINE/Telegram (ต้องเป็น HTTPS)
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" placeholder="https://your-domain.com" style={{ flex: 1 }}
                  defaultValue={typeof window !== 'undefined' ? '' : ''} />
                <button className="btn btn-secondary btn-sm">บันทึก</button>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                ตั้งค่าใน <code style={{ color: 'var(--teal)' }}>.env</code> ไฟล์: <code style={{ color: 'var(--teal)' }}>BACKEND_URL=https://...</code>
              </div>
            </div>

            <div style={{ padding: '14px 16px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10 }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--warning)', marginBottom: 8 }}>🌐 ใช้ ngrok สำหรับ Development</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                1. ติดตั้ง: <code>npm install -g ngrok</code><br />
                2. รัน: <code>ngrok http 4000</code><br />
                3. นำ URL ที่ได้ (เช่น <code>https://abc123.ngrok.io</code>) ไปใส่ใน .env<br />
                4. อัปเดต Webhook URL ใน LINE Developers Console
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TEAM TAB ────────────────────────────────────────────────────────── */}
      {tab === 'team' && <TeamTab />}
    </div>
  );
}

function TeamTab() {
  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => {
    api.get('/analytics/agents').then(r => setUsers(r.data.agents || [])).catch(() => {});
  }, []);
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontWeight: 600 }}>👥 รายชื่อทีมงาน</h3>
        <a href="/settings/users" className="btn btn-primary btn-sm">⚙️ จัดการทีม →</a>
      </div>
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
        <table className="table">
          <thead><tr><th>ชื่อ</th><th>บทบาท</th><th>แชท</th><th>เข้าสู่ระบบล่าสุด</th></tr></thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id}>
                <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="avatar avatar-sm">{u.displayName?.[0]}</div>{u.displayName}</div></td>
                <td><span className="badge badge-open">{u.role}</span></td>
                <td>{u._count?.assignedConversations || 0}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('th-TH') : 'ยังไม่เคย'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

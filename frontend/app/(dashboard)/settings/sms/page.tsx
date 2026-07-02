'use client';
import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';

// ─── Templates ────────────────────────────────────────────────────────────────
const SMS_TEMPLATES = [
  { label: '🔐 OTP',       text: 'รหัส OTP ของท่านคือ: {otp} (หมดอายุใน 5 นาที) ห้ามบอกผู้อื่น' },
  { label: '🎁 โปรโมชั่น', text: 'สมาชิก Happy77! ฝากวันนี้รับโบนัส 20% สูงสุด 500บ. สอบถาม LINE: @happy77' },
  { label: '💰 แจ้งเตือน', text: 'แจ้งเตือน: มีรายการถอนเงิน {amount} บ. จากบัญชีของท่าน หากไม่ใช่ท่านติดต่อ LINE: @happy77' },
  { label: '✅ ยืนยัน',    text: 'ยืนยันการสมัครสมาชิก Happy77 เรียบร้อยแล้ว ยินดีต้อนรับ! เข้าเล่นได้ที่ happy77.com' },
  { label: '⭐ VIP',        text: 'ยินดีด้วย! ท่านได้รับการอัพเกรดเป็นสมาชิก VIP รับสิทธิพิเศษเพิ่มเติมได้เลย' },
  { label: '🔙 Winback',   text: 'เราคิดถึงท่านนะ! กลับมาฝากวันนี้รับโบนัสพิเศษ 30% เฉพาะวันนี้วันเดียว' },
];

function CharCounter({ text }: { text: string }) {
  const len   = text.length;
  const parts = Math.ceil(len / 160) || 1;
  const color = len > 140 ? (len > 160 ? 'var(--danger)' : 'var(--warning)') : 'var(--text-muted)';
  return (
    <div style={{ fontSize: '0.75rem', color, textAlign: 'right', marginTop: 4 }}>
      {len}/160 {parts > 1 && <span style={{ color: 'var(--warning)' }}>({parts} SMS = {parts} เครดิต)</span>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    pending:   { color: 'var(--warning)',  label: '⏳ รอส่ง' },
    sent:      { color: 'var(--teal)',     label: '📤 ส่งแล้ว' },
    delivered: { color: 'var(--success)',  label: '✅ ส่งถึง' },
    failed:    { color: 'var(--danger)',   label: '❌ ล้มเหลว' },
  };
  const s = map[status] || { color: 'var(--text-muted)', label: status };
  return (
    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: s.color,
      background: s.color + '15', border: `1px solid ${s.color}40`,
      borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

export default function SmsPage() {
  const [tab, setTab] = useState<'config' | 'send' | 'logs'>('send');

  // Config state
  const [cfg, setCfg]         = useState({ provider: 'mock', apiKey: '', sender: 'CRM' });
  const [balance, setBalance] = useState<number | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [configured, setConfigured] = useState(false);

  // Send state
  const [phone, setPhone]   = useState('');
  const [msg, setMsg]       = useState('');
  const [sending, setSending] = useState(false);

  // Log state
  const [logs, setLogs]         = useState<any[]>([]);
  const [logStats, setLogStats] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState('all');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [total, setTotal] = useState(0);

  // ─── Load config & balance ─────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    try {
      const [cfgRes, balRes] = await Promise.all([
        api.get('/sms/config'),
        api.get('/sms/balance'),
      ]);
      if (cfgRes.data.configured) {
        setConfigured(true);
        setCfg(c => ({ ...c, provider: cfgRes.data.provider || 'mock', sender: cfgRes.data.sender || 'CRM' }));
      }
      setBalance(balRes.data.balance);
    } catch {}
  }, []);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const r = await api.get('/sms/logs', { params: { status: logFilter === 'all' ? undefined : logFilter, limit: 50 } });
      setLogs(r.data.logs || []);
      setLogStats(r.data.stats || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('โหลดประวัติไม่ได้'); }
    finally { setLoadingLogs(false); }
  }, [logFilter]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, loadLogs]);

  // ─── Save config ───────────────────────────────────────────────────────────
  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      await api.post('/sms/config', cfg);
      toast.success('✅ บันทึก SMS config แล้ว');
      setConfigured(true);
      loadConfig();
    } catch (e: any) { toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด'); }
    finally { setSavingCfg(false); }
  };

  // ─── Send SMS ──────────────────────────────────────────────────────────────
  const sendSms = async () => {
    if (!phone.trim()) return toast.error('กรุณาใส่เบอร์โทร');
    if (!msg.trim())   return toast.error('กรุณาใส่ข้อความ');
    setSending(true);
    const tid = toast.loading('กำลังส่ง SMS...');
    try {
      const r = await api.post('/sms/send', { phone: phone.trim(), message: msg });
      if (r.data.success) {
        toast.success(r.data.message, { id: tid });
        setPhone(''); setMsg('');
        loadConfig(); // refresh balance
      } else {
        toast.error(r.data.message || 'ส่งไม่สำเร็จ', { id: tid });
      }
    } catch (e: any) { toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid }); }
    finally { setSending(false); }
  };

  // ─── Stats summary ─────────────────────────────────────────────────────────
  const totalSent      = logStats.find(s => s.status === 'sent')?._count || 0;
  const totalDelivered = logStats.find(s => s.status === 'delivered')?._count || 0;
  const totalFailed    = logStats.find(s => s.status === 'failed')?._count || 0;
  const totalCredit    = logStats.reduce((sum: number, s: any) => sum + (s._sum?.creditUsed || 0), 0);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>📱 SMS Gateway</h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
            ส่ง SMS หาลูกค้าโดยตรง
          </div>
        </div>
        {balance !== null && (
          <div style={{ textAlign: 'right', padding: '10px 18px', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>เครดิตคงเหลือ</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--teal)' }}>{balance?.toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {([['send','📤 ส่ง SMS'], ['logs','📋 ประวัติ'], ['config','⚙️ ตั้งค่า']] as const).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '10px 20px', border: 'none', borderBottom: tab === k ? '2px solid var(--teal)' : '2px solid transparent',
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem',
              fontWeight: tab === k ? 700 : 400, color: tab === k ? 'var(--teal)' : 'var(--text-muted)',
              marginBottom: -1, transition: 'all 0.2s' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ─── SEND TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'send' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Form */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontWeight: 700 }}>📤 ส่ง SMS</h3>

            <div className="form-group">
              <label className="label">เบอร์โทรรับ SMS <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="input" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="0812345678 หรือ +66812345678" />
            </div>

            <div className="form-group">
              <label className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>ข้อความ <span style={{ color: 'var(--danger)' }}>*</span></span>
              </label>
              <textarea className="input" rows={5} value={msg} onChange={e => setMsg(e.target.value)}
                placeholder="พิมพ์ข้อความ SMS..." style={{ resize: 'vertical', minHeight: 100 }} />
              <CharCounter text={msg} />
            </div>

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              onClick={sendSms} disabled={sending || !phone || !msg}>
              {sending ? <><span className="spinner" style={{ width: 14, height: 14 }} /> กำลังส่ง...</> : '📤 ส่ง SMS'}
            </button>

            {!configured && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--warning)' }}>
                ⚠️ ยังไม่ได้ตั้งค่า Provider — กำลังใช้โหมดทดสอบ (Mock)
                <br /><button onClick={() => setTab('config')} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: '0.8rem', padding: 0, marginTop: 4, fontFamily: 'inherit' }}>→ ตั้งค่า SMS Provider</button>
              </div>
            )}
          </div>

          {/* Templates */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontWeight: 700 }}>⚡ Template สำเร็จรูป</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SMS_TEMPLATES.map(t => (
                <button key={t.label}
                  onClick={() => setMsg(t.text)}
                  style={{ textAlign: 'left', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8,
                    background: msg === t.text ? 'rgba(0,212,170,0.06)' : 'var(--bg-tertiary)',
                    borderColor: msg === t.text ? 'rgba(0,212,170,0.3)' : 'var(--border)',
                    cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 4 }}>{t.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t.text.length > 80 ? t.text.slice(0, 80) + '...' : t.text}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── LOGS TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'logs' && (
        <div>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'ส่งแล้ว',    value: totalSent,      color: 'var(--teal)',    icon: '📤' },
              { label: 'ส่งถึง',      value: totalDelivered, color: 'var(--success)', icon: '✅' },
              { label: 'ล้มเหลว',    value: totalFailed,    color: 'var(--danger)',  icon: '❌' },
              { label: 'เครดิตใช้',  value: Math.round(totalCredit), color: 'var(--warning)', icon: '💳' },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value.toLocaleString()}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter + Refresh */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            {['all','pending','sent','delivered','failed'].map(s => (
              <button key={s} onClick={() => setLogFilter(s)}
                className={`btn btn-sm ${logFilter === s ? 'btn-primary' : 'btn-secondary'}`}>
                {s === 'all' ? 'ทั้งหมด' : s === 'pending' ? 'รอส่ง' : s === 'sent' ? 'ส่งแล้ว' : s === 'delivered' ? 'ส่งถึง' : 'ล้มเหลว'}
              </button>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={loadLogs} style={{ marginLeft: 'auto' }}>🔄 รีเฟรช</button>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ทั้งหมด {total} รายการ</span>
          </div>

          {/* Table */}
          <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>วันเวลา</th>
                  <th>เบอร์</th>
                  <th>ข้อความ</th>
                  <th>สถานะ</th>
                  <th>Provider</th>
                  <th style={{ textAlign: 'center' }}>เครดิต</th>
                </tr>
              </thead>
              <tbody>
                {loadingLogs && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}>
                    <span className="spinner" style={{ width: 24, height: 24, display: 'inline-block' }} />
                  </td></tr>
                )}
                {!loadingLogs && logs.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                    📭 ไม่มีประวัติ SMS
                  </td></tr>
                )}
                {logs.map((log: any) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                      {log.phone.replace(/^66/, '0')}
                    </td>
                    <td style={{ fontSize: '0.82rem', maxWidth: 220 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.message}>
                        {log.message}
                      </div>
                      {log.errorMsg && <div style={{ color: 'var(--danger)', fontSize: '0.72rem' }}>{log.errorMsg}</div>}
                    </td>
                    <td><StatusBadge status={log.status} /></td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{log.provider}</td>
                    <td style={{ textAlign: 'center', fontSize: '0.82rem' }}>{log.creditUsed || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── CONFIG TAB ───────────────────────────────────────────────────────── */}
      {tab === 'config' && (
        <div style={{ maxWidth: 520 }}>
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 20px', fontWeight: 700 }}>⚙️ ตั้งค่า SMS Provider</h3>

            <div className="form-group">
              <label className="label">SMS Provider</label>
              <select className="input" value={cfg.provider} onChange={e => setCfg(c => ({ ...c, provider: e.target.value }))}>
                <option value="mock">🧪 Mock (ทดสอบ — ไม่ส่งจริง)</option>
                <option value="thsms">🇹🇭 ThSMS (www.thsms.com)</option>
              </select>
            </div>

            {cfg.provider === 'thsms' && (
              <div className="form-group">
                <label className="label">API Credentials</label>
                <input className="input" type="password" value={cfg.apiKey}
                  onChange={e => setCfg(c => ({ ...c, apiKey: e.target.value }))}
                  placeholder="username:password (จาก ThSMS)" />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  รูปแบบ: <code style={{ color: 'var(--teal)' }}>ชื่อผู้ใช้:รหัสผ่าน</code> จาก <a href="https://www.thsms.com" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>thsms.com</a>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="label">Sender Name (ชื่อผู้ส่ง)</label>
              <input className="input" value={cfg.sender}
                onChange={e => setCfg(c => ({ ...c, sender: e.target.value.slice(0, 11) }))}
                placeholder="เช่น MahaHeng (สูงสุด 11 ตัวอักษร)" maxLength={11} />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                ชื่อที่จะแสดงเป็นผู้ส่งในมือถือลูกค้า (ต้องสมัคร Sender กับ ThSMS ก่อน)
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={saveConfig} disabled={savingCfg} style={{ flex: 1, justifyContent: 'center' }}>
                {savingCfg ? <><span className="spinner" style={{ width: 14, height: 14 }} /> บันทึก...</> : '💾 บันทึก'}
              </button>
              <button className="btn btn-secondary" onClick={loadConfig}>
                🔄 เช็คยอด
              </button>
            </div>

            {balance !== null && (
              <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(0,212,170,0.05)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 8 }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>เครดิตคงเหลือ</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--teal)' }}>{balance?.toLocaleString() ?? '—'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>เครดิต ≈ {balance} SMS (ขึ้นอยู่กับจำนวนตัวอักษร)</div>
              </div>
            )}

            {/* Info box */}
            <div style={{ marginTop: 20, padding: '14px 16px', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>📖 วิธีสมัคร ThSMS</div>
              1. สมัครที่ <a href="https://www.thsms.com" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>thsms.com</a><br />
              2. เติมเครดิต SMS<br />
              3. ขอ Sender Name (ชื่อผู้ส่ง) — ใช้เวลา 1-3 วัน<br />
              4. นำ username:password มาใส่ด้านบน
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '../../../lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────────
type Rule = {
  id: string; name: string; isActive: boolean; createdAt: string;
  trigger: { type: string; config?: any };
  conditions: any[];
  actions: { type: string; config: any }[];
};
type Stats = { total: number; active: number; inactive: number; noDepositContacts: number; newTodayContacts: number };

const TRIGGER_OPTS = [
  { type: 'new_member',   label: '🆕 สมาชิกสมัครใหม่',     desc: 'เมื่อมีสมาชิกสมัครใหม่ใน X ชั่วโมง',     hasConfig: false },
  { type: 'no_deposit',   label: '⚠️ สมาชิกไม่ฝากใน N วัน', desc: 'สมัครแล้วยังไม่ฝากภายใน N วัน',          hasConfig: true,  configKey: 'daysAfter',    configLabel: 'ภายใน (วัน)', default: 1 },
  { type: 'inactive',     label: '😴 ไม่ใช้งาน N วัน',       desc: 'ไม่มีการฝากเงินนาน N วัน',               hasConfig: true,  configKey: 'daysInactive', configLabel: 'ไม่ใช้งาน (วัน)', default: 7 },
  { type: 'birthday',     label: '🎂 วันเกิด',               desc: 'ส่งอวยพรวันเกิดอัตโนมัติ',               hasConfig: false },
  { type: 'vip_threshold',label: '👑 ยอดฝากถึงเกณฑ์ VIP',   desc: 'เมื่อยอดฝากรวมถึง X บาท',                hasConfig: true,  configKey: 'amount',       configLabel: 'ยอดฝาก (บาท)', default: 50000 },
];
const ACTION_OPTS = [
  { type: 'send_message', label: '📤 ส่งข้อความ LINE/Telegram' },
  { type: 'assign_agent', label: '👤 มอบหมาย Agent' },
  { type: 'add_tag',      label: '🏷️ เพิ่ม Tag' },
  { type: 'create_ticket',label: '🎟️ สร้าง Ticket' },
];

// ─── Create/Edit Modal ─────────────────────────────────────────────────────────
function RuleModal({ rule, templates, onClose, onSaved }: { rule?: Rule; templates: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: rule?.name || '',
    isActive: rule?.isActive ?? true,
    triggerType: rule?.trigger?.type || 'no_deposit',
    triggerConfig: rule?.trigger?.config || {},
    actions: rule?.actions || [{ type: 'send_message', config: { channels: ['line'], message: '' } }],
  });
  const [saving, setSaving] = useState(false);

  const triggerDef = TRIGGER_OPTS.find(t => t.type === form.triggerType)!;

  const save = async () => {
    if (!form.name) { toast.error('กรุณาใส่ชื่อ Rule'); return; }
    setSaving(true);
    const tid = toast.loading('บันทึก...');
    try {
      const payload = {
        name: form.name, isActive: form.isActive,
        trigger: { type: form.triggerType, config: form.triggerConfig },
        conditions: [],
        actions: form.actions,
      };
      if (rule) await api.patch(`/automation/${rule.id}`, payload);
      else       await api.post('/automation', payload);
      toast.success('✅ บันทึก Automation Rule แล้ว', { id: tid });
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid }); }
    finally { setSaving(false); }
  };

  const updateAction = (i: number, key: string, val: any) =>
    setForm(f => { const a = [...f.actions]; a[i] = { ...a[i], config: { ...a[i].config, [key]: val } }; return { ...f, actions: a }; });

  const toggleChannel = (i: number, ch: string) =>
    setForm(f => {
      const a = [...f.actions]; const chs: string[] = a[i].config.channels || [];
      a[i] = { ...a[i], config: { ...a[i].config, channels: chs.includes(ch) ? chs.filter(x => x !== ch) : [...chs, ch] } };
      return { ...f, actions: a };
    });

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <div className="modal-title">{rule ? '✏️ แก้ไข' : '⚡ สร้าง'} Automation Rule</div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Name + Toggle */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="label">ชื่อ Rule *</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="เช่น ส่งข้อความสมาชิกใหม่" />
          </div>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 2 }}>
            <label className="label">เปิดใช้งาน</label>
            <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
              style={{ width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', background: form.isActive ? 'var(--teal)' : 'var(--bg-tertiary)', position: 'relative', transition: 'background 0.2s' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: form.isActive ? 27 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </button>
          </div>
        </div>

        {/* Trigger */}
        <div className="form-group">
          <label className="label">🎯 Trigger (เมื่อไหร่จะทำงาน)</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {TRIGGER_OPTS.map(t => (
              <button key={t.type} onClick={() => setForm(f => ({ ...f, triggerType: t.type, triggerConfig: t.hasConfig ? { [t.configKey!]: t.default } : {} }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${form.triggerType === t.type ? 'var(--teal)' : 'var(--border)'}`, background: form.triggerType === t.type ? 'rgba(0,212,170,0.08)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.2s' }}>
                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: form.triggerType === t.type ? 'var(--teal)' : 'var(--text-primary)', marginBottom: 2 }}>{t.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.desc}</div>
              </button>
            ))}
          </div>
          {triggerDef?.hasConfig && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', minWidth: 120 }}>{triggerDef.configLabel}:</label>
              <input type="number" className="input" style={{ width: 100 }}
                value={form.triggerConfig[triggerDef.configKey!] || triggerDef.default}
                onChange={e => setForm(f => ({ ...f, triggerConfig: { ...f.triggerConfig, [triggerDef.configKey!]: parseInt(e.target.value) } }))} />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="form-group">
          <label className="label">⚡ Actions (จะทำอะไร)</label>
          {form.actions.map((action, i) => (
            <div key={i} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <select className="input" style={{ flex: 1 }} value={action.type}
                  onChange={e => setForm(f => { const a = [...f.actions]; a[i] = { type: e.target.value, config: { channels: ['line'], message: '' } }; return { ...f, actions: a }; })}>
                  {ACTION_OPTS.map(o => <option key={o.type} value={o.type}>{o.label}</option>)}
                </select>
                {form.actions.length > 1 && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setForm(f => ({ ...f, actions: f.actions.filter((_, j) => j !== i) }))}>✕</button>}
              </div>

              {action.type === 'send_message' && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    {[{ k: 'line', l: '💚 LINE' }, { k: 'telegram', l: '💙 Telegram' }].map(({ k, l }) => (
                      <button key={k} onClick={() => toggleChannel(i, k)}
                        style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${(action.config.channels || []).includes(k) ? (k === 'line' ? '#00B900' : '#2AABEE') : 'var(--border)'}`, background: (action.config.channels || []).includes(k) ? (k === 'line' ? '#00B90018' : '#2AABEE18') : 'transparent', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', fontWeight: (action.config.channels || []).includes(k) ? 600 : 400, color: (action.config.channels || []).includes(k) ? (k === 'line' ? '#00B900' : '#2AABEE') : 'var(--text-muted)' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {/* Template picker */}
                  <div style={{ marginBottom: 8 }}>
                    <label className="label" style={{ fontSize: '0.72rem' }}>เลือกจาก Template</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {templates.slice(0, 6).map(t => (
                        <button key={t.id} className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                          onClick={() => updateAction(i, 'message', t.message)}>{t.icon} {t.name}</button>
                      ))}
                    </div>
                  </div>
                  <textarea className="input" rows={3} value={action.config.message || ''}
                    onChange={e => updateAction(i, 'message', e.target.value)} placeholder="ข้อความที่จะส่ง..." />
                </>
              )}
              {action.type === 'add_tag' && (
                <input className="input" value={action.config.tag || ''} onChange={e => updateAction(i, 'tag', e.target.value)} placeholder="ชื่อ Tag" />
              )}
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, actions: [...f.actions, { type: 'send_message', config: { channels: ['line'], message: '' } }] }))}>+ เพิ่ม Action</button>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '💾 บันทึก Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function AutomationPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<Rule | undefined>();
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rr, sr, tr] = await Promise.all([api.get('/automation'), api.get('/automation/stats'), api.get('/automation/templates')]);
      setRules(rr.data.rules || []);
      setStats(sr.data.stats || null);
      setTemplates(tr.data.templates || []);
    } catch { toast.error('โหลดข้อมูลไม่ได้'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (rule: Rule) => {
    const tid = toast.loading('กำลังเปลี่ยนสถานะ...');
    try {
      await api.patch(`/automation/${rule.id}`, { isActive: !rule.isActive });
      toast.success(!rule.isActive ? '✅ เปิดใช้งานแล้ว' : '⏸️ ปิดใช้งานแล้ว', { id: tid });
      load();
    } catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('ลบ Rule นี้?')) return;
    const tid = toast.loading('กำลังลบ...');
    try { await api.delete(`/automation/${id}`); toast.success('✅ ลบแล้ว', { id: tid }); load(); }
    catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); }
  };

  const runNow = async (rule: Rule) => {
    setRunning(rule.id);
    const tid = toast.loading(`⚡ กำลังรัน "${rule.name}"...`);
    try {
      const r = await api.post(`/automation/${rule.id}/run`);
      toast.success(`✅ ส่งสำเร็จ ${r.data.sent} ราย (ล้มเหลว: ${r.data.failed})`, { id: tid, duration: 5000 });
    } catch (e: any) { toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid }); }
    finally { setRunning(null); }
  };

  const TRIGGER_LABELS: any = {
    new_member: '🆕 สมาชิกใหม่', no_deposit: '⚠️ ยังไม่ฝาก', inactive: '😴 ไม่ใช้งาน', birthday: '🎂 วันเกิด', vip_threshold: '👑 VIP Threshold'
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 4 }}>⚡ Automation Rules</h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ส่งข้อความอัตโนมัติตาม Trigger — LINE/Telegram</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/broadcasts" className="btn btn-secondary btn-sm">📣 Broadcast</Link>
          <button className="btn btn-primary" onClick={() => { setEditRule(undefined); setShowModal(true); }}>+ สร้าง Rule</button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Rules ทั้งหมด',         value: stats.total,              color: 'var(--text-primary)', icon: '⚡' },
            { label: 'กำลังใช้งาน',           value: stats.active,             color: 'var(--success)',       icon: '✅' },
            { label: 'ปิดใช้งาน',             value: stats.inactive,           color: 'var(--text-muted)',    icon: '⏸️' },
            { label: 'สมาชิกไม่ฝาก (รอ)',     value: stats.noDepositContacts,  color: 'var(--warning)',       icon: '⚠️' },
            { label: 'สมาชิกใหม่วันนี้',      value: stats.newTodayContacts,   color: 'var(--teal)',          icon: '🆕' },
          ].map((s, i) => (
            <div key={i} className="stat-card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.label}</div>
                <div>{s.icon}</div>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Workflow diagram */}
      <div style={{ background: 'rgba(0,212,170,0.04)', border: '1px solid rgba(0,212,170,0.15)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--teal)', marginBottom: 12 }}>🔄 Automation Workflow</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {['🎯 Trigger', '→', '✅ Conditions', '→', '⚡ Actions', '→', '📤 ส่ง LINE/Telegram'].map((s, i) => (
            s === '→' ? <div key={i} style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>{s}</div> :
            <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: '0.82rem', fontWeight: 500 }}>{s}</div>
          ))}
        </div>
      </div>

      {/* Rules list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && [...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--radius)' }} />)}
        {!loading && rules.length === 0 && (
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>⚡</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>ยังไม่มี Automation Rule</div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: '0.85rem' }}>สร้าง Rule เพื่อส่งข้อความอัตโนมัติเมื่อเกิด Event ต่างๆ</div>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ สร้าง Rule แรก</button>
          </div>
        )}
        {!loading && rules.map(rule => {
          const actionCount = rule.actions.length;
          const msgAction = rule.actions.find(a => a.type === 'send_message');
          const channels: string[] = msgAction?.config?.channels || [];
          return (
            <div key={rule.id} style={{ background: 'var(--bg-secondary)', border: `1px solid ${rule.isActive ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderLeft: `4px solid ${rule.isActive ? 'var(--teal)' : 'var(--text-muted)'}`, borderRadius: 'var(--radius)', padding: 18, transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{rule.name}</div>
                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 10, background: rule.isActive ? 'rgba(0,212,170,0.15)' : 'rgba(100,116,139,0.15)', color: rule.isActive ? 'var(--teal)' : 'var(--text-muted)', fontWeight: 600 }}>
                      {rule.isActive ? '● ใช้งาน' : '○ ปิด'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-tertiary)', borderRadius: 8, padding: '4px 10px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Trigger:</span>
                      <span style={{ fontWeight: 600 }}>{TRIGGER_LABELS[rule.trigger.type] || rule.trigger.type}</span>
                      {rule.trigger.config && Object.values(rule.trigger.config).length > 0 && (
                        <span style={{ color: 'var(--teal)', fontSize: '0.72rem' }}>({Object.values(rule.trigger.config).join(', ')})</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-tertiary)', borderRadius: 8, padding: '4px 10px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Actions:</span>
                      <span style={{ fontWeight: 600 }}>{actionCount} รายการ</span>
                    </div>
                    {channels.length > 0 && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {channels.map(c => (
                          <span key={c} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 10, background: c === 'line' ? '#00B90022' : '#2AABEE22', color: c === 'line' ? '#00B900' : '#2AABEE', fontWeight: 600 }}>
                            {c === 'line' ? '💚 LINE' : '💙 Telegram'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {msgAction?.config?.message && (
                    <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                      "{msgAction.config.message}"
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {/* Toggle */}
                  <button onClick={() => toggleActive(rule)}
                    style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: rule.isActive ? 'var(--teal)' : 'var(--bg-tertiary)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: rule.isActive ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditRule(rule); setShowModal(true); }}>✏️</button>
                  <button className="btn btn-primary btn-sm" disabled={running === rule.id} onClick={() => runNow(rule)}>
                    {running === rule.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '▶ รันเดี๋ยวนี้'}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteRule(rule.id)}>🗑️</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Template showcase */}
      {templates.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)', fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>📋 Message Templates พร้อมใช้</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {templates.map(t => (
              <div key={t.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '1.2rem' }}>{t.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{t.name}</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {t.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && <RuleModal rule={editRule} templates={templates} onClose={() => setShowModal(false)} onSaved={load} />}
    </div>
  );
}

'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';

export default function TelesalesTargetsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [targets, setTargets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [editing, setEditing] = useState<string | null>(null); // agentId
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ur, tr] = await Promise.all([api.get('/users'), api.get(`/telesales/targets?period=${period}`)]);
      setAgents((ur.data.users || []).filter((u: any) => ['agent', 'supervisor'].includes(u.role) && u.isActive));
      setTargets(tr.data.targets || []);
    } catch { toast.error('โหลดข้อมูลไม่ได้'); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const getTarget = (agentId: string) => targets.find(t => t.agentId === agentId);

  const openEdit = (agentId: string) => {
    const t = getTarget(agentId);
    setForm(t ? {
      callTarget: t.callTarget, answerRateTarget: (t.answerRateTarget * 100).toFixed(0),
      depositRateTarget: (t.depositRateTarget * 100).toFixed(0),
      depositAmountTarget: t.depositAmountTarget, profitTarget: t.profitTarget,
    } : { callTarget: 100, answerRateTarget: 60, depositRateTarget: 30, depositAmountTarget: 50000, profitTarget: 20000 });
    setEditing(agentId);
  };

  const save = async (agentId: string) => {
    setSaving(true);
    const tid = toast.loading('บันทึกเป้าหมาย...');
    try {
      await api.put('/telesales/targets', {
        agentId, period,
        callTarget: parseInt(form.callTarget),
        answerRateTarget:    parseFloat(form.answerRateTarget) / 100,
        depositRateTarget:   parseFloat(form.depositRateTarget) / 100,
        depositAmountTarget: parseFloat(form.depositAmountTarget),
        profitTarget:        parseFloat(form.profitTarget),
      });
      toast.success('✅ บันทึกเป้าหมายแล้ว', { id: tid });
      setEditing(null);
      load();
    } catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href="/telesales" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>📞 Telesales</Link>
            <span>›</span><span>ตั้งเป้าหมาย</span>
          </div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700 }}>🎯 ตั้งเป้าหมาย KPI รายบุคคล</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="label" style={{ margin: 0 }}>เดือน:</label>
          <input type="month" className="input" style={{ width: 160 }} value={period} onChange={e => setPeriod(e.target.value)} />
        </div>
      </div>

      {/* KPI legend */}
      <div style={{ background: 'rgba(0,212,170,0.05)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, color: 'var(--teal)', marginBottom: 10, fontSize: '0.9rem' }}>📊 สูตรคำนวณ Score</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {[
            { label: 'อัตรารับสาย',        weight: '20%', example: 'รับสาย/โทรออก' },
            { label: 'อัตราฝากหลังติดตาม', weight: '35%', example: 'ฝาก/รับสาย' },
            { label: 'ยอดฝาก',             weight: '30%', example: 'บาทฝากรวม' },
            { label: 'กำไรสุทธิ',           weight: '15%', example: 'ยอดฝาก × 5%' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{k.label}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--teal)' }}>{k.weight}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{k.example}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Score = (ผลงาน/เป้า) × น้ำหนัก × 100 | Grade: A(≥120) B+(≥110) B(≥90) C+(≥80) C(≥70) D(≥60) F
        </div>
      </div>

      {/* Agent target table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && [...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius)' }} />)}
        {!loading && agents.map(agent => {
          const t = getTarget(agent.id);
          const isEditing = editing === agent.id;
          return (
            <div key={agent.id} style={{ background: 'var(--bg-secondary)', border: `1px solid ${isEditing ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: 20, transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isEditing ? 16 : 0, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className="avatar">{agent.displayName[0]}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{agent.displayName}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{agent.role} · {agent.email}</div>
                  </div>
                  {!t && <span style={{ fontSize: '0.72rem', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '2px 8px' }}>ยังไม่ตั้งเป้า</span>}
                </div>
                {!isEditing ? (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {t ? (
                      <>
                        {[
                          { label: 'โทรออก', val: t.callTarget + ' ครั้ง' },
                          { label: 'รับสาย', val: (t.answerRateTarget * 100).toFixed(0) + '%' },
                          { label: 'ฝาก', val: (t.depositRateTarget * 100).toFixed(0) + '%' },
                          { label: 'ยอดฝาก', val: '฿' + t.depositAmountTarget.toLocaleString() },
                          { label: 'กำไร', val: '฿' + t.profitTarget.toLocaleString() },
                        ].map((kpi, i) => (
                          <div key={i} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>{kpi.label}</div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal)' }}>{kpi.val}</div>
                          </div>
                        ))}
                      </>
                    ) : <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>ใช้ค่า default</span>}
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(agent.id)}>✏️ ตั้งเป้า</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => save(agent.id)} disabled={saving}>💾 บันทึก</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>ยกเลิก</button>
                  </div>
                )}
              </div>

              {isEditing && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  {[
                    { key: 'callTarget',          label: 'เป้าโทรออก (ครั้ง)',    type: 'number', suffix: 'ครั้ง', min: 1 },
                    { key: 'answerRateTarget',     label: 'เป้าอัตรารับสาย',      type: 'number', suffix: '%', min: 0, max: 100 },
                    { key: 'depositRateTarget',    label: 'เป้าอัตราฝาก',         type: 'number', suffix: '%', min: 0, max: 100 },
                    { key: 'depositAmountTarget',  label: 'เป้ายอดฝาก (บาท)',    type: 'number', suffix: '฿', min: 0 },
                    { key: 'profitTarget',         label: 'เป้ากำไรสุทธิ (บาท)', type: 'number', suffix: '฿', min: 0 },
                  ].map(({ key, label, type, suffix, min, max }) => (
                    <div key={key}>
                      <label className="label">{label}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type={type} className="input" value={form[key] || ''} min={min} max={max}
                          onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
                          style={{ flex: 1 }} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{suffix}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!loading && agents.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>ยังไม่มี Agent ในระบบ</div>
        )}
      </div>
    </div>
  );
}

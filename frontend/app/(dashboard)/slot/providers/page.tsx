'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../../store/auth';
import toast from 'react-hot-toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Provider {
  id: string; code: string; name: string; logoUrl?: string;
  sortOrder: number; isActive: boolean; gameCount?: number;
  createdAt: string;
}

const EMPTY_FORM = { code: '', name: '', logoUrl: '', sortOrder: 0 };

export default function SlotProvidersPage() {
  const { token } = useAuthStore();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/slot/providers?all=true`, { headers });
    const d = await r.json();
    if (d.success) setProviders(d.data);
    setLoading(false);
  };

  useEffect(() => { if (token) load(); }, [token]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (p: Provider) => {
    setEditing(p);
    setForm({ code: p.code, name: p.name, logoUrl: p.logoUrl || '', sortOrder: p.sortOrder });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) return toast.error('กรุณากรอก Code และ Name');
    setSaving(true);
    try {
      const url = editing ? `${API}/api/slot/providers/${editing.id}` : `${API}/api/slot/providers`;
      const method = editing ? 'PATCH' : 'POST';
      const r = await fetch(url, { method, headers, body: JSON.stringify(form) });
      const d = await r.json();
      if (!d.success) throw new Error(d.message);
      toast.success(editing ? 'อัปเดตค่ายเรียบร้อย' : 'เพิ่มค่ายเรียบร้อย');
      setShowModal(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Provider) => {
    const r = await fetch(`${API}/api/slot/providers/${p.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    const d = await r.json();
    if (d.success) { toast.success(p.isActive ? 'ปิดค่ายแล้ว' : 'เปิดค่ายแล้ว'); load(); }
  };

  const handleDelete = async (p: Provider) => {
    if (!confirm(`ลบค่าย "${p.name}" และเกมทั้งหมดในค่าย? ไม่สามารถย้อนกลับได้`)) return;
    const r = await fetch(`${API}/api/slot/providers/${p.id}`, { method: 'DELETE', headers });
    const d = await r.json();
    if (d.success) { toast.success('ลบค่ายเรียบร้อย'); load(); }
    else toast.error(d.message);
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>🏢 Slot Providers</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>จัดการค่ายเกมสำหรับ Slot Bot</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/slot" style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.82rem',
          }}>← Dashboard</a>
          <button onClick={openCreate} className="btn btn-primary btn-sm">+ เพิ่มค่าย</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
        </div>
      ) : (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {['ลำดับ', 'Code', 'ชื่อค่าย', 'จำนวนเกม', 'สถานะ', 'จัดการ'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providers.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  ยังไม่มีค่ายเกม — กด "เพิ่มค่าย" เพื่อเริ่มต้น
                </td></tr>
              ) : (
                providers.map((p, i) => (
                  <tr key={p.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.sortOrder}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontFamily: 'monospace', fontSize: '0.82rem', padding: '2px 8px',
                        background: 'var(--bg-tertiary)', borderRadius: 6, color: 'var(--teal)',
                      }}>{p.code}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                      {p.logoUrl && (
                        <img src={p.logoUrl} alt={p.name} style={{ width: 24, height: 24, objectFit: 'contain', marginRight: 8, verticalAlign: 'middle' }} />
                      )}
                      {p.name}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {(p as any)._count?.games ?? p.gameCount ?? '—'} เกม
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button onClick={() => toggleActive(p)} style={{
                        padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                        fontSize: '0.72rem', fontWeight: 600,
                        background: p.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: p.isActive ? '#22c55e' : '#ef4444',
                      }}>{p.isActive ? '✅ เปิด' : '❌ ปิด'}</button>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(p)} className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }}>✏️ แก้ไข</button>
                        <button onClick={() => handleDelete(p)} className="btn btn-ghost btn-sm" style={{ padding: '4px 10px', color: 'var(--danger)' }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 420, maxWidth: '92vw' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 20 }}>
              {editing ? '✏️ แก้ไขค่าย' : '➕ เพิ่มค่ายใหม่'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Code (ตัวพิมพ์ใหญ่) *</label>
                <input
                  value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="PG, JILI, PRAGMATIC..."
                  disabled={!!editing}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ชื่อค่าย *</label>
                <input
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="PG SOFT, JILI Gaming..."
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>URL โลโก้ (ไม่บังคับ)</label>
                <input
                  value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
                  placeholder="https://..."
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ลำดับการแสดง</label>
                <input
                  type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm">ยกเลิก</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

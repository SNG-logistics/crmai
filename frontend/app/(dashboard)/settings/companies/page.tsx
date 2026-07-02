'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';

type Company = {
  id: string;
  name: string;
  slug: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { whatsappAccounts: number; conversations: number; members: number };
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Add form state ──────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Inline rename state ─────────────────────────────────────────────────────
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api.get('/companies');
      setCompanies(r.data.companies || []);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'โหลดข้อมูลไม่ได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) { toast.error('กรุณากรอกชื่อบริษัท'); return; }
    setCreating(true);
    const tid = toast.loading('กำลังสร้างบริษัท...');
    try {
      await api.post('/companies', { name: name.trim(), slug: slug.trim() || undefined });
      toast.success('✅ เพิ่มบริษัทแล้ว', { id: tid });
      setName(''); setSlug('');
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid });
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (c: Company) => {
    setTogglingId(c.id);
    const tid = toast.loading('กำลังดำเนินการ...');
    try {
      await api.patch(`/companies/${c.id}`, { isActive: !c.isActive });
      setCompanies(prev => prev.map(x => x.id === c.id ? { ...x, isActive: !x.isActive } : x));
      toast.success(c.isActive ? '🔴 ปิดใช้งานบริษัทแล้ว' : '✅ เปิดใช้งานแล้ว', { id: tid });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid });
    } finally {
      setTogglingId(null);
    }
  };

  const openEdit = (c: Company) => {
    setEditId(c.id);
    setEditName(c.name);
    setEditSlug(c.slug || '');
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName('');
    setEditSlug('');
  };

  const saveEdit = async (c: Company) => {
    if (!editName.trim()) { toast.error('กรุณากรอกชื่อบริษัท'); return; }
    setSavingEdit(true);
    const tid = toast.loading('กำลังบันทึก...');
    try {
      const r = await api.patch(`/companies/${c.id}`, { name: editName.trim(), slug: editSlug.trim() });
      const updated = r.data.company;
      setCompanies(prev => prev.map(x => x.id === c.id ? { ...x, name: updated.name, slug: updated.slug } : x));
      toast.success('✅ บันทึกแล้ว', { id: tid });
      cancelEdit();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid });
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (c: Company) => {
    if (!confirm(`ลบบริษัท "${c.name}"?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    const tid = toast.loading('กำลังลบ...');
    try {
      await api.delete(`/companies/${c.id}`);
      setCompanies(prev => prev.filter(x => x.id !== c.id));
      toast.success('🗑️ ลบบริษัทแล้ว', { id: tid });
    } catch (e: any) {
      // Backend returns 400 with a Thai message when the company still has conversations/whatsapp accounts
      toast.error(e.response?.data?.message || 'ลบไม่สำเร็จ', { id: tid });
    }
  };

  const activeCount = companies.filter(c => c.isActive).length;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.8rem' }}>🏢</span> บริษัท (Companies)
        </h1>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 }}>
          บริษัท = แบรนด์/บริษัท ภายใต้บัญชีเดียว — แยก WhatsApp / AI / สิทธิ์แอดมิน ออกจากกันในแต่ละบริษัท
        </div>
      </div>

      {/* Add form */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 12 }}>➕ เพิ่มบริษัท</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <label className="label">ชื่อบริษัท *</label>
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !creating) create(); }}
              placeholder="เช่น Happy77"
            />
          </div>
          <div>
            <label className="label">Slug (ไม่บังคับ)</label>
            <input
              className="input"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !creating) create(); }}
              placeholder="happy77"
            />
          </div>
          <button className="btn btn-primary" onClick={create} disabled={creating} style={{ justifyContent: 'center', whiteSpace: 'nowrap' }}>
            {creating ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '➕'} เพิ่มบริษัท
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <span className="spinner" style={{ width: 40, height: 40 }} />
        </div>
      ) : companies.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12, opacity: 0.3 }}>🏢</div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>ยังไม่มีบริษัท</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 6 }}>
            เพิ่มบริษัทแรกของคุณด้วยฟอร์มด้านบน
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            {companies.length} บริษัท · เปิดใช้งาน {activeCount}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {companies.map(c => {
              const isEditing = editId === c.id;
              const counts = c._count || { whatsappAccounts: 0, conversations: 0, members: 0 };
              return (
                <div key={c.id} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, opacity: c.isActive ? 1 : 0.7 }}>
                  {/* Top: name + active toggle */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    {isEditing ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                          className="input"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="ชื่อบริษัท"
                          autoFocus
                        />
                        <input
                          className="input"
                          value={editSlug}
                          onChange={e => setEditSlug(e.target.value)}
                          placeholder="slug (ไม่บังคับ)"
                        />
                      </div>
                    ) : (
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '1.1rem' }}>🏢</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                        </div>
                        {c.slug && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>/{c.slug}</div>
                        )}
                      </div>
                    )}

                    {/* Active toggle */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }} title={c.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}>
                      <input
                        type="checkbox"
                        checked={c.isActive}
                        disabled={togglingId === c.id}
                        onChange={() => toggleActive(c)}
                        style={{ width: 40, height: 22, cursor: 'pointer', accentColor: 'var(--teal)' }}
                      />
                    </label>
                  </div>

                  {/* Status badge */}
                  <div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
                      background: c.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: c.isActive ? 'var(--success, #10B981)' : 'var(--danger)',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                      {c.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </div>

                  {/* Counts */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {[
                      { label: 'เบอร์ WhatsApp', value: counts.whatsappAccounts, icon: '📱', color: '#25D366' },
                      { label: 'บทสนทนา', value: counts.conversations, icon: '💬', color: 'var(--teal)' },
                      { label: 'แอดมิน', value: counts.members, icon: '👤', color: 'var(--purple)' },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{s.icon} {s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    {isEditing ? (
                      <>
                        <button className="btn btn-primary btn-sm" onClick={() => saveEdit(c)} disabled={savingEdit} style={{ flex: 1, justifyContent: 'center' }}>
                          {savingEdit ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '💾'} บันทึก
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={cancelEdit} disabled={savingEdit} style={{ justifyContent: 'center' }}>
                          ยกเลิก
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)} style={{ flex: 1, justifyContent: 'center' }}>
                          ✏️ เปลี่ยนชื่อ
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(c)} style={{ justifyContent: 'center' }}>
                          🗑️ ลบ
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

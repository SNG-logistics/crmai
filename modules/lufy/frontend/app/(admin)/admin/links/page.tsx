'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';

type LinkItem = {
  id: string;
  slug: string;
  type: string;
  status: string;
  comment?: string;
  destinationUrl?: string;
  desktopUrl?: string;
  mobileUrl?: string;
  targets: { url: string; weight: number }[];
  clickCount: number;
  createdAt: string;
};

export default function LinksPage() {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<LinkItem | null>(null);

  // Form State
  const [form, setForm] = useState({
    slug: '',
    type: 'simple',
    destinationUrl: '',
    desktopUrl: '',
    mobileUrl: '',
    targets: [{ url: '', weight: 50 }, { url: '', weight: 50 }],
    comment: '',
  });

  const loadLinks = async () => {
    try {
      const res = await api.get('/links');
      if (res.data.success) setLinks(res.data.links);
    } catch {
      toast.error('ไม่สามารถโหลดลิงก์ได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const tid = toast.loading('กำลังสร้างลิงก์...');
    try {
      const res = await api.post('/links', form);
      if (res.data.success) {
        toast.success('สร้างลิงก์สำเร็จแล้ว! 🚀', { id: tid });
        setShowCreate(false);
        resetForm();
        loadLinks();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid });
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEdit) return;
    const tid = toast.loading('กำลังบันทึก...');
    try {
      const res = await api.patch(`/links/${showEdit.id}`, form);
      if (res.data.success) {
        toast.success('บันทึกเรียบร้อย!', { id: tid });
        setShowEdit(null);
        resetForm();
        loadLinks();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid });
    }
  };

  const handleDelete = async (id: string, slug: string) => {
    if (!confirm(`ต้องการลบลิงก์ /${slug} ใช่หรือไม่?`)) return;
    try {
      await api.delete(`/links/${id}`);
      toast.success('ลบสำเร็จ');
      loadLinks();
    } catch {
      toast.error('ลบล้มเหลว');
    }
  };

  const handleStatusToggle = async (link: LinkItem) => {
    const nextStatus = link.status === 'active' ? 'paused' : 'active';
    try {
      await api.patch(`/links/${link.id}`, { status: nextStatus });
      toast.success(`เปลี่ยนสถานะเป็น ${nextStatus === 'active' ? 'เปิดใช้งาน' : 'ระงับ'}`);
      loadLinks();
    } catch {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const resetForm = () => {
    setForm({
      slug: '',
      type: 'simple',
      destinationUrl: '',
      desktopUrl: '',
      mobileUrl: '',
      targets: [{ url: '', weight: 50 }, { url: '', weight: 50 }],
      comment: '',
    });
  };

  const addTarget = () => {
    setForm({ ...form, targets: [...form.targets, { url: '', weight: 50 }] });
  };

  const removeTarget = (index: number) => {
    setForm({ ...form, targets: form.targets.filter((_, i) => i !== index) });
  };

  const handleTargetChange = (index: number, key: 'url' | 'weight', val: any) => {
    const updated = [...form.targets];
    updated[index] = { ...updated[index], [key]: val };
    setForm({ ...form, targets: updated });
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.protocol}//${window.location.hostname}:3001/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('คัดลอกลิงก์แล้ว! 📋');
  };

  const openEditModal = (link: LinkItem) => {
    setShowEdit(link);
    setForm({
      slug: link.slug,
      type: link.type,
      destinationUrl: link.destinationUrl || '',
      desktopUrl: link.desktopUrl || '',
      mobileUrl: link.mobileUrl || '',
      targets: link.targets.length > 0 ? link.targets : [{ url: '', weight: 50 }, { url: '', weight: 50 }],
      comment: link.comment || '',
    });
  };

  return (
    <div>
      {/* Top Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>🔗 จัดการลิงก์ย่อ</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>ย่อลิงก์ด่วน, แยกประเภทอุปกรณ์ หรือทำ Split Traffic A/B Test</p>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowCreate(true); }}>
          ➕ สร้างลิงก์ย่อ
        </button>
      </div>

      {/* Links List table */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Short Link (slug)</th>
                <th>ประเภท</th>
                <th>รายละเอียด URL ปลายทาง</th>
                <th>สถิติคลิก</th>
                <th>สถานะ</th>
                <th>สร้างเมื่อ</th>
                <th style={{ textAlign: 'right' }}>เครื่องมือ</th>
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(3)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 24 }}><span className="spinner" style={{ margin: 'auto' }} /></td>
                </tr>
              ))}
              {!loading && links.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    ยังไม่มีลิงก์ย่อในระบบ
                  </td>
                </tr>
              )}
              {!loading && links.map(link => (
                <tr key={link.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--teal)' }}>/{link.slug}</strong>
                      <button className="btn btn-secondary btn-sm" onClick={() => copyLink(link.slug)} style={{ padding: '3px 6px', fontSize: '0.7rem' }}>
                        📋 คัดลอก
                      </button>
                    </div>
                    {link.comment && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>💡 {link.comment}</div>}
                  </td>
                  <td>
                    <span style={{
                      fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                      background: link.type === 'split' ? '#9D4EDD22' : link.type === 'device' ? '#FFB70322' : '#00D4AA22',
                      color: link.type === 'split' ? '#9D4EDD' : link.type === 'device' ? '#FFB703' : '#00D4AA',
                    }}>
                      {link.type === 'split' ? '🔀 Split' : link.type === 'device' ? '📱 Device' : '🔗 Simple'}
                    </span>
                  </td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {link.type === 'simple' && link.destinationUrl}
                    {link.type === 'device' && `💻 Desktop: ${link.desktopUrl || '—'} | 📱 Mobile: ${link.mobileUrl || '—'}`}
                    {link.type === 'split' && `A/B Targets: ${link.targets.map(t => `${t.url} (${t.weight}%)`).join(', ')}`}
                  </td>
                  <td>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--teal)' }}>{link.clickCount.toLocaleString()}</strong> คลิก
                  </td>
                  <td>
                    <button
                      onClick={() => handleStatusToggle(link)}
                      style={{
                        padding: '2px 8px', borderRadius: 20, border: 'none', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                        background: link.status === 'active' ? 'rgba(6, 214, 160, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                        color: link.status === 'active' ? 'var(--success)' : 'var(--text-muted)',
                      }}
                    >
                      {link.status === 'active' ? '● Active' : '○ Paused'}
                    </button>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {new Date(link.createdAt).toLocaleDateString('th-TH')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(link)}>✏️ แก้ไข</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(link.id, link.slug)}>🗑️ ลบ</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal - Create/Edit Link */}
      {(showCreate || showEdit) && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowCreate(false); setShowEdit(null); } }}>
          <div className="modal" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <h3 className="modal-title">{showCreate ? '➕ สร้างลิงก์ย่อใหม่' : '✏️ แก้ไขลิงก์ย่อ'}</h3>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setShowCreate(false); setShowEdit(null); }}>✕</button>
            </div>

            <form onSubmit={showCreate ? handleCreate : handleUpdate}>
              <div className="form-group">
                <label className="label">Custom Slug (ปล่อยว่างเพื่อสุ่ม)</label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRight: 'none', borderRadius: '8px 0 0 8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    lufy.cc/
                  </span>
                  <input
                    type="text" className="input" style={{ borderRadius: '0 8px 8px 0' }}
                    value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.replace(/[^a-zA-Z0-9-_]/g, '') })}
                    placeholder="เช่น my-promo" disabled={!!showEdit}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="label">ประเภทลิงก์</label>
                <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ background: 'var(--bg-tertiary)' }}>
                  <option value="simple">🔗 Simple Link (ปลายทางเดียว)</option>
                  <option value="device">📱 Device targeting (คัดกรองตาม มือถือ/คอม)</option>
                  <option value="split">🔀 Split Traffic (กระจายเป้าหมาย A/B Test)</option>
                </select>
              </div>

              {form.type === 'simple' && (
                <div className="form-group">
                  <label className="label">URL ปลายทาง *</label>
                  <input
                    type="url" className="input" required value={form.destinationUrl}
                    onChange={e => setForm({ ...form, destinationUrl: e.target.value })}
                    placeholder="https://example.com/destination"
                  />
                </div>
              )}

              {form.type === 'device' && (
                <>
                  <div className="form-group">
                    <label className="label">สำหรับคอมพิวเตอร์ Desktop URL *</label>
                    <input
                      type="url" className="input" required value={form.desktopUrl}
                      onChange={e => setForm({ ...form, desktopUrl: e.target.value })}
                      placeholder="https://example.com/desktop"
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">สำหรับมือถือ/แท็บเล็ต Mobile URL *</label>
                    <input
                      type="url" className="input" required value={form.mobileUrl}
                      onChange={e => setForm({ ...form, mobileUrl: e.target.value })}
                      placeholder="https://example.com/mobile"
                    />
                  </div>
                </>
              )}

              {form.type === 'split' && (
                <div className="form-group">
                  <label className="label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>ปลายทาง A/B Test Targets *</span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addTarget}>➕ เพิ่ม URL</button>
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                    {form.targets.map((target, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input
                          type="url" className="input" style={{ flexGrow: 1 }} required
                          value={target.url} onChange={e => handleTargetChange(idx, 'url', e.target.value)}
                          placeholder={`URL ปลายทางที่ ${idx + 1}`}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 90 }}>
                          <input
                            type="number" className="input" required min="0" max="100"
                            value={target.weight} onChange={e => handleTargetChange(idx, 'weight', parseInt(e.target.value) || 0)}
                          />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>%</span>
                        </div>
                        {form.targets.length > 2 && (
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeTarget(idx)}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 24 }}>
                <label className="label">หมายเหตุ (Comment)</label>
                <input
                  type="text" className="input" value={form.comment}
                  onChange={e => setForm({ ...form, comment: e.target.value })}
                  placeholder="เช่น ยิงแคมเปญ SMS มิ.ย."
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowCreate(false); setShowEdit(null); }}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary">
                  {showCreate ? '🚀 สร้างลิงก์ย่อ' : '💾 บันทึกการเปลี่ยนแปลง'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

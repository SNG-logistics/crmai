'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';
import { useAuthStore } from '../../../../store/auth';


const ROLES = [
  { value: 'admin',       label: '👑 Admin',       desc: 'จัดการระบบทั้งหมด' },
  { value: 'supervisor',  label: '🔵 Supervisor',   desc: 'ดูแล agent และรายงาน' },
  { value: 'agent',       label: '👤 Agent',        desc: 'รับ-ตอบบทสนทนา' },
  { value: 'bot_manager', label: '🤖 Bot Manager',  desc: 'ตั้งค่า AI Bot' },
  { value: 'analyst',     label: '📊 Analyst',      desc: 'ดู Analytics เท่านั้น' },
];

const ROLE_COLORS: any = {
  admin: 'var(--danger)', supervisor: 'var(--warning)', agent: 'var(--teal)',
  bot_manager: 'var(--purple)', analyst: 'var(--info)', superadmin: 'var(--danger)',
};

type User = {
  id: string; email: string; username: string; displayName: string;
  role: string; isActive: boolean; twoFactorEnabled: boolean;
  lastLoginAt?: string; createdAt: string;
  _count?: { assignedConversations: number; tickets: number };
};

export default function UsersPage() {
  const { user: me } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ displayName: '', email: '', username: '', role: 'agent', password: '' });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    try { const r = await api.get('/users'); setUsers(r.data.users || []); }
    catch { toast.error('โหลดข้อมูลไม่ได้'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditUser(null);
    setForm({ displayName: '', email: '', username: '', role: 'agent', password: '' });
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({ displayName: u.displayName, email: u.email, username: u.username, role: u.role, password: '' });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.displayName || !form.email) { toast.error('กรุณากรอกชื่อและอีเมล'); return; }
    setSaving(true);
    const tid = toast.loading(editUser ? 'กำลังอัปเดต...' : 'กำลังสร้าง...');
    try {
      if (editUser) {
        const data: any = { displayName: form.displayName, role: form.role };
        if (form.password) data.password = form.password;
        await api.patch(`/users/${editUser.id}`, data);
        toast.success('✅ อัปเดตแล้ว', { id: tid });
      } else {
        await api.post('/users', { ...form });
        toast.success('✅ สร้าง User แล้ว', { id: tid });
      }
      setShowModal(false); load();
    } catch (e: any) { toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid }); }
    finally { setSaving(false); }
  };

  const toggleActive = async (u: User) => {
    if (u.id === me?.id) { toast.error('ไม่สามารถระงับตัวเองได้'); return; }
    const tid = toast.loading('กำลังดำเนินการ...');
    try {
      await api.patch(`/users/${u.id}`, { isActive: !u.isActive });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: !x.isActive } : x));
      toast.success(u.isActive ? '🔴 ระงับ User แล้ว' : '✅ เปิดใช้งานแล้ว', { id: tid });
    } catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); }
  };

  const filtered = users.filter(u =>
    u.displayName.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div className="section-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 4 }}>👥 จัดการทีม</h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{users.length} Users · {users.filter(u => u.isActive).length} Online</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>➕ เพิ่ม Agent</button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input className="input" placeholder="🔍 ค้นหาชื่อหรืออีเมล..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 400 }} />
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {ROLES.slice(0, 4).map(r => {
          const count = users.filter(u => u.role === r.value).length;
          return (
            <div key={r.value} className="stat-card" style={{ padding: 14 }}>
              <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{r.label.split(' ')[0]}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: ROLE_COLORS[r.value] || 'var(--teal)' }}>{count}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.value}</div>
            </div>
          );
        })}
      </div>

      {/* User Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" style={{ width: 40, height: 40 }} /></div>
      ) : (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ผู้ใช้</th>
                  <th>Role</th>
                  <th>บทสนทนา</th>
                  <th>Tickets</th>
                  <th>2FA</th>
                  <th>Login ล่าสุด</th>
                  <th>สถานะ</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>ไม่พบผู้ใช้</td></tr>
                )}
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                          <div className="avatar avatar-sm">{u.displayName?.[0]}</div>
                          {!u.isActive && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem' }}>🔴</div>}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                            {u.displayName}
                            {u.id === me?.id && <span style={{ fontSize: '0.65rem', background: 'var(--teal-glow)', color: 'var(--teal)', borderRadius: 10, padding: '1px 6px' }}>คุณ</span>}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ background: (ROLE_COLORS[u.role] || 'var(--teal)') + '22', color: ROLE_COLORS[u.role] || 'var(--teal)', border: `1px solid ${(ROLE_COLORS[u.role] || 'var(--teal)') + '44'}`, borderRadius: 20, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>
                        {u.role}
                      </span>
                    </td>
                    <td><span style={{ fontWeight: 600, color: 'var(--teal)' }}>{u._count?.assignedConversations || 0}</span></td>
                    <td><span style={{ fontWeight: 600, color: 'var(--purple)' }}>{u._count?.tickets || 0}</span></td>
                    <td>
                      <span style={{ fontSize: '1rem' }}>{u.twoFactorEnabled ? '🔐' : '🔓'}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {u.lastLoginAt ? formatDistanceToNow(new Date(u.lastLoginAt), { locale: th, addSuffix: true }) : 'ไม่เคย'}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                        background: u.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        color: u.isActive ? 'var(--success)' : 'var(--danger)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                        {u.isActive ? 'Active' : 'ระงับ'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(u)} title="แก้ไข">✏️</button>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => toggleActive(u)} title={u.isActive ? 'ระงับ' : 'เปิดใช้งาน'}
                          disabled={u.id === me?.id}>{u.isActive ? '🔴' : '✅'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title">{editUser ? '✏️ แก้ไข User' : '➕ สร้าง Agent ใหม่'}</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div className="form-group">
              <label className="label">ชื่อแสดง *</label>
              <input className="input" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="เช่น สมชาย รักดี" />
            </div>
            {!editUser && <>
              <div className="form-group">
                <label className="label">อีเมล *</label>
                <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="agent@company.com" />
              </div>
            </>}
            <div className="form-group">
              <label className="label">Role</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {ROLES.map(r => (
                  <label key={r.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', border: `1px solid ${form.role === r.value ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', background: form.role === r.value ? 'var(--teal-glow)' : 'transparent', transition: 'all 0.15s' }}>
                    <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={() => setForm(f => ({ ...f, role: r.value }))} style={{ accentColor: 'var(--teal)', marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{r.label}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="label">{editUser ? 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่าน (ค่าเริ่มต้น: Agent@1234)'}</label>
              <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editUser ? '•••••••• (เว้นว่างไม่เปลี่ยน)' : 'Agent@1234'} />
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : editUser ? '💾 บันทึก' : '➕ สร้าง Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

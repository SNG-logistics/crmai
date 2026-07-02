'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';

type UserItem = {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
};

export default function UsersManagementPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showReset, setShowReset] = useState<UserItem | null>(null);

  // Forms State
  const [createForm, setCreateForm] = useState({ username: '', password: '', isAdmin: false });
  const [resetPassword, setResetPassword] = useState('');

  const loadUsers = async () => {
    try {
      const res = await api.get('/users');
      if (res.data.success) setUsers(res.data.users);
    } catch {
      toast.error('ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.username || !createForm.password) return;
    const tid = toast.loading('กำลังสร้างผู้ใช้...');
    try {
      const res = await api.post('/users', createForm);
      if (res.data.success) {
        toast.success('สร้างผู้ใช้ใหม่เรียบร้อย! 🎉', { id: tid });
        setShowCreate(false);
        setCreateForm({ username: '', password: '', isAdmin: false });
        loadUsers();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showReset || !resetPassword) return;
    const tid = toast.loading('กำลังรีเซ็ตรหัสผ่าน...');
    try {
      const res = await api.post(`/users/${showReset.id}/reset-password`, { newPassword: resetPassword });
      if (res.data.success) {
        toast.success('รีเซ็ตรหัสผ่านสำเร็จ!', { id: tid });
        setShowReset(null);
        setResetPassword('');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid });
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`ต้องการลบผู้ใช้ "${username}" ใช่หรือไม่? ลิงก์ย่อทั้งหมดของผู้ใช้จะถูกลบไปด้วย`)) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('ลบผู้ใช้สำเร็จ');
      loadUsers();
    } catch {
      toast.error('ลบล้มเหลว');
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>👥 จัดการสมาชิกผู้ใช้งาน</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>สร้างบัญชีผู้ใช้ใหม่, จัดการสิทธิ์การใช้งาน และรีเซ็ตรหัสผ่านสำหรับเอเย่นต์ในเครือ</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          ➕ เพิ่มผู้ใช้งานใหม่
        </button>
      </div>

      {/* Users table */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ชื่อผู้ใช้งาน (Username)</th>
                <th>บทบาท / สิทธิ์การใช้งาน</th>
                <th>สร้างเมื่อ</th>
                <th style={{ textAlign: 'right' }}>เครื่องมือจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 24 }}><span className="spinner" style={{ margin: 'auto' }} /></td>
                </tr>
              )}
              {users.map(user => (
                <tr key={user.id}>
                  <td><strong>{user.username}</strong></td>
                  <td>
                    <span style={{
                      fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                      background: user.isAdmin ? 'rgba(255, 77, 109, 0.15)' : 'rgba(0, 212, 170, 0.15)',
                      color: user.isAdmin ? 'var(--danger)' : 'var(--teal)',
                    }}>
                      {user.isAdmin ? '🛡️ Admin' : '👤 Agent'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {new Date(user.createdAt).toLocaleDateString('th-TH')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowReset(user)}>🔒 รีเซ็ตรหัสผ่าน</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(user.id, user.username)}>🗑️ ลบผู้ใช้</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal - Create User */}
      {showCreate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">👥 เพิ่มผู้ใช้งานใหม่</h3>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowCreate(false)}>✕</button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="label">ชื่อผู้ใช้งาน (Username) *</label>
                <input
                  type="text" className="input" required value={createForm.username}
                  onChange={e => setCreateForm({ ...createForm, username: e.target.value.replace(/[^a-zA-Z0-9-_]/g, '') })}
                  placeholder="กรอกชื่อผู้ใช้..."
                />
              </div>

              <div className="form-group">
                <label className="label">รหัสผ่าน (Password) *</label>
                <input
                  type="password" className="input" required value={createForm.password}
                  onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="กรอกรหัสผ่าน (ขั้นต่ำ 6 ตัว)..."
                />
              </div>

              <div className="form-group" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox" id="isAdmin" checked={createForm.isAdmin}
                  onChange={e => setCreateForm({ ...createForm, isAdmin: e.target.checked })}
                  style={{ width: 18, height: 18, accentColor: 'var(--teal)' }}
                />
                <label htmlFor="isAdmin" style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                  แต่งตั้งเป็นผู้ดูแลระบบ (Admin)
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary">🚀 สร้างบัญชี</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Reset Password */}
      {showReset && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowReset(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">🔒 รีเซ็ตรหัสผ่านสำหรับ "{showReset.username}"</h3>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowReset(null)}>✕</button>
            </div>

            <form onSubmit={handleResetPassword}>
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label className="label">รหัสผ่านใหม่ (New Password) *</label>
                <input
                  type="password" className="input" required value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านใหม่..."
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowReset(null)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary">💾 รีเซ็ตรหัสผ่าน</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

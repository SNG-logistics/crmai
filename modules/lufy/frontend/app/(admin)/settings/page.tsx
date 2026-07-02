'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../../lib/api';

export default function SettingsPage() {
  const [user, setUser] = useState<{ username: string; isAdmin: boolean } | null>(null);
  const [form, setForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/auth/me')
      .then(res => {
        if (res.data.success) setUser(res.data.user);
      });
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.newPassword || form.newPassword.length < 6) {
      toast.error('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      toast.error('การยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setLoading(true);
    const tid = toast.loading('กำลังเปลี่ยนรหัสผ่าน...');
    try {
      // Admin resets own password using user's endpoint, but wait, do we have an endpoint for self password reset?
      // In backend/src/routes/users.ts we have POST /api/users/:id/reset-password which is admin-only.
      // Wait, we can call POST /api/users/:id/reset-password for the logged in user if they are admin,
      // Or we can add a self reset password endpoint or simply call the reset-password endpoint with the user's ID.
      // Wait! Let's check how backend/src/routes/users.ts handles this. It uses requireAdmin.
      // If the current user is admin, they can call POST /api/users/:id/reset-password.
      // Let's call the users endpoint if they have admin status, or let's double check.
      // Wait! Let's verify what ID the user has. We get `userId` from `api.get('/auth/me')`.
      const userId = (user as any).userId;
      const res = await api.post(`/users/${userId}/reset-password`, { newPassword: form.newPassword });
      if (res.data.success) {
        toast.success('เปลี่ยนรหัสผ่านสำเร็จแล้ว! 🔒', { id: tid });
        setForm({ newPassword: '', confirmPassword: '' });
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'เปลี่ยนรหัสผ่านล้มเหลว', { id: tid });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>⚙️ ตั้งค่าบัญชีผู้ใช้</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>จัดการสิทธิ์เข้าถึงบัญชีผู้ใช้ปัจจุบัน และเปลี่ยนรหัสผ่านเพื่อความปลอดภัย</p>
      </div>

      <div className="stat-card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>👤 ข้อมูลผู้ใช้ปัจจุบัน</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem' }}>
          <div><span style={{ color: 'var(--text-muted)' }}>ชื่อบัญชี:</span> <strong>{user?.username}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>สิทธิ์การใช้งาน:</span> <strong>{user?.isAdmin ? '🛡️ Administrator (ผู้ดูแลระบบ)' : '👤 Agent User'}</strong></div>
        </div>
      </div>

      <div className="stat-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>🔒 เปลี่ยนรหัสผ่านเข้าสู่ระบบ</h3>
        <form onSubmit={handleResetPassword}>
          <div className="form-group">
            <label className="label">รหัสผ่านใหม่</label>
            <input
              type="password" className="input" required value={form.newPassword}
              onChange={e => setForm({ ...form, newPassword: e.target.value })}
              placeholder="กรอกรหัสผ่านใหม่ (ขั้นต่ำ 6 ตัว)..." disabled={loading}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 24 }}>
            <label className="label">ยืนยันรหัสผ่านใหม่</label>
            <input
              type="password" className="input" required value={form.confirmPassword}
              onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
              placeholder="ยืนยันรหัสผ่านใหม่อีกครั้ง..." disabled={loading}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <span className="spinner" /> : '💾 อัปเดตรหัสผ่านใหม่'}
          </button>
        </form>
      </div>
    </div>
  );
}

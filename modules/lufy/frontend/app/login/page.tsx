'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      toast.error('กรุณากรอกข้อมูลให้ครบ');
      return;
    }
    setLoading(true);
    const tid = toast.loading('กำลังเข้าสู่ระบบ...');
    try {
      const res = await api.post('/auth/login', form);
      if (res.data.success) {
        toast.success('เข้าสู่ระบบสำเร็จ! 🎉', { id: tid });
        router.push('/admin/links');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'เข้าสู่ระบบล้มเหลว', { id: tid });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at top, rgba(0, 212, 170, 0.05), transparent 50%), #070913',
      padding: 20,
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '40px 32px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <span style={{ fontSize: '3rem' }}>👒</span>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, background: 'var(--gradient-teal)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginTop: 12 }}>
            lufy.cc
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
            ลงชื่อเข้าใช้งานแดชบอร์ดจัดการลิงก์ย่อของคุณ
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label">ชื่อผู้ใช้งาน (Username)</label>
            <input
              type="text"
              className="input"
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              placeholder="กรอกชื่อผู้ใช้..."
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group" style={{ marginBottom: 24 }}>
            <label className="label">รหัสผ่าน (Password)</label>
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="กรอกรหัสผ่าน..."
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.95rem' }}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : 'เข้าสู่ระบบ 🚀'}
          </button>
        </form>
      </div>
    </div>
  );
}

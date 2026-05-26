'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { connectSocket } from '../../lib/socket';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, loadFromStorage, token } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('demo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');

  useEffect(() => {
    loadFromStorage();
    if (token) router.replace('/dashboard');
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await api.post('/auth/login', { username, password, tenantSlug, token: show2FA ? twoFACode : undefined });
      if (res.data.requiresTwoFactor) { setShow2FA(true); setLoading(false); return; }
      setAuth(res.data.user, res.data.tenant, res.data.accessToken);
      connectSocket(res.data.accessToken);
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally { setLoading(false); }
  };

  return (
    <div className={styles.container}>
      <div className={styles.bg}>
        {[...Array(20)].map((_, i) => <span key={i} className={styles.particle} style={{ '--i': i } as any} />)}
      </div>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>🤖</div>
          <h1 className={styles.logoText}>CRM One-Stop</h1>
          <p className={styles.logoSub}>AI Powered Customer Platform</p>
        </div>

        <form onSubmit={handleLogin}>
          {error && <div className={styles.error}><span>⚠️</span>{error}</div>}

          {!show2FA ? (
            <>
              <div className="form-group">
                <label className="label">Tenant Slug</label>
                <input className="input" value={tenantSlug} onChange={e => setTenantSlug(e.target.value)} placeholder="demo" required />
              </div>
              <div className="form-group">
                <label className="label">ชื่อผู้ใช้ / อีเมล</label>
                <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="username หรือ email" required autoComplete="username" />
              </div>
              <div className="form-group">
                <label className="label">รหัสผ่าน</label>
                <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
              </div>
            </>
          ) : (
            <div className={styles.twoFABox}>
              <div className={styles.twoFAIcon}>🔐</div>
              <p className={styles.twoFAText}>กรุณาใส่รหัส 2FA จากแอป Authenticator</p>
              <input className="input" value={twoFACode} onChange={e => setTwoFACode(e.target.value)} placeholder="000000" maxLength={6} style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.3em' }} autoFocus />
            </div>
          )}

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}>
            {loading ? <span className="spinner" /> : (show2FA ? '🔓 ยืนยัน 2FA' : '🚀 เข้าสู่ระบบ')}
          </button>

          {show2FA && (
            <button type="button" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }} onClick={() => setShow2FA(false)}>
              ← กลับ
            </button>
          )}
        </form>

        <div className={styles.hint}>
          <p>Demo: <strong>admin@demo.crm</strong> / <strong>Admin@1234</strong></p>
          <p>Tenant: <strong>demo</strong></p>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import api from '../../lib/api';
import { auth, googleProvider, getIdToken } from '../../lib/firebase';
import { useAuthStore } from '../../store/auth';
import { connectSocket } from '../../lib/socket';
import styles from './login.module.css';

function mapFirebaseError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    case 'auth/user-disabled':
      return 'บัญชีนี้ถูกระงับการใช้งาน';
    case 'auth/too-many-requests':
      return 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่';
    case 'auth/network-request-failed':
      return 'เชื่อมต่อเครือข่ายไม่ได้ กรุณาลองใหม่';
    case 'auth/popup-blocked':
      return 'เบราว์เซอร์บล็อก popup กรุณาอนุญาต popup แล้วลองใหม่';
    default:
      return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่';
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  // If a Firebase session is already active, restore it and go to dashboard.
  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (token) {
        try { await finishLogin(); }
        catch (e) { await handleAuthError(e); } // clear an unprovisioned/orphaned session
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exchange the Firebase session for the CRM profile (tenant + role) via /auth/me.
  const finishLogin = async () => {
    const idToken = await getIdToken(true);
    if (!idToken) throw new Error('no-token');
    const res = await api.get('/auth/me');
    const u = res.data?.user;
    if (!u) throw new Error('no-profile');
    const tenant = u.tenant;
    setAuth(
      {
        id: u.id, tenantId: u.tenantId, email: u.email,
        username: u.username, role: u.role, displayName: u.displayName, avatar: u.avatar,
      },
      tenant,
      idToken
    );
    connectSocket(idToken);
    router.replace('/dashboard');
  };

  const handleAuthError = async (err: any) => {
    // 401 from /auth/me means the Firebase user is not provisioned in the CRM.
    if (err?.response?.status === 401) {
      await signOut(auth).catch(() => {});
      setError('บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้งานระบบ กรุณาติดต่อผู้ดูแล (สร้างผู้ใช้ได้เฉพาะใน Firebase)');
    } else if (err?.code?.startsWith?.('auth/')) {
      setError(mapFirebaseError(err.code));
    } else {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      await finishLogin();
    } catch (err: any) {
      await handleAuthError(err);
    } finally { setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true); setError('');
    try {
      await signInWithPopup(auth, googleProvider);
      await finishLogin();
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        // user dismissed the popup — no error message needed
      } else {
        await handleAuthError(err);
      }
    } finally { setGoogleLoading(false); }
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

        <form onSubmit={handleEmailLogin}>
          {error && <div className={styles.error}><span>⚠️</span>{error}</div>}

          {/* Google sign-in */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="btn btn-lg"
            style={{ width: '100%', justifyContent: 'center', gap: 10, background: '#fff', color: '#1f2937', border: '1px solid var(--border)', marginBottom: 16 }}
          >
            {googleLoading ? <span className="spinner" /> : (
              <>
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                  <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                  <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                  <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                  <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
                </svg>
                เข้าสู่ระบบด้วย Google
              </>
            )}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            หรือเข้าสู่ระบบด้วยอีเมล
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <div className="form-group">
            <label className="label">อีเมล</label>
            <input suppressHydrationWarning className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="username" />
          </div>
          <div className="form-group">
            <label className="label">รหัสผ่าน</label>
            <input suppressHydrationWarning className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
          </div>

          <button suppressHydrationWarning className="btn btn-primary btn-lg" type="submit" disabled={loading || googleLoading} style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}>
            {loading ? <span className="spinner" /> : '🚀 เข้าสู่ระบบ'}
          </button>
        </form>

        <div className={styles.hint}>
          <p>🔐 สร้างผู้ใช้ใหม่ได้เฉพาะใน Firebase (โดยผู้ดูแล) เท่านั้น</p>
        </div>
      </div>
    </div>
  );
}

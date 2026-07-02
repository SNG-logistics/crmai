'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';
import { useAuthStore } from '../../../../store/auth';

export default function ProfileSettingsPage() {
  const { user: me } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [setupMode, setSetupMode] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const loadProfile = async () => {
    try {
      const r = await api.get('/auth/me');
      setProfile(r.data.user || null);
    } catch {
      toast.error('❌ ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSetup2FA = async () => {
    setLoading(true);
    try {
      const r = await api.post('/auth/2fa/setup');
      setQrCode(r.data.qrCode);
      setSecret(r.data.secret);
      setSetupMode(true);
      toast.success('🔑 สร้างคีย์ 2FA สำเร็จ สแกน QR Code เพื่อเชื่อมต่อ');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาดในการตั้งค่า 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast.error('กรุณากรอกรหัส OTP 6 หลัก');
      return;
    }
    setVerifying(true);
    const tid = toast.loading('กำลังยืนยัน...');
    try {
      await api.post('/auth/2fa/verify', { token: otpCode });
      toast.success('🔒 เปิดใช้งาน Two-Factor Authentication สำเร็จ!', { id: tid });
      setSetupMode(false);
      setQrCode(null);
      setSecret(null);
      setOtpCode('');
      loadProfile();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'รหัสยืนยันไม่ถูกต้อง กรุณาลองใหม่', { id: tid });
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!confirm('คุณต้องการปิดใช้งาน Two-Factor Authentication (2FA) ใช่หรือไม่? ความปลอดภัยของบัญชีจะลดลง')) return;
    setLoading(true);
    const tid = toast.loading('กำลังปิดการใช้งาน...');
    try {
      await api.post('/auth/2fa/disable');
      toast.success('🔓 ปิดใช้งาน 2FA สำเร็จแล้ว', { id: tid });
      loadProfile();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด', { id: tid });
    } finally {
      setLoading(false);
    }
  };

  if (loading || !profile) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>👤 ข้อมูลผู้ใช้ & ความปลอดภัย</h1>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
          จัดการข้อมูลโปรไฟล์ส่วนตัว และตั้งค่าการป้องกันความปลอดภัย 2 ชั้น (2FA)
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Profile Card */}
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            📇 ข้อมูลส่วนตัว (Profile Info)
          </h2>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20 }}>
            <div className="avatar" style={{ width: 64, height: 64, fontSize: '1.8rem' }}>
              {profile.displayName?.[0]}
            </div>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{profile.displayName}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>ตำแหน่ง: {profile.role?.toUpperCase()}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="label">ชื่อผู้ใช้ (Username)</label>
              <input className="input" value={profile.username} disabled style={{ opacity: 0.7 }} />
            </div>
            <div className="form-group">
              <label className="label">อีเมล (Email)</label>
              <input className="input" value={profile.email} disabled style={{ opacity: 0.7 }} />
            </div>
          </div>
        </div>

        {/* Security / 2FA Card */}
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            🔐 ความปลอดภัย 2 ชั้น (Two-Factor Authentication)
          </h2>

          {!profile.twoFactorEnabled && !setupMode && (
            <div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', padding: '14px 16px', borderRadius: 10, marginBottom: 20 }}>
                <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '0.9rem' }}>ระบบป้องกัน 2 ชั้นยังไม่เปิดใช้งาน</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                    เพื่อป้องกันไม่ให้ผู้อื่นเดารหัสผ่านและเข้าสู่ระบบของคุณ แนะนำให้เปิดใช้งาน Two-Factor Authentication (2FA) ผ่านแอปพลิเคชันอย่าง Google Authenticator หรือ Microsoft Authenticator
                  </div>
                </div>
              </div>

              <button className="btn btn-primary" onClick={handleSetup2FA}>
                ➕ เริ่มตั้งค่า 2FA
              </button>
            </div>
          )}

          {setupMode && qrCode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--teal)' }}>
                📱 สแกน QR Code ด้วยแอป Authenticator ของคุณ
              </div>

              <div style={{ background: '#fff', padding: 12, borderRadius: 16, display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                <img src={qrCode} alt="2FA QR Code" style={{ width: 180, height: 180, display: 'block' }} />
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: 420 }}>
                หากสแกนไม่ได้ สามารถพิมพ์คีย์ลงแอปโดยตรง:<br />
                <code style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: 6, fontSize: '0.85rem', color: 'var(--teal)', marginTop: 6, display: 'inline-block', letterSpacing: '0.05em' }}>
                  {secret}
                </code>
              </div>

              <div className="form-group" style={{ maxWidth: 280, width: '100%', marginTop: 8 }}>
                <label className="label">กรอกรหัส OTP 6 หลักที่ได้จากแอป</label>
                <input
                  className="input"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  maxLength={6}
                  style={{ textAlign: 'center', fontSize: '1.4rem', letterSpacing: '0.2em' }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 280 }}>
                <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setSetupMode(false)}>
                  ยกเลิก
                </button>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleVerify2FA} disabled={verifying || otpCode.length !== 6}>
                  {verifying ? '⏳ กำลังยืนยัน...' : '🔓 เปิดใช้งาน'}
                </button>
              </div>
            </div>
          )}

          {profile.twoFactorEnabled && (
            <div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', padding: '14px 16px', borderRadius: 10, marginBottom: 20 }}>
                <span style={{ fontSize: '1.5rem' }}>🛡️</span>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: '0.9rem' }}>เปิดใช้งานระบบป้องกัน 2 ชั้นแล้ว</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                    บัญชีของคุณได้รับการป้องกันอย่างปลอดภัยสูงสุด เมื่อล็อกอินจากหน้าจอหลัก ระบบจะบังคับให้กรอก OTP 6 หลักจากแอปพลิเคชันของคุณเสมอ
                  </div>
                </div>
              </div>

              <button className="btn btn-danger" onClick={handleDisable2FA}>
                🗑️ ปิดการใช้งาน 2FA
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

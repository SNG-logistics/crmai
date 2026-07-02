'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '../../lib/api';

type User = { userId: string; username: string; isAdmin: boolean };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me')
      .then(res => {
        if (res.data.success) {
          setUser(res.data.user);
        } else {
          router.push('/login');
        }
        setLoading(false);
      })
      .catch(() => {
        router.push('/login');
        setLoading(false);
      });
  }, [router]);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      toast.success('ออกจากระบบแล้ว');
      router.push('/login');
    } catch {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#070913' }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  const menu = [
    { href: '/admin/links', label: '🔗 ลิงก์ทั้งหมด', active: pathname === '/admin/links' },
    { href: '/admin/analysis', label: '📊 วิเคราะห์สถิติ', active: pathname === '/admin/analysis' },
    { href: '/admin/latest-clicks', label: '🖱️ ล่าสุดที่คลิก', active: pathname === '/admin/latest-clicks' },
    { href: '/settings', label: '⚙️ ตั้งค่าบัญชี', active: pathname === '/settings' },
  ];

  if (user?.isAdmin) {
    menu.push({ href: '/settings/users', label: '👥 จัดการสมาชิก', active: pathname === '/settings/users' });
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#070913' }}>
      {/* Sidebar */}
      <aside style={{
        width: '260px',
        borderRight: '1px solid rgba(255, 255, 255, 0.05)',
        background: '#0D1122',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '24px 16px',
        flexShrink: 0,
      }}>
        <div>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 12, marginBottom: 32 }}>
            <span style={{ fontSize: '1.8rem' }}>👒</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, background: 'var(--gradient-teal)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>
              lufy.cc
            </span>
          </div>

          {/* Navigation */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {menu.map((item, i) => (
              <Link key={i} href={item.href} style={{
                display: 'block',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: 600,
                color: item.active ? '#05070D' : 'var(--text-secondary)',
                background: item.active ? 'var(--gradient-teal)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
              className={!item.active ? 'btn-ghost' : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Footer profile & Logout */}
        <div style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          paddingTop: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--teal-glow)', color: 'var(--teal)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '0.85rem',
            }}>
              {user?.username[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user?.username}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {user?.isAdmin ? '🛡️ Administrator' : '👤 User Agent'}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={handleLogout} style={{ justifyContent: 'center' }}>
            🚪 ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flexGrow: 1, padding: 32, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/auth';
import { connectSocket, disconnectSocket, useSocket } from '../../lib/socket';

const NAV = [
  { href: '/dashboard',        icon: '🏠', label: 'Dashboard' },
  { href: '/inbox',            icon: '💬', label: 'Inbox' },
  { href: '/telesales',        icon: '📞', label: 'Telesales' },
  { href: '/contacts',         icon: '👥', label: 'ลูกค้า' },
  { href: '/tickets',          icon: '🎟️', label: 'Tickets' },
  { href: '/broadcasts',       icon: '📣', label: 'Broadcast' },
  { href: '/automation',       icon: '⚡', label: 'Automation' },
  { href: '/bot',              icon: '🤖', label: 'AI Bot' },
  { href: '/analytics',        icon: '📊', label: 'Analytics' },
  { href: '/live',             icon: '🔴', label: 'Live Dashboard' },
  { href: '/flex',             icon: '💬', label: 'FLEX Builder' },
  { href: '/settings/import',  icon: '📥', label: 'Import ข้อมูล' },
  { href: '/settings/sms',       icon: '📱', label: 'SMS Gateway' },
  { href: '/settings/whatsapp',  icon: '💚', label: 'WhatsApp' },
  { href: '/settings/users',     icon: '👥', label: 'ทีม' },
  { href: '/settings',         icon: '⚙️', label: 'ตั้งค่า' },
];




export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, tenant, token, logout, loadFromStorage, isLoading } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [onlineStatus, setOnlineStatus] = useState<'online' | 'away'>('online');

  useEffect(() => { loadFromStorage(); }, []);

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace('/login');
    } else if (token) {
      connectSocket(token);
    }
  }, [isLoading, token]);

  // Real-time: new message badge on Inbox nav
  useSocket('new_message', (data: any) => {
    if (data.message?.senderType === 'customer' && !pathname.startsWith('/inbox')) {
      setInboxUnread(prev => prev + 1);
    }
  });

  // Reset unread when visiting inbox
  useEffect(() => {
    if (pathname.startsWith('/inbox')) setInboxUnread(0);
  }, [pathname]);

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 16 }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>กำลังโหลด...</div>
    </div>
  );
  if (!user) return null;

  const handleLogout = () => {
    toast.success('👋 ออกจากระบบแล้ว');
    disconnectSocket();
    logout();
    router.replace('/login');
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <div>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99, backdropFilter: 'blur(4px)' }} />
      )}

      {/* ─── Sidebar ─────────────────────────────────────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, var(--teal), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
              🤖
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2 }}>
                {tenant?.name || 'CRM'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>One-Stop Service</div>
            </div>
          </div>
          {/* Tenant plan badge */}
          <span style={{ fontSize: '0.65rem', padding: '2px 8px', background: 'var(--teal-glow)', color: 'var(--teal)', borderRadius: 10, border: '1px solid rgba(0,212,170,0.2)', marginTop: 8, display: 'inline-block' }}>
            ✨ Starter Plan
          </span>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV.map(({ href, icon, label }) => {
            const active = isActive(href);
            const badge = href === '/inbox' && inboxUnread > 0 ? inboxUnread : 0;
            return (
              <Link
                key={href}
                href={href}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
                style={{ position: 'relative' }}
              >
                <span style={{ fontSize: '1.05rem', position: 'relative' }}>
                  {icon}
                  {href === '/live' && (
                    <span style={{
                      position: 'absolute', top: -2, right: -4,
                      width: 7, height: 7, borderRadius: '50%',
                      background: '#ef4444', display: 'inline-block',
                      animation: 'livePulse 1.5s infinite',
                    }} />
                  )}
                </span>
                <span>{label}</span>
                {badge > 0 && (
                  <span style={{ marginLeft: 'auto', background: 'var(--danger)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.65rem', fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {/* Status selector */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['online', 'away'] as const).map(s => (
              <button key={s} onClick={() => setOnlineStatus(s)}
                style={{ flex: 1, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', background: onlineStatus === s ? 'var(--bg-hover)' : 'transparent', color: onlineStatus === s ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s === 'online' ? 'var(--success)' : 'var(--warning)' }} />
                {s === 'online' ? 'Online' : 'Away'}
              </button>
            ))}
          </div>

          {/* User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
            <div style={{ position: 'relative' }}>
              <div className="avatar avatar-sm">{user.displayName?.[0] || 'U'}</div>
              <div className={`status-dot ${onlineStatus}`} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.displayName}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{user.role}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            🚪 ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* ─── Main content ─────────────────────────────────────────── */}
      <div className="main-layout">
        <header className="topbar">
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setSidebarOpen(true)}
            style={{ marginRight: 8 }}
            id="menu-btn"
          >
            ☰
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="topbar-title" style={{ fontSize: '1rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {NAV.find(n => isActive(n.href))?.icon} {NAV.find(n => isActive(n.href))?.label || 'CRM'}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block', boxShadow: '0 0 6px var(--success)' }} />
              <span style={{ color: 'var(--text-muted)' }}>API Online</span>
            </div>
            <Link href="/settings">
              <div className="avatar" title={user.displayName} style={{ cursor: 'pointer' }}>
                {user.displayName?.[0] || 'U'}
              </div>
            </Link>
          </div>
        </header>

        <main className="page-content animate-fade">
          {children}
        </main>
      </div>
    </div>
  );
}

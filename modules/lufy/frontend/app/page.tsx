'use client';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      background: 'radial-gradient(circle at top right, rgba(0, 212, 170, 0.08), transparent 40%), radial-gradient(circle at bottom left, rgba(0, 136, 255, 0.05), transparent 40%), #070913',
    }}>
      {/* Header */}
      <header style={{
        padding: '24px 0',
        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.8rem' }}>👒</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, background: 'var(--gradient-teal)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>
              lufy.cc
            </span>
          </div>
          <Link href="/login" className="btn btn-primary">
            เข้าสู่ระบบ 🔑
          </Link>
        </div>
      </header>

      {/* Hero Body */}
      <main className="container" style={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        padding: '80px 20px',
      }}>
        <div style={{
          background: 'var(--teal-glow)',
          color: 'var(--teal)',
          padding: '6px 16px',
          borderRadius: '30px',
          fontSize: '0.8rem',
          fontWeight: 600,
          marginBottom: 24,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          border: '1px solid rgba(0, 212, 170, 0.2)',
        }}>
          🚀 Next-Gen URL Shortener & Analytics
        </div>

        <h1 style={{
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
          fontWeight: 800,
          lineHeight: 1.15,
          marginBottom: 20,
          letterSpacing: '-0.03em',
        }}>
          ย่อลิงก์ด่วน พร้อมระบบวิเคราะห์<br />
          <span style={{ background: 'var(--gradient-teal)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ระดับ Enterprise
          </span>
        </h1>

        <p style={{
          fontSize: 'clamp(1rem, 2vw, 1.25rem)',
          color: 'var(--text-secondary)',
          maxWidth: '650px',
          lineHeight: 1.6,
          marginBottom: 40,
        }}>
          lufy.cc ช่วยให้คุณสร้าง Smart Links ยอดนิยมแยกตามอุปกณ์, ทำ A/B Testing ยอดแชร์, และวิเคราะห์ข้อมูลผู้คลิกแบบเรียลไทม์ได้อย่างละเอียด
        </p>

        <div style={{ display: 'flex', gap: 16 }}>
          <Link href="/login" className="btn btn-primary" style={{ padding: '14px 32px', fontSize: '1rem', borderRadius: '12px' }}>
            เริ่มใช้งานฟรี 🚀
          </Link>
          <a href="#features" className="btn btn-secondary" style={{ padding: '14px 28px', fontSize: '1rem', borderRadius: '12px' }}>
            ดูคุณสมบัติ 👁️
          </a>
        </div>

        {/* Feature quick preview mockups */}
        <div id="features" style={{
          marginTop: '100px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 24,
          width: '100%',
        }}>
          {[
            { icon: '🎯', title: 'Smart Targeting', desc: 'แยกปลายทางตามอุปกรณ์ iOS/Android/PC เพื่อประสิทธิภาพสูงสุด' },
            { icon: '🔀', title: 'Traffic Split (A/B Test)', desc: 'กระจายผู้คลิกไปยังลิงก์ต่างๆ ตามสัดส่วนเปอร์เซ็นต์ที่กำหนด' },
            { icon: '📊', title: 'Deep Analytics', desc: 'ข้อมูลละเอียด: ประเทศ, เครือข่าย ISP, ระบบปฏิบัติการ, และอุปกรณ์ของผู้คลิก' },
          ].map((f, i) => (
            <div key={i} className="stat-card" style={{
              textAlign: 'left',
              padding: 28,
              transition: 'border-color 0.2s',
              cursor: 'default',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0, 212, 170, 0.3)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
              <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 10 }}>{f.title}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '30px 0',
        borderTop: '1px solid rgba(255, 255, 255, 0.03)',
        fontSize: '0.85rem',
        color: 'var(--text-muted)',
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>© {new Date().getFullYear()} lufy.cc. All rights reserved.</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/login" style={{ color: 'inherit', textDecoration: 'none' }}>แดชบอร์ด</Link>
            <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>ข้อกำหนด</a>
            <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>นโยบาย</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

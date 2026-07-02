'use client';
import { useState, useEffect, useCallback } from 'react';

// URL ของแอป lufy.cc (frontend) — รันแยกบนพอร์ต 3002
// ตั้งค่าได้ผ่าน NEXT_PUBLIC_LUFY_URL ใน .env.local ของ CRM frontend
const LUFY_URL = process.env.NEXT_PUBLIC_LUFY_URL || 'http://localhost:3002';

export default function LufyModulePage() {
  // ใช้ key เพื่อ force reload iframe เมื่อกดรีเฟรช
  const [reloadKey, setReloadKey] = useState(0);
  // ตรวจว่าเซิร์ฟเวอร์ lufy (3002) ทำงานอยู่ไหม — ถ้าไม่ จะได้แจ้งให้ชัดแทน iframe ที่พัง
  const [status, setStatus] = useState<'checking' | 'up' | 'down'>('checking');

  const checkLufy = useCallback(async () => {
    setStatus('checking');
    try {
      // no-cors: อ่านเนื้อหาไม่ได้ (คนละ origin) แต่ถ้าเซิร์ฟเวอร์ไม่ทำงานจะ reject → รู้ว่า down
      await fetch(LUFY_URL, { mode: 'no-cors', cache: 'no-store' });
      setStatus('up');
    } catch {
      setStatus('down');
    }
  }, []);

  useEffect(() => { checkLufy(); }, [checkLufy, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', gap: 8 }}>
      {/* แถบเครื่องมือเล็ก ๆ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 10,
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>🔗 lufy.cc — ระบบย่อลิงก์ &amp; วิเคราะห์การคลิก</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          (โมดูลแยก — ใช้บัญชี/ฐานข้อมูลของ lufy เอง)
        </span>
        {/* ไฟสถานะการเชื่อมต่อ */}
        <span
          title={status === 'up' ? 'เชื่อมต่อแล้ว' : status === 'down' ? 'เชื่อมต่อไม่ได้' : 'กำลังตรวจสอบ...'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: '0.7rem', fontWeight: 600,
            color: status === 'up' ? 'var(--teal)' : status === 'down' ? 'var(--danger)' : 'var(--text-muted)',
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: status === 'up' ? 'var(--teal)' : status === 'down' ? 'var(--danger)' : 'var(--text-muted)',
          }} />
          {status === 'up' ? 'ออนไลน์' : status === 'down' ? 'ออฟไลน์' : 'กำลังตรวจสอบ'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={reload}
            className="btn btn-ghost btn-sm"
            title="โหลดใหม่"
          >
            🔄 รีเฟรช
          </button>
          <a
            href={LUFY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            title="เปิดแบบเต็มจอในแท็บใหม่"
          >
            ↗ เปิดในแท็บใหม่
          </a>
        </div>
      </div>

      {/* เนื้อหา: iframe เมื่อเชื่อมต่อได้ / การ์ดแจ้งเตือนเมื่อเซิร์ฟเวอร์ไม่ทำงาน */}
      {status === 'down' ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            textAlign: 'center',
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: '#070913',
            padding: 24,
          }}
        >
          <div style={{ fontSize: '3rem' }}>🔌</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>ยังเชื่อมต่อโมดูล lufy.cc ไม่ได้</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 520, lineHeight: 1.7 }}>
            โมดูลนี้เป็นเซิร์ฟเวอร์แยก ต้องเปิดใช้งานก่อนถึงจะแสดงในหน้านี้ได้<br />
            ตรวจว่าเซิร์ฟเวอร์ lufy กำลังรันอยู่ที่ <b>{LUFY_URL}</b> (backend พอร์ต 3001, frontend พอร์ต 3002)
          </div>
          <div style={{
            fontSize: '0.78rem', color: 'var(--text-muted)',
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px', textAlign: 'left', maxWidth: 520,
          }}>
            วิธีเปิด: รัน <code>start.bat</code> ที่โฟลเดอร์ CRM<br />
            หรือเปิดเอง — <code>modules\lufy\backend</code> และ <code>modules\lufy\frontend</code> แล้วสั่ง <code>npm run dev</code>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={reload} className="btn btn-secondary btn-sm">🔄 ลองเชื่อมต่อใหม่</button>
            <a href={LUFY_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">↗ เปิดในแท็บใหม่</a>
          </div>
        </div>
      ) : (
        <iframe
          key={reloadKey}
          src={LUFY_URL}
          title="lufy.cc"
          style={{
            flex: 1,
            width: '100%',
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: '#070913',
          }}
        />
      )}

      {/* หมายเหตุเรื่อง cookie ของ iframe */}
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0, paddingLeft: 4 }}>
        หมายเหตุ: lufy.cc มีระบบล็อกอินแยกของตัวเอง หากเบราว์เซอร์บล็อกคุกกี้ของ iframe
        (third-party cookie) ให้กด “เปิดในแท็บใหม่” เพื่อใช้งานแบบเต็มจอ
      </div>
    </div>
  );
}

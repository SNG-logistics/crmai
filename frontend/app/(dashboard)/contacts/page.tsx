'use client';
import { useEffect, useState } from 'react';
import api from '../../../lib/api';
export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/contacts', { params: { search, limit: 50 } }).then(r => { setContacts(r.data.contacts || []); setLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">👥 ลูกค้าทั้งหมด</h2>
        <input className="input" style={{ width: 280 }} placeholder="🔍 ค้นหาลูกค้า..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>ลูกค้า</th><th>ช่องทาง</th><th>อีเมล / โทรศัพท์</th><th>Lead Score</th><th>อัปเดต</th></tr></thead>
          <tbody>
            {loading ? [...Array(5)].map((_, i) => (
              <tr key={i}><td colSpan={5}><div className="skeleton" style={{ height: 20, borderRadius: 4 }} /></td></tr>
            )) : contacts.map(c => (
              <tr key={c.id}>
                <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="avatar avatar-sm">{c.displayName?.[0]}</div><span style={{ fontWeight: 500 }}>{c.displayName}</span></div></td>
                <td>
                  {c.lineUserId && <span className="badge badge-line" style={{ marginRight: 4 }}>🟢 LINE</span>}
                  {c.telegramId && <span className="badge badge-telegram">🔵 TG</span>}
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{c.email || c.phone || '—'}</td>
                <td><div style={{ display: 'flex', gap: 2 }}>{[...Array(5)].map((_, i) => <span key={i} style={{ color: i < Math.ceil(c.leadScore / 20) ? 'var(--warning)' : 'var(--text-muted)' }}>★</span>)}</div></td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{new Date(c.updatedAt).toLocaleDateString('th-TH')}</td>
              </tr>
            ))}
            {!loading && contacts.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>ไม่พบลูกค้า</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import api from '../../../lib/api';
const STATUSES = ['open', 'in_progress', 'pending', 'resolved', 'closed'];
export default function TicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get('/tickets?limit=50').then(r => { setTickets(r.data.tickets || []); setLoading(false); }); }, []);
  const byStatus = (s: string) => tickets.filter(t => t.status === s);
  const PRIORITY_COLORS: any = { critical: 'var(--danger)', high: 'var(--warning)', medium: 'var(--info)', low: 'var(--success)' };
  return (
    <div>
      <div className="section-header"><h2 className="section-title">🎫 Ticket Management</h2></div>
      {loading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {STATUSES.map(s => (
            <div key={s}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem', textTransform: 'capitalize' }}>{s.replace('_', ' ')}</span>
                <span className="badge badge-open" style={{ fontSize: '0.7rem' }}>{byStatus(s).length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {byStatus(s).map(t => (
                  <div key={t.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, borderLeft: `3px solid ${PRIORITY_COLORS[t.priority] || 'var(--border)'}` }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: 6 }}>{t.title}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="avatar avatar-sm">{t.contact?.displayName?.[0] || '?'}</div>
                      <span style={{ fontSize: '0.7rem', color: PRIORITY_COLORS[t.priority] }}>{t.priority}</span>
                    </div>
                  </div>
                ))}
                {byStatus(s).length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: 20 }}>ว่าง</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

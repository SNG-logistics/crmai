'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../../store/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Lead {
  id: string; telegramId: string; displayName?: string; username?: string;
  consentStatus: string; campaignSource?: string; tags: string[];
  lastActiveAt: string; createdAt: string;
}

const STATUS_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  OPTED_IN:  { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e', label: '✅ Opted In' },
  OPTED_OUT: { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444', label: '❌ Opted Out' },
  BLOCKED:   { bg: 'rgba(156,163,175,0.2)', color: '#9ca3af', label: '🚫 Blocked' },
};

function Badge({ text, color, bg }: any) {
  return (
    <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 10, background: bg, color, fontWeight: 500, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

export default function SlotLeadsPage() {
  const { token } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('OPTED_IN');
  const LIMIT = 25;

  const headers = { Authorization: `Bearer ${token}` };

  const load = async (p = page, status = filterStatus) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
    if (status) params.set('consentStatus', status);
    const r = await fetch(`${API}/api/slot/leads?${params}`, { headers });
    const d = await r.json();
    if (d.success) { setLeads(d.data.leads); setTotal(d.data.total); }
    setLoading(false);
  };

  useEffect(() => { if (token) load(1, filterStatus); }, [token, filterStatus]);

  const handlePageChange = (p: number) => { setPage(p); load(p, filterStatus); };

  const totalPages = Math.ceil(total / LIMIT);

  const TAG_COLOR: Record<string, string> = {
    hot_lead: '#f97316',
    interest_provider_pg: '#22c55e',
    interest_provider_jili: '#3b82f6',
    interest_provider_pragmatic: '#a78bfa',
    interest_provider_joker: '#ec4899',
    promo_interest: '#f59e0b',
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>👥 Slot Leads</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
            ผู้ใช้ที่ opt-in จาก Telegram Bot — {total} คน
          </div>
        </div>
        <a href="/slot" style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.82rem' }}>← Dashboard</a>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { value: 'OPTED_IN', label: '✅ Opted In' },
          { value: 'OPTED_OUT', label: '❌ Opted Out' },
          { value: 'BLOCKED', label: '🚫 Blocked' },
          { value: '', label: '👥 ทั้งหมด' },
        ].map(({ value, label }) => (
          <button key={value} onClick={() => { setFilterStatus(value); setPage(1); }}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer',
              fontSize: '0.78rem', fontWeight: 500, fontFamily: 'inherit',
              background: filterStatus === value ? 'var(--teal)' : 'var(--bg-secondary)',
              color: filterStatus === value ? '#000' : 'var(--text-muted)',
            }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
      ) : (
        <>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                  {['Telegram', 'Username', 'Campaign', 'สถานะ', 'Tags', 'Active ล่าสุด'].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>ไม่พบ leads</td></tr>
                ) : (
                  leads.map((l, i) => {
                    const statusStyle = STATUS_COLOR[l.consentStatus] || STATUS_COLOR.BLOCKED;
                    return (
                      <tr key={l.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 500 }}>{l.displayName || 'ไม่ระบุชื่อ'}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>ID: {l.telegramId}</div>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                          {l.username ? `@${l.username}` : '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {l.campaignSource ? (
                            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 6, color: 'var(--text-muted)' }}>
                              {l.campaignSource}
                            </span>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <Badge text={statusStyle.label} color={statusStyle.color} bg={statusStyle.bg} />
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 200 }}>
                            {l.tags.slice(0, 3).map(tag => (
                              <span key={tag} style={{
                                fontSize: '0.66rem', padding: '1px 6px', borderRadius: 10,
                                background: `${TAG_COLOR[tag] || '#6b7280'}22`,
                                color: TAG_COLOR[tag] || '#6b7280',
                                border: `1px solid ${TAG_COLOR[tag] || '#6b7280'}44`,
                              }}>{tag.replace('interest_provider_', '').replace('interest_game_', 'game:')}</span>
                            ))}
                            {l.tags.length > 3 && (
                              <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>+{l.tags.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                          {new Date(l.lastActiveAt).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}{' '}
                          {new Date(l.lastActiveAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button onClick={() => handlePageChange(page - 1)} disabled={page === 1} className="btn btn-ghost btn-sm">← ก่อนหน้า</button>
              <span style={{ padding: '6px 14px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                หน้า {page} / {totalPages}
              </span>
              <button onClick={() => handlePageChange(page + 1)} disabled={page === totalPages} className="btn btn-ghost btn-sm">ถัดไป →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import toast from 'react-hot-toast';

interface SlipRecord {
  id: string;
  conversationId: string;
  contactId: string;
  status: string;
  verifiedBy: string;
  amount?: number;
  transRef?: string;
  sendingBank?: string;
  receivingBank?: string;
  senderName?: string;
  receiverName?: string;
  aiAmount?: number;
  aiBankFrom?: string;
  aiBankTo?: string;
  aiConfidence?: string;
  aiSuspicious?: boolean;
  aiReason?: string;
  isDuplicate: boolean;
  imageHash: string;
  createdAt: string;
  notes?: string;
}

interface SlipStats {
  total: number;
  verified: number;
  fake: number;
  duplicate: number;
  error: number;
  pending: number;
}

const STATUS_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string }> = {
  verified:  { icon: '✅', label: 'ผ่าน',       color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
  fake:      { icon: '❌', label: 'ไม่ผ่าน',     color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  duplicate: { icon: '⚠️', label: 'ซ้ำ',        color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  not_slip:  { icon: '🖼️', label: 'ไม่ใช่สลิป', color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  error:     { icon: '❗', label: 'ผิดพลาด',     color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  pending:   { icon: '⏳', label: 'รอตรวจ',      color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
};

const VERIFY_MAP: Record<string, string> = {
  slipok: 'SlipOK QR', ai: 'AI Vision', manual: 'Manual', auto: 'Auto',
};

export default function SlipHistoryPage() {
  const [slips, setSlips] = useState<SlipRecord[]>([]);
  const [stats, setStats] = useState<SlipStats | null>(null);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SlipRecord | null>(null);

  const loadSlips = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (filter !== 'all') params.status = filter;
      const r = await api.get('/slips', { params });
      setSlips(r.data.slips || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('โหลดข้อมูลสลิปไม่ได้'); }
    finally { setLoading(false); }
  };

  const loadStats = async () => {
    try {
      const r = await api.get('/slips/stats');
      setStats(r.data);
    } catch {}
  };

  useEffect(() => { loadSlips(); }, [filter, page]);
  useEffect(() => { loadStats(); }, []);

  const overrideStatus = async (id: string, newStatus: string) => {
    const tid = toast.loading('กำลังอัพเดท...');
    try {
      await api.patch(`/slips/${id}`, { status: newStatus });
      toast.success('อัพเดทแล้ว', { id: tid });
      loadSlips();
      loadStats();
      if (detail?.id === id) setDetail({ ...detail, status: newStatus, verifiedBy: 'manual' });
    } catch { toast.error('อัพเดทไม่ได้', { id: tid }); }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ fontSize: '1.5rem' }}>🧾</div>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>ประวัติการตรวจสอบสลิป</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>SlipOK + AI Vision Verification History</p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'ทั้งหมด', value: stats.total, icon: '📊', color: 'var(--text-primary)', bg: 'var(--bg-tertiary)' },
            { label: 'ผ่าน', value: stats.verified, icon: '✅', color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
            { label: 'ไม่ผ่าน', value: stats.fake, icon: '❌', color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
            { label: 'สลิปซ้ำ', value: stats.duplicate, icon: '⚠️', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
            { label: 'รอตรวจ', value: stats.pending, icon: '⏳', color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)' },
            { label: 'ผิดพลาด', value: stats.error, icon: '❗', color: '#6B7280', bg: 'rgba(107,114,128,0.08)' },
          ].map(s => (
            <div key={s.label} style={{
              background: s.bg, borderRadius: 12, padding: '14px 16px',
              border: '1px solid var(--border)', textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'ทั้งหมด', icon: '📋' },
          { key: 'verified', label: 'ผ่าน', icon: '✅' },
          { key: 'fake', label: 'ไม่ผ่าน', icon: '❌' },
          { key: 'duplicate', label: 'ซ้ำ', icon: '⚠️' },
          { key: 'pending', label: 'รอตรวจ', icon: '⏳' },
          { key: 'error', label: 'ผิดพลาด', icon: '❗' },
        ].map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setPage(1); }}
            style={{
              padding: '6px 14px', borderRadius: 20, border: `1px solid ${filter === f.key ? 'var(--teal)' : 'var(--border)'}`,
              background: filter === f.key ? 'rgba(0,212,170,0.1)' : 'transparent',
              color: filter === f.key ? 'var(--teal)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', fontWeight: filter === f.key ? 600 : 400,
              transition: 'all 0.2s',
            }}>
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.72rem' }}>เวลา</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.72rem' }}>สถานะ</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.72rem' }}>จำนวนเงิน</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.72rem' }}>ธนาคาร</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.72rem' }}>ตรวจโดย</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.72rem' }}>Ref</th>
              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.72rem' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} />
              </td></tr>
            )}
            {!loading && slips.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🧾</div>
                ยังไม่มีประวัติการตรวจสอบสลิป
              </td></tr>
            )}
            {slips.map(slip => {
              const sc = STATUS_CONFIG[slip.status] || STATUS_CONFIG.pending;
              const amt = slip.amount || slip.aiAmount;
              const bankFrom = slip.sendingBank || slip.aiBankFrom || '';
              const bankTo = slip.receivingBank || slip.aiBankTo || '';
              return (
                <tr key={slip.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                  onClick={() => setDetail(slip)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                    {new Date(slip.createdAt).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}{' '}
                    {new Date(slip.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 12, background: sc.bg, color: sc.color, fontSize: '0.72rem', fontWeight: 600 }}>
                      {sc.icon} {sc.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {amt ? `฿${Number(amt).toLocaleString()}` : '-'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    {bankFrom || bankTo ? `${bankFrom} → ${bankTo}` : '-'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {VERIFY_MAP[slip.verifiedBy] || slip.verifiedBy}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                    {slip.transRef ? slip.transRef.substring(0, 12) + '...' : '-'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setDetail(slip); }}
                      style={{ fontSize: '0.72rem' }}>
                      🔍 ดู
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← ก่อนหน้า</button>
          <span style={{ padding: '6px 14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            หน้า {page} / {totalPages}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>ถัดไป →</button>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div onClick={() => setDetail(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 520,
            maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--border)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>🧾 รายละเอียดสลิป</h2>
              <button onClick={() => setDetail(null)} style={{
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem',
              }}>✕</button>
            </div>

            {(() => {
              const sc = STATUS_CONFIG[detail.status] || STATUS_CONFIG.pending;
              return (
                <div style={{ padding: '12px 16px', borderRadius: 10, background: sc.bg, marginBottom: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{sc.icon}</div>
                  <div style={{ fontWeight: 700, color: sc.color, fontSize: '1rem' }}>{sc.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    ตรวจโดย: {VERIFY_MAP[detail.verifiedBy] || detail.verifiedBy}
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'จำนวนเงิน', value: detail.amount ? `฿${Number(detail.amount).toLocaleString()}` : '-' },
                { label: 'Ref', value: detail.transRef || '-' },
                { label: 'ธนาคารต้นทาง', value: detail.sendingBank || detail.aiBankFrom || '-' },
                { label: 'ธนาคารปลายทาง', value: detail.receivingBank || detail.aiBankTo || '-' },
                { label: 'ผู้โอน', value: detail.senderName || '-' },
                { label: 'ผู้รับ', value: detail.receiverName || '-' },
                { label: 'AI Confidence', value: detail.aiConfidence || '-' },
                { label: 'AI สงสัย', value: detail.aiSuspicious ? '⚠️ ใช่' : '✅ ไม่' },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {detail.aiReason && (
              <div style={{
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8, padding: '10px 12px', marginBottom: 16,
                fontSize: '0.8rem', color: '#EF4444',
              }}>
                ⚠️ เหตุผล AI: {detail.aiReason}
              </div>
            )}

            {/* Manual Override */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                🔧 Admin Override
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => overrideStatus(detail.id, 'verified')}
                  style={{ flex: 1, justifyContent: 'center', background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.3)' }}>
                  ✅ ผ่าน
                </button>
                <button className="btn btn-sm" onClick={() => overrideStatus(detail.id, 'fake')}
                  style={{ flex: 1, justifyContent: 'center', background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                  ❌ ไม่ผ่าน
                </button>
              </div>
            </div>

            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
              ID: {detail.id} | Hash: {detail.imageHash?.substring(0, 12)}...
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

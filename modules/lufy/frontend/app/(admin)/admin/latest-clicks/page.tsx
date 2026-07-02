'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';

type ClickItem = {
  id: string;
  slug: string;
  ip?: string;
  country?: string;
  os?: string;
  browser?: string;
  device?: string;
  deviceType?: string;
  referrer?: string;
  createdAt: string;
};

type IPDetail = {
  ip: string;
  asn: string;
  asName: string;
  asDomain: string;
  country: string;
  countryCode: string;
  continent: string;
  city: string;
  region: string;
  latitude?: number;
  longitude?: number;
};

export default function LatestClicksPage() {
  const [clicks, setClicks] = useState<ClickItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIP, setSelectedIP] = useState<string | null>(null);
  const [ipDetail, setIpDetail] = useState<IPDetail | null>(null);
  const [loadingIP, setLoadingIP] = useState(false);

  const loadClicks = async () => {
    setLoading(true);
    try {
      const res = await api.get('/clicks', { params: { page, limit: 30 } });
      if (res.data.success) {
        setClicks(res.data.clicks);
        setTotal(res.data.total);
      }
    } catch {
      toast.error('ไม่สามารถโหลดข้อมูลการคลิกได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClicks();
  }, [page]);

  const handleDelete = async (id: string) => {
    if (!confirm('ต้องการลบบันทึกการคลิกนี้ใช่หรือไม่?')) return;
    try {
      await api.delete(`/clicks/${id}`);
      toast.success('ลบข้อมูลสำเร็จ');
      loadClicks();
    } catch {
      toast.error('เกิดข้อผิดพลาดในการลบ');
    }
  };

  const handleIPClick = async (ip: string) => {
    setSelectedIP(ip);
    setLoadingIP(true);
    setIpDetail(null);
    try {
      const res = await api.get(`/clicks/ip-detail/${encodeURIComponent(ip)}`);
      if (res.data.success) {
        setIpDetail(res.data.data);
      }
    } catch {
      toast.error('ไม่สามารถดึงข้อมูล IP ได้');
      setSelectedIP(null);
    } finally {
      setLoadingIP(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>🖱️ ล่าสุดที่คลิก (Latest Clicks)</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>บันทึกข้อมูลการคลิกย้อนหลังทั้งหมดของลิงก์ของคุณแบบเรียลไทม์</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadClicks}>
          🔄 รีเฟรช
        </button>
      </div>

      {/* Clicks Table */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 20 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Short Link</th>
                <th>IP Address</th>
                <th>ประเทศ</th>
                <th>เว็บบราวเซอร์</th>
                <th>ระบบปฏิบัติการ</th>
                <th>อุปกรณ์</th>
                <th>แหล่งที่มา</th>
                <th>เวลาคลิก</th>
                <th style={{ textAlign: 'right' }}>เครื่องมือ</th>
              </tr>
            </thead>
            <tbody>
              {loading && clicks.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 30 }}><span className="spinner" style={{ margin: 'auto' }} /></td>
                </tr>
              )}
              {!loading && clicks.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    ยังไม่มีข้อมูลบันทึกการคลิก
                  </td>
                </tr>
              )}
              {clicks.map(click => (
                <tr key={click.id}>
                  <td><strong style={{ color: 'var(--teal)' }}>/{click.slug}</strong></td>
                  <td>
                    {click.ip ? (
                      <button
                        onClick={() => handleIPClick(click.ip!)}
                        style={{
                          background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 600, cursor: 'pointer',
                          textDecoration: 'underline', fontSize: 'inherit', fontFamily: 'inherit', padding: 0
                        }}
                      >
                        {click.ip}
                      </button>
                    ) : '—'}
                  </td>
                  <td>📍 {click.country || 'Unknown'}</td>
                  <td>🧭 {click.browser || 'Unknown'}</td>
                  <td>💻 {click.os || 'Unknown'}</td>
                  <td>
                    <span style={{
                      fontSize: '0.72rem', padding: '2px 6px', borderRadius: 8,
                      background: click.deviceType === 'mobile' ? '#FFB70322' : 'rgba(255,255,255,0.05)',
                      color: click.deviceType === 'mobile' ? '#FFB703' : 'var(--text-secondary)'
                    }}>
                      {click.deviceType === 'mobile' ? '📱 Mobile' : '💻 Desktop'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 6 }}>
                      {click.device && click.device !== 'Unknown' ? `(${click.device})` : ''}
                    </span>
                  </td>
                  <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    {click.referrer || 'Direct'}
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(click.createdAt).toLocaleString('th-TH')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-danger btn-sm" style={{ padding: 4 }} onClick={() => handleDelete(click.id)}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > 30 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
            ก่อนหน้า
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            หน้า {page} จาก {Math.ceil(total / 30)} (ทั้งหมด {total.toLocaleString()} รายการ)
          </span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / 30)} onClick={() => setPage(page + 1)}>
            ถัดไป
          </button>
        </div>
      )}

      {/* IP Detail Modal */}
      {selectedIP && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedIP(null)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3 className="modal-title">📡 ข้อมูลผู้ให้บริการอินเทอร์เน็ต</h3>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSelectedIP(null)}>✕</button>
            </div>

            {loadingIP ? (
              <div style={{ display: 'flex', padding: '40px 0', justifyContent: 'center' }}>
                <span className="spinner" style={{ width: 28, height: 28 }} />
              </div>
            ) : ipDetail ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.88rem' }}>
                <div><span style={{ color: 'var(--text-muted)' }}>IP Address:</span> <strong>{ipDetail.ip}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>ASN หมายเลขเครือข่าย:</span> <strong style={{ color: 'var(--teal)' }}>{ipDetail.asn}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>ชื่อผู้ให้บริการ (ISP):</span> <strong>{ipDetail.asName}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>โดเมนหน่วยงาน:</span> <strong>{ipDetail.asDomain}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>ประเทศ / ทวีป:</span> <strong>{ipDetail.country} ({ipDetail.continent})</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>เมือง / ภูมิภาค:</span> <strong>{ipDetail.city}, {ipDetail.region}</strong></div>
                {ipDetail.latitude && ipDetail.longitude && (
                  <div><span style={{ color: 'var(--text-muted)' }}>พิกัดดาวเทียม:</span> <strong>{ipDetail.latitude}, {ipDetail.longitude}</strong></div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--danger)' }}>โหลดข้อมูลล้มเหลว</div>
            )}

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedIP(null)}>ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

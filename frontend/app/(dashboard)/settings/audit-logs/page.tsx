'use client';
import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';
import { useAuthStore } from '../../../../store/auth';
import { formatDistanceToNow, format } from 'date-fns';
import { th } from 'date-fns/locale';

export default function AuditLogsPage() {
  const { user: me } = useAuthStore();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);

  const ACTIONS = [
    { value: '', label: 'ทุกกิจกรรม' },
    { value: 'USER_LOGIN', label: 'เข้าสู่ระบบ (USER_LOGIN)' },
    { value: 'USER_CREATE', label: 'สร้างพนักงาน (USER_CREATE)' },
    { value: 'USER_UPDATE', label: 'แก้ไขพนักงาน (USER_UPDATE)' },
    { value: 'USER_DEACTIVATE', label: 'ระงับพนักงาน (USER_DEACTIVATE)' },
    { value: 'CONTACT_CREATE', label: 'เพิ่มสมาชิก (CONTACT_CREATE)' },
    { value: 'CONTACT_UPDATE', label: 'แก้ไขสมาชิก (CONTACT_UPDATE)' },
    { value: 'CONTACT_DELETE', label: 'ลบสมาชิก (CONTACT_DELETE)' },
  ];

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/audit', {
        params: {
          search: search || undefined,
          action: actionFilter || undefined,
          page,
          limit: 30,
        },
      });
      setLogs(r.data.logs || []);
      setTotalLogs(r.data.pagination?.total || 0);
      setTotalPages(r.data.pagination?.pages || 1);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'ไม่สามารถโหลดประวัติการใช้งานได้');
    } finally {
      setLoading(false);
    }
  }, [search, actionFilter, page]);

  useEffect(() => {
    // Only fetch if role has permission
    if (me && ['admin', 'supervisor', 'superadmin'].includes(me.role)) {
      loadLogs();
    }
  }, [loadLogs, me]);

  const getActionColor = (action: string) => {
    if (action.includes('CREATE')) return 'var(--teal)';
    if (action.includes('UPDATE')) return 'var(--purple)';
    if (action.includes('DELETE') || action.includes('DEACTIVATE')) return 'var(--danger)';
    if (action.includes('LOGIN')) return 'var(--success)';
    return 'var(--text-secondary)';
  };

  const formatDetails = (detailsStr: string) => {
    try {
      const parsed = JSON.parse(detailsStr);
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(', ');
    } catch {
      return detailsStr;
    }
  };

  if (!me || !['admin', 'supervisor', 'superadmin'].includes(me.role)) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>
        <h2>⚠️ ปฏิเสธการเข้าถึง</h2>
        <p>คุณไม่มีสิทธิ์เข้าถึงหน้าข้อมูลประวัติการใช้งานระบบนี้</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>📋 ประวัติการใช้งานระบบ (Security Logs)</h1>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
            บันทึกการกระทำที่สำคัญและประวัติการทำรายการของเจ้าหน้าที่ทั้งหมดในระบบ {totalLogs} รายการ
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => loadLogs()}>
          🔄 รีเฟรช
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <input
          className="input"
          placeholder="🔍 ค้นหาประวัติหรือข้อมูลกิจกรรม..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: 300 }}
        />
        <select
          className="input"
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1); }}
          style={{ maxWidth: 260 }}
        >
          {ACTIONS.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>

      {/* Data Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" style={{ width: 40, height: 40 }} />
        </div>
      ) : (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 180 }}>เวลาบันทึก</th>
                  <th style={{ width: 160 }}>เจ้าหน้าที่</th>
                  <th style={{ width: 180 }}>กิจกรรม</th>
                  <th>รายละเอียดข้อมูล</th>
                  <th style={{ width: 140 }}>ไอพี / อุปกรณ์</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                      ไม่พบประวัติการทำกิจกรรม
                    </td>
                  </tr>
                )}
                {logs.map(log => (
                  <tr key={log.id}>
                    <td>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        {format(new Date(log.createdAt), 'dd MMM yyyy, HH:mm:ss', { locale: th })}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {formatDistanceToNow(new Date(log.createdAt), { locale: th, addSuffix: true })}
                      </div>
                    </td>
                    <td>
                      {log.user ? (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{log.user.displayName}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{log.user.role}</div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>ระบบอัตโนมัติ / System</span>
                      )}
                    </td>
                    <td>
                      <span style={{
                        background: getActionColor(log.action) + '15',
                        color: getActionColor(log.action),
                        border: `1px solid ${getActionColor(log.action)}35`,
                        borderRadius: 20,
                        padding: '2px 10px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'inline-block'
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxBreak: 'break-all', wordBreak: 'break-word', lineHeight: 1.5 }}>
                      {formatDetails(log.details)}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{log.ipAddress || '-'}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }} title={log.userAgent}>
                        {log.userAgent || '-'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                แสดงหน้า {page} จาก {totalPages} หน้า
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  ◀ ย้อนกลับ
                </button>
                <button
                  className="btn className btn-secondary btn-sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  ถัดไป ▶
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

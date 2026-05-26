'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SyncLog {
  id: string; type: string; status: string; source: string;
  totalRows: number; inserted: number; updated: number; skipped: number; errors: number;
  errorDetail?: string; filename?: string; startedAt: string; finishedAt?: string; duration?: number;
}
interface Stats { totalContacts: number; totalFinancials: number; lastSync?: SyncLog }

type ImportTab = 'members' | 'transactions' | 'api' | 'logs';
type StepState = 'idle' | 'preview' | 'importing' | 'done' | 'error';

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ s }: { s: string }) {
  const map: any = { done: ['var(--success)', '✅ สำเร็จ'], error: ['var(--danger)', '❌ Error'], running: ['var(--warning)', '⏳ กำลังทำ'] };
  const [color, label] = map[s] || ['var(--text-muted)', s];
  return <span style={{ color, fontWeight: 600, fontSize: '0.78rem' }}>{label}</span>;
}

// ─── formatDuration ───────────────────────────────────────────────────────────
function fmtDur(ms?: number) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Sample CSV Download ──────────────────────────────────────────────────────
function downloadSample(type: 'members' | 'transactions') {
  const members = `username,displayName,phone,email,affiliateCode,memberType,registeredAt,firstDepositAt,totalDeposit,totalWithdraw,depositCount
user001,สมชาย ใจดี,0812345678,somchai@email.com,AFF001,regular,2026-01-15,2026-01-16,15000,8000,12
user002,สมหญิง รักไทย,0898765432,,AFF002,new,2026-05-20,,0,0,0
user003,มานะ ขยัน,0811234567,mana@email.com,AFF001,vip,2025-12-01,2025-12-02,250000,180000,85`;

  const transactions = `username,type,amount,date,gameType
user001,deposit,1000,2026-05-01,slot
user001,deposit,2000,2026-05-03,casino
user001,withdraw,1500,2026-05-05,
user002,deposit,500,2026-05-10,lottery
user003,deposit,5000,2026-05-15,sport`;

  const content = type === 'members' ? members : transactions;
  const filename = type === 'members' ? 'members_sample.csv' : 'transactions_sample.csv';
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast.success(`⬇️ ดาวน์โหลด ${filename}`);
}

// ─── CSV Importer Component ───────────────────────────────────────────────────
function CSVImporter({ type }: { type: 'members' | 'transactions' }) {
  const [step, setStep] = useState<StepState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ columns: string[]; preview: any[]; totalRows: number } | null>(null);
  const [result, setResult] = useState<any>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMembers = type === 'members';

  const handleFile = async (f: File) => {
    if (!f.name.endsWith('.csv')) { toast.error('กรุณาใช้ไฟล์ .csv เท่านั้น'); return; }
    setFile(f);
    const tid = toast.loading('กำลังอ่านไฟล์...');
    try {
      const form = new FormData(); form.append('file', f);
      const r = await api.post('/sync/csv/preview', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(r.data);
      setStep('preview');
      toast.success(`✅ พบ ${r.data.totalRows} แถว`, { id: tid });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'อ่านไฟล์ไม่ได้', { id: tid });
      setStep('idle'); setFile(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  };

  const doImport = async () => {
    if (!file) return;
    setStep('importing');
    const tid = toast.loading('กำลัง Import...');
    try {
      const form = new FormData(); form.append('file', file);
      const endpoint = isMembers ? '/sync/csv/members' : '/sync/csv/transactions';
      const r = await api.post(endpoint, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(r.data);
      setStep('done');
      toast.success(`✅ Import สำเร็จ! เพิ่ม ${r.data.inserted} อัปเดต ${r.data.updated}`, { id: tid });
    } catch (e: any) {
      setStep('error');
      toast.error(e.response?.data?.message || 'Import ไม่สำเร็จ', { id: tid });
    }
  };

  const reset = () => { setStep('idle'); setFile(null); setPreview(null); setResult(null); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontWeight: 700 }}>{isMembers ? '👥 Import สมาชิก' : '💰 Import ธุรกรรม'}</h3>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {isMembers ? 'นำเข้าข้อมูลสมาชิกจาก CSV — สมาชิกซ้ำจะถูกอัปเดตอัตโนมัติ'
                       : 'นำเข้าธุรกรรมฝาก/ถอน — ต้องมีสมาชิกอยู่ในระบบก่อน'}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => downloadSample(type)} style={{ flexShrink: 0 }}>
          ⬇️ ดาวน์โหลด CSV ตัวอย่าง
        </button>
      </div>

      {/* Columns guide */}
      <div style={{ background: 'rgba(0,212,170,0.04)', border: '1px solid rgba(0,212,170,0.15)', borderRadius: 10, padding: '10px 14px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--teal)', marginBottom: 6 }}>📋 คอลัมน์ที่รองรับ</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
          {(isMembers
            ? ['username *', 'displayName', 'phone', 'email', 'affiliateCode', 'memberType', 'registeredAt', 'firstDepositAt', 'totalDeposit', 'totalWithdraw', 'depositCount']
            : ['username *', 'type * (deposit/withdraw)', 'amount *', 'date * (YYYY-MM-DD)', 'gameType']
          ).map(c => (
            <span key={c} style={{ fontSize: '0.72rem', background: 'var(--bg-tertiary)', borderRadius: 4, padding: '2px 7px', border: '1px solid var(--border)', color: c.includes('*') ? 'var(--teal)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Drop Zone */}
      {step === 'idle' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--teal)' : 'var(--border)'}`,
            borderRadius: 14, padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
            background: dragging ? 'rgba(0,212,170,0.04)' : 'var(--bg-tertiary)',
            transition: 'all 0.2s',
          }}>
          <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📂</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>ลากไฟล์ CSV มาวางที่นี่</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>หรือคลิกเพื่อเลือกไฟล์ (.csv, สูงสุด 20MB)</div>
        </div>
      )}

      {/* Preview */}
      {step === 'preview' && preview && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <span style={{ fontWeight: 600 }}>📋 Preview: {file?.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginLeft: 8 }}>({preview.totalRows} แถวทั้งหมด, แสดง 10 แรก)</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={reset}>✕ เริ่มใหม่</button>
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 12 }}>
            <table className="table" style={{ minWidth: 600, fontSize: '0.78rem' }}>
              <thead>
                <tr>{preview.columns.map(c => <th key={c} style={{ whiteSpace: 'nowrap' }}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {preview.preview.map((row, i) => (
                  <tr key={i}>
                    {preview.columns.map(c => (
                      <td key={c} style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row[c] || <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={doImport}>
              ✅ ยืนยัน Import {preview.totalRows} แถว
            </button>
            <button className="btn btn-secondary" onClick={reset}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Importing */}
      {step === 'importing' && (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--bg-tertiary)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 16px' }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>กำลัง Import ข้อมูล...</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>อาจใช้เวลาสักครู่สำหรับข้อมูลจำนวนมาก</div>
        </div>
      )}

      {/* Result */}
      {(step === 'done' || step === 'error') && result && (
        <div>
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: '✅ เพิ่มใหม่',  val: result.inserted, color: 'var(--success)' },
              { label: '🔄 อัปเดต',     val: result.updated,  color: 'var(--teal)' },
              { label: '⏭️ ข้าม',       val: result.skipped,  color: 'var(--warning)' },
              { label: '❌ Error',       val: result.errors,   color: 'var(--danger)' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 12px', textAlign: 'center', border: `1px solid ${s.val > 0 && s.label.includes('❌') ? 'rgba(239,68,68,0.2)' : 'var(--border)'}` }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: s.color }}>{s.val.toLocaleString()}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Error detail */}
          {result.errors > 0 && result.errorDetail && (() => {
            try {
              const errs: string[] = JSON.parse(result.errorDetail);
              return (
                <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>❌ รายการที่ผิดพลาด (แสดงสูงสุด 20 รายการ)</div>
                  {errs.slice(0, 10).map((e, i) => (
                    <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '2px 0', fontFamily: 'monospace' }}>{i + 1}. {e}</div>
                  ))}
                </div>
              );
            } catch { return null; }
          })()}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={reset}>⬆️ Import ไฟล์อื่น</button>
            <button className="btn btn-secondary btn-sm" onClick={() => window.location.href = '/contacts'}>👥 ดูสมาชิก →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── API Tester ───────────────────────────────────────────────────────────────
function APITester() {
  const [payload, setPayload] = useState(JSON.stringify({
    members: [
      { username: 'testuser01', displayName: 'ทดสอบ นามสกุล', phone: '0812345678', affiliateCode: 'AFF001', memberType: 'new', registeredAt: new Date().toISOString() }
    ]
  }, null, 2));
  const [endpoint, setEndpoint] = useState('/sync/members');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    setLoading(true); setResult('');
    try {
      const r = await api.post(endpoint, JSON.parse(payload));
      setResult(JSON.stringify(r.data, null, 2));
    } catch (e: any) {
      setResult(JSON.stringify(e.response?.data || { error: e.message }, null, 2));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h3 style={{ margin: 0, fontWeight: 700 }}>🔌 ทดสอบ API Sync</h3>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          ระบบเกมมหาเฮงสามารถส่งข้อมูลมาได้ที่ endpoint เหล่านี้
        </p>
      </div>

      {/* Endpoint docs */}
      <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {[
          { method: 'POST', path: '/api/sync/members', desc: 'Sync สมาชิก (upsert ตาม username)' },
          { method: 'POST', path: '/api/sync/deposits', desc: 'Sync ยอดฝาก-ถอน (อัปเดต FinancialRecord)' },
          { method: 'GET',  path: '/api/sync/logs',    desc: 'ดูประวัติ sync ทั้งหมด' },
          { method: 'GET',  path: '/api/sync/stats',   desc: 'สรุปจำนวนข้อมูลในระบบ' },
        ].map((ep, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: ep.method === 'POST' ? 'var(--teal)' : 'var(--purple)', background: ep.method === 'POST' ? 'rgba(0,212,170,0.1)' : 'rgba(124,58,237,0.1)', borderRadius: 4, padding: '2px 7px', minWidth: 48, textAlign: 'center' }}>{ep.method}</span>
            <code style={{ fontSize: '0.8rem', color: 'var(--text-primary)', flex: 1 }}>{ep.path}</code>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{ep.desc}</span>
          </div>
        ))}
      </div>

      {/* Auth info */}
      <div style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem' }}>
        <div style={{ fontWeight: 700, color: 'var(--purple)', marginBottom: 6 }}>🔐 Authentication</div>
        <div style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
          ส่ง Header: <code style={{ color: 'var(--teal)' }}>x-api-key: YOUR_KEY</code> และ <code style={{ color: 'var(--teal)' }}>x-tenant-id: YOUR_TENANT_ID</code><br />
          หรือใช้ JWT Token ปกติ: <code style={{ color: 'var(--teal)' }}>Authorization: Bearer TOKEN</code>
        </div>
      </div>

      {/* Tester */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Endpoint</div>
          <select className="input" value={endpoint} onChange={e => setEndpoint(e.target.value)} style={{ marginBottom: 8 }}>
            <option value="/sync/members">POST /sync/members</option>
            <option value="/sync/deposits">POST /sync/deposits</option>
          </select>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Request Body (JSON)</div>
          <textarea className="input" rows={14} value={payload} onChange={e => setPayload(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: '0.75rem', resize: 'vertical', minHeight: 200 }} />
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={send} disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> ส่ง...</> : '🚀 ส่ง Request'}
          </button>
        </div>
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Response</div>
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, minHeight: 280, fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', overflowY: 'auto' }}>
            {loading ? <span style={{ color: 'var(--text-muted)' }}>กำลังรอ...</span>
                     : result || <span style={{ color: 'var(--text-muted)' }}>Response จะแสดงที่นี่</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sync Logs ────────────────────────────────────────────────────────────────
function SyncLogsView() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SyncLog | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get('/sync/logs'); setLogs(r.data.logs || []); }
    catch { toast.error('โหลด Logs ไม่ได้'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const TYPE_LABEL: any = {
    members: '👥 สมาชิก (API)', deposits: '💰 ธุรกรรม (API)',
    csv_members: '👥 สมาชิก (CSV)', csv_transactions: '💰 ธุรกรรม (CSV)',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontWeight: 700 }}>📜 ประวัติการ Sync</h3>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>ดูทุกครั้งที่มีการ import/sync ข้อมูล</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '🔄 รีเฟรช'}
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>}

      {!loading && logs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
          <div>ยังไม่มีประวัติ Sync</div>
        </div>
      )}

      {!loading && logs.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          <table className="table">
            <thead>
              <tr>
                <th>ประเภท</th><th>แหล่งที่มา</th><th>สถานะ</th>
                <th style={{ textAlign: 'right' }}>เพิ่มใหม่</th>
                <th style={{ textAlign: 'right' }}>อัปเดต</th>
                <th style={{ textAlign: 'right' }}>ข้าม</th>
                <th style={{ textAlign: 'right' }}>Error</th>
                <th>ไฟล์</th><th>เวลา</th><th>ใช้เวลา</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ cursor: log.errors > 0 ? 'pointer' : 'default' }}
                  onClick={() => log.errors > 0 && setSelected(log)}>
                  <td><span style={{ fontWeight: 500 }}>{TYPE_LABEL[log.type] || log.type}</span></td>
                  <td><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.source === 'csv' ? '📂 CSV' : '🔌 API'}</span></td>
                  <td><StatusBadge s={log.status} /></td>
                  <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{log.inserted.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: 'var(--teal)' }}>{log.updated.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{log.skipped.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: log.errors > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {log.errors > 0 ? <><span style={{ textDecoration: 'underline' }}>{log.errors}</span> 🔍</> : '0'}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.filename || '-'}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(log.startedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{fmtDur(log.duration || undefined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Error Detail Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-secondary)', borderRadius: 14, padding: 24, maxWidth: 600, width: '90vw', maxHeight: '70vh', overflow: 'auto', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 700 }}>❌ รายการที่ผิดพลาด</div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            {selected.errorDetail && (() => {
              try {
                const errs: string[] = JSON.parse(selected.errorDetail);
                return errs.map((e, i) => (
                  <div key={i} style={{ fontFamily: 'monospace', fontSize: '0.75rem', padding: '4px 8px', marginBottom: 4, background: 'rgba(239,68,68,0.05)', borderRadius: 4, color: 'var(--text-secondary)', borderLeft: '3px solid var(--danger)' }}>
                    {i + 1}. {e}
                  </div>
                ));
              } catch { return <div style={{ color: 'var(--text-muted)' }}>{selected.errorDetail}</div>; }
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ImportPage() {
  const [tab, setTab] = useState<ImportTab>('members');
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.get('/sync/stats').then(r => setStats(r.data.stats)).catch(() => {});
  }, []);

  const TABS = [
    { k: 'members',      l: '👥 Import สมาชิก' },
    { k: 'transactions', l: '💰 Import ธุรกรรม' },
    { k: 'api',          l: '🔌 API Docs & Test' },
    { k: 'logs',         l: '📜 ประวัติ Sync' },
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>📥 นำเข้าข้อมูล (Data Import & Sync)</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
          นำเข้าสมาชิกและธุรกรรมจากระบบเกม ผ่าน CSV หรือ API — ข้อมูลซ้ำจะถูกอัปเดตอัตโนมัติ
        </p>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { icon: '👥', label: 'สมาชิกในระบบ',     val: stats.totalContacts.toLocaleString(), color: 'var(--teal)' },
            { icon: '💰', label: 'ระเบียนธุรกรรม',   val: stats.totalFinancials.toLocaleString(), color: 'var(--purple)' },
            { icon: '🕒', label: 'Sync ล่าสุด',
              val: stats.lastSync ? new Date(stats.lastSync.startedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : 'ยังไม่เคย',
              color: 'var(--warning)' },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: '1.8rem' }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k as ImportTab)}
            style={{ padding: '10px 18px', border: 'none', borderBottom: tab === t.k ? '2px solid var(--teal)' : '2px solid transparent', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: tab === t.k ? 700 : 500, color: tab === t.k ? 'var(--teal)' : 'var(--text-muted)', transition: 'all 0.2s', marginBottom: -1 }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="card" style={{ padding: '24px 28px' }}>
        {tab === 'members'      && <CSVImporter type="members" />}
        {tab === 'transactions' && <CSVImporter type="transactions" />}
        {tab === 'api'          && <APITester />}
        {tab === 'logs'         && <SyncLogsView />}
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';

type TrainingConversation = {
  id: string;
  channel: string;
  status: string;
  createdAt: string;
  lastMessageAt?: string | null;
  contact: { displayName: string };
  company?: { id: string; name: string } | null;
  messages: Array<{ content: string; type: string; senderType: string; createdAt: string }>;
  _count: { messages: number };
};

type Props = {
  companyId: string;
  companyName?: string;
};

const PAGE_SIZE = 50;

function channelLabel(channel: string): string {
  if (channel === 'line') return 'LINE';
  if (channel === 'whatsapp') return 'WhatsApp';
  if (channel === 'telegram') return 'Telegram';
  return channel;
}

async function blobErrorMessage(error: any): Promise<string> {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return parsed.message;
    } catch {
      // Fall through to the regular error message.
    }
  }
  return data?.message || error?.message || 'Export แชทไม่สำเร็จ';
}

export default function ChatTrainingExport({ companyId, companyName }: Props) {
  const [conversations, setConversations] = useState<TrainingConversation[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [format, setFormat] = useState<'jsonl' | 'csv'>('jsonl');
  const [anonymize, setAnonymize] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    channel: 'all',
    status: 'all',
    dateFrom: '',
    dateTo: '',
  });

  const load = useCallback(async (nextPage = 1) => {
    if (!companyId) {
      setConversations([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get('/conversations/training', {
        params: {
          companyId,
          ...filters,
          page: nextPage,
          limit: PAGE_SIZE,
        },
      });
      setConversations(response.data.conversations || []);
      setTotal(Number(response.data.total) || 0);
      setPage(nextPage);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'โหลดรายการแชทไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [companyId, filters]);

  useEffect(() => {
    setSelected(new Set());
    load(1);
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentIds = useMemo(() => conversations.map(row => row.id), [conversations]);
  const allCurrentSelected = currentIds.length > 0 && currentIds.every(id => selected.has(id));
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggle = (id: string) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 200) next.add(id);
      return next;
    });
  };

  const toggleCurrentPage = () => {
    setSelected(current => {
      const next = new Set(current);
      if (allCurrentSelected) currentIds.forEach(id => next.delete(id));
      else currentIds.forEach(id => {
        if (next.size < 200) next.add(id);
      });
      return next;
    });
  };

  const exportSelected = async () => {
    if (!selected.size) return toast.error('กรุณาเลือกแชทอย่างน้อย 1 รายการ');
    setExporting(true);
    const toastId = toast.loading('กำลังสร้างชุดข้อมูลจากแชทที่เลือก...');
    try {
      const response = await api.post('/conversations/export', {
        conversationIds: Array.from(selected),
        format,
        anonymize,
      }, {
        responseType: 'blob',
        timeout: 180000,
      });
      const disposition = String(response.headers['content-disposition'] || '');
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const fileName = match?.[1] || `crm-ai-training.${format}`;
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`Export ${selected.size.toLocaleString()} แชทสำเร็จ`, { id: toastId });
    } catch (error: any) {
      toast.error(await blobErrorMessage(error), { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div id="chat-training-export" className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem' }}>🧠 เลือก Export แชทสำหรับ Train AI</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.6, marginTop: 4 }}>
            เลือกเฉพาะบทสนทนาที่คำตอบถูกต้องของ {companyName || 'บริษัทนี้'} • JSONL เหมาะกับชุดข้อมูลแชทสำหรับ Fine-tuning และ CSV เหมาะกับตรวจ/แก้ข้อมูล
          </div>
        </div>
        <span className="tag" style={{ whiteSpace: 'nowrap' }}>เลือกแล้ว {selected.size.toLocaleString()} แชท</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) repeat(4, minmax(110px, auto))', gap: 8, alignItems: 'end', marginBottom: 12 }}>
        <div>
          <label className="label">ค้นหาชื่อลูกค้า</label>
          <input
            className="input"
            value={filters.search}
            onChange={event => setFilters(current => ({ ...current, search: event.target.value }))}
            onKeyDown={event => event.key === 'Enter' && load(1)}
            placeholder="พิมพ์ชื่อ..."
          />
        </div>
        <div>
          <label className="label">ช่องทาง</label>
          <select className="input" value={filters.channel} onChange={event => setFilters(current => ({ ...current, channel: event.target.value }))}>
            <option value="all">ทุกช่องทาง</option>
            <option value="line">LINE</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
          </select>
        </div>
        <div>
          <label className="label">สถานะ</label>
          <select className="input" value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}>
            <option value="all">ทุกสถานะ</option>
            <option value="open">Open</option>
            <option value="bot">Bot</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div>
          <label className="label">ตั้งแต่วันที่</label>
          <input className="input" type="date" value={filters.dateFrom} onChange={event => setFilters(current => ({ ...current, dateFrom: event.target.value }))} />
        </div>
        <div>
          <label className="label">ถึงวันที่</label>
          <input className="input" type="date" value={filters.dateTo} onChange={event => setFilters(current => ({ ...current, dateTo: event.target.value }))} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => load(1)} disabled={loading}>🔎 กรองรายการ</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} disabled={!selected.size}>ล้างที่เลือก</button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>ทั้งหมด {total.toLocaleString()} แชท</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select className="input" value={format} onChange={event => setFormat(event.target.value as 'jsonl' | 'csv')} style={{ width: 140 }}>
            <option value="jsonl">JSONL (Train)</option>
            <option value="csv">CSV (ตรวจข้อมูล)</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={anonymize} onChange={event => setAnonymize(event.target.checked)} />
            ปิดบังชื่อ/เบอร์/อีเมล
          </label>
          <button className="btn btn-primary" onClick={exportSelected} disabled={exporting || !selected.size}>
            {exporting ? <span className="spinner" style={{ width: 15, height: 15 }} /> : '⬇️'} Export {selected.size || ''} แชท
          </button>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '34px minmax(140px, 1.2fr) 90px 90px 85px minmax(180px, 2fr) 145px', gap: 8, alignItems: 'center', padding: '9px 12px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={allCurrentSelected} onChange={toggleCurrentPage} aria-label="เลือกทั้งหมดในหน้านี้" />
          <span>ลูกค้า</span>
          <span>ช่องทาง</span>
          <span>สถานะ</span>
          <span>ข้อความ</span>
          <span>ข้อความล่าสุด</span>
          <span>อัปเดตล่าสุด</span>
        </div>

        {conversations.map(conversation => {
          const latest = conversation.messages[0];
          return (
            <label
              key={conversation.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '34px minmax(140px, 1.2fr) 90px 90px 85px minmax(180px, 2fr) 145px',
                gap: 8,
                alignItems: 'center',
                padding: '10px 12px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: selected.has(conversation.id) ? 'rgba(0,212,170,0.06)' : 'var(--bg-secondary)',
                fontSize: '0.76rem',
              }}
            >
              <input type="checkbox" checked={selected.has(conversation.id)} onChange={() => toggle(conversation.id)} />
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 650 }}>{conversation.contact.displayName}</span>
              <span>{channelLabel(conversation.channel)}</span>
              <span className="tag" style={{ width: 'fit-content' }}>{conversation.status}</span>
              <span>{conversation._count.messages.toLocaleString()}</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                {latest?.content || `[${latest?.type || 'ไม่มีข้อความ'}]`}
              </span>
              <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleString('th-TH') : '-'}
              </span>
            </label>
          );
        })}

        {!loading && conversations.length === 0 && (
          <div style={{ padding: 26, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>ไม่พบแชทตามตัวกรอง</div>
        )}
        {loading && <div style={{ padding: 22, textAlign: 'center' }}><span className="spinner" style={{ width: 22, height: 22 }} /></div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12 }}>
        <button className="btn btn-secondary btn-sm" disabled={loading || page <= 1} onClick={() => load(page - 1)}>ก่อนหน้า</button>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>หน้า {page.toLocaleString()} / {pageCount.toLocaleString()}</span>
        <button className="btn btn-secondary btn-sm" disabled={loading || page >= pageCount} onClick={() => load(page + 1)}>ถัดไป</button>
      </div>

      <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: '0.69rem', lineHeight: 1.55 }}>
        ควรตรวจคำตอบก่อนนำไป Train และเปิด “ปิดบังชื่อ/เบอร์/อีเมล” ไว้เสมอเมื่อส่งข้อมูลออกนอกระบบ CRM
      </div>
    </div>
  );
}

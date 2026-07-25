'use client';

import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';

type KnowledgeItem = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sourceText?: string | null;
  isActive: boolean;
  createdAt: string;
};

type Props = {
  companyId: string;
  companyName?: string;
};

const ACCEPT = '.csv,.xlsx,.txt,.md,.markdown,.json,.pdf,.docx,.log,.html,.htm,.xml,.yaml,.yml';
const ALLOWED_EXTENSIONS = new Set(ACCEPT.split(','));
const PAGE_SIZE = 20;

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLocaleLowerCase() : '';
}

export default function KnowledgeFileManager({ companyId, companyName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState('เอกสาร');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busyId, setBusyId] = useState('');

  const loadItems = useCallback(async (nextPage = 1, reset = true) => {
    if (!companyId) {
      setItems([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get('/bot/knowledge', {
        params: { companyId, sourceType: 'document', page: nextPage, limit: PAGE_SIZE },
      });
      const nextItems: KnowledgeItem[] = response.data.items || [];
      setItems(current => reset ? nextItems : [...current, ...nextItems]);
      setTotal(Number(response.data.total) || 0);
      setHasMore(Boolean(response.data.hasMore));
      setPage(nextPage);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'โหลดความรู้จากไฟล์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setFiles([]);
    loadItems(1, true);
  }, [companyId, loadItems]);

  const addFiles = (incoming: File[]) => {
    const accepted: File[] = [];
    for (const file of incoming) {
      if (!ALLOWED_EXTENSIONS.has(extensionOf(file.name))) {
        toast.error(`ไม่รองรับไฟล์ ${file.name}`);
        continue;
      }
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} มีขนาดเกิน 25 MB`);
        continue;
      }
      accepted.push(file);
    }
    setFiles(current => {
      const combined = [...current];
      for (const file of accepted) {
        if (!combined.some(row => row.name === file.name && row.size === file.size)) combined.push(file);
      }
      if (combined.length > 20) toast.error('อัปโหลดได้ครั้งละไม่เกิน 20 ไฟล์');
      return combined.slice(0, 20);
    });
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files || []));
  };

  const upload = async () => {
    if (!companyId) return toast.error('กรุณาเลือกบริษัท');
    if (!files.length) return toast.error('กรุณาเลือกไฟล์ความรู้');

    const formData = new FormData();
    formData.append('companyId', companyId);
    formData.append('category', category.trim() || 'เอกสาร');
    files.forEach(file => formData.append('files', file));

    setUploading(true);
    const toastId = toast.loading('กำลังอ่านไฟล์และเพิ่มความรู้ให้ AI...');
    try {
      const response = await api.post('/bot/knowledge/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      });
      const imported = Number(response.data.imported) || 0;
      const failed = response.data.failures?.length || 0;
      setFiles([]);
      await loadItems(1, true);
      toast.success(
        `เพิ่มความรู้ ${imported.toLocaleString()} รายการ${failed ? ` • อ่านไม่ได้ ${failed} ไฟล์` : ''}`,
        { id: toastId, duration: 6000 },
      );
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'อ่านและนำเข้าไฟล์ไม่สำเร็จ', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const toggleItem = async (item: KnowledgeItem) => {
    setBusyId(item.id);
    try {
      const response = await api.put(
        `/bot/knowledge/${item.id}`,
        { isActive: !item.isActive },
        { params: { companyId } },
      );
      setItems(current => current.map(row => row.id === item.id ? response.data.item : row));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เปลี่ยนสถานะไม่สำเร็จ');
    } finally {
      setBusyId('');
    }
  };

  const deleteItem = async (item: KnowledgeItem) => {
    if (!window.confirm(`ลบความรู้ “${item.question}” ใช่ไหม?`)) return;
    setBusyId(item.id);
    try {
      await api.delete(`/bot/knowledge/${item.id}`, { params: { companyId } });
      setItems(current => current.filter(row => row.id !== item.id));
      setTotal(current => Math.max(0, current - 1));
      toast.success('ลบความรู้แล้ว');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'ลบความรู้ไม่สำเร็จ');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem' }}>📚 อัปโหลดไฟล์เข้าคลังความรู้</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.6, marginTop: 4 }}>
            CSV/XLSX ที่มีคอลัมน์ question–answer จะสร้าง Q&A อัตโนมัติ ส่วนเอกสารจะถูกแบ่งเป็นช่วงเพื่อให้ AI ของ {companyName || 'บริษัทนี้'} ค้นหาได้ตรงคำถาม
          </div>
        </div>
        <span className="tag" style={{ whiteSpace: 'nowrap' }}>{total.toLocaleString()} รายการ</span>
      </div>

      <input ref={inputRef} type="file" accept={ACCEPT} multiple onChange={onFileChange} style={{ display: 'none' }} />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          minHeight: 130,
          border: `1px dashed ${dragging ? 'var(--teal)' : 'var(--border)'}`,
          borderRadius: 12,
          background: dragging ? 'rgba(0,212,170,0.07)' : 'var(--bg-tertiary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 18,
        }}
      >
        <div>
          <div style={{ fontSize: '2rem', marginBottom: 6 }}>📎</div>
          <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>กดเลือกหรือลากไฟล์มาวาง (สูงสุด 20 ไฟล์)</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 5 }}>
            CSV, XLSX, TXT, MD, JSON, PDF, DOCX, HTML, XML, YAML • ไม่เกิน 25 MB/ไฟล์
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map((file, index) => (
            <div key={`${file.name}-${file.size}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', fontSize: '0.76rem' }}>
              <span>📄</span>
              <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
              <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={event => { event.stopPropagation(); setFiles(current => current.filter((_, rowIndex) => rowIndex !== index)); }}
              >
                เอาออก
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) auto', alignItems: 'end', gap: 10, marginTop: 14 }}>
        <div>
          <label className="label">หมวดหมู่</label>
          <input className="input" value={category} onChange={event => setCategory(event.target.value)} placeholder="เช่น คู่มือ, โปรโมชั่น, FAQ" />
        </div>
        <button className="btn btn-primary" onClick={upload} disabled={uploading || !files.length} style={{ minHeight: 42, justifyContent: 'center' }}>
          {uploading ? <span className="spinner" style={{ width: 15, height: 15 }} /> : '⬆️'} นำเข้าและใช้ตอบลูกค้า
        </button>
      </div>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <div key={item.id} style={{ border: '1px solid var(--border)', background: 'var(--bg-tertiary)', borderRadius: 10, padding: 12, opacity: item.isActive ? 1 : 0.58 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 750, fontSize: '0.84rem' }}>📄 {item.question}</span>
                  <span className="tag">{item.category}</span>
                  {!item.isActive && <span className="tag" style={{ color: '#F59E0B' }}>พักใช้งาน</span>}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.5, marginTop: 6, whiteSpace: 'pre-wrap', maxHeight: 64, overflow: 'hidden' }}>
                  {item.answer}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.67rem', marginTop: 6 }}>
                  {item.sourceText} • {new Date(item.createdAt).toLocaleString('th-TH')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-secondary btn-sm" disabled={busyId === item.id} onClick={() => toggleItem(item)}>
                  {item.isActive ? 'พักใช้' : 'เปิดใช้'}
                </button>
                <button className="btn btn-danger btn-sm" disabled={busyId === item.id} onClick={() => deleteItem(item)}>ลบ</button>
              </div>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && (
          <div style={{ padding: 22, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 10, fontSize: '0.8rem' }}>
            ยังไม่มีความรู้จากไฟล์
          </div>
        )}
        {loading && <div style={{ textAlign: 'center', padding: 12 }}><span className="spinner" style={{ width: 22, height: 22 }} /></div>}
        {hasMore && !loading && (
          <button className="btn btn-secondary" onClick={() => loadItems(page + 1, false)} style={{ alignSelf: 'center' }}>
            แสดงเพิ่ม ({Math.max(0, total - items.length).toLocaleString()} รายการ)
          </button>
        )}
      </div>
    </div>
  );
}

'use client';

import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';

type VisualKnowledgeItem = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sourceType: string;
  sourceText?: string | null;
  imageUrl?: string | null;
  imagePreviewUrl?: string | null;
  imageAnalysis?: string | null;
  sendImage: boolean;
  isActive: boolean;
  createdAt: string;
};

type Props = {
  companyId: string;
  companyName?: string;
  channel: 'line' | 'whatsapp';
};

const PAGE_SIZE = 20;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function VisualKnowledgeManager({ companyId, companyName, channel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<VisualKnowledgeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [category, setCategory] = useState('ข้อมูลจากรูป');
  const [sendImage, setSendImage] = useState(true);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const loadPage = useCallback(async (nextPage: number, reset: boolean) => {
    if (!companyId) {
      setItems([]);
      setTotal(0);
      setHasMore(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get('/bot/knowledge', {
        params: {
          companyId,
          channel,
          sourceType: 'visual',
          page: nextPage,
          limit: PAGE_SIZE,
        },
      });
      const nextItems: VisualKnowledgeItem[] = response.data.items || [];
      setItems(current => reset ? nextItems : [...current, ...nextItems]);
      setTotal(Number(response.data.total) || 0);
      setHasMore(Boolean(response.data.hasMore));
      setPage(nextPage);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'โหลดความรู้จากรูปไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [companyId, channel]);

  useEffect(() => {
    setItems([]);
    setTotal(0);
    setPage(1);
    setFile(null);
    setSourceText('');
    loadPage(1, true);
  }, [companyId, channel, loadPage]);

  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (!ACCEPTED_TYPES.includes(nextFile.type)) {
      toast.error('รองรับเฉพาะรูป JPG, PNG และ WEBP');
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      toast.error('รูปต้องมีขนาดไม่เกิน 10 MB');
      return;
    }
    setFile(nextFile);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    chooseFile(event.target.files?.[0]);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  };

  const clearFile = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const addKnowledge = async () => {
    if (!companyId) {
      toast.error('กรุณาเลือกบริษัท');
      return;
    }
    if (!file && !sourceText.trim()) {
      toast.error('กรุณาแนบรูปหรือใส่ข้อความความรู้');
      return;
    }
    const formData = new FormData();
    formData.append('companyId', companyId);
    formData.append('channel', channel);
    formData.append('sourceText', sourceText.trim());
    formData.append('category', category.trim() || 'ข้อมูลจากรูป');
    formData.append('sendImage', String(sendImage));
    if (file) formData.append('image', file);

    setSaving(true);
    const toastId = toast.loading(file ? 'AI กำลังอ่านรูปและสร้างฐานความรู้...' : 'กำลังบันทึกความรู้...');
    try {
      const response = await api.post('/bot/knowledge/visual', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      setItems(current => [response.data.item, ...current]);
      setTotal(current => current + 1);
      setSourceText('');
      setSendImage(true);
      clearFile();
      toast.success(`เพิ่มความรู้ให้ AI ${channel === 'whatsapp' ? 'WhatsApp' : 'LINE'} สำเร็จ ✅`, { id: toastId });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'วิเคราะห์และบันทึกความรู้ไม่สำเร็จ', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = async (item: VisualKnowledgeItem) => {
    setBusyId(item.id);
    try {
      const response = await api.put(
        `/bot/knowledge/${item.id}`,
        { isActive: !item.isActive },
        { params: { companyId, channel } },
      );
      setItems(current => current.map(row => row.id === item.id ? response.data.item : row));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เปลี่ยนสถานะไม่สำเร็จ');
    } finally {
      setBusyId('');
    }
  };

  const toggleSendImage = async (item: VisualKnowledgeItem) => {
    setBusyId(item.id);
    try {
      const response = await api.put(
        `/bot/knowledge/${item.id}`,
        { sendImage: !item.sendImage },
        { params: { companyId, channel } },
      );
      setItems(current => current.map(row => row.id === item.id ? response.data.item : row));
      toast.success(response.data.item.sendImage ? 'เปิดส่งรูปพร้อมคำตอบแล้ว' : 'ปิดการส่งรูปแล้ว');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เปลี่ยนการตั้งค่าส่งรูปไม่สำเร็จ');
    } finally {
      setBusyId('');
    }
  };

  const deleteItem = async (item: VisualKnowledgeItem) => {
    if (!window.confirm(`ลบความรู้ “${item.question}” ใช่ไหม? รูปต้นฉบับจะถูกลบด้วย`)) return;
    setBusyId(item.id);
    try {
      await api.delete(`/bot/knowledge/${item.id}`, { params: { companyId, channel } });
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem' }}>🖼️ ความรู้จากรูป + ข้อความ</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.6, marginTop: 4 }}>
            AI จะอ่านตัวหนังสือและข้อเท็จจริงในรูป แล้วใช้ตอบลูกค้าของ {companyName || 'บริษัทนี้'} เฉพาะ {channel === 'whatsapp' ? 'WhatsApp' : 'LINE'}
          </div>
        </div>
        <span className="tag" style={{ whiteSpace: 'nowrap' }}>{total.toLocaleString()} รายการ · เพิ่มได้ไม่จำกัด</span>
      </div>

      <div style={{ padding: 16, borderRadius: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', marginBottom: 18 }}>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} style={{ display: 'none' }} />
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            minHeight: 150,
            border: `1px dashed ${dragging ? 'var(--teal)' : 'var(--border)'}`,
            borderRadius: 10,
            background: dragging ? 'rgba(0,212,170,0.07)' : 'var(--bg-secondary)',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 12,
            overflow: 'hidden',
          }}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="ตัวอย่างรูปความรู้" style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 8 }} />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 6 }}>📎</div>
              <div style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.86rem' }}>กดเลือกหรือลากรูปมาวาง</div>
              <div style={{ fontSize: '0.7rem', marginTop: 4 }}>JPG, PNG, WEBP · ไม่เกิน 10 MB</div>
            </div>
          )}
        </div>
        {file && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginTop: 8, fontSize: '0.74rem' }}>
            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={event => { event.stopPropagation(); clearFile(); }}>เอารูปออก</button>
          </div>
        )}

        <div className="form-group" style={{ marginTop: 14, marginBottom: 10 }}>
          <label className="label">ข้อความกำกับ / สิ่งที่ต้องการให้ AI เรียนรู้</label>
          <textarea
            className="input"
            rows={5}
            value={sourceText}
            onChange={event => setSourceText(event.target.value)}
            placeholder={'เช่น รูปนี้เป็นโปรโมชั่นสมาชิกใหม่ ใช้ได้วันที่... เงื่อนไข... เมื่อลูกค้าถามให้ตอบว่า...\nAI จะใช้ข้อความนี้ร่วมกับข้อมูลที่อ่านได้จากรูป โดยไม่แต่งข้อมูลเพิ่ม'}
            style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) auto', gap: 10, alignItems: 'end' }}>
          <div>
            <label className="label">หมวดหมู่</label>
            <input className="input" value={category} onChange={event => setCategory(event.target.value)} placeholder="เช่น โปรโมชั่น, วิธีสมัคร" />
          </div>
          <button className="btn btn-primary" onClick={addKnowledge} disabled={saving || (!file && !sourceText.trim())} style={{ minHeight: 42, justifyContent: 'center' }}>
            {saving ? <span className="spinner" style={{ width: 15, height: 15 }} /> : '✨'} {file ? 'วิเคราะห์รูปและเพิ่มความรู้' : 'เพิ่มความรู้ข้อความ'}
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, cursor: file ? 'pointer' : 'default', color: file ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: '0.76rem' }}>
          <input type="checkbox" checked={sendImage} disabled={!file} onChange={event => setSendImage(event.target.checked)} />
          เมื่อตรงกับคำถามลูกค้า ให้ส่งรูปนี้พร้อมข้อความตอบผ่าน LINE และ WhatsApp
        </label>
        <div style={{ marginTop: 9, color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: 1.55 }}>
          ระบบเก็บรายการได้ไม่จำกัด แต่เวลาตอบจะค้นและส่งเข้า AI เฉพาะข้อมูลที่เกี่ยวข้อง เพื่อให้ตอบเร็วและไม่สับสน
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', gap: 12, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', borderRadius: 12, padding: 12, opacity: item.isActive ? 1 : 0.58 }}>
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.question} style={{ width: 96, height: 82, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 96, height: 82, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>📝</div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 750, fontSize: '0.87rem' }}>{item.question}</div>
                <span className="tag">{item.category}</span>
                {!item.isActive && <span className="tag" style={{ color: '#F59E0B' }}>พักการใช้งาน</span>}
                {item.imageUrl && item.sendImage && <span className="tag" style={{ color: 'var(--teal)' }}>ส่งรูปพร้อมคำตอบ</span>}
              </div>
              {item.sourceText && (
                <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontSize: '0.76rem', lineHeight: 1.5, marginTop: 6 }}>
                  {item.sourceText}
                </div>
              )}
              {item.imageAnalysis && (
                <details style={{ marginTop: 7 }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--teal)', fontSize: '0.72rem' }}>ดูข้อมูลที่ AI อ่านจากรูป</summary>
                  <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.55, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {item.imageAnalysis}
                  </div>
                </details>
              )}
              <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 7 }}>
                เพิ่มเมื่อ {new Date(item.createdAt).toLocaleString('th-TH')}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button className="btn btn-secondary btn-sm" disabled={busyId === item.id} onClick={() => toggleItem(item)}>
                {item.isActive ? 'พักใช้' : 'เปิดใช้'}
              </button>
              {item.imageUrl && (
                <button className="btn btn-secondary btn-sm" disabled={busyId === item.id} onClick={() => toggleSendImage(item)}>
                  {item.sendImage ? 'ปิดส่งรูป' : 'เปิดส่งรูป'}
                </button>
              )}
              <button className="btn btn-danger btn-sm" disabled={busyId === item.id} onClick={() => deleteItem(item)}>ลบ</button>
            </div>
          </div>
        ))}

        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12, fontSize: '0.82rem' }}>
            ยังไม่มีความรู้จากรูป — แนบรูปและใส่ข้อความด้านบนเพื่อเริ่มสอน AI
          </div>
        )}
        {loading && <div style={{ textAlign: 'center', padding: 14 }}><span className="spinner" style={{ width: 22, height: 22 }} /></div>}
        {hasMore && !loading && (
          <button className="btn btn-secondary" onClick={() => loadPage(page + 1, false)} style={{ alignSelf: 'center', justifyContent: 'center' }}>
            แสดงเพิ่ม ({Math.max(0, total - items.length).toLocaleString()} รายการ)
          </button>
        )}
      </div>
    </div>
  );
}

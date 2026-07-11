'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../lib/api';

type QuickReply = {
  id: string;
  trigger: string;
  title: string;
  content: string;
  category: string;
  aiCompose: boolean;
  isActive: boolean;
};

const EMPTY = { trigger: '', title: '', content: '', category: 'ทั่วไป', aiCompose: true };

export default function QuickRepliesPage() {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = () => {
    api.get('/quick-replies')
      .then(r => setItems(r.data.items || []))
      .catch(() => toast.error('โหลด key ลัดไม่สำเร็จ'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const resetForm = () => { setForm(EMPTY); setEditId(null); };

  const save = async () => {
    if (!form.trigger.trim() || !form.title.trim() || !form.content.trim()) {
      toast.error('กรอก key ลัด, ชื่อ และเนื้อหาให้ครบก่อนนะ'); return;
    }
    setSaving(true);
    try {
      if (editId) {
        const r = await api.patch(`/quick-replies/${editId}`, form);
        setItems(prev => prev.map(i => i.id === editId ? r.data.item : i));
        toast.success('แก้ไขสำเร็จ ✅');
      } else {
        const r = await api.post('/quick-replies', form);
        setItems(prev => [...prev, r.data.item]);
        toast.success('เพิ่ม key ลัดสำเร็จ ✅');
      }
      resetForm();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const startEdit = (i: QuickReply) => {
    setEditId(i.id);
    setForm({ trigger: i.trigger, title: i.title, content: i.content, category: i.category, aiCompose: i.aiCompose });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (id: string) => {
    if (!confirm('ลบ key ลัดนี้?')) return;
    try {
      await api.delete(`/quick-replies/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      if (editId === id) resetForm();
      toast.success('ลบแล้ว');
    } catch { toast.error('ลบไม่สำเร็จ'); }
  };

  const toggleActive = async (i: QuickReply) => {
    try {
      const r = await api.patch(`/quick-replies/${i.id}`, { isActive: !i.isActive });
      setItems(prev => prev.map(x => x.id === i.id ? r.data.item : x));
    } catch { toast.error('อัปเดตไม่สำเร็จ'); }
  };

  const filtered = items.filter(i =>
    !search.trim() ||
    i.trigger.includes(search.toLowerCase()) ||
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.content.toLowerCase().includes(search.toLowerCase())
  );

  const byCategory: Record<string, QuickReply[]> = {};
  filtered.forEach(i => { (byCategory[i.category] ||= []).push(i); });

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div className="section-header">
        <div>
          <div className="section-title">⚡ Key ลัด (AI Quick Reply)</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
            พิมพ์ key ลัดในช่องแชท (เช่น /deposit) → AI จะเอาเนื้อหาที่บันทึกไว้มาแต่งเป็นคำตอบให้เข้ากับคำถามลูกค้า แล้วใส่ในช่องพิมพ์ให้ตรวจก่อนส่ง
          </div>
        </div>
      </div>

      {/* ─── Add / Edit form ─── */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>{editId ? '✏️ แก้ไข key ลัด' : '➕ เพิ่ม key ลัดใหม่'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 160px', gap: 10, marginBottom: 10 }}>
          <input className="input" placeholder="key ลัด เช่น /deposit"
            value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value })} />
          <input className="input" placeholder="ชื่อเรื่อง เช่น วิธีฝากเงิน"
            value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder="หมวดหมู่"
            value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
        </div>
        <textarea className="input" rows={4}
          placeholder={'เนื้อหา/ข้อมูลที่ให้ AI ใช้แต่งคำตอบ เช่น\nขั้นตอนฝากเงิน: 1) โอนเข้าบัญชี กสิกร 123-456-7890 ชื่อบัญชี บจก.มหาเฮง 2) ส่งสลิปในแชท 3) ยอดเข้าภายใน 3 นาที ฝากขั้นต่ำ 100 บาท'}
          value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.aiCompose}
              onChange={e => setForm({ ...form, aiCompose: e.target.checked })} />
            🤖 ให้ AI แต่งคำใหม่ตามบริบท (ปิด = แทรกข้อความตรงๆ)
          </label>
          <div style={{ flex: 1 }} />
          {editId && <button className="btn btn-ghost btn-sm" onClick={resetForm}>ยกเลิก</button>}
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : editId ? 'บันทึกการแก้ไข' : 'เพิ่ม key ลัด'}
          </button>
        </div>
      </div>

      {/* ─── List ─── */}
      <input className="input" placeholder="🔍 ค้นหา key ลัด..." value={search}
        onChange={e => setSearch(e.target.value)} style={{ marginBottom: 16 }} />

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 24 }}>กำลังโหลด...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>
          ยังไม่มี key ลัด — เพิ่มอันแรกด้านบนได้เลย
        </div>
      ) : (
        Object.entries(byCategory).map(([cat, list]) => (
          <div key={cat} style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>📁 {cat}</div>
            {list.map(i => (
              <div key={i.id} className="glass-card"
                style={{ padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 12, opacity: i.isActive ? 1 : 0.45 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="badge" style={{ fontFamily: 'monospace' }}>{i.trigger}</span>
                    <span style={{ fontWeight: 600 }}>{i.title}</span>
                    {i.aiCompose && <span className="badge" title="AI แต่งคำใหม่ตามบริบท">🤖 AI</span>}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {i.content}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(i)} title={i.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}>
                    {i.isActive ? '🟢' : '⚪'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => startEdit(i)}>แก้ไข</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(i.id)}>ลบ</button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

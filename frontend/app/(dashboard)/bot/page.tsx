'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../lib/api';

export default function BotPage() {
  const [bot, setBot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ systemPrompt: '', model: 'gpt-4o', temperature: 0.7, isActive: true });
  const [kb, setKb] = useState<any[]>([]);
  const [newKb, setNewKb] = useState({ question: '', answer: '', category: 'general' });
  const [testMsg, setTestMsg] = useState('');
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.get('/bot').then(r => {
      const b = r.data.bot;
      setBot(b);
      if (b) { setForm({ systemPrompt: b.systemPrompt, model: b.model, temperature: b.temperature, isActive: b.isActive }); setKb(b.knowledgeBase || []); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const saveBot = async () => {
    setSaving(true);
    const tid = toast.loading('กำลังบันทึก...');
    try { const r = await api.put('/bot', form); setBot(r.data.bot); toast.success('บันทึกสำเร็จ ✅', { id: tid }); }
    catch { toast.error('บันทึกไม่สำเร็จ', { id: tid }); }
    finally { setSaving(false); }
  };

  const addKb = async () => {
    if (!newKb.question || !newKb.answer) return;
    const r = await api.post('/bot/knowledge', newKb);
    setKb(prev => [r.data.item, ...prev]);
    setNewKb({ question: '', answer: '', category: 'general' });
  };

  const deleteKb = async (id: string) => {
    await api.delete(`/bot/knowledge/${id}`);
    setKb(prev => prev.filter(k => k.id !== id));
  };

  const testBot = async () => {
    if (!testMsg.trim() || testing) return;
    setTesting(true);
    const userMsg = { role: 'user', content: testMsg };
    setTestHistory(prev => [...prev, userMsg]);
    setTestMsg('');
    try {
      const r = await api.post('/bot/test', { message: userMsg.content, history: testHistory });
      setTestHistory(prev => [...prev, { role: 'assistant', content: r.data.reply }]);
    } finally { setTesting(false); }
  };

  const MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'claude-sonnet-4-6', 'claude-opus-4-7', 'gemini-3-5-flash'];

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><div className="spinner" /></div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
      {/* Left: Configuration */}
      <div>
        {/* Bot Settings */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>🤖 ตั้งค่า AI Bot</h3>
            <label className="toggle">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="form-group">
            <label className="label">AI Model (ผ่าน CometAPI)</label>
            <select className="input" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}>
              {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="label">System Prompt (บุคลิก AI)</label>
            <textarea className="input" rows={6} value={form.systemPrompt} onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))} placeholder="คุณเป็น AI Assistant ที่เป็นมิตรของบริษัท..." />
          </div>

          <div className="form-group">
            <label className="label">Temperature: {form.temperature} (0=ตามตำรา, 1=สร้างสรรค์)</label>
            <input type="range" min={0} max={1} step={0.1} value={form.temperature} onChange={e => setForm(f => ({ ...f, temperature: parseFloat(e.target.value) }))} style={{ width: '100%', accentColor: 'var(--teal)' }} />
          </div>

          <button className="btn btn-primary" onClick={saveBot} disabled={saving}>
            {saving ? <span className="spinner" /> : '💾 บันทึกการตั้งค่า'}
          </button>
        </div>

        {/* Knowledge Base */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 20 }}>📚 Knowledge Base (Q&A)</h3>

          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 16 }}>
            <div className="form-row">
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="label">คำถาม</label>
                <input className="input" value={newKb.question} onChange={e => setNewKb(n => ({ ...n, question: e.target.value }))} placeholder="เช่น: เวลาทำการของร้าน?" />
              </div>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="label">หมวดหมู่</label>
                <input className="input" value={newKb.category} onChange={e => setNewKb(n => ({ ...n, category: e.target.value }))} placeholder="general" />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="label">คำตอบ</label>
              <textarea className="input" rows={2} value={newKb.answer} onChange={e => setNewKb(n => ({ ...n, answer: e.target.value }))} placeholder="เช่น: เปิดวันจันทร์-ศุกร์ 9:00-18:00" />
            </div>
            <button className="btn btn-primary btn-sm" onClick={addKb}>+ เพิ่ม Q&A</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {kb.map((item: any) => (
              <div key={item.id} style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: 4 }}>❓ {item.question}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>💬 {item.answer}</div>
                  <div style={{ marginTop: 4 }}><span className="tag">{item.category}</span></div>
                </div>
                <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteKb(item.id)}>🗑️</button>
              </div>
            ))}
            {kb.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>ยังไม่มี Knowledge Base เพิ่ม Q&A เพื่อให้ Bot ตอบได้ดีขึ้น</div>}
          </div>
        </div>
      </div>

      {/* Right: Test Chat */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: 'fit-content', maxHeight: 'calc(100vh - 120px)', position: 'sticky', top: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>🧪 ทดสอบ Bot</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 300, maxHeight: 400 }}>
          {testHistory.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>ส่งข้อความเพื่อทดสอบ Bot</div>}
          {testHistory.map((m: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 10, fontSize: '0.85rem', background: m.role === 'user' ? 'var(--teal-glow)' : 'var(--bg-tertiary)', border: '1px solid', borderColor: m.role === 'user' ? 'rgba(0,212,170,0.2)' : 'var(--border)' }}>
                {m.content}
              </div>
            </div>
          ))}
          {testing && <div style={{ display: 'flex', justifyContent: 'flex-start' }}><div className="typing-indicator"><div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" /></div></div>}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <input className="input" value={testMsg} onChange={e => setTestMsg(e.target.value)} placeholder="พิมพ์ข้อความทดสอบ..." onKeyDown={e => e.key === 'Enter' && testBot()} style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={testBot} disabled={testing || !testMsg.trim()}>ส่ง</button>
        </div>
      </div>
    </div>
  );
}

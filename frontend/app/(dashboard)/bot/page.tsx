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
  // ─── ตั้งค่า AI แยกตามบริษัท (ใช้กับ LINE/แชททุกช่องทางของบริษัทนั้น) ─────────
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState<string>('');

  const DEFAULT_FORM = { systemPrompt: '', model: 'gpt-4o', temperature: 0.7, isActive: true };
  const DEFAULT_SETTINGS = {
    botName: '', greeting: '', language: 'auto', tone: 'friendly',
    maxSentences: 3, useEmoji: true, handoffKeywords: '',
    businessInfo: '', forbidden: '', collectCustomerInfo: true,
  };
  const [settings, setSettings] = useState<any>(DEFAULT_SETTINGS);
  const setS = (k: string, v: any) => setSettings((prev: any) => ({ ...prev, [k]: v }));

  // โหลด config ของบริษัทที่เลือก (ไม่ส่ง companyId = บริษัทเริ่มต้น)
  const loadBot = (cid?: string) => {
    setLoading(true);
    api.get('/bot', { params: cid ? { companyId: cid } : {} }).then(r => {
      const b = r.data.bot;
      setBot(b);
      if (!cid && r.data.companyId) setCompanyId(r.data.companyId);
      if (b) {
        setForm({ systemPrompt: b.systemPrompt, model: b.model, temperature: b.temperature, isActive: b.isActive });
        setKb(b.knowledgeBase || []);
        let meta: any = {};
        try { meta = typeof b.metadata === 'string' ? JSON.parse(b.metadata || '{}') : (b.metadata || {}); } catch { meta = {}; }
        setSettings({ ...DEFAULT_SETTINGS, ...meta });
      }
      else { setForm(DEFAULT_FORM); setKb([]); setSettings(DEFAULT_SETTINGS); }
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    api.get('/companies').then(r => setCompanies(r.data.companies || [])).catch(() => {});
    loadBot();
  }, []);

  // เปลี่ยนบริษัท → โหลด config ของบริษัทนั้น + ล้างแชททดสอบ
  const switchCompany = (cid: string) => {
    setCompanyId(cid);
    setTestHistory([]);
    loadBot(cid);
  };

  const companyName = companies.find(c => c.id === companyId)?.name || '';

  const saveBot = async () => {
    setSaving(true);
    const tid = toast.loading('กำลังบันทึก...');
    try {
      const r = await api.put('/bot', { ...form, companyId, settings });
      setBot(r.data.bot);
      toast.success(`บันทึกการตั้งค่า AI ของ ${companyName || 'บริษัท'} สำเร็จ ✅`, { id: tid });
    }
    catch { toast.error('บันทึกไม่สำเร็จ', { id: tid }); }
    finally { setSaving(false); }
  };

  const addKb = async () => {
    if (!newKb.question || !newKb.answer) return;
    try {
      const r = await api.post('/bot/knowledge', { ...newKb, companyId });
      setKb(prev => [r.data.item, ...prev]);
      setNewKb({ question: '', answer: '', category: 'general' });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เพิ่มไม่สำเร็จ — บันทึกการตั้งค่า Bot ก่อน');
    }
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
      const r = await api.post('/bot/test', { message: userMsg.content, history: testHistory, companyId });
      setTestHistory(prev => [...prev, { role: 'assistant', content: r.data.reply }]);
    } finally { setTesting(false); }
  };

  const MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'claude-sonnet-4-6', 'claude-opus-4-7', 'gemini-3-5-flash'];

  return (
    <div>
      {/* ─── Company Selector — ตั้งค่า AI แยกตามบริษัท ─── */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>🏢 ตั้งค่า AI ของบริษัท:</div>
        <select className="input" style={{ maxWidth: 320 }} value={companyId} onChange={e => switchCompany(e.target.value)}>
          {companies.length === 0 && <option value="">(บริษัทเริ่มต้น)</option>}
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          แต่ละบริษัทมี System Prompt / Model / Knowledge Base แยกกัน — Bot จะใช้ config ของบริษัทที่ลูกค้าแชทเข้ามา (LINE/WhatsApp/Telegram)
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><div className="spinner" /></div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
      {/* Left: Configuration */}
      <div>
        {/* Bot Settings */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>🤖 ตั้งค่า AI Bot {companyName ? `— ${companyName}` : ''}</h3>
            <label className="toggle">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
              <span className="toggle-slider" />
            </label>
          </div>

          {!bot && (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.8rem', color: 'var(--warning)' }}>
              ⚠️ บริษัทนี้ยังไม่มีการตั้งค่า AI — กรอกแล้วกดบันทึกเพื่อสร้าง config ใหม่
            </div>
          )}

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

          {/* ─── การตั้งค่าละเอียด ─── */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0', paddingTop: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 14 }}>⚙️ การตั้งค่าละเอียด</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">ชื่อบอท (ใช้แนะนำตัว)</label>
                <input className="input" value={settings.botName} onChange={e => setS('botName', e.target.value)} placeholder="เช่น น้องใบเตย" />
              </div>
              <div className="form-group">
                <label className="label">ภาษาที่ตอบ</label>
                <select className="input" value={settings.language} onChange={e => setS('language', e.target.value)}>
                  <option value="auto">อัตโนมัติ (ตามลูกค้า)</option>
                  <option value="th">ไทยเสมอ</option>
                  <option value="lo">ลาวเสมอ</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">โทนการตอบ</label>
                <select className="input" value={settings.tone} onChange={e => setS('tone', e.target.value)}>
                  <option value="friendly">เป็นกันเอง</option>
                  <option value="formal">สุภาพทางการ</option>
                  <option value="playful">สนุก เฮฮา</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">ความยาวคำตอบสูงสุด (ประโยค)</label>
                <select className="input" value={settings.maxSentences} onChange={e => setS('maxSentences', parseInt(e.target.value))}>
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} ประโยค</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="label">ข้อความทักทาย (เมื่อลูกค้าทักครั้งแรก)</label>
              <input className="input" value={settings.greeting} onChange={e => setS('greeting', e.target.value)} placeholder="เช่น สวัสดีค่ะ ยินดีให้บริการนะคะ 😊" />
            </div>

            <div className="form-group">
              <label className="label">📋 ข้อมูลธุรกิจ (ข้อเท็จจริงที่ให้บอทใช้ตอบ — โปรโมชั่น เวลาทำการ ขั้นตอนฝาก-ถอน ฯลฯ)</label>
              <textarea className="input" rows={6} value={settings.businessInfo} onChange={e => setS('businessInfo', e.target.value)}
                placeholder={'ใส่ข้อมูลจริงของบริษัทนี้ บอทจะตอบตามนี้เท่านั้น ไม่แต่งเอง เช่น' + String.fromCharCode(10) + '- โปรสมาชิกใหม่ ฝาก 100 รับ 150' + String.fromCharCode(10) + '- ฝากขั้นต่ำ 100 บาท ถอนขั้นต่ำ 300 บาท' + String.fromCharCode(10) + '- เวลาทำการแอดมิน 9:00-24:00'} />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>⚠️ ถ้าเว้นว่าง ระบบจะใช้ข้อมูลโปรโมชั่นกลางเดิม — แนะนำให้กรอกของบริษัทนี้เอง</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="label">คำที่ต้องโอนให้แอดมินทันที (คั่นด้วย ,)</label>
                <input className="input" value={settings.handoffKeywords} onChange={e => setS('handoffKeywords', e.target.value)} placeholder="เช่น ร้องเรียน, โกง, ทนาย" />
              </div>
              <div className="form-group">
                <label className="label">สิ่งที่ห้ามบอททำ/ตอบ</label>
                <input className="input" value={settings.forbidden} onChange={e => setS('forbidden', e.target.value)} placeholder="เช่น ห้ามการันตีผลตอบแทน" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.useEmoji} onChange={e => setS('useEmoji', e.target.checked)} /> 😊 ใช้อีโมจิ
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.collectCustomerInfo} onChange={e => setS('collectCustomerInfo', e.target.checked)} /> 💾 เก็บข้อมูลลูกค้าจากแชทอัตโนมัติ + ไม่ขอซ้ำ + ทวนยืนยันก่อนแก้ปัญหา
              </label>
            </div>
          </div>

          <button className="btn btn-primary" onClick={saveBot} disabled={saving}>
            {saving ? <span className="spinner" /> : '💾 บันทึกการตั้งค่า'}
          </button>
        </div>

        {/* Knowledge Base */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 20 }}>📚 Knowledge Base (Q&A) {companyName ? `— ${companyName}` : ''}</h3>

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
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>🧪 ทดสอบ Bot {companyName ? `(${companyName})` : ''}</div>
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
      )}
    </div>
  );
}

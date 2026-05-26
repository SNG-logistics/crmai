'use client';
import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../../lib/api';

// ─── Built-in FLEX Templates ────────────────────────────────────────────────────
const PRESET_TEMPLATES = [
  {
    id: 'welcome', category: 'welcome', name: '🎉 Welcome สมาชิกใหม่',
    altText: 'ยินดีต้อนรับสู่มหาเฮง!',
    flexJson: {
      type: 'bubble', size: 'mega',
      hero: { type: 'image', url: 'https://placehold.co/800x400/1A2540/00D4AA?text=MAHAHENG', size: 'full', aspectRatio: '2:1', aspectMode: 'cover' },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px',
        contents: [
          { type: 'text', text: '🎉 ยินดีต้อนรับ!', weight: 'bold', size: 'xl', color: '#00D4AA' },
          { type: 'text', text: 'สมาชิกมหาเฮง', weight: 'bold', size: 'xxl', color: '#F1F5F9', margin: 'sm' },
          { type: 'separator', margin: 'md' },
          { type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm', contents: [
            { type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: '✅', size: 'sm', flex: 0 },
              { type: 'text', text: 'ฝาก-ถอน รวดเร็วทันใจ', size: 'sm', color: '#94A3B8', margin: 'md' },
            ]},
            { type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: '✅', size: 'sm', flex: 0 },
              { type: 'text', text: 'รองรับทุกธนาคาร', size: 'sm', color: '#94A3B8', margin: 'md' },
            ]},
            { type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: '✅', size: 'sm', flex: 0 },
              { type: 'text', text: 'โบนัสต้อนรับ 100%', size: 'sm', color: '#94A3B8', margin: 'md' },
            ]},
          ]},
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'button', style: 'primary', color: '#00D4AA', height: 'sm',
            action: { type: 'uri', label: '🎮 เข้าเล่นเลย', uri: 'https://mahaheng.com' } },
          { type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'uri', label: '📞 ติดต่อแอดมิน', uri: 'https://line.me/R/ti/p/@mahaheng' } },
        ],
      },
    },
  },
  {
    id: 'promotion', category: 'promotion', name: '🎁 โปรโมชั่นพิเศษ',
    altText: 'โปรโมชั่นพิเศษจากมหาเฮง!',
    flexJson: {
      type: 'bubble', size: 'mega',
      hero: { type: 'image', url: 'https://placehold.co/800x400/FF6B35/FFFFFF?text=BONUS+100%25', size: 'full', aspectRatio: '2:1', aspectMode: 'cover' },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px',
        contents: [
          { type: 'text', text: '🔥 โปรโมชั่นพิเศษ', weight: 'bold', size: 'lg', color: '#F59E0B' },
          { type: 'text', text: 'ฝากวันนี้รับโบนัส 100%', weight: 'bold', size: 'xxl', color: '#F1F5F9', margin: 'sm', wrap: true },
          { type: 'text', text: 'สูงสุด 500 บาท • วันนี้วันเดียวเท่านั้น!', size: 'sm', color: '#94A3B8', margin: 'sm', wrap: true },
          { type: 'separator', margin: 'md' },
          { type: 'box', layout: 'horizontal', margin: 'md', contents: [
            { type: 'box', layout: 'vertical', flex: 1, contents: [
              { type: 'text', text: 'ฝากขั้นต่ำ', size: 'xs', color: '#64748B' },
              { type: 'text', text: '฿100', size: 'xl', weight: 'bold', color: '#10B981' },
            ]},
            { type: 'separator' },
            { type: 'box', layout: 'vertical', flex: 1, contents: [
              { type: 'text', text: 'รับโบนัสสูงสุด', size: 'xs', color: '#64748B' },
              { type: 'text', text: '฿500', size: 'xl', weight: 'bold', color: '#EF4444' },
            ]},
          ]},
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'button', style: 'primary', color: '#F59E0B', height: 'sm',
            action: { type: 'uri', label: '💰 รับโบนัสเลย', uri: 'https://mahaheng.com/deposit' } },
          { type: 'text', text: '* เงื่อนไขเป็นไปตามที่บริษัทกำหนด', size: 'xxs', color: '#64748B', margin: 'sm', align: 'center' },
        ],
      },
    },
  },
  {
    id: 'vip', category: 'vip', name: '⭐ VIP Upgrade',
    altText: 'ยินดีด้วย! คุณได้รับสถานะ VIP',
    flexJson: {
      type: 'bubble', size: 'mega',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '24px',
        backgroundColor: '#1A1A2E',
        contents: [
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '⭐', size: 'xxl', flex: 0 },
            { type: 'box', layout: 'vertical', flex: 1, margin: 'md', contents: [
              { type: 'text', text: 'VIP MEMBER', weight: 'bold', size: 'sm', color: '#F59E0B' },
              { type: 'text', text: 'ยินดีด้วย!', weight: 'bold', size: 'xxl', color: '#FFFFFF' },
            ]},
          ]},
          { type: 'text', text: 'คุณได้รับการอัพเกรดเป็นสมาชิก VIP แล้ว รับสิทธิประโยชน์พิเศษมากมาย', size: 'sm', color: '#94A3B8', margin: 'md', wrap: true },
          { type: 'separator', margin: 'xl', color: '#2A2A4A' },
          { type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm', contents: [
            { type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: '🎁', size: 'sm', flex: 0 },
              { type: 'text', text: 'โบนัส VIP พิเศษทุกยอดฝาก', size: 'sm', color: '#F59E0B', margin: 'md' },
            ]},
            { type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: '💎', size: 'sm', flex: 0 },
              { type: 'text', text: 'สายตรง VIP แอดมิน 24 ชม.', size: 'sm', color: '#F59E0B', margin: 'md' },
            ]},
            { type: 'box', layout: 'horizontal', contents: [
              { type: 'text', text: '🏆', size: 'sm', flex: 0 },
              { type: 'text', text: 'เข้าร่วมกิจกรรมพิเศษก่อนใคร', size: 'sm', color: '#F59E0B', margin: 'md' },
            ]},
          ]},
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          { type: 'button', style: 'primary', color: '#F59E0B', height: 'sm',
            action: { type: 'uri', label: '💎 เข้าสู่ระบบ VIP', uri: 'https://mahaheng.com' } },
        ],
      },
    },
  },
  {
    id: 'birthday', category: 'birthday', name: '🎂 วันเกิด',
    altText: 'สุขสันต์วันเกิด! ของขวัญพิเศษรอคุณอยู่',
    flexJson: {
      type: 'bubble', size: 'mega',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '24px',
        contents: [
          { type: 'text', text: '🎂', size: 'xxl', align: 'center' },
          { type: 'text', text: 'Happy Birthday!', weight: 'bold', size: 'xxl', color: '#FF6B6B', align: 'center', margin: 'md' },
          { type: 'text', text: 'สุขสันต์วันเกิดนะคะ 🎉', size: 'lg', color: '#F1F5F9', align: 'center' },
          { type: 'text', text: 'ขอให้มีความสุขมากๆ และโชคดีตลอดปี!', size: 'sm', color: '#94A3B8', align: 'center', margin: 'sm', wrap: true },
          { type: 'separator', margin: 'xl' },
          { type: 'box', layout: 'vertical', margin: 'md', paddingAll: '16px',
            backgroundColor: '#FF6B6B18', cornerRadius: '12px',
            contents: [
              { type: 'text', text: '🎁 ของขวัญวันเกิดสุดพิเศษ', weight: 'bold', size: 'md', color: '#FF6B6B', align: 'center' },
              { type: 'text', text: 'โบนัสพิเศษ 50% วันนี้วันเดียว', size: 'sm', color: '#94A3B8', align: 'center', margin: 'sm' },
            ],
          },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          { type: 'button', style: 'primary', color: '#FF6B6B', height: 'sm',
            action: { type: 'uri', label: '🎁 รับของขวัญเลย', uri: 'https://mahaheng.com' } },
        ],
      },
    },
  },
  {
    id: 'winback', category: 'winback', name: '🔙 Winback ดึงลูกค้า',
    altText: 'เราคิดถึงคุณ! มีของขวัญรออยู่',
    flexJson: {
      type: 'bubble', size: 'mega',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '24px',
        contents: [
          { type: 'text', text: '💭 เราคิดถึงคุณ...', weight: 'bold', size: 'lg', color: '#7C3AED' },
          { type: 'text', text: 'กลับมาเล่นกับเรานะคะ!', weight: 'bold', size: 'xxl', color: '#F1F5F9', margin: 'sm', wrap: true },
          { type: 'text', text: 'ไม่ได้เห็นคุณสักพักแล้ว เราเลยเตรียมโปรพิเศษมาให้', size: 'sm', color: '#94A3B8', margin: 'sm', wrap: true },
          { type: 'separator', margin: 'xl' },
          { type: 'box', layout: 'vertical', margin: 'md', paddingAll: '16px',
            backgroundColor: '#7C3AED18', cornerRadius: '12px',
            contents: [
              { type: 'text', text: '🎯 โปรพิเศษเฉพาะคุณ', weight: 'bold', color: '#7C3AED', align: 'center' },
              { type: 'text', text: 'ฝากครั้งแรกรับโบนัส 30%', size: 'sm', color: '#94A3B8', align: 'center', margin: 'sm' },
              { type: 'text', text: 'หมดอายุใน 24 ชั่วโมง!', size: 'xs', color: '#EF4444', align: 'center', margin: 'xs' },
            ],
          },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: '#7C3AED', height: 'sm',
            action: { type: 'uri', label: '🔙 กลับมาเล่นเลย', uri: 'https://mahaheng.com' } },
          { type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'uri', label: '📞 คุยกับแอดมิน', uri: 'https://line.me/R/ti/p/@mahaheng' } },
        ],
      },
    },
  },
];

// ─── FLEX Preview Component ────────────────────────────────────────────────────
function FlexPreview({ flex, altText }: { flex: any; altText: string }) {
  if (!flex) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: '2.5rem' }}>📱</div>
      <div style={{ fontSize: '0.85rem' }}>เลือก Template เพื่อดู Preview</div>
    </div>
  );

  const hero = flex.hero;
  const body = flex.body;
  const footer = flex.footer;

  const renderBox = (box: any): any => {
    if (!box) return null;
    if (box.type === 'text') return (
      <div key={Math.random()} style={{
        fontSize: box.size === 'xxl' ? '1.2rem' : box.size === 'xl' ? '1rem' : box.size === 'lg' ? '0.9rem' : box.size === 'xs' || box.size === 'xxs' ? '0.65rem' : '0.78rem',
        fontWeight: box.weight === 'bold' ? 700 : 400,
        color: box.color || '#F1F5F9',
        textAlign: box.align as any || 'left',
        marginTop: box.margin === 'md' ? 8 : box.margin === 'sm' ? 4 : box.margin === 'xl' ? 16 : box.margin === 'xs' ? 2 : 0,
        wordBreak: 'break-word',
        whiteSpace: box.wrap ? 'pre-wrap' : 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{box.text}</div>
    );
    if (box.type === 'separator') return (
      <div key={Math.random()} style={{ borderTop: `1px solid ${box.color || 'rgba(255,255,255,0.1)'}`, marginTop: box.margin === 'xl' ? 16 : 8, marginBottom: 4 }} />
    );
    if (box.type === 'box') return (
      <div key={Math.random()} style={{
        display: 'flex', flexDirection: box.layout === 'horizontal' ? 'row' : 'column',
        gap: box.spacing === 'md' ? 8 : box.spacing === 'sm' ? 4 : box.spacing === 'xl' ? 16 : 0,
        marginTop: box.margin === 'md' ? 8 : box.margin === 'sm' ? 4 : box.margin === 'xl' ? 16 : 0,
        padding: box.paddingAll || 0,
        background: box.backgroundColor || 'transparent',
        borderRadius: box.cornerRadius || 0,
        flex: box.flex || undefined,
      }}>
        {(box.contents || []).map((c: any) => renderBox(c))}
      </div>
    );
    if (box.type === 'button') return (
      <button key={Math.random()} style={{
        width: '100%', padding: box.height === 'sm' ? '8px 12px' : '12px',
        background: box.color || (box.style === 'secondary' ? 'rgba(255,255,255,0.1)' : 'var(--teal)'),
        border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: '0.82rem', fontWeight: 600,
        color: box.style === 'secondary' ? '#F1F5F9' : '#0F1729',
        marginTop: box.margin === 'sm' ? 4 : 0,
      }}>{box.action?.label}</button>
    );
    return null;
  };

  return (
    <div style={{ background: '#1A2540', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxWidth: 340, width: '100%' }}>
      {hero?.type === 'image' && (
        <img src={hero.url} alt="" style={{ width: '100%', aspectRatio: '2/1', objectFit: 'cover', display: 'block' }}
          onError={e => { (e.target as any).src = 'https://placehold.co/340x170/1A2540/00D4AA?text=Preview'; }} />
      )}
      {body && (
        <div style={{ padding: body.paddingAll || '16px', background: body.backgroundColor || '#1A2540' }}>
          {renderBox(body)}
        </div>
      )}
      {footer && (
        <div style={{ padding: footer.paddingAll || '12px', borderTop: '1px solid rgba(255,255,255,0.05)', background: footer.backgroundColor || '#141D35' }}>
          {renderBox(footer)}
        </div>
      )}
      {/* Alt text */}
      <div style={{ padding: '6px 12px 8px', fontSize: '0.68rem', color: '#4A5568', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        📝 Alt text: {altText}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FlexBuilderPage() {
  const [tab, setTab]                     = useState<'templates' | 'builder' | 'saved'>('templates');
  const [selected, setSelected]           = useState<any>(PRESET_TEMPLATES[0]);
  const [savedTemplates, setSavedTemplates] = useState<any[]>([]);
  const [contacts, setContacts]           = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading]             = useState(false);

  // Builder state
  const [bldName, setBldName]       = useState('');
  const [bldAlt, setBldAlt]         = useState('');
  const [bldJson, setBldJson]       = useState('');
  const [bldParsed, setBldParsed]   = useState<any>(null);
  const [jsonError, setJsonError]   = useState('');

  // Send modal
  const [showSend, setShowSend]     = useState(false);
  const [sendTarget, setSendTarget] = useState<'conversation' | 'contacts'>('conversation');
  const [sendConvId, setSendConvId] = useState('');
  const [sendCids, setSendCids]     = useState<string[]>([]);
  const [sending, setSending]       = useState(false);

  const loadSaved = useCallback(async () => {
    try { const r = await api.get('/flex/templates'); setSavedTemplates(r.data.templates || []); } catch {}
  }, []);

  const loadSendData = useCallback(async () => {
    try {
      const [cr, ccr] = await Promise.all([
        api.get('/contacts', { params: { limit: 200 } }),
        api.get('/conversations', { params: { status: 'open', channel: 'line', limit: 100 } }),
      ]);
      setContacts(cr.data.contacts || []);
      setConversations(ccr.data.conversations || []);
    } catch {}
  }, []);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  // parse JSON in builder
  useEffect(() => {
    if (!bldJson.trim()) { setBldParsed(null); setJsonError(''); return; }
    try { setBldParsed(JSON.parse(bldJson)); setJsonError(''); }
    catch (e: any) { setBldParsed(null); setJsonError(e.message); }
  }, [bldJson]);

  const selectTemplate = (tpl: any) => {
    setSelected(tpl);
    if (tab === 'builder') {
      setBldName(tpl.name);
      setBldAlt(tpl.altText);
      setBldJson(JSON.stringify(tpl.flexJson, null, 2));
    }
  };

  const saveTemplate = async () => {
    if (!bldName || !bldParsed) return toast.error('กรุณาใส่ชื่อและ JSON ที่ถูกต้อง');
    setLoading(true);
    try {
      await api.post('/flex/templates', { name: bldName, altText: bldAlt, flexJson: bldParsed, category: 'custom' });
      toast.success('✅ บันทึก Template แล้ว');
      await loadSaved();
    } catch (e: any) { toast.error(e.response?.data?.message || 'เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  const deleteSaved = async (id: string) => {
    try { await api.delete(`/flex/templates/${id}`); toast.success('ลบแล้ว'); await loadSaved(); }
    catch { toast.error('ลบไม่ได้'); }
  };

  const openSend = (tpl: any) => {
    setSelected(tpl);
    setShowSend(true);
    loadSendData();
  };

  const doSend = async () => {
    if (!selected) return;
    setSending(true);
    const tid = toast.loading('กำลังส่ง...');
    try {
      const payload = { altText: selected.altText, flexJson: selected.flexJson };
      if (sendTarget === 'conversation') {
        if (!sendConvId) return toast.error('เลือกบทสนทนาก่อน', { id: tid });
        await api.post('/flex/send', { conversationId: sendConvId, ...payload });
        toast.success('✅ ส่ง Flex สำเร็จ!', { id: tid });
      } else {
        if (!sendCids.length) return toast.error('เลือกลูกค้าก่อน', { id: tid });
        await api.post('/flex/broadcast', { contactIds: sendCids, ...payload });
        toast.success(`✅ ส่งไปยัง ${sendCids.length} คนแล้ว!`, { id: tid });
      }
      setShowSend(false);
    } catch (e: any) { toast.error(e.response?.data?.message || 'ส่งไม่ได้', { id: tid }); }
    finally { setSending(false); }
  };

  const currentFlex = tab === 'builder' ? bldParsed : selected?.flexJson;
  const currentAlt  = tab === 'builder' ? bldAlt : selected?.altText || '';

  const CATS: Record<string, { label: string; color: string }> = {
    welcome:   { label: 'ต้อนรับ', color: '#00D4AA' },
    promotion: { label: 'โปรโมชั่น', color: '#F59E0B' },
    vip:       { label: 'VIP', color: '#7C3AED' },
    birthday:  { label: 'วันเกิด', color: '#FF6B6B' },
    winback:   { label: 'Winback', color: '#3B82F6' },
    custom:    { label: 'Custom', color: '#64748B' },
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>💬 LINE FLEX Message Builder</h1>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
          สร้างและส่ง Flex Message สวยงามผ่าน LINE OA
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {([['templates', '🎨 Templates สำเร็จรูป'], ['builder', '🔧 Custom Builder'], ['saved', '💾 Templates ที่บันทึก']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.88rem', marginBottom: -1,
              borderBottom: tab === k ? '2px solid var(--teal)' : '2px solid transparent',
              fontWeight: tab === k ? 700 : 400,
              color: tab === k ? 'var(--teal)' : 'var(--text-muted)', transition: 'all 0.2s' }}>
            {l} {k === 'saved' && savedTemplates.length > 0 && <span style={{ fontSize: '0.68rem', background: 'var(--teal)', color: '#000', borderRadius: 10, padding: '1px 5px', marginLeft: 4 }}>{savedTemplates.length}</span>}
          </button>
        ))}
      </div>

      {/* ─── Main Grid ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        {/* Left: Content */}
        <div>
          {/* TEMPLATES TAB */}
          {tab === 'templates' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                {PRESET_TEMPLATES.map(tpl => {
                  const cat = CATS[tpl.category] || CATS.custom;
                  const isActive = selected?.id === tpl.id;
                  return (
                    <div key={tpl.id} onClick={() => selectTemplate(tpl)}
                      style={{ border: `2px solid ${isActive ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 12,
                        background: isActive ? 'rgba(0,212,170,0.05)' : 'var(--bg-secondary)',
                        cursor: 'pointer', overflow: 'hidden', transition: 'all 0.2s' }}>
                      {/* Color bar */}
                      <div style={{ height: 4, background: cat.color }} />
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{tpl.name}</div>
                          <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 20,
                            background: cat.color + '20', color: cat.color, border: `1px solid ${cat.color}40`, whiteSpace: 'nowrap' }}>
                            {cat.label}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12, fontStyle: 'italic' }}>
                          "{tpl.altText}"
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: '0.75rem' }}
                            onClick={e => { e.stopPropagation(); openSend(tpl); }}>📤 ส่ง</button>
                          <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}
                            onClick={e => { e.stopPropagation(); selectTemplate(tpl); setTab('builder'); setBldName(tpl.name); setBldAlt(tpl.altText); setBldJson(JSON.stringify(tpl.flexJson, null, 2)); }}>✏️ แก้ไข</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* BUILDER TAB */}
          {tab === 'builder' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group">
                    <label className="label">ชื่อ Template <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input className="input" value={bldName} onChange={e => setBldName(e.target.value)} placeholder="เช่น โปรโมชั่นเดือนมิถุนายน" />
                  </div>
                  <div className="form-group">
                    <label className="label">Alt Text (ข้อความสำรอง) <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input className="input" value={bldAlt} onChange={e => setBldAlt(e.target.value)} placeholder="ข้อความที่แสดงแทน FLEX" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Flex JSON <span style={{ color: 'var(--danger)' }}>*</span></span>
                    <a href="https://developers.line.biz/flex-simulator/" target="_blank" rel="noreferrer"
                      style={{ color: 'var(--teal)', fontSize: '0.72rem', fontWeight: 600, textDecoration: 'none' }}>
                      🔗 LINE Flex Simulator ↗
                    </a>
                  </label>
                  <textarea className="input" rows={18} value={bldJson} onChange={e => setBldJson(e.target.value)}
                    placeholder={`{\n  "type": "bubble",\n  "body": {\n    "type": "box",\n    "layout": "vertical",\n    "contents": [...]\n  }\n}`}
                    style={{ fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }} />
                  {jsonError && <div style={{ color: 'var(--danger)', fontSize: '0.72rem', marginTop: 4 }}>⚠️ JSON Error: {jsonError}</div>}
                  {bldParsed && <div style={{ color: 'var(--success)', fontSize: '0.72rem', marginTop: 4 }}>✅ JSON ถูกต้อง</div>}
                </div>

                {/* Quick load preset */}
                <div style={{ marginTop: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>โหลด Template สำเร็จรูป:</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {PRESET_TEMPLATES.map(t => (
                      <button key={t.id} className="btn btn-ghost btn-sm"
                        onClick={() => { setBldName(t.name); setBldAlt(t.altText); setBldJson(JSON.stringify(t.flexJson, null, 2)); }}
                        style={{ fontSize: '0.72rem' }}>
                        {t.name.split(' ')[0]} {t.name.split(' ')[1]}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={saveTemplate} disabled={loading || !bldName || !bldParsed}
                    style={{ flex: 1, justifyContent: 'center' }}>
                    {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '💾'} บันทึก Template
                  </button>
                  <button className="btn btn-secondary" onClick={() => openSend({ name: bldName, altText: bldAlt, flexJson: bldParsed })}
                    disabled={!bldParsed} style={{ justifyContent: 'center' }}>
                    📤 ส่งเลย
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SAVED TAB */}
          {tab === 'saved' && (
            <div>
              {savedTemplates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>💾</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600 }}>ยังไม่มี Template ที่บันทึก</div>
                  <div style={{ fontSize: '0.82rem', marginTop: 4 }}>ไปสร้างใน Custom Builder แล้วกด บันทึก</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                  {savedTemplates.map((tpl: any) => {
                    const cat = CATS[tpl.category] || CATS.custom;
                    return (
                      <div key={tpl.id} onClick={() => selectTemplate({ ...tpl, flexJson: typeof tpl.flexJson === 'string' ? JSON.parse(tpl.flexJson) : tpl.flexJson })}
                        style={{ border: `2px solid ${selected?.id === tpl.id ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 12,
                          background: 'var(--bg-secondary)', cursor: 'pointer', overflow: 'hidden' }}>
                        <div style={{ height: 4, background: cat.color }} />
                        <div style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{tpl.name}</div>
                            <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 20,
                              background: cat.color + '20', color: cat.color }}>{cat.label}</span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                            ใช้แล้ว {tpl.usedCount} ครั้ง
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: '0.75rem' }}
                              onClick={e => { e.stopPropagation(); openSend({ ...tpl, flexJson: typeof tpl.flexJson === 'string' ? JSON.parse(tpl.flexJson) : tpl.flexJson }); }}>📤 ส่ง</button>
                            <button className="btn btn-danger btn-sm" style={{ fontSize: '0.75rem' }}
                              onClick={e => { e.stopPropagation(); deleteSaved(tpl.id); }}>🗑️</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div style={{ position: 'sticky', top: 20 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📱</span> Preview (มือถือ LINE)
            </div>
            {/* Phone frame */}
            <div style={{ background: '#0F1117', borderRadius: 20, padding: '16px 12px', border: '3px solid #2A3A5C' }}>
              {/* Status bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, padding: '0 4px' }}>
                <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>9:41</span>
                <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>● ● ●</span>
              </div>
              {/* Chat bubble area */}
              <div style={{ background: '#E8E8E8', borderRadius: 12, padding: 10, minHeight: 200 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#00D4AA', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#000' }}>OA</div>
                  <div style={{ flex: 1 }}>
                    <FlexPreview flex={currentFlex} altText={currentAlt} />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            {selected && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => openSend(selected)}>
                  📤 ส่ง Flex นี้
                </button>
                <a href="https://developers.line.biz/flex-simulator/" target="_blank" rel="noreferrer"
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', fontSize: '0.82rem' }}>
                  🔗 เปิดใน LINE Simulator ↗
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Send Modal ──────────────────────────────────────────────────────────── */}
      {showSend && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowSend(false)}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: 24 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>📤 ส่ง Flex Message</h2>

            {/* Target type */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {(['conversation', 'contacts'] as const).map(t => (
                <button key={t} onClick={() => setSendTarget(t)}
                  className={`btn btn-sm ${sendTarget === t ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, justifyContent: 'center' }}>
                  {t === 'conversation' ? '💬 บทสนทนา' : '👥 เลือกลูกค้า'}
                </button>
              ))}
            </div>

            {sendTarget === 'conversation' ? (
              <div className="form-group">
                <label className="label">เลือกบทสนทนา LINE</label>
                <select className="input" value={sendConvId} onChange={e => setSendConvId(e.target.value)}>
                  <option value="">-- เลือกบทสนทนา --</option>
                  {conversations.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.contact?.displayName || c.channelId} ({c.status})</option>
                  ))}
                </select>
                {conversations.length === 0 && <div style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: 4 }}>ไม่พบบทสนทนา LINE ที่เปิดอยู่</div>}
              </div>
            ) : (
              <div className="form-group">
                <label className="label">เลือกลูกค้า (มี LINE ID) — เลือกได้หลายคน</label>
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  {contacts.filter((c: any) => c.lineUserId).map((c: any) => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '0.82rem' }}>
                      <input type="checkbox" checked={sendCids.includes(c.id)}
                        onChange={e => setSendCids(prev => e.target.checked ? [...prev, c.id] : prev.filter(i => i !== c.id))} />
                      {c.displayName}
                    </label>
                  ))}
                  {contacts.filter((c: any) => c.lineUserId).length === 0 && (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>ไม่มีลูกค้าที่มี LINE ID</div>
                  )}
                </div>
                {sendCids.length > 0 && <div style={{ fontSize: '0.75rem', color: 'var(--teal)', marginTop: 4 }}>เลือก {sendCids.length} คน</div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowSend(false)} style={{ flex: 1, justifyContent: 'center' }}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={doSend} disabled={sending} style={{ flex: 1, justifyContent: 'center' }}>
                {sending ? <><span className="spinner" style={{ width: 14, height: 14 }} /> กำลังส่ง...</> : '📤 ส่งเลย'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

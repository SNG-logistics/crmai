'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../../lib/api';
import { useSocket } from '../../../lib/socket';
import { getSocket } from '../../../lib/socket';
import styles from './inbox.module.css';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';
import { useLang } from '../../../store/lang';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Message {
  id: string; conversationId: string; senderType: 'customer' | 'agent' | 'bot';
  type: string; content: string; createdAt: string; isRead: boolean;
  sender?: { id: string; displayName: string; avatar?: string };
  metadata?: any;
}
interface Conversation {
  id: string; channel: string; status: string; isBot: boolean; priority: string;
  lastMessageAt: string; createdAt: string; assignedToId?: string;
  contact: { id: string; displayName: string; avatar?: string; lineUserId?: string; telegramId?: string; email?: string; phone?: string };
  assignedTo?: { id: string; displayName: string; avatar?: string };
  messages?: Message[];
  _unread?: number;
}

// ─── Sound Notification ───────────────────────────────────────────────────────
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

// ─── FILTERS ─────────────────────────────────────────────────────────────────
// ─── FILTERS (translated inside component) ─────────────────────────────────
const FILTER_KEYS = [
  { key: 'all',      labelTh: 'ทั้งหมด', labelLo: 'ທັງໝົດ',          icon: '📬' },
  { key: 'open',     labelTh: 'เปิด',    labelLo: 'ເປີດ',            icon: '🔵' },
  { key: 'mine',     labelTh: 'ของฉัน',  labelLo: 'ຂອງຂ້ອຍ',         icon: '👤' },
  { key: 'bot',      labelTh: 'Bot',     labelLo: 'Bot',              icon: '🤖' },
  { key: 'pending',  labelTh: 'รอ',      labelLo: 'ລໍຖ້າ',           icon: '⏳' },
  { key: 'resolved', labelTh: 'แก้แล้ว', labelLo: 'ແກ້ໄຂແລ້ວ',     icon: '✅' },
];

const CANNED = [
  // 👋 ทักทาย
  { trigger: '/hi',      text: 'สวัสดีค่ะ ยินดีให้บริการนะคะ มีอะไรให้ช่วยเหลือได้บ้างคะ? 😊', category: 'ทักทาย' },
  { trigger: '/hello',   text: 'สวัสดีครับ ยินดีให้บริการครับ มีอะไรให้ช่วยได้บ้างครับ? 🙏', category: 'ทักทาย' },
  // ⏳ รอสักครู่
  { trigger: '/wait',    text: 'กรุณารอสักครู่นะคะ กำลังตรวจสอบให้เลยค่ะ 🔍', category: 'ทั่วไป' },
  { trigger: '/check',   text: 'กำลังตรวจสอบข้อมูลให้ค่ะ รอสักครู่นะคะ ⏳', category: 'ทั่วไป' },
  // ✅ ขอบคุณ/ปิด
  { trigger: '/thanks',  text: 'ขอบคุณที่ติดต่อเข้ามานะคะ หากมีคำถามเพิ่มเติมยินดีให้บริการเสมอค่ะ 🙏', category: 'ปิดการสนทนา' },
  { trigger: '/close',   text: 'ขอบคุณมากค่ะ หากมีปัญหาหรือข้อสงสัยสามารถติดต่อกลับมาได้เลยนะคะ 😊', category: 'ปิดการสนทนา' },
  // ❌ ขอโทษ
  { trigger: '/sorry',   text: 'ขออภัยในความไม่สะดวกด้วยนะคะ เราจะรีบดำเนินการให้เร็วที่สุดค่ะ 🙏', category: 'ทั่วไป' },
  // 💰 ราคา/โปรโมชั่น
  { trigger: '/price',   text: 'สนใจสอบถามราคา สามารถแจ้งรายการที่ต้องการได้เลยนะคะ ทางทีมจะแจ้งราคาให้ทันทีค่ะ 💰', category: 'ราคา' },
  { trigger: '/promo',   text: 'ขณะนี้มีโปรโมชั่นพิเศษสำหรับสมาชิก! ต้องการทราบรายละเอียดเพิ่มเติมไหมคะ? 🎁', category: 'ราคา' },
  // 📞 ติดต่อ
  { trigger: '/contact', text: 'สามารถติดต่อเราได้ทุกช่องทาง LINE/โทรศัพท์/เว็บไซต์ หรือแจ้งเรื่องที่นี่ได้เลยค่ะ 📞', category: 'ติดต่อ' },
  { trigger: '/team',    text: 'ขอโอนสายให้ทีมผู้เชี่ยวชาญดูแลต่อนะคะ กรุณารอสักครู่ค่ะ 👤', category: 'ทั่วไป' },
  // 🎰 เฉพาะธุรกิจเกม
  { trigger: '/dep',     text: 'ยอดฝากเข้าระบบแล้วนะคะ กรุณาตรวจสอบที่บัญชีของท่านได้เลยค่ะ ✅', category: 'เกม' },
  { trigger: '/with',    text: 'รายการถอนกำลังดำเนินการค่ะ ใช้เวลาประมาณ 5-15 นาทีนะคะ ⏳', category: 'เกม' },
  { trigger: '/bonus',   text: 'โบนัสได้รับการอนุมัติแล้วค่ะ ยอดจะเพิ่มในบัญชีภายใน 5 นาทีค่ะ 🎁', category: 'เกม' },
  { trigger: '/verify',  text: 'กรุณาส่งเอกสารยืนยันตัวตน (บัตรประชาชน + selfie) เพื่อยืนยันบัญชีนะคะ 📋', category: 'เกม' },
];

// ─── Message Bubble ──────────────────────────────────────────────────────────
function MessageBubble({ msg, contactName }: { msg: Message; contactName: string }) {
  const isCustomer = msg.senderType === 'customer';
  const isBot = msg.senderType === 'bot';
  const [lightbox, setLightbox] = useState(false);

  const renderContent = () => {
    if (msg.type === 'image') {
      const imgUrl = msg.metadata?.imageUrl || msg.metadata?.originalContentUrl;
      if (imgUrl) return (
        <div>
          <img src={imgUrl} alt="รูปภาพ" onClick={() => setLightbox(true)}
            style={{ maxWidth: 240, maxHeight: 200, borderRadius: 8, cursor: 'zoom-in', objectFit: 'cover', display: 'block' }} />
          {lightbox && (
            <div onClick={() => setLightbox(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'zoom-out' }}>
              <img src={imgUrl} alt="รูปภาพ" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} />
            </div>
          )}
        </div>
      );
      return <span style={{ opacity: 0.7 }}>🖼️ รูปภาพ</span>;
    }
    if (msg.type === 'sticker') return <span style={{ fontSize: '2.5rem' }}>😊</span>;
    if (msg.type === 'audio') return <span>🎵 เสียง</span>;
    if (msg.type === 'file') return <span>📎 {msg.content}</span>;
    if (msg.type === 'location') return <span>📍 {msg.content}</span>;
    return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>;
  };

  return (
    <div className={`${styles.msgRow} ${isCustomer ? styles.msgCustomer : styles.msgAgent}`}>
      {isCustomer && (
        <div className="avatar avatar-sm" style={{ flexShrink: 0 }}>{contactName?.[0] || '?'}</div>
      )}
      <div className={`${styles.msgBubble} ${isCustomer ? styles.bubbleCustomer : isBot ? styles.bubbleBot : styles.bubbleAgent}`}>
        {renderContent()}
        <div className={styles.msgMeta}>
          {isBot ? '🤖 Bot' : isCustomer ? contactName : (msg.sender?.displayName || 'Agent')}
          {' · '}
          {new Date(msg.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      {!isCustomer && (
        <div className="avatar avatar-sm" style={{ flexShrink: 0, background: isBot ? 'var(--purple-glow)' : 'var(--teal-glow)', border: `1px solid ${isBot ? 'rgba(124,58,237,0.3)' : 'rgba(0,212,170,0.3)'}` }}>
          {isBot ? '🤖' : (msg.sender?.displayName?.[0] || 'A')}
        </div>
      )}
    </div>
  );
}

// ─── Main Inbox Page ──────────────────────────────────────────────────────────
export default function InboxPage() {
  const { lang, t } = useLang();
  const FILTERS = FILTER_KEYS.map(f => ({ ...f, label: lang === 'lo' ? f.labelLo : f.labelTh }));

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [filter, setFilter] = useState('all');
  const [channel, setChannel] = useState('all');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [aiSuggest, setAiSuggest] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showCanned, setShowCanned] = useState(false);
  const [cannedFilter, setCannedFilter] = useState('');
  const [totalUnread, setTotalUnread] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeConvRef = useRef<string | null>(null);
  const typingTimeout = useRef<NodeJS.Timeout>();

  // ─── Load conversations ───────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    const params: any = { limit: 50 };
    if (filter !== 'all') { if (filter === 'mine') params.assignedTo = 'me'; else params.status = filter; }
    if (channel !== 'all') params.channel = channel;
    if (search) params.search = search;
    try {
      const r = await api.get('/conversations', { params });
      const convs = r.data.conversations || [];
      setConversations(convs);
      const unread = convs.filter((c: Conversation) => c._unread > 0).length;
      setTotalUnread(unread);
    } catch { toast.error('โหลดบทสนทนาไม่ได้'); }
  }, [filter, channel, search]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ─── Load messages ────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (id: string) => {
    setLoadingMessages(true);
    try {
      const r = await api.get(`/conversations/${id}`);
      const conv = r.data.conversation;
      setMessages(conv?.messages || []);
      setActiveConv(conv);
      activeConvRef.current = id;
    } catch { toast.error('โหลดข้อความไม่ได้'); }
    finally { setLoadingMessages(false); }
  }, []);

  // ─── Select conversation + join socket room ───────────────────────────────
  const selectConversation = useCallback((conv: Conversation) => {
    if (activeConvRef.current) getSocket()?.emit('leave:conversation', activeConvRef.current);
    setActiveConv(conv);
    setMessages([]);
    setAiSuggest('');
    getSocket()?.emit('join:conversation', conv.id);
    loadMessages(conv.id);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, _unread: 0 } : c));
  }, [loadMessages]);

  // ─── Auto-scroll ─────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Socket: new_message ─────────────────────────────────────────────────
  useSocket('new_message', (data: any) => {
    if (data.conversationId === activeConvRef.current) {
      setMessages(prev => {
        if (prev.some(m => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      setTypingUsers([]);
    } else {
      // แจ้งเตือนถ้าเป็น message จากลูกค้า
      if (data.message.senderType === 'customer') {
        playNotificationSound();
        toast('💬 ข้อความใหม่จาก ' + (data.contact?.displayName || 'ลูกค้า'), { icon: data.channel === 'line' ? '🟢' : '🔵' });
        setConversations(prev => prev.map(c =>
          c.id === data.conversationId ? { ...c, _unread: (c._unread || 0) + 1, lastMessageAt: new Date().toISOString() } : c
        ).sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()));
      }
    }
  });

  useSocket('conversation_updated', () => { loadConversations(); if (activeConvRef.current) loadMessages(activeConvRef.current); });
  useSocket('typing', (data: any) => {
    setTypingUsers(prev => prev.includes(data.username) ? prev : [...prev, data.username]);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => setTypingUsers([]), 3000);
  });

  // ─── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!newMsg.trim() || !activeConv || sending) return;
    setSending(true);
    const content = newMsg;
    setNewMsg(''); setAiSuggest(''); setShowCanned(false);
    const toastId = toast.loading('กำลังส่ง...');
    try {
      await api.post(`/conversations/${activeConv.id}/messages`, { content });
      toast.success('ส่งแล้ว', { id: toastId });
      loadMessages(activeConv.id);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'ส่งไม่ได้', { id: toastId });
      setNewMsg(content);
    } finally { setSending(false); }
  };

  // ─── Typing indicator ─────────────────────────────────────────────────────
  const handleTyping = (val: string) => {
    setNewMsg(val);
    // Canned responses
    if (val.startsWith('/')) {
      setShowCanned(true);
      setCannedFilter(val);
    } else {
      setShowCanned(false);
    }
    getSocket()?.emit('typing', { conversationId: activeConv?.id });
  };

  // ─── AI Suggestion ────────────────────────────────────────────────────────
  const getAISuggestion = async () => {
    if (!activeConv || loadingAI) return;
    setLoadingAI(true);
    const toastId = toast.loading('AI กำลังคิด...');
    try {
      const r = await api.get(`/conversations/${activeConv.id}/ai-suggest`);
      setAiSuggest(r.data.suggestion || '');
      toast.success('AI แนะนำสำเร็จ', { id: toastId });
    } catch { toast.error('AI ไม่ตอบสนอง', { id: toastId }); }
    finally { setLoadingAI(false); }
  };

  // ─── Toggle Bot/Human ─────────────────────────────────────────────────────
  const toggleBot = async () => {
    if (!activeConv) return;
    const toHuman = activeConv.isBot;
    const toastId = toast.loading(toHuman ? 'สลับเป็น Human...' : 'สลับเป็น Bot...');
    try {
      await api.post(`/conversations/${activeConv.id}/handoff`, { toHuman });
      toast.success(toHuman ? '👤 สลับเป็น Human แล้ว' : '🤖 สลับเป็น Bot แล้ว', { id: toastId });
      loadMessages(activeConv.id); loadConversations();
    } catch { toast.error('เกิดข้อผิดพลาด', { id: toastId }); }
  };

  // ─── Resolve conversation ─────────────────────────────────────────────────
  const resolveConversation = async () => {
    if (!activeConv) return;
    const toastId = toast.loading('กำลังปิดบทสนทนา...');
    try {
      await api.patch(`/conversations/${activeConv.id}`, { status: 'resolved' });
      toast.success('✅ ปิดบทสนทนาแล้ว', { id: toastId });
      loadConversations(); setActiveConv(null); setMessages([]);
    } catch { toast.error('เกิดข้อผิดพลาด', { id: toastId }); }
  };

  // ─── Canned responses filtered ────────────────────────────────────────────
  const filteredCanned = CANNED.filter(c =>
    c.trigger.includes(cannedFilter) || c.text.toLowerCase().includes(cannedFilter.slice(1).toLowerCase())
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.inbox}>
      {/* ═══ LEFT: Conversation List ═══════════════════════════════════════ */}
      <div className={styles.convList}>
        <div className={styles.convListHeader}>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input className="input" placeholder="🔍 ค้นหา..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ paddingRight: 36 }} />
            {search && <button onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>}
          </div>

          <div className={styles.filterTabs}>
            {FILTERS.map(f => (
              <button key={f.key} className={`${styles.filterTab} ${filter === f.key ? styles.active : ''}`} onClick={() => setFilter(f.key)}>
                {f.icon} {f.label}
              </button>
            ))}
          </div>

          <div className={styles.channelFilters}>
            {[
              { key: 'all', label: 'ทุกช่อง', icon: '📱' },
              { key: 'line', label: 'LINE', icon: '🟢' },
              { key: 'telegram', label: 'TG', icon: '🔵' },
            ].map(c => (
              <button key={c.key} className={`${styles.channelBtn} ${channel === c.key ? styles.active : ''}`} onClick={() => setChannel(c.key)}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.convCount}>
          <span>{conversations.length} บทสนทนา</span>
          {totalUnread > 0 && <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.75rem', fontWeight: 700 }}>{totalUnread} ใหม่</span>}
        </div>

        <div className={styles.convItems}>
          {conversations.length === 0 && (
            <div className={styles.empty}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
              <div>ไม่มีบทสนทนา</div>
            </div>
          )}
          {conversations.map(conv => {
            const lastMsg = conv.messages?.[0];
            const isActive = activeConv?.id === conv.id;
            const unread = conv._unread || 0;
            return (
              <div key={conv.id} className={`${styles.convItem} ${isActive ? styles.convActive : ''} ${unread > 0 ? styles.convUnread : ''}`}
                onClick={() => selectConversation(conv)}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div className="avatar">{conv.contact?.displayName?.[0] || '?'}</div>
                  <div style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: '50%', background: conv.channel === 'line' ? '#00B900' : '#2AABEE', border: '2px solid var(--bg-secondary)' }} />
                </div>
                <div className={styles.convInfo}>
                  <div className={styles.convTop}>
                    <span className={styles.convName} style={{ fontWeight: unread > 0 ? 700 : 500 }}>
                      {conv.contact?.displayName || 'Unknown'}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                      {conv.lastMessageAt ? formatDistanceToNow(new Date(conv.lastMessageAt), { locale: th, addSuffix: true }) : ''}
                    </span>
                  </div>
                  <div className={styles.convPreview} style={{ fontWeight: unread > 0 ? 600 : 400, color: unread > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {lastMsg?.content || 'ไม่มีข้อความ'}
                  </div>
                  <div className={styles.convMeta}>
                    <span className={`badge badge-${conv.status}`} style={{ fontSize: '0.65rem' }}>
                      {conv.isBot ? '🤖' : '👤'} {conv.status}
                    </span>
                    {conv.priority === 'high' && <span style={{ fontSize: '0.65rem', color: 'var(--danger)' }}>🔴</span>}
                    {unread > 0 && <span style={{ marginLeft: 'auto', background: 'var(--teal)', color: '#0F1729', borderRadius: 10, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 700 }}>{unread}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ MIDDLE: Chat Area ════════════════════════════════════════════════ */}
      <div className={styles.chatArea}>
        {!activeConv ? (
          <div className={styles.noChatSelected}>
            <div style={{ fontSize: '5rem', marginBottom: 16, animation: 'pulse 2s infinite' }}>💬</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>เลือกบทสนทนา</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '0.9rem' }}>
              คลิกที่บทสนทนาด้านซ้ายเพื่อเริ่มต้น
            </div>
            <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[`📬 ${conversations.length} บทสนทนา`, `🤖 Bot พร้อมตอบ`, `⚡ Real-time`].map(s => (
                <span key={s} style={{ padding: '6px 14px', background: 'var(--bg-tertiary)', borderRadius: 20, fontSize: '0.8rem', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>{s}</span>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className={styles.chatHeader}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div className="avatar">{activeConv.contact?.displayName?.[0] || '?'}</div>
                <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: activeConv.channel === 'line' ? '#00B900' : '#2AABEE', border: '2px solid var(--bg-secondary)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{activeConv.contact?.displayName}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                  <span className={`badge badge-${activeConv.channel}`} style={{ fontSize: '0.7rem' }}>
                    {activeConv.channel === 'line' ? '🟢 LINE' : '🔵 Telegram'}
                  </span>
                  <span className={`badge badge-${activeConv.status}`} style={{ fontSize: '0.7rem' }}>{activeConv.status}</span>
                  {activeConv.assignedTo && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>👤 {activeConv.assignedTo.displayName}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {/* Bot/Human Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-tertiary)', borderRadius: 20, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.75rem', color: activeConv.isBot ? 'var(--purple)' : 'var(--teal)' }}>
                    {activeConv.isBot ? '🤖 Bot' : '👤 Human'}
                  </span>
                  <label className="toggle" style={{ transform: 'scale(0.85)' }}>
                    <input type="checkbox" checked={!activeConv.isBot} onChange={toggleBot} />
                    <span className="toggle-slider" />
                  </label>
                </div>
                {/* Resolve */}
                {activeConv.status !== 'resolved' && (
                  <button className="btn btn-secondary btn-sm" onClick={resolveConversation} title="ปิดบทสนทนา">
                    ✅ ปิด
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className={styles.messages}>
              {loadingMessages && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <div className="spinner" style={{ width: 32, height: 32 }} />
                </div>
              )}
              {!loadingMessages && messages.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 60 }}>
                  <div style={{ fontSize: '3rem', marginBottom: 8 }}>💬</div>
                  <div>ยังไม่มีข้อความ</div>
                </div>
              )}
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} contactName={activeConv.contact?.displayName} />
              ))}
              {/* Typing Indicator */}
              {typingUsers.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div className="avatar avatar-sm">A</div>
                  <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: '8px 14px', border: '1px solid var(--border)' }}>
                    <div className="typing-indicator" style={{ padding: 0 }}>
                      <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{typingUsers.join(', ')} กำลังพิมพ์...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* AI Suggestion Bar */}
            {aiSuggest && (
              <div className={styles.aiSuggest} onClick={() => { setNewMsg(aiSuggest); setAiSuggest(''); textareaRef.current?.focus(); }}>
                <span style={{ color: 'var(--teal)', fontWeight: 600, marginRight: 6 }}>✨ AI แนะนำ:</span>
                <span style={{ flex: 1 }}>{aiSuggest}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: 8, flexShrink: 0 }}>คลิกเพื่อใช้ →</span>
                <button onClick={e => { e.stopPropagation(); setAiSuggest(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px', fontSize: '0.8rem' }}>✕</button>
              </div>
            )}

            {/* Canned Responses Popup */}
            {showCanned && filteredCanned.length > 0 && (
              <div className={styles.cannedPopup}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '8px 12px 4px', borderBottom: '1px solid var(--border)' }}>
                  ⚡ Quick Replies
                </div>
                {filteredCanned.map(c => (
                  <div key={c.trigger} className={styles.cannedItem} onClick={() => { setNewMsg(c.text); setShowCanned(false); textareaRef.current?.focus(); }}>
                    <span style={{ color: 'var(--teal)', fontWeight: 600, fontSize: '0.8rem', minWidth: 60 }}>{c.trigger}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Input Area */}
            <div className={styles.chatInput}>
              {activeConv.isBot && (
                <div style={{ textAlign: 'center', padding: '8px 16px', color: 'var(--purple)', fontSize: '0.8rem', background: 'rgba(124,58,237,0.05)', borderTop: '1px solid rgba(124,58,237,0.1)' }}>
                  🤖 Bot กำลังตอบอัตโนมัติ — สลับเป็น Human เพื่อตอบเอง
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: '12px 16px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <textarea
                    ref={textareaRef}
                    className="input"
                    rows={2}
                    placeholder={activeConv.isBot ? '' : 'พิมพ์ข้อความ... (Enter ส่ง, Shift+Enter ขึ้นบรรทัด, / สำหรับ Quick Reply)'}
                    value={newMsg}
                    onChange={e => handleTyping(e.target.value)}
                    disabled={activeConv.isBot}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                      if (e.key === 'Escape') { setShowCanned(false); setAiSuggest(''); }
                    }}
                    style={{ resize: 'none', borderRadius: 10, paddingRight: 40, minHeight: 60 }}
                  />
                  <span style={{ position: 'absolute', right: 10, bottom: 10, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {newMsg.length > 0 ? `${newMsg.length}` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={getAISuggestion} disabled={loadingAI || activeConv.isBot} title="AI แนะนำ">
                    {loadingAI ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '✨'}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={sendMessage}
                    disabled={sending || !newMsg.trim() || activeConv.isBot}
                    style={{ padding: '8px 16px', borderRadius: 10 }}>
                    {sending ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '📤'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ═══ RIGHT: AI Smart Admin Panel ════════════════════════════════════ */}
      {activeConv && (
        <AiAdminPanel
          conv={activeConv}
          messages={messages}
          onUseDraft={(text: string) => { setNewMsg(text); textareaRef.current?.focus(); }}
          onResolve={resolveConversation}
          onToggleBot={toggleBot}
        />
      )}
    </div>
  );
}

// ─── AI Smart Admin Panel ─────────────────────────────────────────────────────
function AiAdminPanel({ conv, messages, onUseDraft, onResolve, onToggleBot }: {
  conv: any; messages: any[]; onUseDraft: (t: string) => void; onResolve: () => void; onToggleBot: () => void;
}) {
  const [tab, setTab] = useState<'profile' | 'ai' | 'actions'>('ai');
  const [drafts, setDrafts] = useState<string[]>([]);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [tone, setTone] = useState<'friendly' | 'formal' | 'urgent'>('friendly');
  const [purpose, setPurpose] = useState<'reply' | 'followup' | 'promotion' | 'apology'>('reply');
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [translateText, setTranslateText] = useState('');
  const [translated, setTranslated] = useState<any>(null);
  const [loadingTranslate, setLoadingTranslate] = useState(false);

  const contact: any = conv.contact;

  const getDrafts = async () => {
    setLoadingDraft(true); setDrafts([]);
    const tid = toast.loading('AI กำลังร่างข้อความ...');
    try {
      const r = await api.post(`/conversations/${conv.id}/ai-draft`, { tone, purpose });
      setDrafts(r.data.suggestions || []);
      toast.success(`✨ ได้ ${r.data.suggestions?.length || 0} ตัวเลือก`, { id: tid });
    } catch { toast.error('AI ไม่ตอบสนอง', { id: tid }); }
    finally { setLoadingDraft(false); }
  };

  const getSummary = async () => {
    setLoadingSummary(true);
    const tid = toast.loading('AI กำลังวิเคราะห์...');
    try {
      const r = await api.get(`/conversations/${conv.id}/summary`);
      setSummary(r.data);
      toast.success('✅ วิเคราะห์สำเร็จ', { id: tid });
    } catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); }
    finally { setLoadingSummary(false); }
  };

  const doTranslate = async () => {
    if (!translateText.trim()) return;
    setLoadingTranslate(true);
    try {
      const r = await api.post(`/conversations/${conv.id}/translate`, { text: translateText });
      setTranslated(r.data);
    } catch { toast.error('แปลไม่ได้'); }
    finally { setLoadingTranslate(false); }
  };

  const SENTIMENT_COLOR: any = { positive: 'var(--success)', neutral: 'var(--warning)', negative: 'var(--danger)' };
  const SENTIMENT_ICON: any  = { positive: '😊', neutral: '😐', negative: '😟' };
  const URGENCY_COLOR: any   = { low: 'var(--success)', medium: 'var(--warning)', high: 'var(--danger)' };

  return (
    <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab selector */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {[
          { k: 'ai', l: '✨ AI', title: 'AI ช่วยร่าง' },
          { k: 'profile', l: '👤 ลูกค้า', title: 'ข้อมูลลูกค้า' },
          { k: 'actions', l: '⚡ Action', title: 'การดำเนินการ' },
        ].map(t => (
          <button key={t.k} title={t.title} onClick={() => setTab(t.k as any)}
            style={{ flex: 1, padding: '10px 4px', border: 'none', background: tab === t.k ? 'var(--bg-tertiary)' : 'transparent', borderBottom: tab === t.k ? '2px solid var(--teal)' : '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, color: tab === t.k ? 'var(--teal)' : 'var(--text-muted)', transition: 'all 0.2s' }}>
            {t.l}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>

        {/* ─── TAB: AI ─── */}
        {tab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* AI Draft Replies */}
            <div style={{ background: 'rgba(0,212,170,0.04)', border: '1px solid rgba(0,212,170,0.15)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--teal)', marginBottom: 10 }}>✨ AI ร่างข้อความตอบ</div>

              {/* Tone selector */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>โทนการพูด</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[{ k: 'friendly', l: '😊 เป็นกันเอง' }, { k: 'formal', l: '🤝 เป็นทางการ' }, { k: 'urgent', l: '⚡ รวดเร็ว' }].map(t => (
                    <button key={t.k} onClick={() => setTone(t.k as any)}
                      style={{ flex: 1, padding: '4px 2px', borderRadius: 6, border: `1px solid ${tone === t.k ? 'var(--teal)' : 'var(--border)'}`, background: tone === t.k ? 'rgba(0,212,170,0.1)' : 'transparent', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'inherit', color: tone === t.k ? 'var(--teal)' : 'var(--text-muted)', fontWeight: tone === t.k ? 600 : 400 }}>
                      {t.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Purpose selector */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>วัตถุประสงค์</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {[{ k: 'reply', l: '💬 ตอบคำถาม' }, { k: 'followup', l: '📞 ติดตาม' }, { k: 'promotion', l: '🎁 โปรโมชั่น' }, { k: 'apology', l: '🙏 ขอโทษ' }].map(p => (
                    <button key={p.k} onClick={() => setPurpose(p.k as any)}
                      style={{ padding: '5px 4px', borderRadius: 6, border: `1px solid ${purpose === p.k ? 'var(--teal)' : 'var(--border)'}`, background: purpose === p.k ? 'rgba(0,212,170,0.1)' : 'transparent', cursor: 'pointer', fontSize: '0.68rem', fontFamily: 'inherit', color: purpose === p.k ? 'var(--teal)' : 'var(--text-muted)', fontWeight: purpose === p.k ? 600 : 400 }}>
                      {p.l}
                    </button>
                  ))}
                </div>
              </div>

              <button className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={getDrafts} disabled={loadingDraft}>
                {loadingDraft ? <><span className="spinner" style={{ width: 13, height: 13 }} /> กำลังคิด...</> : '✨ สร้างข้อความตอบ'}
              </button>
            </div>

            {/* Draft options */}
            {drafts.length > 0 && (
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>เลือก 1 ตัวเลือก (คลิกเพื่อใช้):</div>
                {drafts.map((d, i) => (
                  <div key={i} onClick={() => { onUseDraft(d); toast.success('✅ ใช้ข้อความแล้ว'); }}
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1.5, transition: 'border-color 0.2s, background 0.2s', color: 'var(--text-secondary)' }}
                    onMouseEnter={e => { (e.currentTarget as any).style.borderColor = 'var(--teal)'; (e.currentTarget as any).style.background = 'rgba(0,212,170,0.05)'; }}
                    onMouseLeave={e => { (e.currentTarget as any).style.borderColor = 'var(--border)'; (e.currentTarget as any).style.background = 'var(--bg-tertiary)'; }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#000', flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--teal)', fontWeight: 600 }}>ตัวเลือก {i + 1}</span>
                    </div>
                    {d}
                  </div>
                ))}
              </div>
            )}

            {/* Conversation Summary */}
            <div style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--purple)', marginBottom: 8 }}>🧠 วิเคราะห์บทสนทนา</div>
              <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--purple)', color: 'var(--purple)', background: 'rgba(124,58,237,0.08)' }} onClick={getSummary} disabled={loadingSummary || messages.length === 0}>
                {loadingSummary ? <><span className="spinner" style={{ width: 13, height: 13 }} /> วิเคราะห์...</> : '🔍 วิเคราะห์บทสนทนา'}
              </button>
              {summary && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--bg-tertiary)', borderRadius: 8, padding: '8px 10px' }}>
                    {summary.summary}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2 }}>ความรู้สึก</div>
                      <div style={{ fontSize: '1rem' }}>{SENTIMENT_ICON[summary.sentiment]}</div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: SENTIMENT_COLOR[summary.sentiment] }}>
                        {{ positive: 'ดี', neutral: 'กลาง', negative: 'ไม่ดี' }[summary.sentiment as string]}
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2 }}>ความเร่งด่วน</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: URGENCY_COLOR[summary.urgency], marginTop: 2 }}>
                        {{ low: '🟢 ต่ำ', medium: '🟡 ปานกลาง', high: '🔴 สูง' }[summary.urgency as string]}
                      </div>
                    </div>
                  </div>
                  {summary.intent && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: 6, padding: '5px 8px' }}>
                      🎯 ต้องการ: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{summary.intent}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Translate */}
            <div style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.15)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--info)', marginBottom: 8 }}>🌐 แปลภาษา → ไทย</div>
              <textarea className="input" rows={2} value={translateText} onChange={e => setTranslateText(e.target.value)}
                placeholder="วางข้อความที่ต้องการแปล..." style={{ fontSize: '0.78rem', resize: 'none', marginBottom: 6 }} />
              <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--info)', color: 'var(--info)', background: 'rgba(6,182,212,0.08)' }}
                onClick={doTranslate} disabled={loadingTranslate || !translateText.trim()}>
                {loadingTranslate ? <><span className="spinner" style={{ width: 13, height: 13 }} /> แปล...</> : '🌐 แปล'}
              </button>
              {translated && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 3 }}>ภาษา: {translated.lang}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', lineHeight: 1.5 }}
                    onClick={() => { onUseDraft(translated.thai); toast.success('✅ ใช้ข้อความแปลแล้ว'); }}>
                    {translated.thai} <span style={{ fontSize: '0.65rem', color: 'var(--teal)' }}>← คลิกใช้</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB: Profile ─── */}
        {tab === 'profile' && (
          <div>
            <div style={{ textAlign: 'center', paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <div className="avatar avatar-lg" style={{ margin: '0 auto 10px', fontSize: '1.2rem' }}>{contact.displayName?.[0] || '?'}</div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{contact.displayName}</div>
              {contact.username && <div style={{ fontSize: '0.78rem', color: 'var(--teal)', marginTop: 2 }}>@{contact.username}</div>}
              <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                {contact.lineUserId   && <span className="badge badge-line"     style={{ fontSize: '0.68rem' }}>🟢 LINE</span>}
                {contact.telegramId   && <span className="badge badge-telegram" style={{ fontSize: '0.68rem' }}>🔵 TG</span>}
                {contact.memberType === 'vip' && <span style={{ background: '#F59E0B22', color: '#F59E0B', border: '1px solid #F59E0B44', borderRadius: 10, padding: '1px 7px', fontSize: '0.68rem', fontWeight: 700 }}>👑 VIP</span>}
              </div>
            </div>

            {/* Financial stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'ยอดฝากรวม', value: '฿' + (contact.totalDeposit || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 }), color: 'var(--success)' },
                { label: 'ยอดถอนรวม', value: '฿' + (contact.totalWithdraw || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 }), color: 'var(--danger)' },
                { label: 'ครั้งที่ฝาก', value: `${contact.depositCount || 0} ครั้ง`, color: 'var(--teal)' },
                { label: 'กำไร',        value: '฿' + ((contact.totalDeposit || 0) - (contact.totalWithdraw || 0)).toLocaleString('th-TH', { maximumFractionDigits: 0 }), color: (contact.totalDeposit || 0) >= (contact.totalWithdraw || 0) ? 'var(--success)' : 'var(--danger)' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Contact info */}
            {[
              contact.phone   && { icon: '📞', val: contact.phone },
              contact.email   && { icon: '✉️', val: contact.email },
              contact.affiliateCode && { icon: '🤝', val: 'Affiliate: ' + contact.affiliateCode },
              contact.firstDepositAt && { icon: '💰', val: 'ฝากแรก: ' + new Date(contact.firstDepositAt).toLocaleDateString('th-TH') },
            ].filter(Boolean).map((item: any, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: '0.78rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span>{item.icon}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.val}</span>
              </div>
            ))}

            <div style={{ marginTop: 12 }}>
              <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6 }}
                onClick={() => window.open(`/contacts/${contact.id}`, '_blank')}>👤 ดูโปรไฟล์เต็ม →</button>
            </div>
          </div>
        )}

        {/* ─── TAB: Actions ─── */}
        {tab === 'actions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>บทสนทนา</div>

            {/* Bot/Human Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{conv.isBot ? '🤖 Bot ตอบ' : '👤 Human ตอบ'}</span>
              <button onClick={onToggleBot}
                style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: !conv.isBot ? 'var(--teal)' : 'var(--bg-secondary)', position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: !conv.isBot ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
              </button>
            </div>

            {conv.status !== 'resolved' && (
              <button className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start', width: '100%' }} onClick={onResolve}>✅ ปิดบทสนทนา</button>
            )}

            <button className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start' }}
              onClick={async () => {
                const tid = toast.loading('สร้าง Ticket...');
                try { await api.post('/tickets', { title: `[Inbox] ${contact?.displayName}`, contactId: contact?.id, conversationId: conv.id, priority: 'medium' }); toast.success('✅ สร้าง Ticket', { id: tid }); }
                catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); }
              }}>🎫 สร้าง Ticket</button>

            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8, marginBottom: 4, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>ข้อมูลบทสนทนา</div>
            {[
              { icon: '📅', label: 'เริ่มเมื่อ', val: new Date(conv.createdAt).toLocaleDateString('th-TH') },
              { icon: '📱', label: 'ช่องทาง', val: conv.channel === 'line' ? '🟢 LINE' : '🔵 Telegram' },
              { icon: '⚡', label: 'Priority', val: conv.priority },
              { icon: '💬', label: 'ข้อความ', val: `${messages.length} ข้อความ` },
              { icon: '👤', label: 'กำหนดให้', val: conv.assignedTo?.displayName || 'ยังไม่กำหนด' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.78rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--text-muted)' }}>{r.icon} {r.label}</span>
                <span style={{ color: 'var(--text-secondary)', maxWidth: 110, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{r.val}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


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
  platformMsgId?: string;
}
interface Conversation {
  id: string; channel: string; status: string; isBot: boolean; priority: string;
  lastMessageAt: string; createdAt: string; assignedToId?: string;
  contact: { id: string; displayName: string; avatar?: string; lineUserId?: string; telegramId?: string; whatsappId?: string; email?: string; phone?: string };
  assignedTo?: { id: string; displayName: string; avatar?: string };
  messages?: Message[];
  _unread?: number;
}

// ─── Sound Notification ───────────────────────────────────────────────────────
// ใช้ AudioContext ตัวเดียวซ้ำ + resume ทุกครั้ง (เบราว์เซอร์ suspend จนกว่าจะมี user gesture)
let _audioCtx: AudioContext | null = null;
function playNotificationSound() {
  try {
    if (typeof window === 'undefined') return;
    if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = _audioCtx;
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
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

// ─── Channel helpers (LINE / WhatsApp / Telegram) ────────────────────────────
const channelColor = (ch?: string) => ch === 'line' ? '#00B900' : ch === 'whatsapp' ? '#25D366' : '#2AABEE';
const channelLabel = (ch?: string) => ch === 'line' ? '🟢 LINE' : ch === 'whatsapp' ? '🟩 WhatsApp' : '🔵 Telegram';
const channelIcon  = (ch?: string) => ch === 'line' ? '🟢' : ch === 'whatsapp' ? '🟩' : '🔵';

// ─── Enchant tone labels ──────────────────────────────────────────────────────
const TONE_META: Record<string, { label: string; color: string }> = {
  formal:   { label: '🎩 สุภาพทางการ', color: '#6366F1' },
  friendly: { label: '😊 เป็นกันเอง',   color: '#00D4AA' },
  urgent:   { label: '⚡ กระชับ',        color: '#F59E0B' },
};

// ─── Slip Verification Badge ─────────────────────────────────────────────────
function SlipBadge({ data }: { data: any }) {
  if (!data) return null;

  const STATUS_MAP: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
    verified:  { icon: '✅', label: 'สลิปผ่านการตรวจสอบ', color: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)' },
    fake:      { icon: '❌', label: 'สลิปไม่ผ่านการตรวจสอบ', color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
    duplicate: { icon: '⚠️', label: 'สลิปซ้ำ', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
    not_slip:  { icon: '🖼️', label: 'ไม่ใช่สลิป', color: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' },
    error:     { icon: '⏳', label: 'รอตรวจสอบ', color: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' },
    pending:   { icon: '⏳', label: 'กำลังตรวจสอบ', color: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' },
  };

  const s = STATUS_MAP[data.status] || STATUS_MAP.pending;
  const VERIFY_MAP: Record<string, string> = { slipok: 'SlipOK', ai: 'AI Vision', manual: 'Manual', auto: 'Auto' };

  return (
    <div style={{
      marginTop: 8, padding: '8px 10px', borderRadius: 8,
      background: s.bg, border: `1px solid ${s.border}`,
      fontSize: '0.75rem', lineHeight: 1.6,
    }}>
      <div style={{ fontWeight: 700, color: s.color, marginBottom: 2 }}>
        {s.icon} {s.label}
      </div>
      {data.amount && (
        <div style={{ color: 'var(--text-secondary)' }}>
          💰 {Number(data.amount).toLocaleString()} บาท
        </div>
      )}
      {(data.bankFrom || data.bankTo) && (
        <div style={{ color: 'var(--text-secondary)' }}>
          🏦 {data.bankFrom || '?'} → {data.bankTo || '?'}
        </div>
      )}
      {data.transRef && (
        <div style={{ color: 'var(--text-muted)' }}>
          🔖 Ref: {data.transRef}
        </div>
      )}
      <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: 2 }}>
        🔍 {VERIFY_MAP[data.verifiedBy] || data.verifiedBy}
      </div>
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────
function MessageBubble({ msg, contactName, channel }: { msg: Message; contactName: string; channel?: string }) {
  const isCustomer = msg.senderType === 'customer';
  const isBot = msg.senderType === 'bot';
  const [lightbox, setLightbox] = useState(false);

  // Parse metadata ครั้งเดียว ใช้ร่วมกันทั้ง slip / รูป / เสียง / วิดีโอ / ไฟล์
  const meta: any = (() => {
    if (!msg.metadata) return {};
    try { return typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata; }
    catch { return {}; }
  })();
  const slipData = meta?.slipVerification || null;

  const renderContent = () => {
    // ─── รูปภาพ / สติ๊กเกอร์ (WhatsApp จะมี imageUrl หลังดาวน์โหลด) ───────────────
    // imageUrl เป็น relative path เช่น /uploads/whatsapp-media/xxx.jpg หรือ /uploads/line-images/xxx.jpg
    // → Next.js rewrite ส่งต่อไป backend อัตโนมัติ ไม่ต้องต่อ host
    const staticUrl = meta?.imageUrl || meta?.originalContentUrl || null;
    if (msg.type === 'image' || (msg.type === 'sticker' && staticUrl)) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('crm_token') || '' : '';
      const tenantId = typeof window !== 'undefined' ? localStorage.getItem('crm_tenant_id') || '' : '';

      // Fallback: LINE Content Proxy — ใช้เฉพาะ LINE เท่านั้น (WhatsApp ใช้ static file)
      const platformMsgId = msg.platformMsgId || meta?.messageId;
      const proxyUrl = (channel === 'line' && platformMsgId)
        ? `/api/line/content/${platformMsgId}?token=${encodeURIComponent(token)}&tenantId=${encodeURIComponent(tenantId)}`
        : null;

      // ใช้ staticUrl ก่อน ถ้าไม่มีใช้ proxyUrl
      const imgUrl = staticUrl || proxyUrl;

      if (imgUrl) {
        const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
          const img = e.target as HTMLImageElement;
          // ถ้ายังไม่เคยลอง proxy และมี proxyUrl → switch ไป proxy
          if (proxyUrl && !img.dataset.triedProxy) {
            img.dataset.triedProxy = 'true';
            img.src = proxyUrl;
          } else {
            img.style.display = 'none';
            img.insertAdjacentHTML('afterend', '<span style="opacity:0.7">🖼️ รูปภาพ (โหลดไม่ได้)</span>');
          }
        };
        return (
          <div>
            <img
              src={imgUrl}
              alt="รูปภาพ"
              onClick={() => setLightbox(true)}
              onError={handleImgError}
              style={{ maxWidth: 240, maxHeight: 200, borderRadius: 8, cursor: 'zoom-in', objectFit: 'cover', display: 'block' }}
            />
            <a
              href={imgUrl}
              download
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'inline-block', marginTop: 4, fontSize: '0.7rem', color: 'var(--text-muted)', textDecoration: 'none' }}
            >
              ⬇️ ดาวน์โหลด
            </a>
            {lightbox && (
              <div
                onClick={() => setLightbox(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'zoom-out' }}
              >
                <img
                  src={imgUrl}
                  alt="รูปภาพ"
                  style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
                />
              </div>
            )}
          </div>
        );
      }
      return <span style={{ opacity: 0.7 }}>🖼️ รูปภาพ (ไม่มี ID)</span>;
    }
    if (msg.type === 'sticker') return <span style={{ fontSize: '2.5rem' }}>😊</span>;
    // ─── เสียง (voice note) — เล่นฟังได้ในหน้า Inbox ─────────────────────────────
    if (msg.type === 'audio') {
      const audioUrl = meta?.audioUrl || null;
      if (audioUrl) {
        return (
          <div style={{ minWidth: 220 }}>
            <audio
              controls
              preload="metadata"
              src={audioUrl}
              style={{ width: 240, height: 40, display: 'block' }}
            />
            <a
              href={audioUrl}
              download
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-block', marginTop: 4, fontSize: '0.7rem', color: 'var(--text-muted)', textDecoration: 'none' }}
            >
              ⬇️ ดาวน์โหลดเสียง
            </a>
          </div>
        );
      }
      return <span>🎵 เสียง</span>;
    }
    // ─── วิดีโอ ─────────────────────────────────────────────────────────────────
    if (msg.type === 'video') {
      const videoUrl = meta?.videoUrl || null;
      if (videoUrl) {
        return (
          <video
            controls
            preload="metadata"
            src={videoUrl}
            style={{ maxWidth: 260, maxHeight: 320, borderRadius: 8, display: 'block' }}
          />
        );
      }
      return <span>🎬 วิดีโอ</span>;
    }
    // ─── ไฟล์เอกสาร ─────────────────────────────────────────────────────────────
    if (msg.type === 'file') {
      const fileUrl = meta?.fileUrl || null;
      if (fileUrl) {
        return (
          <a href={fileUrl} download target="_blank" rel="noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
            📎 {meta?.fileName || msg.content || 'ไฟล์'}
          </a>
        );
      }
      return <span>📎 {msg.content}</span>;
    }
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
        {slipData && <SlipBadge data={slipData} />}
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
  const [companyFilter, setCompanyFilter] = useState('all');
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [aiSuggest, setAiSuggest] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  // ─── Enchant (พิมพ์ลาว → แปลไทย + แนะนำ 3 โทน) ───────────────────────────────
  const [enchant, setEnchant] = useState<{ lang: string; thai: string; suggestions: { tone: string; text: string }[] } | null>(null);
  const [loadingEnchant, setLoadingEnchant] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showCanned, setShowCanned] = useState(false);
  const [cannedFilter, setCannedFilter] = useState('');
  // ─── Key ลัด (AI Quick Replies จาก DB) ────────────────────────────────────
  const [quickReplies, setQuickReplies] = useState<any[]>([]);
  const [composingQR, setComposingQR] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  // ─── External Reply Detection ───────────────────────────────────────────────
  // true = มีสัญญาณว่า admin ตอบนอก CRM (ลูกค้าส่งล่าสุด แต่ใน DB ไม่มี agent reply ตามมา
  //         ทั้งที่ conversation status เป็น resolved/open แล้ว)
  const [externalReplyWarning, setExternalReplyWarning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // ─── Admin Presence (ป้องกันตอบซ้อน) ──────────────────────────────────────
  const [convViewers, setConvViewers] = useState<{ userId: string; displayName: string; username: string }[]>([]);
  const [adminTyping, setAdminTyping] = useState<string | null>(null); // displayName ของแอดมินที่กำลังพิมพ์
  const adminTypingTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeConvRef = useRef<string | null>(null);
  const typingTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

  // ─── Load conversations ───────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    const params: any = { limit: 50 };
    if (filter !== 'all') { if (filter === 'mine') params.assignedTo = 'me'; else params.status = filter; }
    if (channel !== 'all') params.channel = channel;
    if (companyFilter !== 'all') params.companyId = companyFilter;
    if (search) params.search = search;
    try {
      const r = await api.get('/conversations', { params });
      const convs = r.data.conversations || [];
      setConversations(convs); // totalUnread ถูกคำนวณใน useEffect ที่ผูกกับ conversations
    } catch { toast.error('โหลดบทสนทนาไม่ได้'); }
  }, [filter, channel, companyFilter, search]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // โหลดรายชื่อบริษัท (สำหรับตัวกรอง) — ถ้ามีมากกว่า 1 บริษัทจะโชว์ dropdown
  useEffect(() => {
    api.get('/companies').then(r => setCompanies(r.data.companies || [])).catch(() => {});
    // โหลด key ลัดของ tenant
    api.get('/quick-replies').then(r => setQuickReplies((r.data.items || []).filter((i: any) => i.isActive))).catch(() => {});
  }, []);

  // อัปเดตตัวเลข "X ใหม่" บนหัว list ให้ตามจำนวนห้องที่ยังไม่อ่าน (เรียลไทม์)
  useEffect(() => {
    setTotalUnread(conversations.filter(c => (c._unread ?? 0) > 0).length);
  }, [conversations]);

  // ─── Load messages ────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (id: string) => {
    setLoadingMessages(true);
    try {
      const r = await api.get(`/conversations/${id}`);
      const conv = r.data.conversation;
      const msgs: Message[] = conv?.messages || [];
      setMessages(msgs);
      setActiveConv(conv);
      activeConvRef.current = id;

      // ─── External Reply Detection ─────────────────────────────────────────
      // ตรวจหา "gap": ถ้าข้อความล่าสุดใน DB เป็น customer แต่ conversation
      // status ไม่ใช่ 'bot'/'open' อีกต่อไป (resolved/closed) หรือ
      // มีช่องว่างเวลา > 3 นาที ระหว่าง customer message ล่าสุดกับ reply
      // → อาจหมายความว่า admin ตอบนอก CRM แล้ว
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        const lastCustomerIdx = [...msgs].reverse().findIndex(m => m.senderType === 'customer');
        const lastCustomer = lastCustomerIdx >= 0 ? msgs[msgs.length - 1 - lastCustomerIdx] : null;

        if (lastCustomer) {
          // หา agent/bot message ที่ตามหลัง lastCustomer
          const lastCustomerTime = new Date(lastCustomer.createdAt).getTime();
          const agentAfter = msgs.find(m =>
            (m.senderType === 'agent' || m.senderType === 'bot') &&
            new Date(m.createdAt).getTime() > lastCustomerTime
          );

          // ถ้าไม่มี agent reply หลังข้อความลูกค้าล่าสุด
          // และ conversation status เป็น resolved/closed (admin จัดการนอก CRM)
          // หรือข้อความล่าสุดเป็น customer และ gap > 5 นาที
          const gapMs = Date.now() - lastCustomerTime;
          const isLongGap = gapMs > 5 * 60 * 1000; // > 5 นาที
          const isResolvedWithNoReply = (conv?.status === 'resolved' || conv?.status === 'closed') && !agentAfter;
          const lastMsgIsCustomer = lastMsg.senderType === 'customer' && isLongGap && !agentAfter;

          setExternalReplyWarning(isResolvedWithNoReply || lastMsgIsCustomer);
        } else {
          setExternalReplyWarning(false);
        }
      } else {
        setExternalReplyWarning(false);
      }
    } catch { toast.error('โหลดข้อความไม่ได้'); }
    finally { setLoadingMessages(false); }
  }, []);

  // ─── Select conversation + join socket room ───────────────────────────────
  const selectConversation = useCallback((conv: Conversation) => {
    if (activeConvRef.current) getSocket()?.emit('leave:conversation', activeConvRef.current);
    setActiveConv(conv);
    setMessages([]);
    setAiSuggest('');
    setEnchant(null);
    setConvViewers([]); // reset viewers เมื่อเปลี่ยน conversation
    setAdminTyping(null);
    setExternalReplyWarning(false); // reset warning เมื่อเปลี่ยน conversation
    getSocket()?.emit('join:conversation', conv.id);
    loadMessages(conv.id);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, _unread: 0 } : c));
  }, [loadMessages]);

  // ─── Manual Sync — เรียก backend sync-line API ──────────────────────────────
  const syncMessages = useCallback(async () => {
    if (!activeConv || syncing) return;
    setSyncing(true);
    const toastId = toast.loading('🔄 กำลัง Sync กับ LINE...');
    try {
      if (activeConv.channel === 'line') {
        // เรียก /sync-line API: update profile + ตรวจ gap + inject notes
        const r = await api.post(`/conversations/${activeConv.id}/sync-line`);
        const s = r.data.summary;

        // แสดงผลสรุป
        const lines = s.results as string[];
        toast.success(
          `✅ Sync เสร็จ\n${lines.slice(0, 3).join('\n')}`,
          { id: toastId, duration: 5000 }
        );

        if (s.gapsFound > 0) {
          toast(`⚠️ พบ ${s.gapsFound} gap — บันทึก note เข้าประวัติแล้ว`, {
            icon: '📝', duration: 4000,
          });
          setExternalReplyWarning(false); // ซ่อน banner เพราะ inject note แล้ว
        }
      } else {
        toast.success('🔄 รีเฟรชข้อความแล้ว', { id: toastId });
      }

      // Reload messages หลัง sync เสมอ
      await loadMessages(activeConv.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Sync ไม่สำเร็จ', { id: toastId });
    } finally {
      setSyncing(false);
    }
  }, [activeConv, syncing, loadMessages]);

  // ─── Auto-scroll ─────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Socket: new_message ─────────────────────────────────────────────────
  useSocket('new_message', (data: any) => {
    const isActive = data.conversationId === activeConvRef.current;
    const isCustomer = data.message?.senderType === 'customer';
    const nowIso = new Date().toISOString();

    // 1) ถ้าเปิดห้องนี้อยู่ → ต่อข้อความใหม่ทันที (ทุก senderType)
    if (isActive) {
      setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
      setTypingUsers([]);
    }

    // 2) เสียง + แจ้งเตือน เมื่อลูกค้าทักเข้ามา (ทุกห้อง — ดังแม้กำลังเปิดห้องอื่น)
    if (isCustomer) {
      playNotificationSound();
      if (!isActive) {
        toast('💬 ข้อความใหม่จาก ' + (data.contact?.displayName || 'ลูกค้า'), { icon: channelIcon(data.channel) });
      }
    }

    // 3) อัปเดต list — ถ้าห้องยังไม่อยู่ใน list (ห้องใหม่/ลูกค้าใหม่) ให้โหลด list ใหม่
    const known = conversations.some(c => c.id === data.conversationId);
    if (!known) {
      loadConversations();
      return;
    }
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === data.conversationId);
      if (idx === -1) return prev;
      const updated: Conversation = {
        ...prev[idx],
        lastMessageAt: nowIso,
        messages: [data.message],                       // อัปเดตข้อความตัวอย่างใน list
        _unread: isActive ? 0 : (isCustomer ? ((prev[idx]._unread || 0) + 1) : (prev[idx]._unread || 0)),
      };
      // ย้ายห้องที่มีข้อความใหม่ขึ้นบนสุด
      return [updated, ...prev.filter((_, i) => i !== idx)];
    });
  });

  useSocket('conversation_updated', () => { loadConversations(); if (activeConvRef.current) loadMessages(activeConvRef.current); });

  // ─── Admin Typing (ป้องกันตอบซ้อน) ──────────────────────────────────────
  useSocket('admin_typing', (data: any) => {
    if (data.conversationId !== activeConvRef.current) return;
    setTypingUsers(prev => prev.includes(data.username) ? prev : [...prev, data.username]);
    setAdminTyping(data.displayName || data.username);
    clearTimeout(typingTimeout.current);
    clearTimeout(adminTypingTimeout.current);
    typingTimeout.current = setTimeout(() => setTypingUsers([]), 3000);
    adminTypingTimeout.current = setTimeout(() => setAdminTyping(null), 3000);
  });

  // ─── Admin Presence: เข้า/ออก conversation ───────────────────────────────
  useSocket('admin_enter', (data: any) => {
    if (data.conversationId !== activeConvRef.current) return;
    setConvViewers(data.viewers || []);
  });
  useSocket('admin_leave', (data: any) => {
    if (data.conversationId !== activeConvRef.current) return;
    setConvViewers(data.viewers || []);
  });
  useSocket('conversation_viewers', (data: any) => {
    if (data.conversationId !== activeConvRef.current) return;
    setConvViewers(data.viewers || []);
  });

  // ─── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!newMsg.trim() || !activeConv || sending) return;
    setSending(true);
    const content = newMsg;
    setNewMsg(''); setAiSuggest(''); setShowCanned(false); setEnchant(null);
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

  // ─── Enchant: ส่งร่าง (ลาว) → รับคำแปลไทย + คำตอบ 3 โทน ──────────────────────
  const enchantDraft = async () => {
    if (!activeConv || loadingEnchant || !newMsg.trim()) return;
    setLoadingEnchant(true);
    const toastId = toast.loading('✨ Enchant กำลังแปลและคิดคำตอบ...');
    try {
      const r = await api.post(`/conversations/${activeConv.id}/enchant`, { draft: newMsg });
      setEnchant({ lang: r.data.lang, thai: r.data.thai, suggestions: r.data.suggestions || [] });
      setShowCanned(false); setAiSuggest('');
      toast.success(`✨ ได้ ${r.data.suggestions?.length || 0} คำตอบ`, { id: toastId });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Enchant ไม่สำเร็จ', { id: toastId });
    } finally { setLoadingEnchant(false); }
  };

  // ใช้คำตอบที่ Enchant แนะนำ → ใส่ลงช่องพิมพ์ (แอดมินกด Enter ส่งเอง)
  const useEnchantSuggestion = (text: string) => {
    setNewMsg(text);
    setEnchant(null);
    textareaRef.current?.focus();
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

  // ─── Key ลัดจาก DB filtered ───────────────────────────────────────────────
  const filteredQuickReplies = quickReplies.filter(q =>
    q.trigger.includes(cannedFilter.toLowerCase()) ||
    q.title.toLowerCase().includes(cannedFilter.slice(1).toLowerCase()) ||
    q.content.toLowerCase().includes(cannedFilter.slice(1).toLowerCase())
  );

  // กด key ลัด → AI แต่งคำตอบจากเนื้อหา + บริบทแชท → ใส่ช่องพิมพ์ให้ตรวจก่อนส่ง
  const applyQuickReply = async (q: any) => {
    setShowCanned(false);
    if (!q.aiCompose) { setNewMsg(q.content); textareaRef.current?.focus(); return; }
    if (composingQR) return;
    setComposingQR(q.id);
    const toastId = toast.loading(`⚡ AI กำลังแต่งคำตอบ "${q.title}"...`);
    try {
      const r = await api.post(`/quick-replies/${q.id}/compose`, { conversationId: activeConv?.id });
      setNewMsg(r.data.text || q.content);
      toast.success('⚡ ใส่คำตอบในช่องพิมพ์แล้ว — ตรวจแล้วกดส่งได้เลย', { id: toastId });
      textareaRef.current?.focus();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'AI แต่งคำตอบไม่สำเร็จ', { id: toastId });
      setNewMsg(q.content); // fallback เนื้อหาดิบ
      textareaRef.current?.focus();
    } finally { setComposingQR(null); }
  };

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

          {companies.length > 1 && (
            <select
              className="input"
              value={companyFilter}
              onChange={e => setCompanyFilter(e.target.value)}
              style={{ marginBottom: 8, fontSize: '0.82rem', padding: '6px 10px', cursor: 'pointer' }}
            >
              <option value="all">🏢 ทุกบริษัท</option>
              {companies.map(c => <option key={c.id} value={c.id}>🏢 {c.name}</option>)}
            </select>
          )}

          <div className={styles.channelFilters}>
            {[
              { key: 'all', label: 'ทุกช่อง', icon: '📱' },
              { key: 'line', label: 'LINE', icon: '🟢' },
              { key: 'whatsapp', label: 'WhatsApp', icon: '🟩' },
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
                  <div style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: '50%', background: channelColor(conv.channel), border: '2px solid var(--bg-secondary)' }} />
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
                <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: channelColor(activeConv.channel), border: '2px solid var(--bg-secondary)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{activeConv.contact?.displayName}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                  <span className={`badge badge-${activeConv.channel}`} style={{ fontSize: '0.7rem' }}>
                    {channelLabel(activeConv.channel)}
                  </span>
                  <span className={`badge badge-${activeConv.status}`} style={{ fontSize: '0.7rem' }}>{activeConv.status}</span>
                  {activeConv.assignedTo && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>👤 {activeConv.assignedTo.displayName}</span>}
                  {/* ── CRM-only notice ── */}
                  <span title="ข้อความที่ตอบจาก LINE OA Manager โดยตรงจะไม่บันทึกใน CRM" style={{
                    fontSize: '0.62rem', padding: '1px 6px',
                    background: 'rgba(245,158,11,0.1)', color: 'var(--warning)',
                    border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8,
                    cursor: 'help', whiteSpace: 'nowrap',
                  }}>⚠️ ตอบผ่าน CRM เท่านั้น</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {/* Sync/Refresh Button */}
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={syncMessages}
                  disabled={syncing}
                  title="รีเฟรชข้อความล่าสุด"
                  style={{ fontSize: '0.9rem' }}
                >
                  {syncing
                    ? <span className="spinner" style={{ width: 13, height: 13 }} />
                    : '🔄'
                  }
                </button>
                {/* Bot/Human Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-tertiary)', borderRadius: 20, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.75rem', color: activeConv.isBot ? 'var(--purple)' : 'var(--teal)' }}>
                    {activeConv.isBot ? '🤖 Bot' : '👤 Human'}
                  </span>
                  <label className="toggle" style={{ transform: 'scale(0.85)' }}>
                    <input type="checkbox" checked={false} disabled title="Bot mode is always enabled" />
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




            {/* ═══ Admin Presence Bar — แอดมินคนไหนกำลังดูอยู่ ═══════════════════════════ */}
            {convViewers.length > 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 16px',
                background: 'rgba(0,212,170,0.06)',
                borderBottom: '1px solid rgba(0,212,170,0.15)',
                fontSize: '0.75rem', color: 'var(--teal)',
              }}>
                <span>👥 กำลังดูอยู่:</span>
                {convViewers.map(v => (
                  <span key={v.userId} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 12,
                    background: 'rgba(0,212,170,0.12)',
                    border: '1px solid rgba(0,212,170,0.2)',
                    fontWeight: 600,
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal)', display: 'inline-block' }} />
                    {v.displayName || v.username}
                  </span>
                ))}
                {convViewers.length > 1 && (
                  <span style={{ color: 'var(--warning)', marginLeft: 4, fontWeight: 600 }}>
                    ⚠️ มีแอดมินหลายคนดูอยู่
                  </span>
                )}
              </div>
            )}

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
                <MessageBubble key={msg.id} msg={msg} contactName={activeConv.contact?.displayName} channel={activeConv.channel} />
              ))}
              {/* Typing Indicator — สำหรับที่แอดมินอื่นกำลังพิมพ์ */}
              {typingUsers.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div className="avatar avatar-sm" style={{ background: 'var(--warning)', fontSize: '0.7rem' }}>
                    {typingUsers[0]?.[0] || 'A'}
                  </div>
                  <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: '8px 14px', border: '1px solid rgba(245,158,11,0.3)' }}>
                    <div className="typing-indicator" style={{ padding: 0 }}>
                      <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>
                    👤 {typingUsers.join(', ')} กำลังพิมพ์...
                  </span>
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

            {/* ═══ Enchant Suggestions — แปลร่าง (ลาว) + คำตอบ 3 โทน ═══════════════ */}
            {enchant && (
              <div style={{
                margin: '0 16px 8px', padding: 12,
                background: 'rgba(124,58,237,0.05)',
                border: '1px solid rgba(124,58,237,0.25)', borderRadius: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: 'var(--purple)', fontSize: '0.82rem' }}>✨ Enchant</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    แปลจาก {enchant.lang} → เลือกคำตอบที่จะส่ง
                  </span>
                  <button onClick={() => setEnchant(null)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                </div>
                {/* คำแปลร่างเป็นไทย */}
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderRadius: 8, padding: '6px 10px', marginBottom: 8, lineHeight: 1.5 }}>
                  📝 ร่างของคุณ (ไทย): <span style={{ color: 'var(--text-primary)' }}>{enchant.thai}</span>
                </div>
                {/* คำตอบแนะนำ 3 โทน */}
                {enchant.suggestions.length === 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>ไม่มีคำตอบแนะนำ</div>
                )}
                {enchant.suggestions.map((s, i) => {
                  const meta = TONE_META[s.tone] || { label: s.tone, color: 'var(--teal)' };
                  return (
                    <div key={i} onClick={() => { useEnchantSuggestion(s.text); toast.success('✅ ใส่คำตอบแล้ว — กด Enter เพื่อส่ง'); }}
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', marginBottom: 6, cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s' }}
                      onMouseEnter={e => { (e.currentTarget as any).style.borderColor = meta.color; (e.currentTarget as any).style.background = 'rgba(124,58,237,0.06)'; }}
                      onMouseLeave={e => { (e.currentTarget as any).style.borderColor = 'var(--border)'; (e.currentTarget as any).style.background = 'var(--bg-tertiary)'; }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: meta.color }}>{meta.label}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-muted)' }}>คลิกเพื่อใช้ →</span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{s.text}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Canned Responses Popup */}
            {showCanned && (filteredQuickReplies.length > 0 || filteredCanned.length > 0) && (
              <div className={styles.cannedPopup}>
                {/* ── Key ลัด (AI) จาก DB ── */}
                {filteredQuickReplies.length > 0 && (
                  <>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '8px 12px 4px', borderBottom: '1px solid var(--border)' }}>
                      🤖 Key ลัด — AI แต่งคำตอบให้เข้ากับแชท
                    </div>
                    {filteredQuickReplies.map(q => (
                      <div key={q.id} className={styles.cannedItem}
                        onClick={() => applyQuickReply(q)}
                        style={{ opacity: composingQR && composingQR !== q.id ? 0.5 : 1 }}>
                        <span style={{ color: 'var(--purple)', fontWeight: 600, fontSize: '0.8rem', minWidth: 60 }}>
                          {composingQR === q.id ? '⏳' : q.trigger}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {q.aiCompose ? '🤖 ' : ''}{q.title} — {q.content}
                        </span>
                      </div>
                    ))}
                  </>
                )}
                {/* ── Quick Replies เดิม (แทรกตรงๆ) ── */}
                {filteredCanned.length > 0 && (
                  <>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '8px 12px 4px', borderBottom: '1px solid var(--border)' }}>
                      ⚡ Quick Replies
                    </div>
                    {filteredCanned.map(c => (
                      <div key={c.trigger} className={styles.cannedItem} onClick={() => { setNewMsg(c.text); setShowCanned(false); textareaRef.current?.focus(); }}>
                        <span style={{ color: 'var(--teal)', fontWeight: 600, fontSize: '0.8rem', minWidth: 60 }}>{c.trigger}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.text}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Input Area */}
            <div className={styles.chatInput}>
              {activeConv.isBot && (
                <div style={{ textAlign: 'center', padding: '8px 16px', color: 'var(--purple)', fontSize: '0.8rem', background: 'rgba(124,58,237,0.05)', borderTop: '1px solid rgba(124,58,237,0.1)' }}>
                  🤖 Bot ตอบอัตโนมัติอยู่ — แอดมินพิมพ์และกดส่งตอบเองได้ทันที โดยไม่ต้องสลับโหมด
                </div>
              )}
              {/* ── LINE OA Direct Reply Reminder (สำหรับ LINE conversations) ── */}
              {!activeConv.isBot && activeConv.channel === 'line' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 16px',
                  background: 'rgba(0,185,0,0.04)',
                  borderTop: '1px solid rgba(0,185,0,0.12)',
                  fontSize: '0.7rem', color: 'rgba(0,185,0,0.8)',
                }}>
                  <span>🟢</span>
                  <span>ข้อความนี้จะส่งผ่าน LINE API และ<strong>บันทึกใน CRM อัตโนมัติ</strong> — อย่าตอบผ่าน LINE OA Manager</span>
                </div>
              )}
              {/* ⚠️ Warning: แอดมินคนอื่นกำลังพิมพ์ — เตือนไม่ให้ตอบซ้อน */}
              {adminTyping && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 16px',
                  background: 'rgba(245,158,11,0.08)',
                  borderTop: '1px solid rgba(245,158,11,0.25)',
                  fontSize: '0.78rem', color: 'var(--warning)',
                  fontWeight: 600,
                  animation: 'pulse 1.5s infinite',
                }}>
                  <span>⚠️</span>
                  <span>{adminTyping} กำลังพิมพ์ตอบลูกค้าอยู่ — โปรดรอก่อนส่ง</span>
                  <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.7rem', fontWeight: 400 }}>เพื่อป้องกันการตอบซ้อน</span>
                </div>
              )}
              {/* ── Enchant toolbar — พิมพ์ลาว แล้วให้ AI แปล+แนะนำ ── */}
              {!activeConv.isBot && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 0' }}>
                  <button
                    className="btn btn-sm"
                    onClick={enchantDraft}
                    disabled={loadingEnchant || !newMsg.trim()}
                    title="พิมพ์ภาษาลาว แล้วกด Enchant — AI แปลเป็นไทย + แนะนำคำตอบ 3 โทน"
                    style={{ borderColor: 'var(--purple)', color: 'var(--purple)', background: 'rgba(124,58,237,0.1)', whiteSpace: 'nowrap', fontWeight: 700 }}
                  >
                    {loadingEnchant
                      ? <><span className="spinner" style={{ width: 13, height: 13 }} /> กำลังคิด...</>
                      : '✨ Enchant'}
                  </button>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    พิมพ์ภาษาลาว แล้วกด Enchant → AI แปลไทย + แนะนำคำตอบ 3 โทน
                  </span>
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
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        // ถ้า popup key ลัดเปิดอยู่ → Enter = เลือกตัวแรก (ไม่ส่ง "/xxx" ดิบๆ หาลูกค้า)
                        if (showCanned && filteredQuickReplies.length > 0) { applyQuickReply(filteredQuickReplies[0]); return; }
                        if (showCanned && filteredCanned.length > 0) { setNewMsg(filteredCanned[0].text); setShowCanned(false); return; }
                        if (newMsg.trim().startsWith('/') && quickReplies.length > 0) { toast.error('ไม่พบ key ลัดนี้ — กด Esc ถ้าต้องการส่งข้อความปกติ'); return; }
                        sendMessage();
                      }
                      if (e.key === 'Escape') { setShowCanned(false); setAiSuggest(''); setEnchant(null); }
                    }}
                    style={{ resize: 'none', borderRadius: 10, paddingRight: 40, minHeight: 60 }}
                  />
                  <span style={{ position: 'absolute', right: 10, bottom: 10, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {newMsg.length > 0 ? `${newMsg.length}` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm btn-icon" disabled={activeConv.isBot}
                    title="⚡ Key ลัด — AI แต่งคำตอบจากที่ตั้งไว้"
                    onClick={() => { setCannedFilter('/'); setShowCanned(v => !v); textareaRef.current?.focus(); }}>
                    ⚡
                  </button>
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
                {contact.whatsappId   && <span className="badge badge-whatsapp" style={{ fontSize: '0.68rem' }}>🟩 WhatsApp</span>}
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

            {/* ─── ข้อมูลที่ลูกค้าแจ้งไว้ (บันทึกอัตโนมัติจากแชท) ─── */}
            {(() => {
              let prof: any = {};
              try { prof = JSON.parse(contact.customFields || '{}')?.crm_profile || {}; } catch { prof = {}; }
              const rows = [
                prof.fullName     && { icon: '🪪', label: 'ชื่อ-สกุล', val: prof.fullName },
                prof.phone        && { icon: '📱', label: 'เบอร์', val: prof.phone },
                prof.bankName     && { icon: '🏦', label: 'ธนาคาร', val: prof.bankName },
                prof.bankAccount  && { icon: '💳', label: 'เลขบัญชี', val: prof.bankAccount },
                prof.gameUsername && { icon: '🎮', label: 'ยูสเซอร์', val: prof.gameUsername },
              ].filter(Boolean) as any[];
              if (!rows.length) return null;
              return (
                <div style={{ marginTop: 12, background: 'var(--bg-tertiary)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--teal)', marginBottom: 6 }}>
                    💾 ข้อมูลที่ลูกค้าแจ้ง (บันทึกอัตโนมัติ)
                    {prof.updatedAt && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>{new Date(prof.updatedAt).toLocaleDateString('th-TH')}</span>}
                  </div>
                  {rows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: '0.78rem' }}>
                      <span>{r.icon}</span>
                      <span style={{ color: 'var(--text-muted)', minWidth: 62 }}>{r.label}</span>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600, wordBreak: 'break-all' }}>{r.val}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

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
              <span style={{ fontSize: '0.75rem', color: 'var(--purple)' }}>เปิดตลอด</span>
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
              { icon: '📱', label: 'ช่องทาง', val: channelLabel(conv.channel) },
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

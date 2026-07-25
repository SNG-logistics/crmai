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
const FILTER_KEYS = [
  { key: 'all',      labelTh: 'ทั้งหมด', labelLo: 'ທັງໝົດ',          icon: '📬' },
  { key: 'open',     labelTh: 'เปิด',    labelLo: 'ເປີດ',            icon: '🔵' },
  { key: 'mine',     labelTh: 'ของฉัน',  labelLo: 'ຂອງຂ້ອຍ',         icon: '👤' },
  { key: 'bot',      labelTh: 'Bot',     labelLo: 'Bot',              icon: '🤖' },
  { key: 'pending',  labelTh: 'รอ',      labelLo: 'ລໍຖ້າ',           icon: '⏳' },
  { key: 'resolved', labelTh: 'แก้แล้ว', labelLo: 'ແກ້ໄຂແລ້ວ',     icon: '✅' },
];

const CANNED = [
  { trigger: '/hi',      text: 'สวัสดีค่ะ ยินดีให้บริการนะคะ มีอะไรให้ช่วยเหลือได้บ้างคะ? 😊', category: 'ทักทาย' },
  { trigger: '/hello',   text: 'สวัสดีครับ ยินดีให้บริการครับ มีอะไรให้ช่วยได้บ้างครับ? 🙏', category: 'ทักทาย' },
  { trigger: '/wait',    text: 'กรุณารอสักครู่นะคะ กำลังตรวจสอบให้เลยค่ะ 🔍', category: 'ทั่วไป' },
  { trigger: '/check',   text: 'กำลังตรวจสอบข้อมูลให้ค่ะ รอสักครู่นะคะ ⏳', category: 'ทั่วไป' },
  { trigger: '/thanks',  text: 'ขอบคุณที่ติดต่อเข้ามานะคะ หากมีคำถามเพิ่มเติมยินดีให้บริการเสมอค่ะ 🙏', category: 'ปิดการสนทนา' },
  { trigger: '/close',   text: 'ขอบคุณมากค่ะ หากมีปัญหาหรือข้อสงสัยสามารถติดต่อกลับมาได้เลยนะคะ 😊', category: 'ปิดการสนทนา' },
  { trigger: '/sorry',   text: 'ขออภัยในความไม่สะดวกด้วยนะคะ เราจะรีบดำเนินการให้เร็วที่สุดค่ะ 🙏', category: 'ทั่วไป' },
  { trigger: '/price',   text: 'สนใจสอบถามราคา สามารถแจ้งรายการที่ต้องการได้เลยนะคะ ทางทีมจะแจ้งราคาให้ทันทีค่ะ 💰', category: 'ราคา' },
  { trigger: '/promo',   text: 'ขณะนี้มีโปรโมชั่นพิเศษสำหรับสมาชิก! ต้องการทราบรายละเอียดเพิ่มเติมไหมคะ? 🎁', category: 'ราคา' },
  { trigger: '/contact', text: 'สามารถติดต่อเราได้ทุกช่องทาง LINE/โทรศัพท์/เว็บไซต์ หรือแจ้งเรื่องที่นี่ได้เลยค่ะ 📞', category: 'ติดต่อ' },
  { trigger: '/team',    text: 'ขอโอนสายให้ทีมผู้เชี่ยวชาญดูแลต่อนะคะ กรุณารอสักครู่ค่ะ 👤', category: 'ทั่วไป' },
  { trigger: '/dep',     text: 'ยอดฝากเข้าระบบแล้วนะคะ กรุณาตรวจสอบที่บัญชีของท่านได้เลยค่ะ ✅', category: 'เกม' },
  { trigger: '/with',    text: 'รายการถอนกำลังดำเนินการค่ะ ใช้เวลาประมาณ 5-15 นาทีนะคะ ⏳', category: 'เกม' },
  { trigger: '/bonus',   text: 'โบนัสได้รับการอนุมัติแล้วค่ะ ยอดจะเพิ่มในบัญชีภายใน 5 นาทีค่ะ 🎁', category: 'เกม' },
  { trigger: '/verify',  text: 'กรุณาส่งเอกสารยืนยันตัวตน (บัตรประชาชน + selfie) เพื่อยืนยันบัญชีนะคะ 📋', category: 'เกม' },
];

// ─── Lao Lottery Parser ───────────────────────────────────────────────────────
interface LaoLotteryResult {
  raw: string; numbers: string[]; count: number;
  service: string; round: string;
  pricePerNumber: number; total: number;
  readCode: string; readText: string;
  grid: { number: string; readCode: string; priceText: string; service: string; round: string; totalText: string }[];
}
function parseLaoLottery(input: string): LaoLotteryResult | null {
  const raw = input.trim();
  const match = raw.match(/^(.+?)\s*=\s*([\d.,]+)\s*([^\s]*)\s*(.*)$/);
  if (!match) return null;
  const numbers = (match[1].match(/\d{1,3}/g) || []).map(n => n.padStart(2, '0'));
  if (numbers.length === 0) return null;
  const unitText = match[3] || '';
  const detailText = (match[4] || '').trim();
  let pricePerNumber = Number(match[2].replace(/,/g, ''));
  if (/[ลlLkK]/.test(unitText)) pricePerNumber *= 1000;
  if (isNaN(pricePerNumber) || pricePerNumber <= 0) return null;
  const roundMatch = detailText.match(/(\d{1,2}\.\d{1,2})/);
  const round = roundMatch ? roundMatch[1] : '';
  const service = detailText.replace(round, '').trim() || 'หวยลาว';
  const total = numbers.length * pricePerNumber;
  const readCode = 'l' + numbers.join('l') + 'l';
  return { raw, numbers, count: numbers.length, service, round, pricePerNumber, total, readCode, readText: `${readCode} total ${total.toLocaleString()} kip`, grid: numbers.map(num => ({ number: num, readCode: `l${num}l`, priceText: `${pricePerNumber.toLocaleString()} kip`, service, round, totalText: `${total.toLocaleString()} kip` })) };
}

function LaoLotteryPreview({ result, onSend, onDismiss }: { result: LaoLotteryResult; onSend: (text: string) => void; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(result.readText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); };
  return (
    <div style={{ margin: '0 0 10px 0', borderRadius: 12, overflow: 'hidden', border: '1.5px solid rgba(168,85,247,0.35)', background: 'linear-gradient(135deg,rgba(88,28,135,0.18),rgba(59,7,100,0.12))', boxShadow: '0 4px 18px rgba(139,92,246,0.18)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(139,92,246,0.18)', borderBottom: '1px solid rgba(168,85,247,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: '1rem' }}>🎰</span>
          <span style={{ fontWeight: 800, fontSize: '.82rem', color: '#c4b5fd' }}>ຫວຍລາວ — ຮັບລາຍການ</span>
          <span style={{ fontSize: '.68rem', color: '#a78bfa', background: 'rgba(167,139,250,0.15)', borderRadius: 5, padding: '1px 7px' }}>{result.service} · ຮອບ {result.round}</span>
        </div>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '2px 5px' }}>✕</button>
      </div>
      <div style={{ overflowX: 'auto', padding: '10px 12px 4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.75rem' }}>
          <thead><tr style={{ color: '#c4b5fd', fontWeight: 700, textAlign: 'left' }}>{['ເລກ','ລະຫັດ','ລາຄາ/ເລກ','ປະເພດ','ຮອບ','ຍອດລວມ'].map(h=><th key={h} style={{padding:'3px 8px 6px',borderBottom:'1px solid rgba(167,139,250,0.2)',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
          <tbody>{result.grid.map((row,i)=><tr key={i} style={{borderBottom:'1px solid rgba(167,139,250,0.08)'}}><td style={{padding:'4px 8px',fontWeight:900,color:'#f0abfc',fontSize:'.88rem'}}>{row.number}</td><td style={{padding:'4px 8px',color:'#e9d5ff',fontFamily:'monospace'}}>{row.readCode}</td><td style={{padding:'4px 8px',color:'#d8b4fe'}}>{row.priceText}</td><td style={{padding:'4px 8px',color:'#c4b5fd'}}>{row.service}</td><td style={{padding:'4px 8px',color:'#c4b5fd'}}>{row.round}</td><td style={{padding:'4px 8px',fontWeight:800,color:'#fbbf24'}}>{row.totalText}</td></tr>)}</tbody>
        </table>
      </div>
      <div style={{ padding: '8px 12px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, borderTop: '1px solid rgba(167,139,250,0.15)', marginTop: 4 }}>
        <div style={{ fontFamily: 'monospace', fontSize: '.8rem', color: '#e9d5ff', background: 'rgba(139,92,246,0.15)', borderRadius: 7, padding: '4px 10px', letterSpacing: '.5px' }}>{result.readText}</div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={copy} style={{ border: '1px solid rgba(167,139,250,0.4)', background: 'transparent', color: '#c4b5fd', borderRadius: 7, padding: '5px 11px', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer' }}>{copied ? '✅ copied' : '📋 copy'}</button>
          <button onClick={() => onSend(result.readText)} style={{ border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', borderRadius: 7, padding: '5px 14px', fontSize: '.74rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 3px 10px rgba(139,92,246,0.4)' }}>📤 ສ່ງຂໍ້ຄວາມນີ້</button>
        </div>
      </div>
    </div>
  );
}

// ─── Channel helpers ──────────────────────────────────────────────────────────
const channelColor = (ch?: string) => ch === 'line' ? '#00B900' : ch === 'whatsapp' ? '#25D366' : '#2AABEE';
const channelLabel = (ch?: string) => ch === 'line' ? '🟢 LINE' : ch === 'whatsapp' ? '🟩 WhatsApp' : '🔵 Telegram';
const channelIcon  = (ch?: string) => ch === 'line' ? '🟢' : ch === 'whatsapp' ? '🟩' : '🔵';

const TONE_META: Record<string, { label: string; color: string }> = {
  formal:   { label: '🎩 สุภาพทางการ', color: '#6366F1' },
  friendly: { label: '😊 เป็นกันเอง',   color: '#00D4AA' },
  urgent:   { label: '⚡ กระชับ',        color: '#F59E0B' },
};

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
    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: s.bg, border: `1px solid ${s.border}`, fontSize: '0.75rem', lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700, color: s.color, marginBottom: 2 }}>{s.icon} {s.label}</div>
      {data.amount && <div style={{ color: 'var(--text-secondary)' }}>💰 {Number(data.amount).toLocaleString()} บาท</div>}
      {(data.bankFrom || data.bankTo) && <div style={{ color: 'var(--text-secondary)' }}>🏦 {data.bankFrom || '?'} → {data.bankTo || '?'}</div>}
      {data.transRef && <div style={{ color: 'var(--text-muted)' }}>🔖 Ref: {data.transRef}</div>}
      <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: 2 }}>🔍 {VERIFY_MAP[data.verifiedBy] || data.verifiedBy}</div>
    </div>
  );
}

function MessageBubble({ msg, contactName, channel }: { msg: Message; contactName: string; channel?: string }) {
  const isCustomer = msg.senderType === 'customer';
  const isBot = msg.senderType === 'bot';
  const [lightbox, setLightbox] = useState(false);
  const meta: any = (() => {
    if (!msg.metadata) return {};
    try { return typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata; } catch { return {}; }
  })();
  const slipData = meta?.slipVerification || null;

  const renderContent = () => {
    const staticUrl = meta?.imageUrl || meta?.originalContentUrl || null;
    if (msg.type === 'image' || (msg.type === 'sticker' && staticUrl)) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('crm_token') || '' : '';
      const tenantId = typeof window !== 'undefined' ? localStorage.getItem('crm_tenant_id') || '' : '';
      const platformMsgId = msg.platformMsgId || meta?.messageId;
      const proxyUrl = (channel === 'line' && platformMsgId) ? `/api/line/content/${platformMsgId}?token=${encodeURIComponent(token)}&tenantId=${encodeURIComponent(tenantId)}` : null;
      const imgUrl = staticUrl || proxyUrl;
      if (imgUrl) {
        const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
          const img = e.target as HTMLImageElement;
          if (proxyUrl && !img.dataset.triedProxy) { img.dataset.triedProxy = 'true'; img.src = proxyUrl; }
          else { img.style.display = 'none'; img.insertAdjacentHTML('afterend', '<span style="opacity:0.7">🖼️ รูปภาพ (โหลดไม่ได้)</span>'); }
        };
        return (
          <div>
            <img src={imgUrl} alt="รูปภาพ" onClick={() => setLightbox(true)} onError={handleImgError} style={{ maxWidth: 240, maxHeight: 200, borderRadius: 8, cursor: 'zoom-in', objectFit: 'cover', display: 'block' }} />
            <a href={imgUrl} download target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'inline-block', marginTop: 4, fontSize: '0.7rem', color: 'var(--text-muted)', textDecoration: 'none' }}>⬇️ ดาวน์โหลด</a>
            {lightbox && <div onClick={() => setLightbox(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'zoom-out' }}><img src={imgUrl} alt="รูปภาพ" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} /></div>}
          </div>
        );
      }
      return <span style={{ opacity: 0.7 }}>🖼️ รูปภาพ (ไม่มี ID)</span>;
    }
    if (msg.type === 'sticker') return <span style={{ fontSize: '2.5rem' }}>😊</span>;
    if (msg.type === 'audio') { const u = meta?.audioUrl; return u ? <div style={{ minWidth: 220 }}><audio controls preload="metadata" src={u} style={{ width: 240, height: 40, display: 'block' }} /><a href={u} download target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 4, fontSize: '0.7rem', color: 'var(--text-muted)', textDecoration: 'none' }}>⬇️ ดาวน์โหลดเสียง</a></div> : <span>🎵 เสียง</span>; }
    if (msg.type === 'video') { const u = meta?.videoUrl; return u ? <video controls preload="metadata" src={u} style={{ maxWidth: 260, maxHeight: 320, borderRadius: 8, display: 'block' }} /> : <span>🎬 วิดีโอ</span>; }
    if (msg.type === 'file') { const u = meta?.fileUrl; return u ? <a href={u} download target="_blank" rel="noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>📎 {meta?.fileName || msg.content || 'ไฟล์'}</a> : <span>📎 {msg.content}</span>; }
    if (msg.type === 'location') return <span>📍 {msg.content}</span>;
    return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>;
  };

  return (
    <div className={`${styles.msgRow} ${isCustomer ? styles.msgCustomer : styles.msgAgent}`}>
      {isCustomer && <div className="avatar avatar-sm" style={{ flexShrink: 0 }}>{contactName?.[0] || '?'}</div>}
      <div className={`${styles.msgBubble} ${isCustomer ? styles.bubbleCustomer : isBot ? styles.bubbleBot : styles.bubbleAgent}`}>
        {renderContent()}
        {slipData && <SlipBadge data={slipData} />}
        <div className={styles.msgMeta}>
          {isBot ? '🤖 Bot' : isCustomer ? contactName : (msg.sender?.displayName || 'Agent')}
          {' · '}
          {new Date(msg.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      {!isCustomer && <div className="avatar avatar-sm" style={{ flexShrink: 0, background: isBot ? 'var(--purple-glow)' : 'var(--teal-glow)', border: `1px solid ${isBot ? 'rgba(124,58,237,0.3)' : 'rgba(0,212,170,0.3)'}` }}>{isBot ? '🤖' : (msg.sender?.displayName?.[0] || 'A')}</div>}
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
  const [exportingChat, setExportingChat] = useState(false);
  const [aiSuggest, setAiSuggest] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [enchant, setEnchant] = useState<{ lang: string; thai: string; suggestions: { tone: string; text: string }[] } | null>(null);
  const [loadingEnchant, setLoadingEnchant] = useState(false);
  const [laoLottery, setLaoLottery] = useState<LaoLotteryResult | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showCanned, setShowCanned] = useState(false);
  const [cannedFilter, setCannedFilter] = useState('');
  const [quickReplies, setQuickReplies] = useState<any[]>([]);
  const [composingQR, setComposingQR] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [externalReplyWarning, setExternalReplyWarning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [convViewers, setConvViewers] = useState<{ userId: string; displayName: string; username: string }[]>([]);
  const [adminTyping, setAdminTyping] = useState<string | null>(null);
  const adminTypingTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeConvRef = useRef<string | null>(null);
  const typingTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

  const loadConversations = useCallback(async () => {
    const params: any = { limit: 50 };
    if (filter !== 'all') { if (filter === 'mine') params.assignedTo = 'me'; else params.status = filter; }
    if (channel !== 'all') params.channel = channel;
    if (companyFilter !== 'all') params.companyId = companyFilter;
    if (search) params.search = search;
    try { const r = await api.get('/conversations', { params }); setConversations(r.data.conversations || []); }
    catch { toast.error('โหลดบทสนทนาไม่ได้'); }
  }, [filter, channel, companyFilter, search]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { api.get('/companies').then(r => setCompanies(r.data.companies || [])).catch(() => {}); api.get('/quick-replies').then(r => setQuickReplies((r.data.items || []).filter((i: any) => i.isActive))).catch(() => {}); }, []);
  useEffect(() => { setTotalUnread(conversations.filter(c => (c._unread ?? 0) > 0).length); }, [conversations]);

  const loadMessages = useCallback(async (id: string) => {
    setLoadingMessages(true);
    try {
      const r = await api.get(`/conversations/${id}`);
      const conv = r.data.conversation;
      const msgs: Message[] = conv?.messages || [];
      setMessages(msgs);
      setActiveConv(conv);
      activeConvRef.current = id;
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        const lastCustomerIdx = [...msgs].reverse().findIndex(m => m.senderType === 'customer');
        const lastCustomer = lastCustomerIdx >= 0 ? msgs[msgs.length - 1 - lastCustomerIdx] : null;
        if (lastCustomer) {
          const lastCustomerTime = new Date(lastCustomer.createdAt).getTime();
          const agentAfter = msgs.find(m => (m.senderType === 'agent' || m.senderType === 'bot') && new Date(m.createdAt).getTime() > lastCustomerTime);
          const gapMs = Date.now() - lastCustomerTime;
          const isLongGap = gapMs > 5 * 60 * 1000;
          const isResolvedWithNoReply = (conv?.status === 'resolved' || conv?.status === 'closed') && !agentAfter;
          const lastMsgIsCustomer = lastMsg.senderType === 'customer' && isLongGap && !agentAfter;
          setExternalReplyWarning(isResolvedWithNoReply || lastMsgIsCustomer);
        } else { setExternalReplyWarning(false); }
      } else { setExternalReplyWarning(false); }
    } catch { toast.error('โหลดข้อความไม่ได้'); }
    finally { setLoadingMessages(false); }
  }, []);

  const goBackToList = useCallback(() => {
    if (activeConvRef.current) getSocket()?.emit('leave:conversation', activeConvRef.current);
    setActiveConv(null);
    setMessages([]);
    setAiSuggest('');
    setEnchant(null);
    activeConvRef.current = null;
  }, []);

  const selectConversation = useCallback((conv: Conversation) => {
    if (activeConvRef.current) getSocket()?.emit('leave:conversation', activeConvRef.current);
    setActiveConv(conv);
    setMessages([]);
    setAiSuggest('');
    setEnchant(null);
    setConvViewers([]);
    setAdminTyping(null);
    setExternalReplyWarning(false);
    getSocket()?.emit('join:conversation', conv.id);
    loadMessages(conv.id);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, _unread: 0 } : c));
  }, [loadMessages]);

  const syncMessages = useCallback(async () => {
    if (!activeConv || syncing) return;
    setSyncing(true);
    const toastId = toast.loading('🔄 กำลัง Sync กับ LINE...');
    try {
      if (activeConv.channel === 'line') {
        const r = await api.post(`/conversations/${activeConv.id}/sync-line`);
        const s = r.data.summary;
        toast.success(`✅ Sync เสร็จ\n${(s.results as string[]).slice(0, 3).join('\n')}`, { id: toastId, duration: 5000 });
        if (s.gapsFound > 0) { toast(`⚠️ พบ ${s.gapsFound} gap — บันทึก note เข้าประวัติแล้ว`, { icon: '📝', duration: 4000 }); setExternalReplyWarning(false); }
      } else { toast.success('🔄 รีเฟรชข้อความแล้ว', { id: toastId }); }
      await loadMessages(activeConv.id);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Sync ไม่สำเร็จ', { id: toastId }); }
    finally { setSyncing(false); }
  }, [activeConv, syncing, loadMessages]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useSocket('new_message', (data: any) => {
    const isActive = data.conversationId === activeConvRef.current;
    const isCustomer = data.message?.senderType === 'customer';
    const nowIso = new Date().toISOString();
    if (isActive) { setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]); setTypingUsers([]); }
    if (isCustomer) { playNotificationSound(); if (!isActive) toast('💬 ข้อความใหม่จาก ' + (data.contact?.displayName || 'ลูกค้า'), { icon: channelIcon(data.channel) }); }
    const known = conversations.some(c => c.id === data.conversationId);
    if (!known) { loadConversations(); return; }
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === data.conversationId);
      if (idx === -1) return prev;
      const updated: Conversation = { ...prev[idx], lastMessageAt: nowIso, messages: [data.message], _unread: isActive ? 0 : (isCustomer ? ((prev[idx]._unread || 0) + 1) : (prev[idx]._unread || 0)) };
      return [updated, ...prev.filter((_, i) => i !== idx)];
    });
  });

  useSocket('conversation_updated', () => { loadConversations(); if (activeConvRef.current) loadMessages(activeConvRef.current); });
  useSocket('admin_typing', (data: any) => { if (data.conversationId !== activeConvRef.current) return; setTypingUsers(prev => prev.includes(data.username) ? prev : [...prev, data.username]); setAdminTyping(data.displayName || data.username); clearTimeout(typingTimeout.current); clearTimeout(adminTypingTimeout.current); typingTimeout.current = setTimeout(() => setTypingUsers([]), 3000); adminTypingTimeout.current = setTimeout(() => setAdminTyping(null), 3000); });
  useSocket('admin_enter', (data: any) => { if (data.conversationId !== activeConvRef.current) return; setConvViewers(data.viewers || []); });
  useSocket('admin_leave', (data: any) => { if (data.conversationId !== activeConvRef.current) return; setConvViewers(data.viewers || []); });
  useSocket('conversation_viewers', (data: any) => { if (data.conversationId !== activeConvRef.current) return; setConvViewers(data.viewers || []); });

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeConv || sending) return;
    setSending(true);
    const content = newMsg;
    setNewMsg(''); setAiSuggest(''); setShowCanned(false); setEnchant(null); setLaoLottery(null);
    const toastId = toast.loading('กำลังส่ง...');
    try { await api.post(`/conversations/${activeConv.id}/messages`, { content }); toast.success('ส่งแล้ว', { id: toastId }); loadMessages(activeConv.id); }
    catch (e: any) { toast.error(e.response?.data?.message || 'ส่งไม่ได้', { id: toastId }); setNewMsg(content); }
    finally { setSending(false); }
  };

  const handleTyping = (val: string) => {
    setNewMsg(val);
    if (val.startsWith('/')) { setShowCanned(true); setCannedFilter(val); setLaoLottery(null); }
    else { setShowCanned(false); if (/\d.*=\s*[\d.,]+\s*[ลlLkK]/.test(val)) { const p = parseLaoLottery(val); setLaoLottery(p); } else setLaoLottery(null); }
    getSocket()?.emit('typing', { conversationId: activeConv?.id });
  };

  const getAISuggestion = async () => { if (!activeConv || loadingAI) return; setLoadingAI(true); const tid = toast.loading('AI กำลังคิด...'); try { const r = await api.get(`/conversations/${activeConv.id}/ai-suggest`); setAiSuggest(r.data.suggestion || ''); toast.success('AI แนะนำสำเร็จ', { id: tid }); } catch { toast.error('AI ไม่ตอบสนอง', { id: tid }); } finally { setLoadingAI(false); } };
  const enchantDraft = async () => { if (!activeConv || loadingEnchant || !newMsg.trim()) return; setLoadingEnchant(true); const tid = toast.loading('✨ Enchant กำลังแปลและคิดคำตอบ...'); try { const r = await api.post(`/conversations/${activeConv.id}/enchant`, { draft: newMsg }); setEnchant({ lang: r.data.lang, thai: r.data.thai, suggestions: r.data.suggestions || [] }); setShowCanned(false); setAiSuggest(''); toast.success(`✨ ได้ ${r.data.suggestions?.length || 0} คำตอบ`, { id: tid }); } catch (e: any) { toast.error(e.response?.data?.message || 'Enchant ไม่สำเร็จ', { id: tid }); } finally { setLoadingEnchant(false); } };
  const useEnchantSuggestion = (text: string) => { setNewMsg(text); setEnchant(null); textareaRef.current?.focus(); };
  const toggleBot = async () => { if (!activeConv) return; const toHuman = activeConv.isBot; const tid = toast.loading(toHuman ? 'สลับเป็น Human...' : 'สลับเป็น Bot...'); try { await api.post(`/conversations/${activeConv.id}/handoff`, { toHuman }); toast.success(toHuman ? '👤 สลับเป็น Human แล้ว' : '🤖 สลับเป็น Bot แล้ว', { id: tid }); loadMessages(activeConv.id); loadConversations(); } catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); } };
  const resolveConversation = async () => { if (!activeConv) return; const tid = toast.loading('กำลังปิดบทสนทนา...'); try { await api.patch(`/conversations/${activeConv.id}`, { status: 'resolved' }); toast.success('✅ ปิดบทสนทนาแล้ว', { id: tid }); loadConversations(); goBackToList(); } catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); } };

  const filteredCanned = CANNED.filter(c => c.trigger.includes(cannedFilter) || c.text.toLowerCase().includes(cannedFilter.slice(1).toLowerCase()));
  const filteredQuickReplies = quickReplies.filter(q => q.trigger.includes(cannedFilter.toLowerCase()) || q.title.toLowerCase().includes(cannedFilter.slice(1).toLowerCase()) || q.content.toLowerCase().includes(cannedFilter.slice(1).toLowerCase()));
  const applyQuickReply = async (q: any) => { setShowCanned(false); setNewMsg(q.content); textareaRef.current?.focus(); };

  // ═══════════════════ RENDER ═══════════════════
  return (
    <div className={`${styles.inbox}${activeConv ? ` ${styles.showChat}` : ''}`}>

      {/* ═══ LEFT: Conversation List ═══════════════════════════════════ */}
      <div className={styles.convList}>
        <div className={styles.convListHeader}>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input className="input" placeholder="🔍 ค้นหา..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingRight: 36 }} />
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>}
          </div>
          <div className={styles.filterTabs}>
            {FILTERS.map(f => <button key={f.key} className={`${styles.filterTab} ${filter === f.key ? styles.active : ''}`} onClick={() => setFilter(f.key)}>{f.icon} {f.label}</button>)}
          </div>
          {companies.length > 1 && (
            <select className="input" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} style={{ marginBottom: 8, fontSize: '0.82rem', padding: '6px 10px', cursor: 'pointer' }}>
              <option value="all">🏢 ทุกบริษัท</option>
              {companies.map(c => <option key={c.id} value={c.id}>🏢 {c.name}</option>)}
            </select>
          )}
          <div className={styles.channelFilters}>
            {[{ key: 'all', label: 'ทุกช่อง', icon: '📱' },{ key: 'line', label: 'LINE', icon: '🟢' },{ key: 'whatsapp', label: 'WhatsApp', icon: '🟩' },{ key: 'telegram', label: 'TG', icon: '🔵' }].map(c => <button key={c.key} className={`${styles.channelBtn} ${channel === c.key ? styles.active : ''}`} onClick={() => setChannel(c.key)}>{c.icon} {c.label}</button>)}
          </div>
        </div>
        <div className={styles.convCount}>
          <span>{conversations.length} บทสนทนา</span>
          {totalUnread > 0 && <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.75rem', fontWeight: 700 }}>{totalUnread} ใหม่</span>}
        </div>
        <div className={styles.convItems}>
          {conversations.length === 0 && <div className={styles.empty}><div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div><div>ไม่มีบทสนทนา</div></div>}
          {conversations.map(conv => {
            const lastMsg = conv.messages?.[0];
            const isActive = activeConv?.id === conv.id;
            const unread = conv._unread || 0;
            return (
              <div key={conv.id} className={`${styles.convItem} ${isActive ? styles.convActive : ''} ${unread > 0 ? styles.convUnread : ''}`} onClick={() => selectConversation(conv)}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div className="avatar">{conv.contact?.displayName?.[0] || '?'}</div>
                  <div style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: '50%', background: channelColor(conv.channel), border: '2px solid var(--bg-secondary)' }} />
                </div>
                <div className={styles.convInfo}>
                  <div className={styles.convTop}>
                    <span className={styles.convName} style={{ fontWeight: unread > 0 ? 700 : 500 }}>{conv.contact?.displayName || 'Unknown'}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>{conv.lastMessageAt ? formatDistanceToNow(new Date(conv.lastMessageAt), { locale: th, addSuffix: true }) : ''}</span>
                  </div>
                  <div className={styles.convPreview} style={{ fontWeight: unread > 0 ? 600 : 400, color: unread > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{lastMsg?.content || 'ไม่มีข้อความ'}</div>
                  <div className={styles.convMeta}>
                    <span className={`badge badge-${conv.status}`} style={{ fontSize: '0.65rem' }}>{conv.isBot ? '🤖' : '👤'} {conv.status}</span>
                    {conv.priority === 'high' && <span style={{ fontSize: '0.65rem', color: 'var(--danger)' }}>🔴</span>}
                    {unread > 0 && <span style={{ marginLeft: 'auto', background: 'var(--teal)', color: '#0F1729', borderRadius: 10, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 700 }}>{unread}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ MIDDLE: Chat Area ═══════════════════════════════════════ */}
      <div className={styles.chatArea}>
        {!activeConv ? (
          /* Empty state — desktop only (mobile CSS hides chatArea when !showChat) */
          <div className={styles.noChatSelected}>
            <div style={{ fontSize: '5rem', marginBottom: 16 }}>💬</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>เลือกบทสนทนา</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '0.9rem' }}>คลิกที่บทสนทนาด้านซ้ายเพื่อเริ่มต้น</div>
            <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[`📬 ${conversations.length} บทสนทนา`, '🤖 Bot พร้อมตอบ', '⚡ Real-time'].map(s => <span key={s} style={{ padding: '6px 14px', background: 'var(--bg-tertiary)', borderRadius: 20, fontSize: '0.8rem', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>{s}</span>)}
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className={styles.chatHeader}>
              <button className={styles.mobileBack} onClick={goBackToList} aria-label="กลับ">←</button>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div className="avatar">{activeConv.contact?.displayName?.[0] || '?'}</div>
                <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: channelColor(activeConv.channel), border: '2px solid var(--bg-secondary)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{activeConv.contact?.displayName}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                  <span className={`badge badge-${activeConv.channel}`} style={{ fontSize: '0.7rem' }}>{channelLabel(activeConv.channel)}</span>
                  <span className={`badge badge-${activeConv.status}`} style={{ fontSize: '0.7rem' }}>{activeConv.status}</span>
                  {activeConv.assignedTo && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>👤 {activeConv.assignedTo.displayName}</span>}
                  {adminTyping && <span style={{ fontSize: '0.65rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 3 }}>⌨️ {adminTyping} กำลังพิมพ์...</span>}
                  {convViewers.length > 0 && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>👁️ {convViewers.map(v => v.displayName || v.username).join(', ')}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                {externalReplyWarning && <span title="ตรวจพบว่าอาจมีการตอบนอก CRM" style={{ fontSize: '0.65rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '2px 6px', borderRadius: 4 }}>⚠️ ตอบนอก CRM</span>}
                <button className="btn btn-sm" onClick={syncMessages} disabled={syncing} style={{ fontSize: '0.7rem', padding: '3px 8px' }}>{syncing ? '⏳' : '🔄'} Sync</button>
                <button className="btn btn-sm" onClick={toggleBot} style={{ fontSize: '0.7rem', padding: '3px 8px' }}>{activeConv.isBot ? '🤖→👤' : '👤→🤖'}</button>
                <button className="btn btn-sm btn-danger" onClick={resolveConversation} style={{ fontSize: '0.7rem', padding: '3px 8px' }}>✅ ปิด</button>
              </div>
            </div>

            {/* Messages */}
            <div className={styles.messages}>
              {loadingMessages ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
                : messages.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>ยังไม่มีข้อความ</div>
                : messages.map(msg => <MessageBubble key={msg.id} msg={msg} contactName={activeConv.contact?.displayName || 'ลูกค้า'} channel={activeConv.channel} />)
              }
              <div ref={messagesEndRef} />
            </div>

            {/* AI Suggest */}
            {aiSuggest && (
              <div className={styles.aiSuggest} onClick={() => { setNewMsg(aiSuggest); setAiSuggest(''); textareaRef.current?.focus(); }}>
                <span>✨</span><span style={{ flex: 1 }}>{aiSuggest}</span><span style={{ fontSize: '0.7rem', opacity: 0.6 }}>คลิกเพื่อใช้</span>
              </div>
            )}

            {/* Enchant Panel */}
            {enchant && (
              <div style={{ margin: '0 16px 8px', padding: 12, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a5b4fc' }}>✨ Enchant — แปลจาก{enchant.lang}: "{enchant.thai.slice(0, 60)}"</span>
                  <button onClick={() => setEnchant(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                </div>
                {enchant.suggestions.map((s, i) => (
                  <div key={i} onClick={() => useEnchantSuggestion(s.text)} style={{ cursor: 'pointer', padding: '8px 10px', borderRadius: 8, background: 'rgba(99,102,241,0.1)', border: `1px solid ${TONE_META[s.tone]?.color || '#6366F1'}40`, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: TONE_META[s.tone]?.color, whiteSpace: 'nowrap' }}>{TONE_META[s.tone]?.label || s.tone}</span>
                    <span style={{ fontSize: '0.82rem', flex: 1 }}>{s.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Chat Input */}
            <div className={styles.chatInput} style={{ position: 'relative' }}>
              {showCanned && (
                <div className={styles.cannedPopup}>
                  {filteredCanned.map((c, i) => <div key={i} className={styles.cannedItem} onClick={() => { setNewMsg(c.text); setShowCanned(false); textareaRef.current?.focus(); } }><span style={{ fontWeight: 700, opacity: 0.6, fontSize: '0.75rem' }}>{c.trigger}</span><span style={{ fontSize: '0.82rem', flex: 1 }}>{c.text.slice(0, 60)}…</span></div>)}
                  {filteredQuickReplies.map((q, i) => <div key={`qr-${i}`} className={styles.cannedItem} onClick={() => applyQuickReply(q)}><span style={{ fontWeight: 700, opacity: 0.6, fontSize: '0.75rem' }}>/{q.trigger || 'qr'}</span><span style={{ fontSize: '0.82rem', flex: 1 }}>{q.title || q.content.slice(0, 60)}…</span></div>)}
                </div>
              )}
              {laoLottery && <LaoLotteryPreview result={laoLottery} onSend={(txt) => { setNewMsg(txt); setLaoLottery(null); }} onDismiss={() => setLaoLottery(null)} />}
              <div style={{ display: 'flex', gap: 8, padding: '10px 16px', alignItems: 'flex-end' }}>
                <textarea ref={textareaRef} className="input" rows={1} value={newMsg} onChange={e => handleTyping(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="พิมพ์ข้อความ..." style={{ flex: 1, resize: 'none', minHeight: 36, maxHeight: 120 }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm" onClick={getAISuggestion} disabled={loadingAI} title="AI แนะนำ">{loadingAI ? '⏳' : '✨'}</button>
                  <button className="btn btn-sm" onClick={enchantDraft} disabled={loadingEnchant || !newMsg.trim()} title="Enchant (ลาว→ไทย)" style={{ background: loadingEnchant ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff' }}>{loadingEnchant ? '⏳' : '🪄'}</button>
                  <button className="btn btn-primary btn-sm" onClick={sendMessage} disabled={sending || !newMsg.trim()}>{sending ? '⏳' : '📤'}</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ═══ RIGHT: Contact Panel ═══════════════════════════════════ */}
      <div className={styles.contactPanel}>
        {activeConv ? (
          <div style={{ padding: 16 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div className="avatar avatar-lg" style={{ margin: '0 auto 8px', width: 56, height: 56, fontSize: '1.4rem' }}>{activeConv.contact?.displayName?.[0] || '?'}</div>
              <div style={{ fontWeight: 600 }}>{activeConv.contact?.displayName}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>{channelLabel(activeConv.channel)}</div>
            </div>
            <hr className={styles.divider} />
            <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeConv.contact?.lineUserId && <div><span style={{ color: 'var(--text-muted)' }}>LINE ID:</span> {activeConv.contact.lineUserId}</div>}
              {activeConv.contact?.whatsappId && <div><span style={{ color: 'var(--text-muted)' }}>WhatsApp:</span> {activeConv.contact.whatsappId}</div>}
              {activeConv.contact?.telegramId && <div><span style={{ color: 'var(--text-muted)' }}>Telegram:</span> {activeConv.contact.telegramId}</div>}
              {activeConv.contact?.email && <div><span style={{ color: 'var(--text-muted)' }}>📧</span> {activeConv.contact.email}</div>}
              {activeConv.contact?.phone && <div><span style={{ color: 'var(--text-muted)' }}>📞</span> {activeConv.contact.phone}</div>}
              <div><span style={{ color: 'var(--text-muted)' }}>สร้าง:</span> {new Date(activeConv.createdAt).toLocaleDateString('th-TH')}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>อัปเดตล่าสุด:</span> {new Date(activeConv.lastMessageAt).toLocaleString('th-TH')}</div>
            </div>
            <hr className={styles.divider} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(activeConv.id); toast.success('คัดลอก ID แล้ว'); }} style={{ fontSize: '0.75rem' }}>📋 คัดลอก Conversation ID</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: '0.85rem' }}>เลือกบทสนทนาเพื่อดูข้อมูล</div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../../lib/api';
import { useSocket } from '../../../lib/socket';
import { getSocket } from '../../../lib/socket';
import styles from './inbox.module.css';
import { useLang } from '../../../store/lang';

// ─── Types ───────────────────────────────────────────────────────────────────
type UiLanguage = 'th' | 'lo';

interface Message {
  id: string; conversationId: string; senderType: 'customer' | 'agent' | 'bot';
  type: string; content: string; createdAt: string; isRead: boolean;
  sender?: { id: string; displayName: string; avatar?: string };
  metadata?: any;
  platformMsgId?: string;
}
interface Conversation {
  id: string; channel: string; status: string; isBot: boolean; priority: string;
  lastMessageAt: string; lastCustomerMessageAt?: string | null; createdAt: string; assignedToId?: string;
  contact: { id: string; displayName: string; avatar?: string; lineUserId?: string; telegramId?: string; whatsappId?: string; email?: string; phone?: string };
  assignedTo?: { id: string; displayName: string; avatar?: string };
  messages?: Message[];
  _unread?: number;
  _unreadMessageIds?: string[];
}

const localize = (lang: UiLanguage, thai: string, lao: string) => lang === 'lo' ? lao : thai;

function formatRelativeTime(value: string, lang: UiLanguage) {
  const diffSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const absolute = Math.abs(diffSeconds);
  let amount = diffSeconds;
  let unit: Intl.RelativeTimeFormatUnit = 'second';

  if (absolute >= 86400) {
    amount = Math.round(diffSeconds / 86400);
    unit = 'day';
  } else if (absolute >= 3600) {
    amount = Math.round(diffSeconds / 3600);
    unit = 'hour';
  } else if (absolute >= 60) {
    amount = Math.round(diffSeconds / 60);
    unit = 'minute';
  }

  return new Intl.RelativeTimeFormat(lang === 'lo' ? 'lo-LA' : 'th-TH', { numeric: 'auto' }).format(amount, unit);
}

function conversationStatusLabel(status: string, lang: UiLanguage) {
  const labels: Record<string, [string, string]> = {
    open: ['เปิด', 'ເປີດ'],
    pending: ['รอตอบ', 'ລໍຖ້າຕອບ'],
    resolved: ['ปิดแล้ว', 'ປິດແລ້ວ'],
    closed: ['ปิดแล้ว', 'ປິດແລ້ວ'],
  };
  const label = labels[status];
  return label ? localize(lang, label[0], label[1]) : status;
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
  // Pattern: "12 20 22 26=10 ล. ลาวพัด 20.24" or "12 20=10k ลาวพัด 20.24"
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

  return {
    raw, numbers, count: numbers.length, service, round,
    pricePerNumber, total,
    readCode,
    readText: `${readCode} total ${total.toLocaleString()} kip`,
    grid: numbers.map(num => ({
      number: num,
      readCode: `l${num}l`,
      priceText: `${pricePerNumber.toLocaleString()} kip`,
      service, round,
      totalText: `${total.toLocaleString()} kip`,
    })),
  };
}

function LaoLotteryPreview({ result, onSend, onDismiss }: { result: LaoLotteryResult; onSend: (text: string) => void; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(result.readText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  };
  return (
    <div style={{
      margin: '0 0 10px 0', borderRadius: 12, overflow: 'hidden',
      border: '1.5px solid rgba(168,85,247,0.35)',
      background: 'linear-gradient(135deg,rgba(88,28,135,0.18),rgba(59,7,100,0.12))',
      boxShadow: '0 4px 18px rgba(139,92,246,0.18)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(139,92,246,0.18)', borderBottom: '1px solid rgba(168,85,247,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: '1rem' }}>🎰</span>
          <span style={{ fontWeight: 800, fontSize: '.82rem', color: '#c4b5fd' }}>ຫວຍລາວ — ຮັບລາຍການ</span>
          <span style={{ fontSize: '.68rem', color: '#a78bfa', background: 'rgba(167,139,250,0.15)', borderRadius: 5, padding: '1px 7px' }}>
            {result.service} · ຮອບ {result.round}
          </span>
        </div>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '2px 5px' }}>✕</button>
      </div>

      {/* Grid table */}
      <div style={{ overflowX: 'auto', padding: '10px 12px 4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.75rem' }}>
          <thead>
            <tr style={{ color: '#c4b5fd', fontWeight: 700, textAlign: 'left' }}>
              {['ເລກ', 'ລະຫັດ', 'ລາຄາ/ເລກ', 'ປະເພດ', 'ຮອບ', 'ຍອດລວມ'].map(h => (
                <th key={h} style={{ padding: '3px 8px 6px', borderBottom: '1px solid rgba(167,139,250,0.2)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.grid.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(167,139,250,0.08)' }}>
                <td style={{ padding: '4px 8px', fontWeight: 900, color: '#f0abfc', fontSize: '.88rem' }}>{row.number}</td>
                <td style={{ padding: '4px 8px', color: '#e9d5ff', fontFamily: 'monospace' }}>{row.readCode}</td>
                <td style={{ padding: '4px 8px', color: '#d8b4fe' }}>{row.priceText}</td>
                <td style={{ padding: '4px 8px', color: '#c4b5fd' }}>{row.service}</td>
                <td style={{ padding: '4px 8px', color: '#c4b5fd' }}>{row.round}</td>
                <td style={{ padding: '4px 8px', fontWeight: 800, color: '#fbbf24' }}>{row.totalText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary + actions */}
      <div style={{ padding: '8px 12px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, borderTop: '1px solid rgba(167,139,250,0.15)', marginTop: 4 }}>
        <div style={{ fontFamily: 'monospace', fontSize: '.8rem', color: '#e9d5ff', background: 'rgba(139,92,246,0.15)', borderRadius: 7, padding: '4px 10px', letterSpacing: '.5px' }}>
          {result.readText}
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={copy} style={{
            border: '1px solid rgba(167,139,250,0.4)', background: 'transparent', color: '#c4b5fd',
            borderRadius: 7, padding: '5px 11px', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer',
          }}>{copied ? '✅ copied' : '📋 copy'}</button>
          <button onClick={() => onSend(result.readText)} style={{
            border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff',
            borderRadius: 7, padding: '5px 14px', fontSize: '.74rem', fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 3px 10px rgba(139,92,246,0.4)',
          }}>📤 ສ່ງຂໍ້ຄວາມນີ້</button>
        </div>
      </div>
    </div>
  );
}

// ─── Channel helpers (LINE / WhatsApp / Telegram) ────────────────────────────
const channelColor = (ch?: string) => ch === 'line' ? '#00B900' : ch === 'whatsapp' ? '#25D366' : '#2AABEE';
const channelLabel = (ch?: string) => ch === 'line' ? '🟢 LINE' : ch === 'whatsapp' ? '🟩 WhatsApp' : '🔵 Telegram';
const channelIcon  = (ch?: string) => ch === 'line' ? '🟢' : ch === 'whatsapp' ? '🟩' : '🔵';

// ─── Enchant tone labels ──────────────────────────────────────────────────────
const TONE_META: Record<string, { labelTh: string; labelLo: string; color: string }> = {
  formal:   { labelTh: '🎩 สุภาพทางการ', labelLo: '🎩 ສຸພາບເປັນທາງການ', color: '#6366F1' },
  friendly: { labelTh: '😊 เป็นกันเอง',   labelLo: '😊 ເປັນກັນເອງ',       color: '#00D4AA' },
  urgent:   { labelTh: '⚡ กระชับ',        labelLo: '⚡ ສັ້ນກະຊັບ',           color: '#F59E0B' },
};

// ─── Slip Verification Badge ─────────────────────────────────────────────────
function SlipBadge({ data, lang }: { data: any; lang: UiLanguage }) {
  const [current, setCurrent] = useState(data || {});
  const [updating, setUpdating] = useState(false);
  const l = (thai: string, lao: string) => localize(lang, thai, lao);
  useEffect(() => { setCurrent(data || {}); }, [data]);
  if (!data) return null;

  const STATUS_MAP: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
    verified:  { icon: '✅', label: l('สลิปผ่านการตรวจสอบ', 'ສະລິບຜ່ານການກວດສອບ'), color: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)' },
    fake:      { icon: '❌', label: l('สลิปไม่ผ่านการตรวจสอบ', 'ສະລິບບໍ່ຜ່ານການກວດສອບ'), color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
    duplicate: { icon: '⚠️', label: l('สลิปซ้ำ', 'ສະລິບຊ້ຳ'), color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
    not_slip:  { icon: '🖼️', label: l('ไม่ใช่สลิป', 'ບໍ່ແມ່ນສະລິບ'), color: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' },
    error:     { icon: '⏳', label: l('รอตรวจสอบ', 'ລໍຖ້າກວດສອບ'), color: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' },
    pending:   { icon: '⏳', label: l('กำลังตรวจสอบ', 'ກຳລັງກວດສອບ'), color: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' },
  };

  const s = STATUS_MAP[current.status] || STATUS_MAP.pending;
  const VERIFY_MAP: Record<string, string> = { slipok: 'SlipOK', ai: 'AI Vision', manual: 'Manual', auto: 'Auto' };
  const updateStatus = async (status: 'verified' | 'fake') => {
    if (!current.recordId || updating) return;
    setUpdating(true);
    const toastId = toast.loading(status === 'verified'
      ? l('กำลังยืนยันสลิป...', 'ກຳລັງຢືນຢັນສະລິບ...')
      : l('กำลังบันทึกว่าไม่ผ่าน...', 'ກຳລັງບັນທຶກວ່າບໍ່ຜ່ານ...'));
    try {
      const response = await api.patch(`/slips/${current.recordId}`, { status });
      setCurrent((previous: any) => ({
        ...previous,
        status: response.data.status,
        verifiedBy: response.data.verifiedBy,
      }));
      toast.success(status === 'verified'
        ? l('✅ ยืนยันสลิปแล้ว', '✅ ຢືນຢັນສະລິບແລ້ວ')
        : l('❌ บันทึกว่าสลิปไม่ผ่านแล้ว', '❌ ບັນທຶກສະລິບບໍ່ຜ່ານແລ້ວ'), { id: toastId });
    } catch (error: any) {
      toast.error(error.response?.data?.message || l('อัปเดตสลิปไม่สำเร็จ', 'ອັບເດດສະລິບບໍ່ສຳເລັດ'), { id: toastId });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div style={{
      marginTop: 8, padding: '8px 10px', borderRadius: 8,
      background: s.bg, border: `1px solid ${s.border}`,
      fontSize: '0.75rem', lineHeight: 1.6,
    }}>
      <div style={{ fontWeight: 700, color: s.color, marginBottom: 2 }}>
        {s.icon} {s.label}
      </div>
      {current.amount && (
        <div style={{ color: 'var(--text-secondary)' }}>
          💰 {Number(current.amount).toLocaleString()} {l('บาท', 'ບາດ')}
        </div>
      )}
      {(current.bankFrom || current.bankTo) && (
        <div style={{ color: 'var(--text-secondary)' }}>
          🏦 {current.bankFrom || '?'} → {current.bankTo || '?'}
        </div>
      )}
      {(current.receiverAccountPrefix || current.receiverAccountSuffix) && (
        <div style={{ color: 'var(--text-secondary)' }}>
          💳 {l('บัญชีผู้รับ', 'ບັນຊີຜູ້ຮັບ')}: {current.receiverAccountPrefix || '•••'}••••{current.receiverAccountSuffix || '•••'}
        </div>
      )}
      {current.transRef && (
        <div style={{ color: 'var(--text-muted)' }}>
          🔖 {l('เลขธุรกรรม', 'ເລກທຸລະກຳ')}: {current.transRef}
        </div>
      )}
      <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: 2 }}>
        🔍 {VERIFY_MAP[current.verifiedBy] || current.verifiedBy}
      </div>
      {current.recordId && (
        <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
          {current.status !== 'verified' && (
            <button
              type="button"
              disabled={updating}
              onClick={() => updateStatus('verified')}
              style={{ flex: 1, border: '1px solid rgba(16,185,129,.4)', background: 'rgba(16,185,129,.14)', color: '#10B981', borderRadius: 7, padding: '5px 7px', cursor: updating ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700 }}
            >
              ✅ {l('ยืนยันสลิป', 'ຢືນຢັນສະລິບ')}
            </button>
          )}
          {current.status !== 'fake' && (
            <button
              type="button"
              disabled={updating}
              onClick={() => updateStatus('fake')}
              style={{ flex: 1, border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.1)', color: '#EF4444', borderRadius: 7, padding: '5px 7px', cursor: updating ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700 }}
            >
              ❌ {l('ไม่ผ่าน', 'ບໍ່ຜ່ານ')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────
function MessageBubble({ msg, contactName, channel, lang }: { msg: Message; contactName: string; channel?: string; lang: string }) {
  const isCustomer = msg.senderType === 'customer';
  const isBot = msg.senderType === 'bot';
  const [lightbox, setLightbox] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const uiLang: UiLanguage = lang === 'lo' ? 'lo' : 'th';
  const l = (thai: string, lao: string) => localize(uiLang, thai, lao);

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
            img.insertAdjacentHTML('afterend', `<span style="opacity:0.7">🖼️ ${l('รูปภาพ (โหลดไม่ได้)', 'ຮູບພາບ (ໂຫຼດບໍ່ໄດ້)')}</span>`);
          }
        };
        return (
          <div>
            <img
              src={imgUrl}
              alt={l('รูปภาพ', 'ຮູບພາບ')}
              onClick={() => setLightbox(true)}
              onError={handleImgError}
              style={{ maxWidth: 240, maxHeight: 200, borderRadius: 8, cursor: 'zoom-in', objectFit: 'cover', display: 'block' }}
            />
            {(meta?.aiKnowledgeImage || meta?.bonusTimeImage) && msg.content && (
              <div style={{ marginTop: 7, whiteSpace: 'pre-wrap', fontSize: '0.82rem', lineHeight: 1.55 }}>
                {msg.content}
              </div>
            )}
            <a
              href={imgUrl}
              download
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'inline-block', marginTop: 4, fontSize: '0.7rem', color: 'var(--text-muted)', textDecoration: 'none' }}
            >
              ⬇️ {l('ดาวน์โหลด', 'ດາວໂຫຼດ')}
            </a>
            {meta?.aiImageAnalysis && (
              <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 7, background: 'rgba(6,182,212,.1)', border: '1px solid rgba(6,182,212,.25)', fontSize: '0.68rem', lineHeight: 1.45 }}>
                <div style={{ color: 'var(--teal)', fontWeight: 700 }}>
                  {meta.aiImageAnalysis.kind === 'slip'
                    ? l('🧾 AI: สลิป/หลักฐานการโอน', '🧾 AI: ສະລິບ/ຫຼັກຖານການໂອນ')
                    : meta.aiImageAnalysis.kind === 'problem'
                      ? l('🛠️ AI: รูปปัญหาของลูกค้า', '🛠️ AI: ຮູບບັນຫາຂອງລູກຄ້າ')
                      : l('🖼️ AI: รูปทั่วไป', '🖼️ AI: ຮູບພາບທົ່ວໄປ')}
                </div>
                {meta.aiImageAnalysis.summary && (
                  <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{meta.aiImageAnalysis.summary}</div>
                )}
              </div>
            )}
            {lightbox && (
              <div
                onClick={() => setLightbox(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'zoom-out' }}
              >
                <img
                  src={imgUrl}
                  alt={l('รูปภาพ', 'ຮູບພາບ')}
                  style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
                />
              </div>
            )}
          </div>
        );
      }
      return <span style={{ opacity: 0.7 }}>🖼️ {l('รูปภาพ (ไม่มี ID)', 'ຮູບພາບ (ບໍ່ມີ ID)')}</span>;
    }
    if (msg.type === 'sticker') return <span style={{ fontSize: '2.5rem' }}>😊</span>;
    // ─── เสียง (voice note) — เล่นฟังได้ในหน้า Inbox ─────────────────────────────
    if (msg.type === 'audio') {
      const audioUrl = meta?.audioUrl || null;
      const transcription = meta?.voice?.transcription;
      const transcriptText = typeof transcription === 'string'
        ? transcription.trim()
        : typeof transcription?.text === 'string'
          ? transcription.text.trim()
          : '';
      const transcriptStatus = String(
        typeof transcription === 'string'
          ? 'complete'
          : transcription?.status || (transcriptText ? 'complete' : '')
      ).toLowerCase();
      const isPending = ['queued', 'pending', 'waiting'].includes(transcriptStatus);
      const isProcessing = ['processing', 'transcribing', 'in_progress'].includes(transcriptStatus);
      const isComplete = ['complete', 'completed', 'success', 'ready'].includes(transcriptStatus) || !!transcriptText;
      const isFailed = ['failed', 'error'].includes(transcriptStatus);
      const isLongTranscript = transcriptText.length > 240;
      const visibleTranscript = isLongTranscript && !transcriptExpanded
        ? `${transcriptText.slice(0, 240).trimEnd()}…`
        : transcriptText;
      const voiceLabels = lang === 'lo'
        ? {
            audio: 'ສຽງ',
            download: 'ດາວໂຫຼດສຽງ',
            pending: 'AI ກຳລັງລໍຖ້າຟັງສຽງ...',
            processing: 'AI ກຳລັງຟັງ ແລະ ຖອດສຽງ...',
            transcript: 'ຂໍ້ຄວາມທີ່ AI ໄດ້ຍິນ',
            noSpeech: 'ຖອດສຽງແລ້ວ ແຕ່ບໍ່ພົບຄຳເວົ້າທີ່ຊັດເຈນ',
            failed: 'AI ບໍ່ສາມາດຟັງສຽງໄດ້ — ແອດມິນຍັງສາມາດກົດຟັງໄດ້',
            expand: 'ສະແດງທັງໝົດ',
            collapse: 'ຫຍໍ້ຂໍ້ຄວາມ',
          }
        : {
            audio: 'เสียง',
            download: 'ดาวน์โหลดเสียง',
            pending: 'AI กำลังรอฟังเสียง...',
            processing: 'AI กำลังฟังและถอดเสียง...',
            transcript: 'ข้อความที่ AI ได้ยิน',
            noSpeech: 'ถอดเสียงแล้ว แต่ไม่พบคำพูดที่ชัดเจน',
            failed: 'AI ฟังเสียงไม่สำเร็จ — แอดมินยังกดเล่นเพื่อฟังได้',
            expand: 'แสดงทั้งหมด',
            collapse: 'ย่อข้อความ',
          };

      return (
        <div style={{ width: 240, maxWidth: '100%', minWidth: 0 }}>
          {audioUrl ? (
            <>
            <audio
              controls
              preload="metadata"
              src={audioUrl}
              aria-label={voiceLabels.audio}
              style={{ width: '100%', maxWidth: '100%', minWidth: 0, height: 40, display: 'block' }}
            />
            <a
              href={audioUrl}
              download
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-block', marginTop: 4, fontSize: '0.7rem', color: 'var(--text-muted)', textDecoration: 'none' }}
            >
              ⬇️ {voiceLabels.download}
            </a>
            </>
          ) : (
            <span>🎵 {voiceLabels.audio}</span>
          )}

          {(isPending || isProcessing) && (
            <div style={{ marginTop: 7, padding: '7px 9px', borderRadius: 8, background: 'rgba(6,182,212,.1)', border: '1px solid rgba(6,182,212,.24)', color: 'var(--teal)', fontSize: '0.72rem', lineHeight: 1.45 }}>
              ⏳ {isProcessing ? voiceLabels.processing : voiceLabels.pending}
            </div>
          )}

          {isComplete && (
            <div style={{ marginTop: 7, padding: '8px 9px', borderRadius: 8, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.24)', fontSize: '0.74rem', lineHeight: 1.5 }}>
              <div style={{ color: '#10B981', fontWeight: 700, marginBottom: transcriptText ? 3 : 0 }}>
                📝 {voiceLabels.transcript}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--text-secondary)' }}>
                {visibleTranscript || voiceLabels.noSpeech}
              </div>
              {isLongTranscript && (
                <button
                  type="button"
                  onClick={() => setTranscriptExpanded(value => !value)}
                  style={{ marginTop: 4, padding: 0, border: 0, background: 'transparent', color: 'var(--teal)', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  {transcriptExpanded ? voiceLabels.collapse : voiceLabels.expand}
                </button>
              )}
            </div>
          )}

          {isFailed && !isComplete && (
            <div style={{ marginTop: 7, padding: '7px 9px', borderRadius: 8, background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.28)', color: 'var(--warning)', fontSize: '0.72rem', lineHeight: 1.45 }}>
              ⚠️ {voiceLabels.failed}
            </div>
          )}
        </div>
      );
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
      return <span>🎬 {l('วิดีโอ', 'ວິດີໂອ')}</span>;
    }
    // ─── ไฟล์เอกสาร ─────────────────────────────────────────────────────────────
    if (msg.type === 'file') {
      const fileUrl = meta?.fileUrl || null;
      if (fileUrl) {
        return (
          <a href={fileUrl} download target="_blank" rel="noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
            📎 {meta?.fileName || msg.content || l('ไฟล์', 'ໄຟລ໌')}
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
        {slipData && <SlipBadge data={slipData} lang={uiLang} />}
        <div className={styles.msgMeta}>
          {isBot ? '🤖 Bot' : isCustomer ? contactName : (msg.sender?.displayName || 'Agent')}
          {' · '}
          {new Date(msg.createdAt).toLocaleTimeString(uiLang === 'lo' ? 'lo-LA' : 'th-TH', { hour: '2-digit', minute: '2-digit' })}
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
  const { lang } = useLang();
  const uiLang: UiLanguage = lang === 'lo' ? 'lo' : 'th';
  const l = (thai: string, lao: string) => localize(uiLang, thai, lao);
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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [listReloadNonce, setListReloadNonce] = useState(0);
  const [sending, setSending] = useState(false);
  const [exportingChat, setExportingChat] = useState(false);
  const [aiSuggest, setAiSuggest] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  // ─── Enchant (ร่างข้อความ → คำตอบภาษาที่แอดมินเลือก 3 โทน) ─────────────────────
  const [enchant, setEnchant] = useState<{
    lang: string;
    translation: string;
    outputLanguage: UiLanguage;
    suggestions: { tone: string; text: string }[];
  } | null>(null);
  const [loadingEnchant, setLoadingEnchant] = useState(false);
  // ─── Lao Lottery Parser ───────────────────────────────────────────────────
  const [laoLottery, setLaoLottery] = useState<LaoLotteryResult | null>(null);
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
  const loadedConversationRef = useRef<string | null>(null);
  const readMessageIdsRef = useRef<Set<string>>(new Set());
  const unreadMessageIdsByConversationRef = useRef<Map<string, Set<string>>>(new Map());
  const conversationEventRevisionRef = useRef(0);
  const conversationListRequestRef = useRef(0);
  const messageLoadRequestRef = useRef(0);
  const typingTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
  // ─── Mobile drawer ─────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiReplyLanguage, setAiReplyLanguage] = useState<UiLanguage>(uiLang);
  const aiReplyLanguageRef = useRef<UiLanguage>(uiLang);

  useEffect(() => {
    setAiReplyLanguage(uiLang);
  }, [uiLang]);

  useEffect(() => {
    aiReplyLanguageRef.current = aiReplyLanguage;
  }, [aiReplyLanguage]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  // ─── Load conversations ───────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    const requestId = ++conversationListRequestRef.current;
    const eventRevisionAtStart = conversationEventRevisionRef.current;
    const params: any = { limit: 50 };
    if (filter !== 'all') { if (filter === 'mine') params.assignedTo = 'me'; else params.status = filter; }
    if (channel !== 'all') params.channel = channel;
    if (companyFilter !== 'all') params.companyId = companyFilter;
    if (debouncedSearch) params.search = debouncedSearch;
    try {
      const r = await api.get('/conversations', { params });
      if (
        requestId !== conversationListRequestRef.current
      ) return;
      if (eventRevisionAtStart !== conversationEventRevisionRef.current) {
        // The snapshot raced a realtime event. Schedule one fresh authoritative
        // request so an initial/empty list cannot remain blank after discard.
        setListReloadNonce(value => value + 1);
        return;
      }
      const convs = r.data.conversations || [];
      for (const conversation of convs) {
        const unreadIds = Array.isArray(conversation?._unreadMessageIds)
          ? conversation._unreadMessageIds.filter((id: unknown): id is string => typeof id === 'string')
          : [];
        // Replace this room's set with the authoritative server snapshot. This
        // prevents a delayed read(M1) event from decrementing a newer M2 badge.
        unreadMessageIdsByConversationRef.current.set(
          conversation.id,
          new Set(unreadIds),
        );
      }
      setConversations(convs); // totalUnread ถูกคำนวณใน useEffect ที่ผูกกับ conversations
    } catch {
      if (requestId === conversationListRequestRef.current) {
        toast.error(localize(uiLang, 'โหลดบทสนทนาไม่ได้', 'ໂຫຼດການສົນທະນາບໍ່ໄດ້'));
      }
    }
  }, [filter, channel, companyFilter, debouncedSearch, uiLang]);

  useEffect(() => { loadConversations(); }, [loadConversations, listReloadNonce]);

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

  // The badge is recomputed from the room's remaining unread-id set instead of
  // being decremented. Decrementing leaves a stuck number whenever the local
  // counter and the server disagree (message already read on another device, a
  // missed socket event). Resetting to the set size cannot drift, and ids that
  // arrive while the read request is in flight stay counted, so a customer who
  // writes again immediately still raises a fresh badge.
  const applyConversationRead = useCallback((data: any, idsKnownAtRequest?: Set<string>) => {
    const conversationId = data?.conversationId;
    if (!conversationId) return;
    const ids: string[] = Array.isArray(data?.readMessageIds)
      ? data.readMessageIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const serverRemaining = typeof data?.remainingUnread === 'number'
      ? Math.max(0, data.remainingUnread)
      : null;
    const knownUnreadIds = unreadMessageIdsByConversationRef.current.get(conversationId);

    ids.forEach((id: string) => {
      readMessageIdsRef.current.add(id);
      knownUnreadIds?.delete(id);
    });
    if (readMessageIdsRef.current.size > 5000) {
      readMessageIdsRef.current = new Set(
        Array.from(readMessageIdsRef.current).slice(-2500),
      );
    }

    // Server says nothing is left unread. Drop every id the room already held
    // when the request went out — including ids the server never listed because
    // they were flagged read elsewhere. Ids added mid-flight are newer than the
    // server snapshot, so they survive and keep the badge honest.
    if (serverRemaining === 0 && knownUnreadIds) {
      if (idsKnownAtRequest) idsKnownAtRequest.forEach(id => knownUnreadIds.delete(id));
      else knownUnreadIds.clear();
    }

    const nextUnread = knownUnreadIds ? knownUnreadIds.size : (serverRemaining ?? 0);
    conversationEventRevisionRef.current += 1;
    setConversations(previous => {
      const index = previous.findIndex(conversation => conversation.id === conversationId);
      if (index === -1 || (previous[index]._unread ?? 0) === nextUnread) return previous;
      const next = [...previous];
      next[index] = { ...next[index], _unread: nextUnread };
      return next;
    });
  }, []);

  const markConversationRead = useCallback(async (id: string) => {
    // Snapshot before the request so the response can clear exactly these ids.
    const idsKnownAtRequest = new Set(
      unreadMessageIdsByConversationRef.current.get(id) || [],
    );
    try {
      const response = await api.post(`/conversations/${id}/read`);
      applyConversationRead(response.data, idsKnownAtRequest);
    } catch {
      await loadConversations();
    }
  }, [applyConversationRead, loadConversations]);

  // ─── Load messages ────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (id: string) => {
    const requestId = ++messageLoadRequestRef.current;
    setLoadingMessages(true);
    try {
      const r = await api.get(`/conversations/${id}`);
      const conv = r.data.conversation;
      const msgs: Message[] = conv?.messages || [];
      // Ignore a slower response from a room the admin has already left.
      if (
        activeConvRef.current !== id
        || requestId !== messageLoadRequestRef.current
      ) return false;
      // A realtime message can arrive while this GET is in flight. Merge it
      // with the snapshot so the older response cannot erase the bubble.
      setMessages(previous => {
        const byId = new Map<string, Message>();
        for (const message of msgs) byId.set(message.id, message);
        for (const message of previous) {
          if (message.conversationId === id && !byId.has(message.id)) {
            byId.set(message.id, message);
          }
        }
        return Array.from(byId.values()).sort((left, right) => {
          const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
          return timeDelta || left.id.localeCompare(right.id);
        });
      });
      setActiveConv(conv);
      loadedConversationRef.current = id;

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
      return true;
    } catch {
      if (
        activeConvRef.current === id
        && requestId === messageLoadRequestRef.current
      ) {
        toast.error(localize(uiLang, 'โหลดข้อความไม่ได้', 'ໂຫຼດຂໍ້ຄວາມບໍ່ໄດ້'));
      }
      return false;
    } finally {
      if (
        activeConvRef.current === id
        && requestId === messageLoadRequestRef.current
      ) setLoadingMessages(false);
    }
  }, [uiLang]);

  // ─── Select conversation + join socket room ───────────────────────────────
  const selectConversation = useCallback((conv: Conversation) => {
    if (activeConvRef.current) getSocket()?.emit('leave:conversation', activeConvRef.current);
    activeConvRef.current = conv.id;
    loadedConversationRef.current = null;
    setActiveConv(conv);
    setDrawerOpen(false); // ปิด drawer บนมือถือหลังเลือกห้อง
    setMessages([]);
    setNewMsg('');
    setAiSuggest('');
    setEnchant(null);
    setLaoLottery(null);
    setConvViewers([]); // reset viewers เมื่อเปลี่ยน conversation
    setAdminTyping(null);
    setExternalReplyWarning(false); // reset warning เมื่อเปลี่ยน conversation
    getSocket()?.emit('join:conversation', conv.id);
    void loadMessages(conv.id).then(loaded => {
      // Opening a room is an explicit read: the admin clicked it and the
      // messages are on screen. Only visibility is checked here — requiring
      // document.hasFocus() left the badge stuck whenever the browser reported
      // the window as unfocused (devtools, embedded view, click-through).
      if (
        loaded
        && activeConvRef.current === conv.id
        && loadedConversationRef.current === conv.id
        && document.visibilityState === 'visible'
      ) {
        void markConversationRead(conv.id);
      }
    });
  }, [loadMessages, markConversationRead]);

  // Customer messages received in a hidden/background tab stay unread. Clear
  // them only after the human admin returns to the visible inbox.
  useEffect(() => {
    const markVisibleConversationRead = () => {
      const conversationId = activeConvRef.current;
      if (
        conversationId
        && loadedConversationRef.current === conversationId
        && document.visibilityState === 'visible'
        && document.hasFocus()
      ) {
        void markConversationRead(conversationId);
      }
    };
    window.addEventListener('focus', markVisibleConversationRead);
    document.addEventListener('visibilitychange', markVisibleConversationRead);
    return () => {
      window.removeEventListener('focus', markVisibleConversationRead);
      document.removeEventListener('visibilitychange', markVisibleConversationRead);
    };
  }, [markConversationRead]);

  // ─── Manual Sync — เรียก backend sync-line API ──────────────────────────────
  const syncMessages = useCallback(async () => {
    if (!activeConv || syncing) return;
    setSyncing(true);
    const toastId = toast.loading(localize(uiLang, '🔄 กำลัง Sync กับ LINE...', '🔄 ກຳລັງ Sync ກັບ LINE...'));
    try {
      if (activeConv.channel === 'line') {
        // เรียก /sync-line API: update profile + ตรวจ gap + inject notes
        const r = await api.post(`/conversations/${activeConv.id}/sync-line`);
        const s = r.data.summary;

        // แสดงผลสรุป
        const lines = s.results as string[];
        toast.success(
          localize(uiLang, `✅ Sync เสร็จ\n${lines.slice(0, 3).join('\n')}`, `✅ Sync ສຳເລັດ\n${lines.slice(0, 3).join('\n')}`),
          { id: toastId, duration: 5000 }
        );

        if (s.gapsFound > 0) {
          toast(localize(uiLang, `⚠️ พบ ${s.gapsFound} gap — บันทึก note เข้าประวัติแล้ว`, `⚠️ ພົບ ${s.gapsFound} gap — ບັນທຶກ note ເຂົ້າປະຫວັດແລ້ວ`), {
            icon: '📝', duration: 4000,
          });
          setExternalReplyWarning(false); // ซ่อน banner เพราะ inject note แล้ว
        }
      } else {
        toast.success(localize(uiLang, '🔄 รีเฟรชข้อความแล้ว', '🔄 ໂຫຼດຂໍ້ຄວາມໃໝ່ແລ້ວ'), { id: toastId });
      }

      // Reload messages หลัง sync เสมอ
      await loadMessages(activeConv.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || localize(uiLang, 'Sync ไม่สำเร็จ', 'Sync ບໍ່ສຳເລັດ'), { id: toastId });
    } finally {
      setSyncing(false);
    }
  }, [activeConv, syncing, loadMessages, uiLang]);

  // ─── Auto-scroll ─────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Socket: new_message ─────────────────────────────────────────────────
  useSocket('new_message', (data: any) => {
    if (!data?.conversationId || !data?.message?.id) return;
    conversationEventRevisionRef.current += 1;
    const isActive = data.conversationId === activeConvRef.current;
    const isCustomer = data.message?.senderType === 'customer';
    const isActuallyViewed = isActive
      && document.visibilityState === 'visible'
      && document.hasFocus();
    const messageId = data.message.id as string;
    let knownUnreadIds = unreadMessageIdsByConversationRef.current.get(data.conversationId);
    if (!knownUnreadIds) {
      knownUnreadIds = new Set<string>();
      unreadMessageIdsByConversationRef.current.set(data.conversationId, knownUnreadIds);
    }
    const shouldCountAsUnread = isCustomer
      && !isActuallyViewed
      && !readMessageIdsRef.current.has(messageId)
      && !knownUnreadIds.has(messageId);
    if (shouldCountAsUnread) knownUnreadIds.add(messageId);
    const nowIso = new Date().toISOString();

    // 1) ถ้าเปิดห้องนี้อยู่ → ต่อข้อความใหม่ทันที (ทุก senderType)
    if (isActive) {
      setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
      setTypingUsers([]);
      if (isCustomer && isActuallyViewed) void markConversationRead(data.conversationId);
    }

    // 2) เสียง + แจ้งเตือน เมื่อลูกค้าทักเข้ามา (ทุกห้อง — ดังแม้กำลังเปิดห้องอื่น)
    if (isCustomer) {
      playNotificationSound();
      if (!isActuallyViewed) {
        toast(
          localize(uiLang, '💬 ข้อความใหม่จาก ', '💬 ຂໍ້ຄວາມໃໝ່ຈາກ ') + (data.contact?.displayName || localize(uiLang, 'ลูกค้า', 'ລູກຄ້າ')),
          { icon: channelIcon(data.channel) },
        );
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
        lastMessageAt: data.message?.createdAt || nowIso,
        lastCustomerMessageAt: isCustomer
          ? (data.message?.createdAt || nowIso)
          : prev[idx].lastCustomerMessageAt,
        messages: [data.message],                       // อัปเดตข้อความตัวอย่างใน list
        _unread: isCustomer
          ? ((prev[idx]._unread || 0) + (shouldCountAsUnread ? 1 : 0))
          : (prev[idx]._unread || 0),
      };
      // Only incoming customer activity changes queue order. Bot/AI and agent
      // replies update the preview in place and preserve the unread badge.
      if (isCustomer) return [updated, ...prev.filter((_, i) => i !== idx)];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  });

  useSocket('conversation_read', (data: any) => {
    applyConversationRead(data);
  });

  useSocket('conversation_updated', () => {
    conversationEventRevisionRef.current += 1;
    loadConversations();
    if (activeConvRef.current) loadMessages(activeConvRef.current);
  });

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
    setNewMsg(''); setAiSuggest(''); setShowCanned(false); setEnchant(null); setLaoLottery(null);
    const toastId = toast.loading(l('กำลังส่ง...', 'ກຳລັງສົ່ງ...'));
    try {
      await api.post(`/conversations/${activeConv.id}/messages`, { content });
      toast.success(l('ส่งแล้ว', 'ສົ່ງແລ້ວ'), { id: toastId });
      loadMessages(activeConv.id);
    } catch (e: any) {
      toast.error(e.response?.data?.message || l('ส่งไม่ได้', 'ສົ່ງບໍ່ໄດ້'), { id: toastId });
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
      setLaoLottery(null);
    } else {
      setShowCanned(false);
      // ─── Lao Lottery auto-detect ────────────────────────────────────────
      // Pattern: digits + "=" + amount + unit (ล/k) + optional service + round
      if (/\d.*=\s*[\d.,]+\s*[ลlLkK]/.test(val)) {
        const parsed = parseLaoLottery(val);
        setLaoLottery(parsed);
      } else {
        setLaoLottery(null);
      }
    }
    getSocket()?.emit('typing', { conversationId: activeConv?.id });
  };

  // ─── AI Suggestion ────────────────────────────────────────────────────────
  const getAISuggestion = async () => {
    if (!activeConv || loadingAI) return;
    const conversationId = activeConv.id;
    const requestLanguage = aiReplyLanguage;
    setLoadingAI(true);
    const toastId = toast.loading(l('AI กำลังคิด...', 'AI ກຳລັງຄິດ...'));
    try {
      const r = await api.get(`/conversations/${conversationId}/ai-suggest`, {
        params: { language: requestLanguage },
      });
      if (
        activeConvRef.current !== conversationId
        || aiReplyLanguageRef.current !== requestLanguage
      ) {
        toast.dismiss(toastId);
        return;
      }
      setAiSuggest(r.data.suggestion || '');
      toast.success(l('AI แนะนำสำเร็จ', 'AI ແນະນຳສຳເລັດ'), { id: toastId });
    } catch {
      if (
        activeConvRef.current === conversationId
        && aiReplyLanguageRef.current === requestLanguage
      ) {
        toast.error(l('AI ไม่ตอบสนอง', 'AI ບໍ່ຕອບສະໜອງ'), { id: toastId });
      } else {
        toast.dismiss(toastId);
      }
    }
    finally { setLoadingAI(false); }
  };

  // ─── Enchant: ส่งร่าง → รับคำแปล + คำตอบ 3 โทนในภาษาที่เลือก ───────────────
  const enchantDraft = async () => {
    if (!activeConv || loadingEnchant || !newMsg.trim()) return;
    const conversationId = activeConv.id;
    const requestLanguage = aiReplyLanguage;
    setLoadingEnchant(true);
    const toastId = toast.loading(l('✨ Enchant กำลังแปลและคิดคำตอบ...', '✨ Enchant ກຳລັງແປ ແລະ ຄິດຄຳຕອບ...'));
    try {
      const r = await api.post(`/conversations/${conversationId}/enchant`, {
        draft: newMsg,
        language: requestLanguage,
      });
      if (
        activeConvRef.current !== conversationId
        || aiReplyLanguageRef.current !== requestLanguage
      ) {
        toast.dismiss(toastId);
        return;
      }
      setEnchant({
        lang: r.data.lang,
        translation: r.data.translation || r.data.thai || newMsg,
        outputLanguage: r.data.outputLanguage === 'lo' ? 'lo' : 'th',
        suggestions: r.data.suggestions || [],
      });
      setShowCanned(false); setAiSuggest('');
      toast.success(l(
        `✨ ได้ ${r.data.suggestions?.length || 0} คำตอบ`,
        `✨ ໄດ້ ${r.data.suggestions?.length || 0} ຄຳຕອບ`,
      ), { id: toastId });
    } catch (e: any) {
      if (
        activeConvRef.current === conversationId
        && aiReplyLanguageRef.current === requestLanguage
      ) {
        toast.error(e.response?.data?.message || l('Enchant ไม่สำเร็จ', 'Enchant ບໍ່ສຳເລັດ'), { id: toastId });
      } else {
        toast.dismiss(toastId);
      }
    } finally { setLoadingEnchant(false); }
  };

  // ใช้คำตอบที่ Enchant แนะนำ → ใส่ลงช่องพิมพ์ (แอดมินกด Enter ส่งเอง)
  const useEnchantSuggestion = (text: string) => {
    setNewMsg(text);
    setEnchant(null);
    textareaRef.current?.focus();
  };

  const exportCurrentChat = async () => {
    if (!activeConv || exportingChat) return;
    setExportingChat(true);
    const toastId = toast.loading(l('กำลัง Export ห้องแชทสำหรับ Train AI...', 'ກຳລັງສົ່ງອອກຫ້ອງແຊັດສຳລັບ Train AI...'));
    try {
      const response = await api.post('/conversations/export', {
        conversationIds: [activeConv.id],
        format: 'jsonl',
        anonymize: true,
      }, {
        responseType: 'blob',
        timeout: 180000,
      });
      const disposition = String(response.headers['content-disposition'] || '');
      const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1]
        || `crm-ai-training-${activeConv.id}.jsonl`;
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(l('Export ห้องแชทสำเร็จ (ปิดบังข้อมูลส่วนตัวแล้ว)', 'ສົ່ງອອກຫ້ອງແຊັດສຳເລັດ (ປິດບັງຂໍ້ມູນສ່ວນຕົວແລ້ວ)'), { id: toastId });
    } catch (error: any) {
      let message = error.response?.data?.message || error.message || l('Export ห้องแชทไม่สำเร็จ', 'ສົ່ງອອກຫ້ອງແຊັດບໍ່ສຳເລັດ');
      if (error.response?.data instanceof Blob) {
        try {
          const parsed = JSON.parse(await error.response.data.text());
          message = parsed.message || message;
        } catch { /* keep the regular message */ }
      }
      toast.error(message, { id: toastId });
    } finally {
      setExportingChat(false);
    }
  };

  // ─── Toggle Bot/Human ─────────────────────────────────────────────────────
  const toggleBot = async () => {
    if (!activeConv) return;
    const toHuman = activeConv.isBot;
    const toastId = toast.loading(toHuman
      ? l('สลับเป็น Human...', 'ກຳລັງສະຫຼັບເປັນຄົນຕອບ...')
      : l('สลับเป็น Bot...', 'ກຳລັງສະຫຼັບເປັນ Bot...'));
    try {
      await api.post(`/conversations/${activeConv.id}/handoff`, { toHuman });
      toast.success(toHuman
        ? l('👤 สลับเป็น Human แล้ว', '👤 ສະຫຼັບເປັນຄົນຕອບແລ້ວ')
        : l('🤖 สลับเป็น Bot แล้ว', '🤖 ສະຫຼັບເປັນ Bot ແລ້ວ'), { id: toastId });
      loadMessages(activeConv.id); loadConversations();
    } catch { toast.error(l('เกิดข้อผิดพลาด', 'ເກີດຂໍ້ຜິດພາດ'), { id: toastId }); }
  };

  // ─── Resolve conversation ─────────────────────────────────────────────────
  const resolveConversation = async () => {
    if (!activeConv) return;
    const toastId = toast.loading(l('กำลังปิดบทสนทนา...', 'ກຳລັງປິດການສົນທະນາ...'));
    try {
      await api.patch(`/conversations/${activeConv.id}`, { status: 'resolved' });
      toast.success(l('✅ ปิดบทสนทนาแล้ว', '✅ ປິດການສົນທະນາແລ້ວ'), { id: toastId });
      loadConversations(); setActiveConv(null); setMessages([]);
    } catch { toast.error(l('เกิดข้อผิดพลาด', 'ເກີດຂໍ້ຜິດພາດ'), { id: toastId }); }
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

  // กด key ลัด → ใส่ "คำตอบที่ตั้งไว้เป๊ะๆ" ลงช่องพิมพ์ ให้แอดมินตรวจ/แก้ก่อนกดส่ง
  const applyQuickReply = async (q: any) => {
    setShowCanned(false);
    setNewMsg(q.content);
    textareaRef.current?.focus();
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.inbox}>
      {/* ═══ LEFT: Conversation List ═══════════════════════════════════════ */}
      <div className={`${styles.convList} ${drawerOpen ? styles.convListOpen : ''}`}>
        <button className={styles.drawerClose} onClick={() => setDrawerOpen(false)} aria-label={l('ปิดรายชื่อ', 'ປິດລາຍຊື່')}>✕</button>
        <div className={styles.convListHeader}>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input className="input" placeholder={l('🔍 ค้นหา...', '🔍 ຄົ້ນຫາ...')} value={search}
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
              <option value="all">🏢 {l('ทุกบริษัท', 'ທຸກບໍລິສັດ')}</option>
              {companies.map(c => <option key={c.id} value={c.id}>🏢 {c.name}</option>)}
            </select>
          )}

          <div className={styles.channelFilters}>
            {[
              { key: 'all', label: l('ทุกช่อง', 'ທຸກຊ່ອງທາງ'), icon: '📱' },
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
          <span>{conversations.length} {l('บทสนทนา', 'ການສົນທະນາ')}</span>
          {totalUnread > 0 && <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.75rem', fontWeight: 700 }}>{totalUnread} {l('ใหม่', 'ໃໝ່')}</span>}
        </div>

        <div className={styles.convItems}>
          {conversations.length === 0 && (
            <div className={styles.empty}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
              <div>{l('ไม่มีบทสนทนา', 'ບໍ່ມີການສົນທະນາ')}</div>
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
                      {conv.contact?.displayName || l('ไม่ทราบชื่อ', 'ບໍ່ຮູ້ຊື່')}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                      {(conv.lastCustomerMessageAt || conv.lastMessageAt)
                        ? formatRelativeTime(conv.lastCustomerMessageAt || conv.lastMessageAt, uiLang)
                        : ''}
                    </span>
                  </div>
                  <div className={styles.convPreview} style={{ fontWeight: unread > 0 ? 600 : 400, color: unread > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {lastMsg?.content || l('ไม่มีข้อความ', 'ບໍ່ມີຂໍ້ຄວາມ')}
                  </div>
                  <div className={styles.convMeta}>
                    <span className={`badge badge-${conv.status}`} style={{ fontSize: '0.65rem' }}>
                      {conv.isBot ? '🤖' : '👤'} {conversationStatusLabel(conv.status, uiLang)}
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
            <button className={styles.mobileToggle} onClick={() => setDrawerOpen(true)} aria-label={l('เปิดรายชื่อ', 'ເປີດລາຍຊື່')} style={{ position: 'absolute', top: 16, left: 16, margin: 0 }}>☰</button>
            <div style={{ fontSize: '5rem', marginBottom: 16, animation: 'pulse 2s infinite' }}>💬</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{l('เลือกบทสนทนา', 'ເລືອກການສົນທະນາ')}</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '0.9rem' }}>
              {l('แตะ ☰ มุมซ้ายบนเพื่อเปิดรายชื่อ', 'ແຕະ ☰ ມຸມຊ້າຍເທິງເພື່ອເປີດລາຍຊື່')}
            </div>
            <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                `📬 ${conversations.length} ${l('บทสนทนา', 'ການສົນທະນາ')}`,
                l('🤖 Bot พร้อมตอบ', '🤖 Bot ພ້ອມຕອບ'),
                l('⚡ Real-time', '⚡ ເວລາຈິງ'),
              ].map(s => (
                <span key={s} style={{ padding: '6px 14px', background: 'var(--bg-tertiary)', borderRadius: 20, fontSize: '0.8rem', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>{s}</span>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className={styles.chatHeader}>
              <button className={styles.mobileToggle} onClick={() => setDrawerOpen(true)} aria-label={l('เปิดรายชื่อ', 'ເປີດລາຍຊື່')}>☰</button>
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
                  <span className={`badge badge-${activeConv.status}`} style={{ fontSize: '0.7rem' }}>{conversationStatusLabel(activeConv.status, uiLang)}</span>
                  {activeConv.assignedTo && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>👤 {activeConv.assignedTo.displayName}</span>}
                  {/* ── CRM-only notice ── */}
                  <span title={l('ข้อความที่ตอบจาก LINE OA Manager โดยตรงจะไม่บันทึกใน CRM', 'ຂໍ້ຄວາມທີ່ຕອບຈາກ LINE OA Manager ໂດຍກົງຈະບໍ່ຖືກບັນທຶກໃນ CRM')} style={{
                    fontSize: '0.62rem', padding: '1px 6px',
                    background: 'rgba(245,158,11,0.1)', color: 'var(--warning)',
                    border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8,
                    cursor: 'help', whiteSpace: 'nowrap',
                  }}>⚠️ {l('ตอบผ่าน CRM เท่านั้น', 'ຕອບຜ່ານ CRM ເທົ່ານັ້ນ')}</span>
                </div>
              </div>
              <div className={styles.chatHeaderActions} style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <button
                  className={`btn btn-secondary btn-sm ${styles.chatHeaderHideMobile}`}
                  onClick={exportCurrentChat}
                  disabled={exportingChat}
                  title={l('Export ห้องแชทนี้เป็น JSONL สำหรับ Train AI (ปิดบังข้อมูลส่วนตัว)', 'ສົ່ງອອກຫ້ອງແຊັດນີ້ເປັນ JSONL ສຳລັບ Train AI (ປິດບັງຂໍ້ມູນສ່ວນຕົວ)')}
                >
                  {exportingChat ? <span className="spinner" style={{ width: 13, height: 13 }} /> : '⬇️'} {l('Export AI', 'ສົ່ງອອກ AI')}
                </button>
                {/* Sync/Refresh Button */}
                <button
                  className={`btn btn-ghost btn-sm btn-icon ${styles.chatHeaderHideMobile}`}
                  onClick={syncMessages}
                  disabled={syncing}
                  title={l('รีเฟรชข้อความล่าสุด', 'ໂຫຼດຂໍ້ຄວາມລ່າສຸດໃໝ່')}
                  style={{ fontSize: '0.9rem' }}
                >
                  {syncing
                    ? <span className="spinner" style={{ width: 13, height: 13 }} />
                    : '🔄'
                  }
                </button>
                {/* Bot/Human Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-tertiary)', borderRadius: 20, border: '1px solid var(--border)' }}>
                  <span className={styles.chatHeaderHideMobile} style={{ fontSize: '0.75rem', color: activeConv.isBot ? 'var(--purple)' : 'var(--teal)' }}>
                    {activeConv.isBot ? '🤖 Bot' : l('👤 Human', '👤 ຄົນຕອບ')}
                  </span>
                  <label className="toggle" style={{ transform: 'scale(0.85)' }}>
                    <input type="checkbox" checked={!activeConv.isBot} onChange={toggleBot} title={l('สลับ AI ↔ คนตอบ', 'ສະຫຼັບ AI ↔ ຄົນຕອບ')} />
                    <span className="toggle-slider" />
                  </label>
                </div>
                {/* Resolve */}
                {activeConv.status !== 'resolved' && (
                  <button className={`btn btn-secondary btn-sm ${styles.chatHeaderHideMobile}`} onClick={resolveConversation} title={l('ปิดบทสนทนา', 'ປິດການສົນທະນາ')}>
                    ✅ {l('ปิด', 'ປິດ')}
                  </button>
                )}
                {/* AI Panel Toggle (Tablet/Mobile) */}
                <button 
                  className={styles.aiPanelToggle} 
                  onClick={() => setAiPanelOpen(true)}
                  title={l('เปิด AI Assistant', 'ເປີດຜູ້ຊ່ວຍ AI')}
                >
                  ✨
                </button>
                {/* Mobile More Button */}
                <button 
                  className={styles.mobileMoreBtn} 
                  onClick={() => setMobileMenuOpen(v => !v)}
                  title={l('เพิ่มเติม', 'ເພີ່ມເຕີມ')}
                >
                  ⋯
                  {mobileMenuOpen && (
                    <div className={styles.mobileMoreMenu}>
                      <button className={styles.mobileMoreMenuItem} onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); exportCurrentChat(); }}>
                        {exportingChat ? <span className="spinner" style={{ width: 13, height: 13 }} /> : '⬇️'} {l('Export AI', 'ສົ່ງອອກ AI')}
                      </button>
                      <button className={styles.mobileMoreMenuItem} onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); syncMessages(); }}>
                        {syncing ? <span className="spinner" style={{ width: 13, height: 13 }} /> : '🔄'} {l('Sync รีเฟรชข้อความ', 'Sync ໂຫຼດຂໍ້ຄວາມໃໝ່')}
                      </button>
                      {activeConv.status !== 'resolved' && (
                        <button className={`${styles.mobileMoreMenuItem} ${styles.mobileMoreMenuDanger}`} onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); resolveConversation(); }}>
                          ✅ {l('ปิดบทสนทนา', 'ປິດການສົນທະນາ')}
                        </button>
                      )}
                    </div>
                  )}
                </button>
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
                <span>👥 {l('กำลังดูอยู่', 'ກຳລັງເບິ່ງຢູ່')}:</span>
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
                    ⚠️ {l('มีแอดมินหลายคนดูอยู่', 'ມີແອດມິນຫຼາຍຄົນກຳລັງເບິ່ງ')}
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
                  <div>{l('ยังไม่มีข้อความ', 'ຍັງບໍ່ມີຂໍ້ຄວາມ')}</div>
                </div>
              )}
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} contactName={activeConv.contact?.displayName} channel={activeConv.channel} lang={lang} />
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
                    👤 {typingUsers.join(', ')} {l('กำลังพิมพ์...', 'ກຳລັງພິມ...')}
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* AI Suggestion Bar */}
            {aiSuggest && (
              <div className={styles.aiSuggest} onClick={() => { setNewMsg(aiSuggest); setAiSuggest(''); textareaRef.current?.focus(); }}>
                <span style={{ color: 'var(--teal)', fontWeight: 600, marginRight: 6 }}>✨ {l('AI แนะนำ', 'AI ແນະນຳ')}:</span>
                <span style={{ flex: 1 }}>{aiSuggest}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: 8, flexShrink: 0 }}>{l('คลิกเพื่อใช้', 'ຄລິກເພື່ອໃຊ້')} →</span>
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
                    {l('แปลจาก', 'ແປຈາກ')} {enchant.lang} → {enchant.outputLanguage === 'lo' ? 'ພາສາລາວ' : l('ภาษาไทย', 'ພາສາໄທ')}
                  </span>
                  <button onClick={() => setEnchant(null)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                </div>
                {/* คำแปลร่างในภาษาปลายทางที่แอดมินเลือก */}
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderRadius: 8, padding: '6px 10px', marginBottom: 8, lineHeight: 1.5 }}>
                  📝 {l('ร่างของคุณ', 'ຮ່າງຂອງທ່ານ')} ({enchant.outputLanguage === 'lo' ? 'ພາສາລາວ' : l('ภาษาไทย', 'ພາສາໄທ')}): <span style={{ color: 'var(--text-primary)' }}>{enchant.translation}</span>
                </div>
                {/* คำตอบแนะนำ 3 โทน */}
                {enchant.suggestions.length === 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>{l('ไม่มีคำตอบแนะนำ', 'ບໍ່ມີຄຳຕອບແນະນຳ')}</div>
                )}
                {enchant.suggestions.map((s, i) => {
                  const meta = TONE_META[s.tone] || { labelTh: s.tone, labelLo: s.tone, color: 'var(--teal)' };
                  return (
                    <div key={i} onClick={() => { useEnchantSuggestion(s.text); toast.success(l('✅ ใส่คำตอบแล้ว — กด Enter เพื่อส่ง', '✅ ໃສ່ຄຳຕອບແລ້ວ — ກົດ Enter ເພື່ອສົ່ງ')); }}
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', marginBottom: 6, cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s' }}
                      onMouseEnter={e => { (e.currentTarget as any).style.borderColor = meta.color; (e.currentTarget as any).style.background = 'rgba(124,58,237,0.06)'; }}
                      onMouseLeave={e => { (e.currentTarget as any).style.borderColor = 'var(--border)'; (e.currentTarget as any).style.background = 'var(--bg-tertiary)'; }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: meta.color }}>{uiLang === 'lo' ? meta.labelLo : meta.labelTh}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{l('คลิกเพื่อใช้', 'ຄລິກເພື່ອໃຊ້')} →</span>
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
                      🤖 {l('Key ลัด — AI แต่งคำตอบให้เข้ากับแชท', 'Key ລັດ — AI ຮຽບຮຽງຄຳຕອບໃຫ້ເຂົ້າກັບແຊັດ')}
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
                  🤖 {l(
                    'Bot ตอบอัตโนมัติอยู่ — แอดมินพิมพ์และกดส่งตอบเองได้ทันที โดยไม่ต้องสลับโหมด',
                    'Bot ກຳລັງຕອບອັດຕະໂນມັດ — ແອດມິນສາມາດພິມ ແລະ ສົ່ງຄຳຕອບເອງໄດ້ທັນທີ ໂດຍບໍ່ຕ້ອງສະຫຼັບໂໝດ',
                  )}
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
                  <span>
                    {l('ข้อความนี้จะส่งผ่าน LINE API และ', 'ຂໍ້ຄວາມນີ້ຈະສົ່ງຜ່ານ LINE API ແລະ')}
                    <strong>{l('บันทึกใน CRM อัตโนมัติ', 'ບັນທຶກໃນ CRM ອັດຕະໂນມັດ')}</strong>
                    {l(' — อย่าตอบผ่าน LINE OA Manager', ' — ຢ່າຕອບຜ່ານ LINE OA Manager')}
                  </span>
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
                  <span>{adminTyping} {l('กำลังพิมพ์ตอบลูกค้าอยู่ — โปรดรอก่อนส่ง', 'ກຳລັງພິມຕອບລູກຄ້າ — ກະລຸນາລໍຖ້າກ່ອນສົ່ງ')}</span>
                  <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.7rem', fontWeight: 400 }}>{l('เพื่อป้องกันการตอบซ้อน', 'ເພື່ອປ້ອງກັນການຕອບຊ້ອນ')}</span>
                </div>
              )}
              {/* ── Enchant toolbar — พิมพ์ลาว แล้วให้ AI แปล+แนะนำ ── */}
              {!activeConv.isBot && (
                <div className={styles.enchantBar} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 0' }}>
                  <button
                    className="btn btn-sm"
                    onClick={enchantDraft}
                    disabled={loadingEnchant || !newMsg.trim()}
                    title={l('ให้ AI เรียบเรียงร่างเป็นภาษาที่เลือก พร้อมคำตอบ 3 โทน', 'ໃຫ້ AI ຮຽບຮຽງຮ່າງເປັນພາສາທີ່ເລືອກ ພ້ອມຄຳຕອບ 3 ໂທນ')}
                    style={{ borderColor: 'var(--purple)', color: 'var(--purple)', background: 'rgba(124,58,237,0.1)', whiteSpace: 'nowrap', fontWeight: 700 }}
                  >
                    {loadingEnchant
                      ? <><span className="spinner" style={{ width: 13, height: 13 }} /> {l('กำลังคิด...', 'ກຳລັງຄິດ...')}</>
                      : '✨ Enchant'}
                  </button>
                  <span className={styles.enchantHint} style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {l(
                      `AI จะสร้างคำตอบ ${aiReplyLanguage === 'lo' ? 'ภาษาลาว' : 'ภาษาไทย'} 3 โทน`,
                      `AI ຈະສ້າງຄຳຕອບ ${aiReplyLanguage === 'lo' ? 'ພາສາລາວ' : 'ພາສາໄທ'} 3 ໂທນ`,
                    )}
                  </span>
                </div>
              )}
              {/* ── 🎰 Lao Lottery Preview — แสดงเมื่อ detect pattern หวยลาว ── */}
              {laoLottery && !activeConv.isBot && (
                <div style={{ padding: '0 16px 0' }}>
                  <LaoLotteryPreview
                    result={laoLottery}
                    onSend={(text) => {
                      setNewMsg(text);
                      setLaoLottery(null);
                      setTimeout(() => sendMessage(), 50);
                    }}
                    onDismiss={() => setLaoLottery(null)}
                  />
                </div>
              )}
              <div className={styles.inputRow} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: '12px 16px' }}>

                <div style={{ flex: 1, position: 'relative' }}>
                  <textarea
                    ref={textareaRef}
                    className="input"
                    rows={2}
                    placeholder={l(
                      'พิมพ์ข้อความ... (Enter ส่ง, Shift+Enter ขึ้นบรรทัด, / สำหรับ Quick Reply)',
                      'ພິມຂໍ້ຄວາມ... (Enter ສົ່ງ, Shift+Enter ຂຶ້ນແຖວໃໝ່, / ສຳລັບ Quick Reply)',
                    )}
                    value={newMsg}
                    onChange={e => handleTyping(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        // ถ้า popup key ลัดเปิดอยู่ → Enter = เลือกตัวแรก (ไม่ส่ง "/xxx" ดิบๆ หาลูกค้า)
                        if (showCanned && filteredQuickReplies.length > 0) { applyQuickReply(filteredQuickReplies[0]); return; }
                        if (showCanned && filteredCanned.length > 0) { setNewMsg(filteredCanned[0].text); setShowCanned(false); return; }
                        if (newMsg.trim().startsWith('/') && quickReplies.length > 0) {
                          toast.error(l('ไม่พบ key ลัดนี้ — กด Esc ถ้าต้องการส่งข้อความปกติ', 'ບໍ່ພົບ Key ລັດນີ້ — ກົດ Esc ຫາກຕ້ອງການສົ່ງຂໍ້ຄວາມປົກກະຕິ'));
                          return;
                        }
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
                <div className={styles.inputBtnGroup} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm btn-icon"
                    title={l('⚡ Key ลัด — คำตอบที่ตั้งไว้', '⚡ Key ລັດ — ຄຳຕອບທີ່ຕັ້ງໄວ້')}
                    onClick={() => { setCannedFilter('/'); setShowCanned(v => !v); textareaRef.current?.focus(); }}>
                    ⚡
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <select
                      value={aiReplyLanguage}
                      onChange={event => setAiReplyLanguage(event.target.value as UiLanguage)}
                      aria-label={l('เลือกภาษาคำตอบ AI', 'ເລືອກພາສາຄຳຕອບ AI')}
                      title={l('เลือกภาษาคำตอบ AI', 'ເລືອກພາສາຄຳຕອບ AI')}
                      style={{
                        width: 46,
                        height: 24,
                        padding: '0 3px',
                        borderRadius: 7,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--teal)',
                        fontFamily: 'inherit',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <option value="lo">LA</option>
                      <option value="th">TH</option>
                    </select>
                    <button
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={getAISuggestion}
                      disabled={loadingAI}
                      title={`${l('AI แนะนำ', 'AI ແນະນຳ')} · ${aiReplyLanguage === 'lo' ? 'ພາສາລາວ' : l('ภาษาไทย', 'ພາສາໄທ')}`}
                    >
                      {loadingAI ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '✨'}
                    </button>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={sendMessage}
                    disabled={sending || !newMsg.trim()}
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
        <>
          {aiPanelOpen && <div className={styles.aiPanelBackdrop} onClick={() => setAiPanelOpen(false)} />}
          <div className={`${styles.aiPanel} ${aiPanelOpen ? styles.aiPanelOpen : ''}`}>
            <div className={styles.aiPanelHandle} onClick={() => setAiPanelOpen(false)} />
            <button className={styles.aiPanelClose} onClick={() => setAiPanelOpen(false)}>✕</button>
            <AiAdminPanel
              key={activeConv.id}
              conv={activeConv}
              messages={messages}
              lang={uiLang}
              replyLanguage={aiReplyLanguage}
              onReplyLanguageChange={setAiReplyLanguage}
              onUseDraft={(text: string) => { setNewMsg(text); textareaRef.current?.focus(); setAiPanelOpen(false); }}
              onResolve={() => { resolveConversation(); setAiPanelOpen(false); }}
              onToggleBot={toggleBot}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── AI Smart Admin Panel ─────────────────────────────────────────────────────
function AiAdminPanel({ conv, messages, lang, replyLanguage, onReplyLanguageChange, onUseDraft, onResolve, onToggleBot }: {
  conv: any;
  messages: any[];
  lang: UiLanguage;
  replyLanguage: UiLanguage;
  onReplyLanguageChange: (language: UiLanguage) => void;
  onUseDraft: (t: string) => void;
  onResolve: () => void;
  onToggleBot: () => void;
}) {
  const l = (thai: string, lao: string) => localize(lang, thai, lao);
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
  const replyLanguageRef = useRef<UiLanguage>(replyLanguage);

  const contact: any = conv.contact;

  useEffect(() => {
    replyLanguageRef.current = replyLanguage;
    setDrafts([]);
  }, [replyLanguage]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(l(`คัดลอก${label}แล้ว`, `ສຳເນົາ ${label} ແລ້ວ`));
    } catch {
      toast.error(l('คัดลอกไม่สำเร็จ', 'ສຳເນົາບໍ່ສຳເລັດ'));
    }
  };

  const getDrafts = async () => {
    const requestLanguage = replyLanguage;
    setLoadingDraft(true); setDrafts([]);
    const tid = toast.loading(l('AI กำลังร่างข้อความ...', 'AI ກຳລັງຮ່າງຂໍ້ຄວາມ...'));
    try {
      const r = await api.post(`/conversations/${conv.id}/ai-draft`, {
        tone,
        purpose,
        language: requestLanguage,
      });
      if (replyLanguageRef.current !== requestLanguage) {
        toast.dismiss(tid);
        return;
      }
      setDrafts(r.data.suggestions || []);
      toast.success(l(
        `✨ ได้ ${r.data.suggestions?.length || 0} ตัวเลือก`,
        `✨ ໄດ້ ${r.data.suggestions?.length || 0} ຕົວເລືອກ`,
      ), { id: tid });
    } catch {
      if (replyLanguageRef.current === requestLanguage) {
        toast.error(l('AI ไม่ตอบสนอง', 'AI ບໍ່ຕອບສະໜອງ'), { id: tid });
      } else {
        toast.dismiss(tid);
      }
    }
    finally { setLoadingDraft(false); }
  };

  const getSummary = async () => {
    setLoadingSummary(true);
    const tid = toast.loading(l('AI กำลังวิเคราะห์...', 'AI ກຳລັງວິເຄາະ...'));
    try {
      const r = await api.get(`/conversations/${conv.id}/summary`);
      setSummary(r.data);
      toast.success(l('✅ วิเคราะห์สำเร็จ', '✅ ວິເຄາະສຳເລັດ'), { id: tid });
    } catch { toast.error(l('เกิดข้อผิดพลาด', 'ເກີດຂໍ້ຜິດພາດ'), { id: tid }); }
    finally { setLoadingSummary(false); }
  };

  const doTranslate = async () => {
    if (!translateText.trim()) return;
    setLoadingTranslate(true);
    try {
      const r = await api.post(`/conversations/${conv.id}/translate`, { text: translateText });
      setTranslated(r.data);
    } catch { toast.error(l('แปลไม่ได้', 'ແປບໍ່ໄດ້')); }
    finally { setLoadingTranslate(false); }
  };

  const SENTIMENT_COLOR: any = { positive: 'var(--success)', neutral: 'var(--warning)', negative: 'var(--danger)' };
  const SENTIMENT_ICON: any  = { positive: '😊', neutral: '😐', negative: '😟' };
  const URGENCY_COLOR: any   = { low: 'var(--success)', medium: 'var(--warning)', high: 'var(--danger)' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab selector */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {[
          { k: 'ai', l: '✨ AI', title: l('AI ช่วยร่าง', 'AI ຊ່ວຍຮ່າງ') },
          { k: 'profile', l: l('👤 ลูกค้า', '👤 ລູກຄ້າ'), title: l('ข้อมูลลูกค้า', 'ຂໍ້ມູນລູກຄ້າ') },
          { k: 'actions', l: l('⚡ Action', '⚡ ການດຳເນີນການ'), title: l('การดำเนินการ', 'ການດຳເນີນການ') },
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
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--teal)', marginBottom: 8 }}>
                ✨ {l('AI ร่างข้อความตอบ', 'AI ຮ່າງຂໍ້ຄວາມຕອບ')}
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                  {l('ภาษาของคำตอบ AI', 'ພາສາຂອງຄຳຕອບ AI')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {([
                    { key: 'lo' as const, label: '🇱🇦 ພາສາລາວ' },
                    { key: 'th' as const, label: lang === 'lo' ? '🇹🇭 ພາສາໄທ' : '🇹🇭 ภาษาไทย' },
                  ]).map(option => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={replyLanguage === option.key}
                      onClick={() => onReplyLanguageChange(option.key)}
                      style={{
                        padding: '6px 4px',
                        borderRadius: 7,
                        border: `1px solid ${replyLanguage === option.key ? 'var(--teal)' : 'var(--border)'}`,
                        background: replyLanguage === option.key ? 'rgba(0,212,170,0.1)' : 'transparent',
                        color: replyLanguage === option.key ? 'var(--teal)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: '0.7rem',
                        fontWeight: replyLanguage === option.key ? 700 : 500,
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone selector */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>{l('โทนการพูด', 'ໂທນການເວົ້າ')}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { k: 'friendly', l: l('😊 เป็นกันเอง', '😊 ເປັນກັນເອງ') },
                    { k: 'formal', l: l('🤝 เป็นทางการ', '🤝 ເປັນທາງການ') },
                    { k: 'urgent', l: l('⚡ รวดเร็ว', '⚡ ວ່ອງໄວ') },
                  ].map(t => (
                    <button key={t.k} onClick={() => setTone(t.k as any)}
                      style={{ flex: 1, padding: '4px 2px', borderRadius: 6, border: `1px solid ${tone === t.k ? 'var(--teal)' : 'var(--border)'}`, background: tone === t.k ? 'rgba(0,212,170,0.1)' : 'transparent', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'inherit', color: tone === t.k ? 'var(--teal)' : 'var(--text-muted)', fontWeight: tone === t.k ? 600 : 400 }}>
                      {t.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Purpose selector */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>{l('วัตถุประสงค์', 'ຈຸດປະສົງ')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {[
                    { k: 'reply', l: l('💬 ตอบคำถาม', '💬 ຕອບຄຳຖາມ') },
                    { k: 'followup', l: l('📞 ติดตาม', '📞 ຕິດຕາມ') },
                    { k: 'promotion', l: l('🎁 โปรโมชั่น', '🎁 ໂປຣໂມຊັນ') },
                    { k: 'apology', l: l('🙏 ขอโทษ', '🙏 ຂໍໂທດ') },
                  ].map(p => (
                    <button key={p.k} onClick={() => setPurpose(p.k as any)}
                      style={{ padding: '5px 4px', borderRadius: 6, border: `1px solid ${purpose === p.k ? 'var(--teal)' : 'var(--border)'}`, background: purpose === p.k ? 'rgba(0,212,170,0.1)' : 'transparent', cursor: 'pointer', fontSize: '0.68rem', fontFamily: 'inherit', color: purpose === p.k ? 'var(--teal)' : 'var(--text-muted)', fontWeight: purpose === p.k ? 600 : 400 }}>
                      {p.l}
                    </button>
                  ))}
                </div>
              </div>

              <button className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={getDrafts} disabled={loadingDraft}>
                {loadingDraft
                  ? <><span className="spinner" style={{ width: 13, height: 13 }} /> {l('กำลังคิด...', 'ກຳລັງຄິດ...')}</>
                  : l('✨ สร้างข้อความตอบ', '✨ ສ້າງຂໍ້ຄວາມຕອບ')}
              </button>
            </div>

            {/* Draft options */}
            {drafts.length > 0 && (
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
                  {l('เลือก 1 ตัวเลือก (คลิกเพื่อใช้):', 'ເລືອກ 1 ຕົວເລືອກ (ຄລິກເພື່ອໃຊ້):')}
                </div>
                {drafts.map((d, i) => (
                  <div key={i} onClick={() => { onUseDraft(d); toast.success(l('✅ ใช้ข้อความแล้ว', '✅ ໃຊ້ຂໍ້ຄວາມແລ້ວ')); }}
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1.5, transition: 'border-color 0.2s, background 0.2s', color: 'var(--text-secondary)' }}
                    onMouseEnter={e => { (e.currentTarget as any).style.borderColor = 'var(--teal)'; (e.currentTarget as any).style.background = 'rgba(0,212,170,0.05)'; }}
                    onMouseLeave={e => { (e.currentTarget as any).style.borderColor = 'var(--border)'; (e.currentTarget as any).style.background = 'var(--bg-tertiary)'; }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#000', flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--teal)', fontWeight: 600 }}>{l('ตัวเลือก', 'ຕົວເລືອກ')} {i + 1}</span>
                    </div>
                    {d}
                  </div>
                ))}
              </div>
            )}

            {/* Conversation Summary */}
            <div style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--purple)', marginBottom: 8 }}>🧠 {l('วิเคราะห์บทสนทนา', 'ວິເຄາະການສົນທະນາ')}</div>
              <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--purple)', color: 'var(--purple)', background: 'rgba(124,58,237,0.08)' }} onClick={getSummary} disabled={loadingSummary || messages.length === 0}>
                {loadingSummary
                  ? <><span className="spinner" style={{ width: 13, height: 13 }} /> {l('วิเคราะห์...', 'ກຳລັງວິເຄາະ...')}</>
                  : l('🔍 วิเคราะห์บทสนทนา', '🔍 ວິເຄາະການສົນທະນາ')}
              </button>
              {summary && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--bg-tertiary)', borderRadius: 8, padding: '8px 10px' }}>
                    {summary.summary}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2 }}>{l('ความรู้สึก', 'ຄວາມຮູ້ສຶກ')}</div>
                      <div style={{ fontSize: '1rem' }}>{SENTIMENT_ICON[summary.sentiment]}</div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: SENTIMENT_COLOR[summary.sentiment] }}>
                        {(lang === 'lo'
                          ? { positive: 'ດີ', neutral: 'ປານກາງ', negative: 'ບໍ່ດີ' }
                          : { positive: 'ดี', neutral: 'กลาง', negative: 'ไม่ดี' })[summary.sentiment as string]}
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2 }}>{l('ความเร่งด่วน', 'ຄວາມດ່ວນ')}</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: URGENCY_COLOR[summary.urgency], marginTop: 2 }}>
                        {(lang === 'lo'
                          ? { low: '🟢 ຕ່ຳ', medium: '🟡 ປານກາງ', high: '🔴 ສູງ' }
                          : { low: '🟢 ต่ำ', medium: '🟡 ปานกลาง', high: '🔴 สูง' })[summary.urgency as string]}
                      </div>
                    </div>
                  </div>
                  {summary.intent && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: 6, padding: '5px 8px' }}>
                      🎯 {l('ต้องการ', 'ຄວາມຕ້ອງການ')}: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{summary.intent}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Translate */}
            <div style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.15)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--info)', marginBottom: 8 }}>🌐 {l('แปลภาษา → ไทย', 'ແປພາສາ → ໄທ')}</div>
              <textarea className="input" rows={2} value={translateText} onChange={e => setTranslateText(e.target.value)}
                placeholder={l('วางข้อความที่ต้องการแปล...', 'ວາງຂໍ້ຄວາມທີ່ຕ້ອງການແປ...')} style={{ fontSize: '0.78rem', resize: 'none', marginBottom: 6 }} />
              <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--info)', color: 'var(--info)', background: 'rgba(6,182,212,0.08)' }}
                onClick={doTranslate} disabled={loadingTranslate || !translateText.trim()}>
                {loadingTranslate
                  ? <><span className="spinner" style={{ width: 13, height: 13 }} /> {l('แปล...', 'ກຳລັງແປ...')}</>
                  : l('🌐 แปล', '🌐 ແປ')}
              </button>
              {translated && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 3 }}>{l('ภาษา', 'ພາສາ')}: {translated.lang}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', lineHeight: 1.5 }}
                    onClick={() => { onUseDraft(translated.thai); toast.success(l('✅ ใช้ข้อความแปลแล้ว', '✅ ໃຊ້ຂໍ້ຄວາມແປແລ້ວ')); }}>
                    {translated.thai} <span style={{ fontSize: '0.65rem', color: 'var(--teal)' }}>← {l('คลิกใช้', 'ຄລິກເພື່ອໃຊ້')}</span>
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
                { label: l('ยอดฝากรวม', 'ຍອດຝາກລວມ'), value: '฿' + (contact.totalDeposit || 0).toLocaleString(lang === 'lo' ? 'lo-LA' : 'th-TH', { maximumFractionDigits: 0 }), color: 'var(--success)' },
                { label: l('ยอดถอนรวม', 'ຍອດຖອນລວມ'), value: '฿' + (contact.totalWithdraw || 0).toLocaleString(lang === 'lo' ? 'lo-LA' : 'th-TH', { maximumFractionDigits: 0 }), color: 'var(--danger)' },
                { label: l('ครั้งที่ฝาก', 'ຈຳນວນຄັ້ງທີ່ຝາກ'), value: `${contact.depositCount || 0} ${l('ครั้ง', 'ຄັ້ງ')}`, color: 'var(--teal)' },
                { label: l('กำไร', 'ກຳໄລ'), value: '฿' + ((contact.totalDeposit || 0) - (contact.totalWithdraw || 0)).toLocaleString(lang === 'lo' ? 'lo-LA' : 'th-TH', { maximumFractionDigits: 0 }), color: (contact.totalDeposit || 0) >= (contact.totalWithdraw || 0) ? 'var(--success)' : 'var(--danger)' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Contact info */}
            {[
              contact.phone   && { icon: '📞', label: l('เบอร์โทร', 'ເບີໂທ'), val: contact.phone },
              contact.email   && { icon: '✉️', label: l('อีเมล', 'ອີເມລ'), val: contact.email },
              contact.affiliateCode && { icon: '🤝', label: 'Affiliate', val: contact.affiliateCode },
              contact.firstDepositAt && { icon: '💰', label: l('ฝากแรก', 'ຝາກຄັ້ງທຳອິດ'), val: new Date(contact.firstDepositAt).toLocaleDateString(lang === 'lo' ? 'lo-LA' : 'th-TH') },
            ].filter(Boolean).map((item: any, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: '0.78rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span>{item.icon}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.label}: {item.val}</span>
                <button
                  type="button"
                  title={l(`คัดลอก${item.label}`, `ສຳເນົາ ${item.label}`)}
                  onClick={() => copyText(String(item.val), item.label)}
                  style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontSize: '0.68rem' }}
                >📋</button>
              </div>
            ))}

            {/* ─── ข้อมูลสมัครครั้งแรก: snapshot ไม่ถูกเขียนทับเมื่อแก้โปรไฟล์ภายหลัง ─── */}
            {(() => {
              let customFields: any = {};
              try { customFields = JSON.parse(contact.customFields || '{}'); } catch { customFields = {}; }
              const snapshot = customFields.registration_snapshot || null;
              const prof: any = snapshot || customFields.crm_profile || {};
              const rows = [
                prof.fullName     && { icon: '🪪', label: l('ชื่อ-สกุล', 'ຊື່-ນາມສະກຸນ'), val: prof.fullName },
                prof.phone        && { icon: '📱', label: l('เบอร์', 'ເບີໂທ'), val: prof.phone },
                prof.bankName     && { icon: '🏦', label: l('ธนาคาร', 'ທະນາຄານ'), val: prof.bankName },
                prof.bankAccount  && { icon: '💳', label: l('เลขบัญชี', 'ເລກບັນຊີ'), val: prof.bankAccount },
                prof.gameUsername && { icon: '🎮', label: l('ยูสเซอร์', 'ຊື່ຜູ້ໃຊ້'), val: prof.gameUsername },
              ].filter(Boolean) as any[];
              if (!rows.length) return null;
              return (
                <div style={{ marginTop: 12, background: 'var(--bg-tertiary)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--teal)', marginBottom: 6 }}>
                    {snapshot
                      ? l('🧾 ข้อมูลสมัครครั้งแรก', '🧾 ຂໍ້ມູນສະໝັກຄັ້ງທຳອິດ')
                      : l('💾 ข้อมูลที่ลูกค้าแจ้งล่าสุด', '💾 ຂໍ້ມູນຫຼ້າສຸດທີ່ລູກຄ້າແຈ້ງ')}
                    {(prof.capturedAt || prof.updatedAt) && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                        {new Date(prof.capturedAt || prof.updatedAt).toLocaleString(lang === 'lo' ? 'lo-LA' : 'th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                  {snapshot?.channel && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 5 }}>
                      {l('รับข้อมูลจาก', 'ຮັບຂໍ້ມູນຈາກ')} {snapshot.channel === 'whatsapp' ? 'WhatsApp' : snapshot.channel === 'line' ? 'LINE' : 'Telegram'}
                    </div>
                  )}
                  {rows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '0.78rem', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <span>{r.icon}</span>
                      <span style={{ color: 'var(--text-muted)', minWidth: 62 }}>{r.label}</span>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600, wordBreak: 'break-all', flex: 1 }}>{r.val}</span>
                      <button
                        type="button"
                        title={l(`คัดลอก${r.label}`, `ສຳເນົາ ${r.label}`)}
                        onClick={() => copyText(String(r.val), r.label)}
                        style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--teal)', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontSize: '0.68rem', flexShrink: 0 }}
                      >📋</button>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div style={{ marginTop: 12 }}>
              <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6 }}
                onClick={() => window.open(`/contacts/${contact.id}`, '_blank')}>👤 {l('ดูโปรไฟล์เต็ม', 'ເບິ່ງໂປຣໄຟລ໌ເຕັມ')} →</button>
            </div>
          </div>
        )}

        {/* ─── TAB: Actions ─── */}
        {tab === 'actions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{l('บทสนทนา', 'ການສົນທະນາ')}</div>

            {/* Bot/Human Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{conv.isBot ? l('🤖 Bot ตอบ', '🤖 Bot ຕອບ') : l('👤 Human ตอบ', '👤 ຄົນຕອບ')}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--purple)' }}>{l('เปิดตลอด', 'ເປີດຕະຫຼອດ')}</span>
            </div>

            {conv.status !== 'resolved' && (
              <button className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start', width: '100%' }} onClick={onResolve}>✅ {l('ปิดบทสนทนา', 'ປິດການສົນທະນາ')}</button>
            )}

            <button className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start' }}
              onClick={async () => {
                const tid = toast.loading(l('สร้าง Ticket...', 'ກຳລັງສ້າງ Ticket...'));
                try {
                  await api.post('/tickets', { title: `[Inbox] ${contact?.displayName}`, contactId: contact?.id, conversationId: conv.id, priority: 'medium' });
                  toast.success(l('✅ สร้าง Ticket', '✅ ສ້າງ Ticket ແລ້ວ'), { id: tid });
                } catch { toast.error(l('เกิดข้อผิดพลาด', 'ເກີດຂໍ້ຜິດພາດ'), { id: tid }); }
              }}>🎫 {l('สร้าง Ticket', 'ສ້າງ Ticket')}</button>

            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8, marginBottom: 4, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{l('ข้อมูลบทสนทนา', 'ຂໍ້ມູນການສົນທະນາ')}</div>
            {[
              { icon: '📅', label: l('เริ่มเมื่อ', 'ເລີ່ມເມື່ອ'), val: new Date(conv.createdAt).toLocaleDateString(lang === 'lo' ? 'lo-LA' : 'th-TH') },
              { icon: '📱', label: l('ช่องทาง', 'ຊ່ອງທາງ'), val: channelLabel(conv.channel) },
              { icon: '⚡', label: 'Priority', val: conv.priority },
              { icon: '💬', label: l('ข้อความ', 'ຂໍ້ຄວາມ'), val: `${messages.length} ${l('ข้อความ', 'ຂໍ້ຄວາມ')}` },
              { icon: '👤', label: l('กำหนดให้', 'ມອບໝາຍໃຫ້'), val: conv.assignedTo?.displayName || l('ยังไม่กำหนด', 'ຍັງບໍ່ໄດ້ກຳນົດ') },
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

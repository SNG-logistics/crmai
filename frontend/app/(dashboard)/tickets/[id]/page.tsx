'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';
import { formatDistanceToNow, differenceInMinutes, differenceInHours, isPast } from 'date-fns';
import { th } from 'date-fns/locale';

const PRIORITY_CONFIG: any = {
  critical: { label: 'Critical', color: 'var(--danger)', bg: 'rgba(239,68,68,0.1)', icon: '🔴' },
  high:     { label: 'High',     color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)', icon: '🟠' },
  medium:   { label: 'Medium',   color: 'var(--info)',    bg: 'rgba(59,130,246,0.1)', icon: '🟡' },
  low:      { label: 'Low',      color: 'var(--success)', bg: 'rgba(16,185,129,0.1)', icon: '🟢' },
};
const STATUS_FLOW = ['open', 'in_progress', 'pending', 'resolved', 'closed'];

// ─── SLA Timer Component ──────────────────────────────────────────────────────
function SLATimer({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  if (!deadline) return <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>ไม่ได้กำหนด</span>;
  const dl = new Date(deadline);
  const overdue = isPast(dl);
  const mins = Math.abs(differenceInMinutes(dl, now));
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  const timeStr = hrs > 0 ? `${hrs} ชม. ${m} นาที` : `${m} นาที`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: overdue ? 'var(--danger)' : hrs < 1 ? 'var(--warning)' : 'var(--success)', animation: overdue ? 'pulse 1s infinite' : undefined }} />
      <span style={{ fontSize: '0.85rem', color: overdue ? 'var(--danger)' : hrs < 1 ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
        {overdue ? `⚠️ เกิน ${timeStr}` : `⏰ เหลือ ${timeStr}`}
      </span>
    </div>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ticket, setTicket] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // which field
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [slaDate, setSlaDate] = useState('');

  const load = useCallback(async () => {
    try {
      const [tr, ur] = await Promise.all([api.get(`/tickets/${id}`), api.get('/users')]);
      setTicket(tr.data.ticket);
      setAgents(ur.data.users || []);
      if (tr.data.ticket.slaDeadline) setSlaDate(new Date(tr.data.ticket.slaDeadline).toISOString().slice(0, 16));
    } catch { toast.error('ไม่พบ Ticket'); router.push('/tickets'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const update = async (data: any, successMsg = 'อัปเดตแล้ว ✅') => {
    setSaving(true);
    const tid = toast.loading('กำลังอัปเดต...');
    try {
      const r = await api.patch(`/tickets/${id}`, data);
      setTicket((prev: any) => ({ ...prev, ...r.data.ticket }));
      toast.success(successMsg, { id: tid });
      setEditing(null);
    } catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" style={{ width: 40, height: 40 }} /></div>;
  if (!ticket) return null;

  const pc = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;
  const statusIdx = STATUS_FLOW.indexOf(ticket.status);

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        <Link href="/tickets" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>🎫 Tickets</Link>
        <span>›</span>
        <span style={{ color: 'var(--text-primary)' }}>#{id.slice(-6).toUpperCase()}</span>
      </div>

      {/* Status Pipeline */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
          {STATUS_FLOW.map((s, i) => {
            const done = i <= statusIdx;
            const current = i === statusIdx;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 80 }}>
                <button onClick={() => update({ status: s })} disabled={saving}
                  style={{ flex: 1, padding: '8px 4px', background: current ? 'var(--teal-glow)' : done ? 'rgba(0,212,170,0.04)' : 'transparent',
                    border: `1px solid ${current ? 'var(--teal)' : done ? 'rgba(0,212,170,0.2)' : 'var(--border)'}`,
                    borderRadius: 8, color: current ? 'var(--teal)' : done ? 'var(--text-secondary)' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: '0.78rem', fontWeight: current ? 700 : 400, fontFamily: 'inherit', textAlign: 'center', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
                  {current ? '✓ ' : done ? '✓ ' : ''}{s.replace('_', ' ')}
                </button>
                {i < STATUS_FLOW.length - 1 && <div style={{ width: 20, height: 2, background: done && i < statusIdx ? 'var(--teal)' : 'var(--border)', flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        {/* Left */}
        <div>
          {/* Title Card */}
          <div style={{ background: 'var(--bg-secondary)', border: `1px solid var(--border)`, borderLeft: `4px solid ${pc.color}`, borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                {editing === 'title' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input" defaultValue={ticket.title} id="title-input" autoFocus style={{ fontSize: '1.1rem' }} />
                    <button className="btn btn-primary btn-sm" onClick={() => update({ title: (document.getElementById('title-input') as HTMLInputElement).value })}>บันทึก</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>ยกเลิก</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, flex: 1 }}>{ticket.title}</h2>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing('title')}>✏️</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ background: pc.bg, color: pc.color, border: `1px solid ${pc.color}44`, borderRadius: 20, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>{pc.icon} {pc.label}</span>
                  <span className={`badge badge-${ticket.status}`}>{ticket.status}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>#{id.slice(-6).toUpperCase()}</span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>รายละเอียด</div>
              {editing === 'desc' ? (
                <div>
                  <textarea className="input" defaultValue={ticket.description || ''} id="desc-input" rows={4} autoFocus />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => update({ description: (document.getElementById('desc-input') as HTMLTextAreaElement).value })}>บันทึก</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>ยกเลิก</button>
                  </div>
                </div>
              ) : (
                <div style={{ color: ticket.description ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, cursor: 'text', padding: '8px 0' }}
                  onClick={() => setEditing('desc')}>
                  {ticket.description || 'คลิกเพื่อเพิ่มรายละเอียด...'}
                </div>
              )}
            </div>
          </div>

          {/* Linked Conversation Messages */}
          {ticket.conversation?.messages?.length > 0 && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>💬 บทสนทนาที่เกี่ยวข้อง</span>
                <Link href="/inbox" className="btn btn-ghost btn-sm">เปิด Inbox →</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ticket.conversation.messages.slice(-5).map((m: any) => (
                  <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div className="avatar avatar-sm" style={{ background: m.senderType === 'customer' ? 'var(--bg-tertiary)' : m.senderType === 'bot' ? 'var(--purple-glow)' : 'var(--teal-glow)', border: '1px solid var(--border)', flexShrink: 0 }}>
                      {m.senderType === 'bot' ? '🤖' : m.senderType === 'customer' ? '👤' : 'A'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                        {m.senderType} · {new Date(m.createdAt).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                      </div>
                      <div style={{ fontSize: '0.875rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-secondary)' }}>{m.content}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Internal Comments */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>📝 Internal Notes</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', marginBottom: 12 }}>
              (ฟีเจอร์ comment thread — coming in Phase 4)
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <textarea className="input" rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="เพิ่ม internal note..." style={{ flex: 1, resize: 'none' }} />
              <button className="btn btn-primary" disabled={!comment.trim()} onClick={() => { toast.success('บันทึก Note แล้ว'); setComment(''); }}>📤</button>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Contact */}
          {ticket.contact && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>👤 ลูกค้า</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <div className="avatar">{ticket.contact.displayName?.[0]}</div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{ticket.contact.displayName}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{ticket.contact.email || ticket.contact.phone || '—'}</div>
                </div>
              </div>
              <Link href={`/contacts/${ticket.contact.id}`} className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>ดูโปรไฟล์ →</Link>
            </div>
          )}

          {/* Priority Selector */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>⚡ Priority</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {Object.entries(PRIORITY_CONFIG).map(([key, p]: [string, any]) => (
                <button key={key} onClick={() => update({ priority: key })} disabled={saving}
                  style={{ padding: '6px 8px', borderRadius: 8, border: `1px solid ${ticket.priority === key ? p.color : 'var(--border)'}`,
                    background: ticket.priority === key ? p.bg : 'transparent', color: ticket.priority === key ? p.color : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: ticket.priority === key ? 700 : 400 }}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assign Agent */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>👥 Assigned To</div>
            {ticket.assignedTo ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div className="avatar avatar-sm">{ticket.assignedTo.displayName?.[0]}</div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{ticket.assignedTo.displayName}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ticket.assignedTo.role}</div>
                </div>
              </div>
            ) : <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>ยังไม่มีผู้รับผิดชอบ</div>}
            <select className="input" style={{ fontSize: '0.82rem', padding: '6px 10px' }}
              value={ticket.assignedToId || ''} onChange={e => update({ assignedToId: e.target.value || null }, '✅ มอบหมายแล้ว')}>
              <option value="">— ยังไม่มอบหมาย —</option>
              {agents.filter(a => a.isActive).map(a => <option key={a.id} value={a.id}>{a.displayName} ({a.role})</option>)}
            </select>
          </div>

          {/* SLA */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>⏱ SLA Deadline</div>
            <SLATimer deadline={ticket.slaDeadline} />
            <div style={{ marginTop: 10 }}>
              <input type="datetime-local" className="input" value={slaDate}
                onChange={e => setSlaDate(e.target.value)} style={{ fontSize: '0.82rem', marginBottom: 8 }} />
              <button className="btn btn-secondary btn-sm" style={{ width: '100%' }}
                onClick={() => update({ slaDeadline: slaDate ? new Date(slaDate).toISOString() : null }, '⏱ ตั้ง SLA แล้ว')}>
                ตั้ง SLA
              </button>
            </div>
          </div>

          {/* Meta */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>📋 ข้อมูล</div>
            {[
              { label: 'สร้างเมื่อ', val: new Date(ticket.createdAt).toLocaleDateString('th-TH') },
              { label: 'อัปเดต', val: formatDistanceToNow(new Date(ticket.updatedAt), { locale: th, addSuffix: true }) },
              { label: 'แก้ไขเมื่อ', val: ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleDateString('th-TH') : '—' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{r.val}</span>
              </div>
            ))}
            <hr className="divider" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ticket.status !== 'resolved' && (
                <button className="btn btn-primary btn-sm" style={{ justifyContent: 'center' }} onClick={() => update({ status: 'resolved' }, '✅ ปิด Ticket แล้ว')}>✅ ปิด Ticket</button>
              )}
              <button className="btn btn-danger btn-sm" style={{ justifyContent: 'center' }}
                onClick={async () => { if (!confirm('ลบ Ticket นี้?')) return; await api.delete(`/tickets/${id}`); toast.success('ลบแล้ว'); router.push('/tickets'); }}>
                🗑️ ลบ Ticket
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

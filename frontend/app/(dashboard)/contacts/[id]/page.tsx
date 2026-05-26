'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';

const LEAD_COLORS = ['var(--danger)', 'var(--warning)', 'var(--warning)', 'var(--success)', 'var(--teal)'];

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'conversations' | 'tickets'>('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    api.get(`/contacts/${id}`).then(r => {
      const c = r.data.contact;
      setContact(c);
      setForm({ displayName: c.displayName, email: c.email || '', phone: c.phone || '', notes: c.notes || '', leadScore: c.leadScore || 0 });
      setNote(c.notes || '');
      setLoading(false);
    }).catch(() => { toast.error('ไม่พบข้อมูลลูกค้า'); router.push('/contacts'); });
  }, [id]);

  const saveContact = async () => {
    setSaving(true);
    const tid = toast.loading('กำลังบันทึก...');
    try {
      const r = await api.patch(`/contacts/${id}`, { ...form, notes: note });
      setContact((prev: any) => ({ ...prev, ...r.data.contact }));
      setEditing(false);
      toast.success('บันทึกสำเร็จ ✅', { id: tid });
    } catch { toast.error('บันทึกไม่สำเร็จ', { id: tid }); }
    finally { setSaving(false); }
  };

  const blockContact = async () => {
    if (!confirm(`${contact.isBlocked ? 'ปลดบล็อก' : 'บล็อก'}ลูกค้านี้?`)) return;
    const tid = toast.loading('กำลังดำเนินการ...');
    try {
      await api.patch(`/contacts/${id}`, { isBlocked: !contact.isBlocked });
      setContact((prev: any) => ({ ...prev, isBlocked: !prev.isBlocked }));
      toast.success(contact.isBlocked ? '✅ ปลดบล็อกแล้ว' : '🚫 บล็อกแล้ว', { id: tid });
    } catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  );
  if (!contact) return null;

  const stars = Math.round((contact.leadScore || 0) / 20);
  const tags = contact.tags?.map((ct: any) => ct.tag) || [];

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        <Link href="/contacts" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>👥 ลูกค้า</Link>
        <span>›</span>
        <span style={{ color: 'var(--text-primary)' }}>{contact.displayName}</span>
      </div>

      {/* Header Card */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, marginBottom: 20, display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <div className="avatar avatar-lg" style={{ width: 72, height: 72, fontSize: '1.8rem' }}>
            {contact.displayName?.[0] || '?'}
          </div>
          {contact.isBlocked && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(239,68,68,0.4)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🚫</div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          {editing ? (
            <input className="input" value={form.displayName} onChange={e => setForm((f: any) => ({ ...f, displayName: e.target.value }))}
              style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 8 }} />
          ) : (
            <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 6 }}>
              {contact.displayName}
              {contact.isBlocked && <span style={{ fontSize: '0.75rem', background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', borderRadius: 10, padding: '2px 8px', marginLeft: 10 }}>บล็อก</span>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {contact.lineUserId && <span className="badge badge-line">🟢 LINE</span>}
            {contact.telegramId && <span className="badge badge-telegram">🔵 Telegram</span>}
            {tags.map((t: any) => <span key={t.id} className="tag" style={{ background: t.color + '22', color: t.color, borderColor: t.color + '44' }}>🏷️ {t.name}</span>)}
          </div>
          {/* Lead Score */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Lead Score:</span>
            {editing ? (
              <input type="range" min={0} max={100} value={form.leadScore} onChange={e => setForm((f: any) => ({ ...f, leadScore: parseInt(e.target.value) }))}
                style={{ width: 120, accentColor: 'var(--teal)' }} />
            ) : null}
            <div style={{ display: 'flex', gap: 2 }}>
              {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: '1rem', color: i <= stars ? (LEAD_COLORS[stars-1] || 'var(--teal)') : 'var(--bg-hover)' }}>★</span>)}
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{contact.leadScore}/100</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {editing ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={saveContact} disabled={saving}>{saving ? <span className="spinner" /> : '💾 บันทึก'}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>ยกเลิก</button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>✏️ แก้ไข</button>
              <button className="btn btn-secondary btn-sm" onClick={blockContact}>{contact.isBlocked ? '✅ ปลดบล็อก' : '🚫 บล็อก'}</button>
              <Link href={`/inbox?contact=${id}`} className="btn btn-primary btn-sm">💬 แชท</Link>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        {/* Left: Info */}
        <div>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>📋 ข้อมูลติดต่อ</div>
            <div className="form-group">
              <label className="label">อีเมล</label>
              {editing ? <input className="input" value={form.email} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
                : <div style={{ color: form.email ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '0.875rem' }}>{contact.email || '—'}</div>}
            </div>
            <div className="form-group">
              <label className="label">โทรศัพท์</label>
              {editing ? <input className="input" value={form.phone} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} placeholder="08x-xxx-xxxx" />
                : <div style={{ color: form.phone ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '0.875rem' }}>{contact.phone || '—'}</div>}
            </div>
            {contact.lineUserId && <div className="form-group"><label className="label">LINE User ID</label><div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{contact.lineUserId}</div></div>}
            {contact.telegramId && <div className="form-group"><label className="label">Telegram ID</label><div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>@{contact.telegramId}</div></div>}
            <div><label className="label">สร้างเมื่อ</label><div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(contact.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'บทสนทนา', value: contact.conversations?.length || 0, icon: '💬', color: 'var(--teal)' },
              { label: 'Tickets', value: contact.tickets?.length || 0, icon: '🎫', color: 'var(--purple)' },
            ].map((s, i) => (
              <div key={i} className="stat-card" style={{ padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>📝 Notes</div>
            <textarea className="input" rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="บันทึกข้อมูลสำคัญเกี่ยวกับลูกค้า..." style={{ marginBottom: 8 }} />
            <button className="btn btn-secondary btn-sm" onClick={async () => {
              const tid = toast.loading('บันทึก...');
              try { await api.patch(`/contacts/${id}`, { notes: note }); toast.success('บันทึก Notes แล้ว', { id: tid }); }
              catch { toast.error('เกิดข้อผิดพลาด', { id: tid }); }
            }}>💾 บันทึก</button>
          </div>
        </div>

        {/* Right: Tabs */}
        <div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {[
              { key: 'overview', label: '🏠 Overview' },
              { key: 'conversations', label: `💬 บทสนทนา (${contact.conversations?.length || 0})` },
              { key: 'tickets', label: `🎫 Tickets (${contact.tickets?.length || 0})` },
            ].map(t => (
              <button key={t.key} className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTab(t.key as any)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 16 }}>📊 สรุปกิจกรรม</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  {[
                    { icon: '💬', val: contact.conversations?.length || 0, label: 'บทสนทนาทั้งหมด' },
                    { icon: '✅', val: contact.conversations?.filter((c: any) => c.status === 'resolved').length || 0, label: 'แก้ปัญหาแล้ว' },
                    { icon: '🎫', val: contact.tickets?.length || 0, label: 'Tickets ทั้งหมด' },
                  ].map((s, i) => (
                    <div key={i} style={{ textAlign: 'center', padding: 16, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>{s.icon}</div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--teal)' }}>{s.val}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Recent Activity */}
              {contact.conversations?.slice(0, 3).map((conv: any) => (
                <div key={conv.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '1.2rem' }}>{conv.channel === 'line' ? '🟢' : '🔵'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{conv.channel === 'line' ? 'LINE' : 'Telegram'} — {conv.status}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{conv.messages?.[0]?.content || 'ไม่มีข้อความ'}</div>
                  </div>
                  <Link href={`/inbox`} className="btn btn-ghost btn-sm">→</Link>
                </div>
              ))}
            </div>
          )}

          {tab === 'conversations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {contact.conversations?.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>ยังไม่มีบทสนทนา</div>}
              {contact.conversations?.map((conv: any) => (
                <div key={conv.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className={`badge badge-${conv.channel}`}>{conv.channel === 'line' ? '🟢 LINE' : '🔵 TG'}</span>
                      <span className={`badge badge-${conv.status}`}>{conv.status}</span>
                      {conv.isBot ? <span className="badge badge-bot">🤖 Bot</span> : <span className="badge badge-open">👤 Human</span>}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {conv.lastMessageAt ? formatDistanceToNow(new Date(conv.lastMessageAt), { locale: th, addSuffix: true }) : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {conv.messages?.[0]?.content || 'ไม่มีข้อความ'}
                  </div>
                  {conv.assignedTo && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>👤 {conv.assignedTo.displayName}</div>}
                </div>
              ))}
            </div>
          )}

          {tab === 'tickets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {contact.tickets?.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>ยังไม่มี Ticket</div>}
              {contact.tickets?.map((ticket: any) => {
                const PCOLOR: any = { critical: 'var(--danger)', high: 'var(--warning)', medium: 'var(--info)', low: 'var(--success)' };
                return (
                  <div key={ticket.id} style={{ background: 'var(--bg-secondary)', border: `1px solid var(--border)`, borderLeft: `4px solid ${PCOLOR[ticket.priority]}`, borderRadius: 'var(--radius-sm)', padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{ticket.title}</div>
                      <Link href={`/tickets/${ticket.id}`} className="btn btn-ghost btn-sm">→</Link>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span className={`badge badge-${ticket.status}`}>{ticket.status}</span>
                      <span style={{ fontSize: '0.75rem', color: PCOLOR[ticket.priority] }}>{ticket.priority}</span>
                      {ticket.assignedTo && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>👤 {ticket.assignedTo.displayName}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../../store/auth';
import toast from 'react-hot-toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Game {
  id: string; code: string; name: string; slug: string;
  imageUrl?: string; description?: string; playUrl?: string;
  tags: string[]; isRecommended: boolean; isActive: boolean;
  popularityScore: number; bonusScore: number; featureScore: number;
  providerName?: string; providerId: string; updatedAt: string;
}
interface Provider { id: string; code: string; name: string; }

const EMPTY_FORM = {
  providerId: '', code: '', name: '', description: '', imageUrl: '',
  playUrl: '', tags: '', isRecommended: false, isActive: true,
  popularityScore: 70, bonusScore: 70, featureScore: 70,
};

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

export default function SlotGamesPage() {
  const { token } = useAuthStore();
  const [games, setGames] = useState<Game[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Game | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterProvider, setFilterProvider] = useState('');
  const [filterRecommended, setFilterRecommended] = useState('');
  const [search, setSearch] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = async () => {
    setLoading(true);
    const [gRes, pRes] = await Promise.all([
      fetch(`${API}/api/slot/games`, { headers }),
      fetch(`${API}/api/slot/providers?all=true`, { headers }),
    ]);
    const [gd, pd] = await Promise.all([gRes.json(), pRes.json()]);
    if (gd.success) setGames(gd.data);
    if (pd.success) setProviders(pd.data);
    setLoading(false);
  };

  useEffect(() => { if (token) load(); }, [token]);

  const filtered = games.filter(g => {
    if (filterProvider && g.providerId !== filterProvider) return false;
    if (filterRecommended === 'true' && !g.isRecommended) return false;
    if (filterRecommended === 'false' && g.isRecommended) return false;
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, providerId: providers[0]?.id || '' });
    setShowModal(true);
  };
  const openEdit = (g: Game) => {
    setEditing(g);
    setForm({
      providerId: g.providerId, code: g.code, name: g.name,
      description: g.description || '', imageUrl: g.imageUrl || '',
      playUrl: g.playUrl || '', tags: g.tags.join(', '),
      isRecommended: g.isRecommended, isActive: g.isActive,
      popularityScore: g.popularityScore, bonusScore: g.bonusScore, featureScore: g.featureScore,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.providerId || !form.name || !form.code) return toast.error('กรุณากรอกข้อมูลที่จำเป็น');
    setSaving(true);
    try {
      const body = {
        ...form,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      };
      const url = editing ? `${API}/api/slot/games/${editing.id}` : `${API}/api/slot/games`;
      const method = editing ? 'PATCH' : 'POST';
      const r = await fetch(url, { method, headers, body: JSON.stringify(body) });
      const d = await r.json();
      if (!d.success) throw new Error(d.message);
      toast.success(editing ? 'อัปเดตเกมเรียบร้อย' : 'เพิ่มเกมเรียบร้อย');
      setShowModal(false);
      load();
    } catch (e: any) { toast.error(e.message || 'เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (g: Game) => {
    const r = await fetch(`${API}/api/slot/games/${g.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ isActive: !g.isActive }),
    });
    const d = await r.json();
    if (d.success) { toast.success(g.isActive ? 'ปิดเกมแล้ว' : 'เปิดเกมแล้ว'); load(); }
  };

  const handleDelete = async (g: Game) => {
    if (!confirm(`ลบเกม "${g.name}"?`)) return;
    const r = await fetch(`${API}/api/slot/games/${g.id}`, { method: 'DELETE', headers });
    const d = await r.json();
    if (d.success) { toast.success('ลบเกมเรียบร้อย'); load(); }
    else toast.error(d.message);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>🎮 Slot Games</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>จัดการเกมทั้งหมด ({filtered.length} / {games.length})</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/slot" style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.82rem' }}>← Dashboard</a>
          <button onClick={openCreate} className="btn btn-primary btn-sm">+ เพิ่มเกม</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 ค้นหาชื่อเกม..."
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem', flex: 1, minWidth: 160 }}
        />
        <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem' }}>
          <option value="">ทุกค่าย</option>
          {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterRecommended} onChange={e => setFilterRecommended(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem' }}>
          <option value="">ทุกสถานะ</option>
          <option value="true">🔥 แนะนำ</option>
          <option value="false">ปกติ</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
      ) : (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                {['เกม', 'ค่าย', 'Scores', 'ฟีเจอร์', 'สถานะ', 'จัดการ'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>ไม่พบเกม</td></tr>
              ) : (
                filtered.map((g, i) => (
                  <tr key={g.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {g.imageUrl ? (
                          <img src={g.imageUrl} alt={g.name} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🎰</div>
                        )}
                        <div>
                          <div style={{ fontWeight: 500 }}>
                            {g.isRecommended && <span style={{ fontSize: '0.7rem', marginRight: 4 }}>🔥</span>}
                            {g.name}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{g.code}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '0.78rem', padding: '2px 8px', background: 'var(--teal-glow)', color: 'var(--teal)', borderRadius: 6 }}>
                        {g.providerName}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', minWidth: 120 }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>อัตราชนะ</div>
                      <ScoreBar value={g.popularityScore} color="var(--teal)" />
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, marginBottom: 2 }}>ฟรีสปิน</div>
                      <ScoreBar value={g.bonusScore} color="#f97316" />
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, marginBottom: 2 }}>WILD</div>
                      <ScoreBar value={g.featureScore} color="#a78bfa" />
                    </td>
                    <td style={{ padding: '12px 14px', maxWidth: 160 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {g.tags.slice(0, 3).map(t => (
                          <span key={t} style={{ fontSize: '0.68rem', padding: '1px 6px', background: 'var(--bg-tertiary)', borderRadius: 10, color: 'var(--text-muted)' }}>{t}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <button onClick={() => toggleActive(g)} style={{
                        padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
                        background: g.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: g.isActive ? '#22c55e' : '#ef4444',
                      }}>{g.isActive ? '✅ เปิด' : '❌ ปิด'}</button>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(g)} className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }}>✏️</button>
                        <button onClick={() => handleDelete(g)} className="btn btn-ghost btn-sm" style={{ padding: '4px 10px', color: 'var(--danger)' }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', overflowY: 'auto', padding: 16 }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 500, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 20 }}>
              {editing ? '✏️ แก้ไขเกม' : '➕ เพิ่มเกมใหม่'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {[
                { label: 'ค่ายเกม *', key: 'providerId', type: 'select' },
                { label: 'Code *', key: 'code', placeholder: 'speed_winner' },
                { label: 'ชื่อเกม *', key: 'name', placeholder: 'Speed Winner' },
                { label: 'คำอธิบาย', key: 'description', placeholder: 'รายละเอียดเกม...' },
                { label: 'URL รูปภาพ', key: 'imageUrl', placeholder: 'https://...' },
                { label: 'URL เข้าเล่น', key: 'playUrl', placeholder: 'https://...' },
                { label: 'ฟีเจอร์ (คั่นด้วยจุลภาค)', key: 'tags', placeholder: 'Free Spin, Wild, Multiplier' },
              ].map(({ label, key, type, placeholder }: any) => (
                <div key={key}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
                  {type === 'select' ? (
                    <select value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit' }}>
                      {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (
                    <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder} disabled={!!editing && key === 'code'}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    />
                  )}
                </div>
              ))}
              {/* Scores — แสดงในการ์ด BONUS TIME บน LINE และเมนู Telegram */}
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 8 }}>
                💡 ค่า % ด้านล่างจะแสดงในการ์ดเกมเมื่อลูกค้าพิมพ์ BONUSTIME ใน LINE
              </div>
              {[
                { label: '🎯 อัตราชนะ / โอกาสชนะ (%)', key: 'popularityScore' },
                { label: '🎁 เข้าฟรีสปิน (%)', key: 'bonusScore' },
                { label: '⚡ WILD (%)', key: 'featureScore' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    {label}: <strong>{(form as any)[key]}</strong>
                  </label>
                  <input type="range" min={0} max={100} value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
              {/* Toggles */}
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={form.isRecommended} onChange={e => setForm(f => ({ ...f, isRecommended: e.target.checked }))} />
                  🔥 แนะนำ (Recommended)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                  ✅ เปิดใช้งาน
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm">ยกเลิก</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

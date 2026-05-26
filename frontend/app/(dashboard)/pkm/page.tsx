'use client';
import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../lib/api';

const BANKS = [
  'ธนาคารกรุงไทย','ธนาคารกสิกรไทย','ธนาคารไทยพาณิชย์',
  'ธนาคารกรุงเทพ','ธนาคารกรุงศรีอยุธยา','ธนาคารออมสิน',
  'ธนาคารทหารไทยธนชาต','ธนาคารซีไอเอ็มบีไทย','ทรูมันนี่วอลเล็ท','พร้อมเพย์',
];

const INIT = {
  displayName:'', phone:'', username:'', bank:'', bankAccount:'',
  credit:'', balance:'', depositTotal:'', withdrawTotal:'',
  registeredAt:'', memberType:'สมาชิกทั่วไป', affiliateCode:'',
};

export default function PKMMemberPage() {
  const [form, setForm]           = useState({ ...INIT });
  const [loading, setLoading]     = useState(false);
  const [lookupQ, setLookupQ]     = useState('');
  const [results, setResults]     = useState<any[]>([]);
  const [selected, setSelected]   = useState<any>(null);
  const [promoName, setPromoName] = useState('');
  const [promoAmt, setPromoAmt]   = useState('');
  const [tab, setTab]             = useState<'lookup'|'import'>('lookup');

  // ─── field change helper ──────────────────────────────────────────────────
  const chg = (k: keyof typeof INIT) =>
    (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  // ─── Import ───────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!form.username && !form.phone)
      return toast.error('ต้องระบุ Username หรือเบอร์โทร');
    setLoading(true);
    try {
      const r = await api.post('/pkm/import-member', form);
      toast.success(`✅ ${r.data.action==='created'?'เพิ่ม':'อัปเดต'}สมาชิกสำเร็จ`);
      setForm({ ...INIT });
    } catch (e:any) { toast.error(e.response?.data?.message||'เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  // ─── Lookup ───────────────────────────────────────────────────────────────
  const handleLookup = async () => {
    if (!lookupQ.trim()) return;
    setLoading(true);
    try {
      const r = await api.get('/pkm/lookup', { params:{ q:lookupQ } });
      setResults(r.data.contacts);
      if (!r.data.contacts.length) toast('ไม่พบสมาชิก',{icon:'🔍'});
    } catch (e:any) { toast.error(e.response?.data?.message||'เกิดข้อผิดพลาด'); }
    finally { setLoading(false); }
  };

  // ─── Add Promo ────────────────────────────────────────────────────────────
  const handleAddPromo = async () => {
    if (!selected || !promoName) return;
    try {
      await api.post('/pkm/add-promotion',{
        username:selected.username, phone:selected.phone,
        promotionName:promoName, amount:promoAmt,
      });
      toast.success(`✅ เพิ่มโปรโมชั่น "${promoName}" แล้ว`);
      setPromoName(''); setPromoAmt('');
      const r = await api.get('/pkm/lookup',{params:{q:selected.username||selected.phone}});
      if (r.data.contacts[0]) setSelected(r.data.contacts[0]);
    } catch (e:any) { toast.error(e.response?.data?.message||'เกิดข้อผิดพลาด'); }
  };

  // ─── Shared styles ────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width:'100%', padding:'9px 12px', boxSizing:'border-box',
    background:'var(--bg-tertiary)', border:'1px solid var(--border)',
    borderRadius:8, color:'var(--text-primary)', fontSize:'0.85rem',
    fontFamily:'inherit', outline:'none',
  };
  const lbl: React.CSSProperties = {
    display:'block', fontSize:'0.74rem', color:'var(--text-muted)', marginBottom:4,
  };

  return (
    <div style={{padding:'20px 24px', maxWidth:1100, margin:'0 auto'}}>

      {/* ── Header ── */}
      <div style={{marginBottom:20}}>
        <h1 style={{margin:0,fontSize:'1.4rem',fontWeight:800,display:'flex',alignItems:'center',gap:10}}>
          <span>🎰</span> PKM Member Manager
          <span style={{fontSize:'0.7rem',padding:'3px 10px',background:'rgba(0,212,170,0.15)',color:'var(--teal)',borderRadius:20,fontWeight:500}}>
            happy77.app
          </span>
        </h1>
        <div style={{fontSize:'0.8rem',color:'var(--text-muted)',marginTop:4}}>
          ค้นหาและจัดการข้อมูลสมาชิก — เบอร์ ธนาคาร ยอดฝาก/ถอน โปรโมชั่น
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{display:'flex',gap:8,marginBottom:20}}>
        {([['lookup','🔍 ค้นหาสมาชิก'],['import','➕ เพิ่ม/อัปเดตสมาชิก']] as const).map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{padding:'8px 18px',borderRadius:10,border:'none',cursor:'pointer',
              fontFamily:'inherit',fontSize:'0.85rem',fontWeight:tab===k?700:400,
              background:tab===k?'var(--teal)':'var(--bg-tertiary)',
              color:tab===k?'#000':'var(--text-muted)',
            }}>{l}
          </button>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:selected?'1fr 380px':'1fr',gap:20}}>

        {/* ════════════════ LEFT ════════════════ */}
        <div>

          {/* ── LOOKUP ── */}
          {tab==='lookup'&&(
            <div className="card" style={{padding:20}}>
              <div style={{fontWeight:700,marginBottom:14,fontSize:'0.95rem'}}>🔍 ค้นหาสมาชิก</div>
              <div style={{display:'flex',gap:8,marginBottom:16}}>
                <input
                  className="input"
                  value={lookupQ}
                  onChange={e=>setLookupQ(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&handleLookup()}
                  placeholder="Username / เบอร์โทร / ชื่อ..."
                  style={{flex:1}}
                />
                <button onClick={handleLookup} disabled={loading} className="btn btn-primary">
                  {loading?<span className="spinner" style={{width:14,height:14}}/>:'🔍'} ค้นหา
                </button>
              </div>

              {results.length>0&&(
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {results.map(c=>(
                    <div key={c.id} onClick={()=>setSelected(c)}
                      style={{padding:'14px 16px',cursor:'pointer',borderRadius:10,
                        background:selected?.id===c.id?'rgba(0,212,170,0.1)':'var(--bg-tertiary)',
                        border:`1px solid ${selected?.id===c.id?'var(--teal)':'var(--border)'}`,
                        transition:'all 0.2s'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:'0.95rem'}}>{c.displayName}</div>
                          <div style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:2}}>
                            {c.username&&<span>👤 {c.username}</span>}
                            {c.phone&&<span style={{marginLeft:10}}>📞 {c.phone}</span>}
                            {c.bank&&<span style={{marginLeft:10}}>🏦 {c.bank}</span>}
                          </div>
                        </div>
                        <div style={{textAlign:'right',fontSize:'0.78rem'}}>
                          <div style={{color:'#10B981',fontWeight:700}}>฿{(c.totalDeposit||0).toLocaleString()}</div>
                          <div style={{color:'var(--text-muted)'}}>ฝาก {c.depositCount||0} ครั้ง</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── IMPORT ── */}
          {tab==='import'&&(
            <div className="card" style={{padding:20}}>
              <div style={{fontWeight:700,marginBottom:10,fontSize:'0.95rem'}}>➕ เพิ่ม / อัปเดต ข้อมูลสมาชิก</div>
              <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:16,
                padding:'8px 12px',background:'rgba(59,130,246,0.1)',borderRadius:8}}>
                💡 Copy ข้อมูลจากหน้า PKM แล้วกรอกที่นี่
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 20px'}}>
                {/* ── Left col ── */}
                <div>
                  <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',
                    textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>
                    ข้อมูลส่วนตัว
                  </div>

                  <label style={lbl}>ชื่อ-นามสกุล</label>
                  <input className="input" style={{marginBottom:10}}
                    value={form.displayName} onChange={chg('displayName')}
                    placeholder="อนุชา พลแสง" />

                  <label style={lbl}>เบอร์โทรศัพท์</label>
                  <input className="input" style={{marginBottom:10}}
                    value={form.phone} onChange={chg('phone')}
                    placeholder="0866666666" />

                  <label style={lbl}>Username</label>
                  <input className="input" style={{marginBottom:10}}
                    value={form.username} onChange={chg('username')}
                    placeholder="LAG0866666666" />

                  <label style={lbl}>รหัสพาร์ทเนอร์</label>
                  <input className="input" style={{marginBottom:10}}
                    value={form.affiliateCode} onChange={chg('affiliateCode')}
                    placeholder="ถ้ามี" />

                  <label style={lbl}>ประเภทสมาชิก</label>
                  <select className="input" style={{marginBottom:10}}
                    value={form.memberType} onChange={chg('memberType')}>
                    {['สมาชิกทั่วไป','VIP','สมาชิกใหม่','สมาชิกเก่า'].map(o=>(
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                {/* ── Right col ── */}
                <div>
                  <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',
                    textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>
                    ธนาคาร & ยอดเงิน
                  </div>

                  <label style={lbl}>ธนาคาร</label>
                  <select className="input" style={{marginBottom:10}}
                    value={form.bank} onChange={chg('bank')}>
                    <option value="">-- เลือกธนาคาร --</option>
                    {BANKS.map(b=><option key={b} value={b}>{b}</option>)}
                  </select>

                  <label style={lbl}>เลขบัญชี</label>
                  <input className="input" style={{marginBottom:10}}
                    value={form.bankAccount} onChange={chg('bankAccount')}
                    placeholder="473556742123" />

                  <label style={lbl}>เครดิตปัจจุบัน</label>
                  <input className="input" style={{marginBottom:10}}
                    value={form.credit} onChange={chg('credit')}
                    placeholder="692.08" />

                  <label style={lbl}>ดุลปัจจุบัน</label>
                  <input className="input" style={{marginBottom:10}}
                    value={form.balance} onChange={chg('balance')}
                    placeholder="0.00" />

                  <label style={lbl}>ยอดฝากรวม (บาท)</label>
                  <input className="input" style={{marginBottom:10}}
                    value={form.depositTotal} onChange={chg('depositTotal')}
                    placeholder="0.00" />

                  <label style={lbl}>ยอดถอนรวม (บาท)</label>
                  <input className="input" style={{marginBottom:10}}
                    value={form.withdrawTotal} onChange={chg('withdrawTotal')}
                    placeholder="0.00" />
                </div>
              </div>

              <button onClick={handleImport} disabled={loading} className="btn btn-primary"
                style={{width:'100%',justifyContent:'center',marginTop:12,padding:'13px'}}>
                {loading?<span className="spinner" style={{width:16,height:16}}/>:'💾'} บันทึกข้อมูลสมาชิก
              </button>
            </div>
          )}
        </div>

        {/* ════════════════ RIGHT — Detail Panel ════════════════ */}
        {selected&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>

            {/* Profile */}
            <div className="card" style={{padding:18}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:'0.9rem'}}>👤 โปรไฟล์สมาชิก</div>
                <button onClick={()=>setSelected(null)}
                  style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:'1.1rem'}}>✕</button>
              </div>
              <div style={{textAlign:'center',marginBottom:14}}>
                <div style={{width:52,height:52,borderRadius:'50%',
                  background:'linear-gradient(135deg,var(--teal),var(--purple))',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:'1.4rem',margin:'0 auto 8px'}}>
                  {selected.displayName?.[0]||'?'}
                </div>
                <div style={{fontWeight:700}}>{selected.displayName}</div>
                {selected.memberType&&(
                  <span style={{fontSize:'0.7rem',padding:'2px 8px',
                    background:'var(--teal-glow)',color:'var(--teal)',borderRadius:10}}>
                    {selected.memberType}
                  </span>
                )}
              </div>

              {[
                {icon:'👤',label:'Username',  value:selected.username},
                {icon:'📞',label:'เบอร์โทร', value:selected.phone},
                {icon:'🏦',label:'ธนาคาร',   value:selected.bank},
                {icon:'💳',label:'เลขบัญชี', value:selected.bankAccount},
                {icon:'🪙',label:'เครดิต',   value:selected.credit!=null?`${selected.credit}`:null},
                {icon:'💰',label:'ดุล',       value:selected.balance!=null?`฿${selected.balance}`:null},
              ].filter(r=>r.value).map(row=>(
                <div key={row.label} style={{display:'flex',justifyContent:'space-between',
                  padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:'0.8rem'}}>
                  <span style={{color:'var(--text-muted)'}}>{row.icon} {row.label}</span>
                  <span style={{fontWeight:500}}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Financial */}
            <div className="card" style={{padding:16}}>
              <div style={{fontWeight:700,fontSize:'0.85rem',marginBottom:10}}>💰 ยอดเงิน</div>
              {[
                {l:'ยอดฝากรวม', v:selected.totalDeposit,  c:'#10B981'},
                {l:'ยอดถอนรวม', v:selected.totalWithdraw, c:'#EF4444'},
                {l:'กำไรสุทธิ',  v:(selected.totalDeposit||0)-(selected.totalWithdraw||0),
                  c:(selected.totalDeposit||0)>=(selected.totalWithdraw||0)?'#10B981':'#EF4444'},
                {l:'ฝาก (ครั้ง)',v:`${selected.depositCount||0} ครั้ง`, c:'var(--text-primary)'},
              ].map(s=>(
                <div key={s.l} style={{display:'flex',justifyContent:'space-between',
                  padding:'5px 0',fontSize:'0.8rem'}}>
                  <span style={{color:'var(--text-muted)'}}>{s.l}</span>
                  <span style={{fontWeight:700,color:s.c}}>
                    {typeof s.v==='number'?`฿${s.v.toLocaleString()}`:s.v}
                  </span>
                </div>
              ))}
            </div>

            {/* Promotions */}
            <div className="card" style={{padding:16}}>
              <div style={{fontWeight:700,fontSize:'0.85rem',marginBottom:10}}>🎁 โปรโมชั่น</div>
              {!(selected.promotions?.length)
                ?<div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>ยังไม่มีโปรโมชั่น</div>
                :(selected.promotions||[]).map((p:any,i:number)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',
                    padding:'4px 0',fontSize:'0.78rem'}}>
                    <span>🎁 {p.name}</span>
                    <span style={{color:'#F59E0B'}}>฿{p.amount}</span>
                  </div>
                ))
              }
              <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:6}}>
                <input className="input" value={promoName}
                  onChange={e=>setPromoName(e.target.value)}
                  placeholder="ชื่อโปรโมชั่น เช่น ฝากครั้งแรก 100%" />
                <div style={{display:'flex',gap:6}}>
                  <input className="input" style={{flex:1}} value={promoAmt}
                    onChange={e=>setPromoAmt(e.target.value)}
                    placeholder="จำนวน (บาท)" />
                  <button onClick={handleAddPromo} className="btn btn-primary btn-sm">+ เพิ่ม</button>
                </div>
              </div>
            </div>

            {/* Copy for AI */}
            <div className="card" style={{padding:16}}>
              <div style={{fontWeight:700,fontSize:'0.85rem',marginBottom:10}}>🤖 ข้อมูลสำหรับ AI</div>
              <pre style={{fontSize:'0.72rem',background:'var(--bg-tertiary)',borderRadius:8,
                padding:'10px 12px',lineHeight:1.8,color:'var(--text-secondary)',
                whiteSpace:'pre-wrap',margin:0,fontFamily:'monospace'}}>
{`ชื่อ: ${selected.displayName}
ยูส: ${selected.username||'-'}
เบอร์: ${selected.phone||'-'}
ธนาคาร: ${selected.bank||'-'} ${selected.bankAccount||''}
เครดิต: ${selected.credit||0}
ยอดฝากรวม: ฿${(selected.totalDeposit||0).toLocaleString()}
ยอดถอนรวม: ฿${(selected.totalWithdraw||0).toLocaleString()}
กำไรสุทธิ: ฿${((selected.totalDeposit||0)-(selected.totalWithdraw||0)).toLocaleString()}
ฝาก: ${selected.depositCount||0} ครั้ง
ประเภท: ${selected.memberType||'-'}
โปร: ${(selected.promotions||[]).map((p:any)=>p.name).join(', ')||'ยังไม่มี'}`}
              </pre>
              <button onClick={()=>{
                navigator.clipboard.writeText(
                  `ชื่อ: ${selected.displayName}\nยูส: ${selected.username||'-'}\nเบอร์: ${selected.phone||'-'}\nธนาคาร: ${selected.bank||'-'} ${selected.bankAccount||''}\nยอดฝากรวม: ฿${(selected.totalDeposit||0).toLocaleString()}\nยอดถอนรวม: ฿${(selected.totalWithdraw||0).toLocaleString()}`
                );
                toast.success('✅ Copy แล้ว');
              }} className="btn btn-ghost btn-sm"
                style={{width:'100%',justifyContent:'center',marginTop:8,fontSize:'0.78rem'}}>
                📋 Copy ข้อมูลทั้งหมด
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

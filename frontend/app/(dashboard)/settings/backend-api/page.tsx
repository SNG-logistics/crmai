'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';

type Company = { id: string; name: string };
type EndpointKey = 'customerLookup' | 'registrationStatus' | 'balance' | 'depositStatus' | 'withdrawalStatus';
type ApiConfig = {
  enabled: boolean;
  baseUrl: string;
  authType: 'none' | 'bearer' | 'api-key';
  authHeader: string;
  timeoutMs: number;
  healthEndpoint: string;
  hasApiKey: boolean;
  endpoints: Record<EndpointKey, string>;
};

const EMPTY_CONFIG: ApiConfig = {
  enabled: false,
  baseUrl: '',
  authType: 'bearer',
  authHeader: 'Authorization',
  timeoutMs: 10000,
  healthEndpoint: '/health',
  hasApiKey: false,
  endpoints: {
    customerLookup: '',
    registrationStatus: '',
    balance: '',
    depositStatus: '',
    withdrawalStatus: '',
  },
};

const ENDPOINTS: { key: EndpointKey; label: string; hint: string }[] = [
  { key: 'customerLookup', label: 'ค้นหาข้อมูลลูกค้า', hint: '/customers/{{username}}' },
  { key: 'registrationStatus', label: 'ตรวจว่าสมัครแล้วหรือยัง', hint: '/customers/{{username}}/registration' },
  { key: 'balance', label: 'ตรวจยอดลูกค้า', hint: '/customers/{{username}}/balance' },
  { key: 'depositStatus', label: 'ตรวจปัญหาฝากไม่เข้า', hint: '/deposits/status?username={{username}}' },
  { key: 'withdrawalStatus', label: 'ตรวจปัญหาถอนไม่ได้', hint: '/withdrawals/status?username={{username}}' },
];

export default function BackendApiSettingsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [config, setConfig] = useState<ApiConfig>(EMPTY_CONFIG);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get('/companies');
        const list = response.data.companies || [];
        setCompanies(list);
        setCompanyId(list[0]?.id || '');
      } catch (e: any) {
        toast.error(e.response?.data?.message || 'โหลดรายชื่อบริษัทไม่ได้');
      }
    })();
  }, []);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setApiKey('');
    api.get('/backend-api', { params: { companyId } })
      .then(r => setConfig({ ...EMPTY_CONFIG, ...r.data.config, endpoints: { ...EMPTY_CONFIG.endpoints, ...(r.data.config?.endpoints || {}) } }))
      .catch((e: any) => toast.error(e.response?.data?.message || 'โหลดค่า API ไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [companyId]);

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    const tid = toast.loading('กำลังบันทึก API...');
    try {
      const response = await api.put('/backend-api', { companyId, ...config, apiKey });
      setConfig({ ...EMPTY_CONFIG, ...response.data.config, endpoints: { ...EMPTY_CONFIG.endpoints, ...(response.data.config?.endpoints || {}) } });
      setApiKey('');
      toast.success('บันทึกและเข้ารหัส API Key แล้ว', { id: tid });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'บันทึกไม่สำเร็จ', { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    if (!companyId || !confirm('ลบ API Key ที่บันทึกไว้ใช่ไหม?')) return;
    setSaving(true);
    try {
      const response = await api.put('/backend-api', { companyId, ...config, apiKey: '', clearApiKey: true });
      setConfig({ ...config, hasApiKey: response.data.config?.hasApiKey === true });
      setApiKey('');
      toast.success('ลบ API Key แล้ว');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'ลบ API Key ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!companyId) return;
    setTesting(true);
    const tid = toast.loading('กำลังทดสอบการเชื่อมต่อ...');
    try {
      const response = await api.post('/backend-api/test', { companyId });
      toast.success(`${response.data.message} (${response.data.latencyMs} ms)`, { id: tid });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'เชื่อมต่อ API ไม่สำเร็จ', { id: tid });
    } finally {
      setTesting(false);
    }
  };

  const setEndpoint = (key: EndpointKey, value: string) => {
    setConfig(current => ({ ...current, endpoints: { ...current.endpoints, [key]: value } }));
  };

  if (loading && !companies.length) {
    return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>🔌 API ตรวจหลังบ้าน</h1>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 5 }}>
          เตรียมจุดเชื่อมต่อให้ AI ตรวจสมาชิก ยอดเงิน ฝากไม่เข้า และถอนไม่ได้จากระบบจริงในอนาคต
        </div>
      </div>

      {!companies.length ? (
        <div className="card" style={{ padding: 24 }}>กรุณาสร้างบริษัทก่อนตั้งค่า API</div>
      ) : (
        <>
          <div className="card" style={{ padding: 18, marginBottom: 16 }}>
            <label className="label">บริษัท</label>
            <select className="input" value={companyId} onChange={e => setCompanyId(e.target.value)}>
              {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, .95fr)', gap: 16 }}>
              <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>เปิดใช้ API หลังบ้าน</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>เปิดเมื่อ endpoint พร้อมใช้งานจริง</div>
                  </div>
                  <input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} style={{ width: 44, height: 24 }} />
                </label>

                <div>
                  <label className="label">Base URL</label>
                  <input className="input" value={config.baseUrl} onChange={e => setConfig({ ...config, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="label">การยืนยันตัวตน</label>
                    <select className="input" value={config.authType} onChange={e => {
                      const authType = e.target.value as ApiConfig['authType'];
                      setConfig({ ...config, authType, authHeader: authType === 'api-key' ? 'x-api-key' : 'Authorization' });
                    }}>
                      <option value="bearer">Bearer Token</option>
                      <option value="api-key">API Key Header</option>
                      <option value="none">ไม่ใช้</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">ชื่อ Header</label>
                    <input className="input" value={config.authHeader} disabled={config.authType === 'none'} onChange={e => setConfig({ ...config, authHeader: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label className="label">API Key / Token</label>
                  <input
                    className="input"
                    type="password"
                    value={apiKey}
                    disabled={config.authType === 'none'}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={config.hasApiKey ? '•••••••• (บันทึกแล้ว — เว้นว่างเพื่อใช้ค่าเดิม)' : 'วางคีย์ที่นี่'}
                    autoComplete="new-password"
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: '0.7rem' }}>
                    <span style={{ color: config.hasApiKey ? 'var(--success)' : 'var(--text-muted)' }}>
                      {config.hasApiKey ? '🔒 มีคีย์ที่เข้ารหัสไว้แล้ว' : 'ยังไม่มีคีย์'}
                    </span>
                    {config.hasApiKey && <button onClick={clearKey} disabled={saving} style={{ border: 0, background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}>ลบคีย์</button>}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="label">Health endpoint</label>
                    <input className="input" value={config.healthEndpoint} onChange={e => setConfig({ ...config, healthEndpoint: e.target.value })} placeholder="/health" />
                  </div>
                  <div>
                    <label className="label">Timeout (ms)</label>
                    <input className="input" type="number" min={1000} max={30000} value={config.timeoutMs} onChange={e => setConfig({ ...config, timeoutMs: Number(e.target.value) })} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                    {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '💾'} บันทึก
                  </button>
                  <button className="btn btn-secondary" onClick={testConnection} disabled={testing || !config.baseUrl} style={{ flex: 1, justifyContent: 'center' }}>
                    {testing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '🧪'} ทดสอบ
                  </button>
                </div>
              </div>

              <div className="card" style={{ padding: 22 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Endpoint สำหรับ AI</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
                  กรอกเป็น path ภายใต้ Base URL ใช้ตัวแปร <code>{'{{username}}'}</code> หรือ <code>{'{{phone}}'}</code> ได้
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                  {ENDPOINTS.map(item => (
                    <div key={item.key}>
                      <label className="label">{item.label}</label>
                      <input className="input" value={config.endpoints[item.key]} onChange={e => setEndpoint(item.key, e.target.value)} placeholder={item.hint} />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 18, padding: '11px 13px', borderRadius: 9, background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.25)', fontSize: '0.72rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  ตอนนี้หน้านี้บันทึกและทดสอบการเชื่อมต่ออย่างปลอดภัยก่อน ยังไม่ให้ AI เรียกดูยอดจริงจนกว่าจะกำหนดรูปแบบ request/response ของ API เพื่อป้องกันการอ่านยอดผิดคน
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

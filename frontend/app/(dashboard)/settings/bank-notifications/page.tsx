'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../lib/api';

type Company = {
  id: string;
  name: string;
};

type BankDevice = {
  id: string;
  name: string;
  deviceId?: string;
  publicId?: string;
  allowedPackages?: string[] | string | null;
  isActive: boolean;
  lastSeenAt?: string | null;
  lastError?: string | null;
  createdAt?: string;
};

type BankTransaction = {
  id: string;
  eventId?: string;
  status?: string;
  matchStatus?: string;
  direction?: string;
  amount?: number | string | null;
  parsedAmount?: number | string | null;
  amountMinor?: number | string | null;
  amountDisplay?: string | null;
  currency?: string | null;
  bank?: string | null;
  bankName?: string | null;
  parsedBank?: string | null;
  bankHint?: string | null;
  receivingBank?: string | null;
  transactionRef?: string | null;
  transRef?: string | null;
  reference?: string | null;
  ref?: string | null;
  occurredAt?: string | null;
  transactionAt?: string | null;
  notificationTime?: string | null;
  postedAt?: string | null;
  capturedAt?: string | null;
  receivedAt?: string | null;
  createdAt?: string | null;
  matchReason?: string | null;
  reason?: string | null;
  notes?: string | null;
  deviceName?: string | null;
  packageName?: string | null;
  matchedSlipId?: string | null;
  match?: {
    reason?: string | null;
  } | null;
  device?: {
    name?: string | null;
  } | null;
};

type Enrollment = {
  serverUrl: string;
  deviceId: string;
  secret: string;
  allowedPackages: string[];
};

const PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

const cardStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 14,
} as const;

const inputLabelStyle = {
  display: 'block',
  color: 'var(--text-secondary)',
  fontSize: '0.78rem',
  fontWeight: 600,
  marginBottom: 6,
} as const;

function packagesFrom(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map(item => String(item).trim()).filter(Boolean))];
  }

  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return packagesFrom(parsed);
    } catch {
      // Fall through to comma/newline parsing.
    }
  }

  return [...new Set(trimmed.split(/[\n,]+/).map(item => item.trim()).filter(Boolean))];
}

function parsePackageInput(value: string): { packages: string[]; invalid: string[] } {
  const packages = packagesFrom(value);
  return {
    packages,
    invalid: packages.filter(packageName => !PACKAGE_PATTERN.test(packageName)),
  };
}

function getTransactionStatus(transaction: BankTransaction): string {
  return String(transaction.matchStatus || transaction.status || 'pending').toLowerCase();
}

function getBank(transaction: BankTransaction): string {
  return transaction.bankName || transaction.bank || transaction.parsedBank || transaction.bankHint || transaction.receivingBank || '-';
}

function getReference(transaction: BankTransaction): string {
  return transaction.transactionRef || transaction.transRef || transaction.reference || transaction.ref || '-';
}

function getOccurredAt(transaction: BankTransaction): string | null {
  return transaction.occurredAt
    || transaction.transactionAt
    || transaction.notificationTime
    || transaction.postedAt
    || transaction.capturedAt
    || transaction.receivedAt
    || transaction.createdAt
    || null;
}

function getMatchReason(transaction: BankTransaction): string {
  return transaction.matchReason || transaction.reason || transaction.match?.reason || transaction.notes || '-';
}

function formatDate(value?: string | null): string {
  if (!value) return 'ยังไม่เคยเชื่อมต่อ';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatAmount(transaction: BankTransaction): string {
  if (transaction.amountDisplay) {
    return transaction.currency && !transaction.amountDisplay.includes(transaction.currency)
      ? `${transaction.amountDisplay} ${transaction.currency}`
      : transaction.amountDisplay;
  }
  const rawAmount = transaction.amount ?? transaction.parsedAmount;
  if (rawAmount === null || rawAmount === undefined || rawAmount === '') {
    if (transaction.amountMinor === null || transaction.amountMinor === undefined || transaction.amountMinor === '') return '-';
    return `${transaction.amountMinor} ${transaction.currency || ''}`.trim();
  }
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) return String(rawAmount);
  return `${new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(amount)} ${transaction.currency || 'THB'}`;
}

function statusStyle(status: string) {
  if (['matched', 'verified', 'confirmed'].includes(status)) {
    return { label: 'จับคู่แล้ว', color: 'var(--success)', background: 'rgba(6,214,160,.1)', border: 'rgba(6,214,160,.25)' };
  }
  if (['rejected', 'invalid', 'failed', 'error'].includes(status)) {
    return { label: 'ไม่ผ่าน', color: 'var(--danger)', background: 'rgba(255,77,109,.1)', border: 'rgba(255,77,109,.25)' };
  }
  if (['duplicate', 'used'].includes(status)) {
    return { label: 'ถูกใช้แล้ว', color: 'var(--warning)', background: 'rgba(255,183,3,.1)', border: 'rgba(255,183,3,.25)' };
  }
  if (['unmatched', 'no_match'].includes(status)) {
    return { label: 'ยังไม่พบสลิป', color: '#f59e0b', background: 'rgba(245,158,11,.1)', border: 'rgba(245,158,11,.25)' };
  }
  return { label: 'รอตรวจ', color: 'var(--purple)', background: 'rgba(157,78,221,.1)', border: 'rgba(157,78,221,.25)' };
}

function normalizeEnrollment(
  responseData: any,
  fallbackPackages: string[],
  fallbackDevice?: BankDevice,
): Enrollment | null {
  const source = responseData?.enrollment || responseData?.credentials || responseData || {};
  const device = responseData?.device || fallbackDevice || {};
  const deviceId = String(source.deviceId || source.publicId || device.deviceId || device.publicId || '');
  const secret = String(source.secret || source.deviceSecret || source.apiSecret || source.token || '');
  const serverUrl = String(
    source.serverUrl
    || source.ingestUrl
    || source.endpoint
    || (typeof window !== 'undefined' ? `${window.location.origin}/api/bank-notifications/ingest` : ''),
  );
  const allowedPackages = packagesFrom(source.allowedPackages || device.allowedPackages || fallbackPackages);

  if (!deviceId || !secret) return null;
  return { serverUrl, deviceId, secret, allowedPackages };
}

export default function BankNotificationsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [devices, setDevices] = useState<BankDevice[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [packageInput, setPackageInput] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPackages, setEditPackages] = useState('');
  const [savingDeviceId, setSavingDeviceId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await api.get('/companies');
        const list: Company[] = response.data.companies || [];
        if (!mounted) return;
        setCompanies(list);
        setCompanyId(list[0]?.id || '');
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'โหลดรายชื่อบริษัทไม่ได้');
      } finally {
        if (mounted) setLoadingCompanies(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const loadData = useCallback(async (quiet = false) => {
    if (!companyId) {
      setDevices([]);
      setTransactions([]);
      return;
    }

    if (quiet) setRefreshing(true);
    else setLoadingData(true);

    try {
      const [deviceResponse, transactionResponse] = await Promise.all([
        api.get('/bank-notifications/devices', { params: { companyId } }),
        api.get('/bank-notifications/transactions', { params: { companyId, limit: 100 } }),
      ]);

      const deviceData = deviceResponse.data.devices || deviceResponse.data.data || [];
      const transactionData = transactionResponse.data.transactions || transactionResponse.data.data || [];
      setDevices(Array.isArray(deviceData) ? deviceData : []);
      setTransactions(Array.isArray(transactionData) ? transactionData : []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'โหลดข้อมูลแจ้งเตือนธนาคารไม่ได้');
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  }, [companyId]);

  useEffect(() => {
    setEnrollment(null);
    setEditingId(null);
    setStatusFilter('all');
    setSearch('');
    void loadData();
  }, [loadData]);

  const createDevice = async () => {
    const name = deviceName.trim();
    const parsed = parsePackageInput(packageInput);
    if (!name) return toast.error('กรุณาตั้งชื่อมือถือ');
    if (!parsed.packages.length) return toast.error('ต้องระบุ Package ID ของแอปธนาคารอย่างน้อย 1 รายการ');
    if (parsed.invalid.length) {
      return toast.error(`Package ID ไม่ถูกต้อง: ${parsed.invalid.join(', ')}`);
    }

    setCreating(true);
    const loadingToast = toast.loading('กำลังสร้างรหัสเชื่อมต่อ...');
    try {
      const response = await api.post('/bank-notifications/devices', {
        companyId,
        name,
        allowedPackages: parsed.packages,
      });
      const nextEnrollment = normalizeEnrollment(response.data, parsed.packages, response.data?.device);
      if (!nextEnrollment) {
        throw new Error('ระบบไม่ได้ส่งรหัสลับสำหรับลงทะเบียนกลับมา');
      }
      setEnrollment(nextEnrollment);
      setDeviceName('');
      setPackageInput('');
      await loadData(true);
      toast.success('สร้างอุปกรณ์แล้ว — บันทึกรหัสลับก่อนปิดหน้าต่าง', { id: loadingToast });
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'สร้างอุปกรณ์ไม่สำเร็จ', { id: loadingToast });
    } finally {
      setCreating(false);
    }
  };

  const setDeviceActive = async (device: BankDevice, isActive: boolean) => {
    if (!isActive && !confirm(`ปิดการรับข้อมูลจาก "${device.name}" ใช่ไหม?`)) return;
    setSavingDeviceId(device.id);
    try {
      await api.patch(`/bank-notifications/devices/${device.id}`, { isActive });
      setDevices(current => current.map(item => item.id === device.id ? { ...item, isActive } : item));
      toast.success(isActive ? 'เปิดรับข้อมูลจากอุปกรณ์แล้ว' : 'ระงับอุปกรณ์แล้ว');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เปลี่ยนสถานะอุปกรณ์ไม่สำเร็จ');
    } finally {
      setSavingDeviceId(null);
    }
  };

  const beginEdit = (device: BankDevice) => {
    setEditingId(device.id);
    setEditName(device.name);
    setEditPackages(packagesFrom(device.allowedPackages).join(', '));
  };

  const saveDevice = async (device: BankDevice) => {
    const name = editName.trim();
    const parsed = parsePackageInput(editPackages);
    if (!name) return toast.error('ชื่ออุปกรณ์ห้ามว่าง');
    if (!parsed.packages.length) return toast.error('ต้องอนุญาต Package ID อย่างน้อย 1 รายการ');
    if (parsed.invalid.length) return toast.error(`Package ID ไม่ถูกต้อง: ${parsed.invalid.join(', ')}`);

    setSavingDeviceId(device.id);
    try {
      const response = await api.patch(`/bank-notifications/devices/${device.id}`, {
        name,
        allowedPackages: parsed.packages,
      });
      const updated = response.data.device || response.data;
      setDevices(current => current.map(item => item.id === device.id
        ? { ...item, ...updated, name, allowedPackages: parsed.packages }
        : item));
      setEditingId(null);
      toast.success('บันทึกอุปกรณ์แล้ว');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'บันทึกอุปกรณ์ไม่สำเร็จ');
    } finally {
      setSavingDeviceId(null);
    }
  };

  const rotateSecret = async (device: BankDevice) => {
    if (!confirm(`สร้างรหัสลับใหม่ให้ "${device.name}" ใช่ไหม?\nรหัสเดิมจะใช้งานไม่ได้ทันที และต้องลงทะเบียนในมือถือใหม่`)) return;
    setSavingDeviceId(device.id);
    const loadingToast = toast.loading('กำลังเปลี่ยนรหัสลับ...');
    try {
      const response = await api.post(`/bank-notifications/devices/${device.id}/rotate`);
      const nextEnrollment = normalizeEnrollment(
        response.data,
        packagesFrom(device.allowedPackages),
        response.data?.device || device,
      );
      if (!nextEnrollment) throw new Error('ระบบไม่ได้ส่งรหัสลับใหม่กลับมา');
      setEnrollment(nextEnrollment);
      await loadData(true);
      toast.success('เปลี่ยนรหัสแล้ว — นำข้อมูลใหม่ไปใส่ในมือถือ', { id: loadingToast });
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'เปลี่ยนรหัสลับไม่สำเร็จ', { id: loadingToast });
    } finally {
      setSavingDeviceId(null);
    }
  };

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`คัดลอก${label}แล้ว`);
    } catch {
      toast.error('คัดลอกไม่ได้ กรุณาเลือกข้อความแล้วคัดลอกเอง');
    }
  };

  const statusOptions = useMemo(
    () => [...new Set(transactions.map(getTransactionStatus).filter(Boolean))].sort(),
    [transactions],
  );

  const visibleTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter(transaction => {
      const status = getTransactionStatus(transaction);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!query) return true;
      return [
        getBank(transaction),
        getReference(transaction),
        getMatchReason(transaction),
        transaction.deviceName,
        transaction.device?.name,
        transaction.packageName,
        transaction.amount,
        transaction.parsedAmount,
        transaction.amountMinor,
        transaction.amountDisplay,
      ].some(value => String(value || '').toLowerCase().includes(query));
    });
  }, [transactions, statusFilter, search]);

  const matchedCount = transactions.filter(transaction =>
    ['matched', 'verified', 'confirmed'].includes(getTransactionStatus(transaction))).length;
  const activeCount = devices.filter(device => device.isActive).length;

  if (loadingCompanies) {
    return <div style={{ padding: 48, textAlign: 'center' }}><span className="spinner" /></div>;
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>🏦 แจ้งเตือนเงินเข้าธนาคาร</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 5 }}>
            เชื่อมต่อแอป Android เพื่อใช้รายการเงินจริงเป็นหลักฐานตรวจสลิปใน WhatsApp
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" disabled={!companyId || refreshing} onClick={() => void loadData(true)}>
          {refreshing ? <span className="spinner" style={{ width: 15, height: 15 }} /> : '↻'} รีเฟรช
        </button>
      </div>

      {!companies.length ? (
        <div style={{ ...cardStyle, padding: 26, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🏢</div>
          <div style={{ fontWeight: 700 }}>ยังไม่มีบริษัท</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '5px 0 14px' }}>สร้างบริษัทก่อนเชื่อมต่อมือถือรับแจ้งเตือนธนาคาร</div>
          <a href="/settings/companies" className="btn btn-primary btn-sm">ไปหน้าบริษัท</a>
        </div>
      ) : (
        <>
          <div style={{ ...cardStyle, padding: 18, marginBottom: 16 }}>
            <label style={inputLabelStyle}>บริษัทที่รับเงิน</label>
            <select className="input" value={companyId} onChange={event => setCompanyId(event.target.value)} style={{ maxWidth: 480 }}>
              {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 6 }}>
              อุปกรณ์และรายการเงินเข้าจะแยกตามบริษัท ห้ามนำรหัสของบริษัทหนึ่งไปใช้กับอีกบริษัท
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}>
            {[
              { label: 'อุปกรณ์ทั้งหมด', value: devices.length, detail: `เปิดใช้งาน ${activeCount}`, color: 'var(--teal)' },
              { label: 'แจ้งเตือนที่รับแล้ว', value: transactions.length, detail: '100 รายการล่าสุด', color: 'var(--text-primary)' },
              { label: 'จับคู่สลิปสำเร็จ', value: matchedCount, detail: transactions.length ? `${Math.round((matchedCount / transactions.length) * 100)}% ของรายการล่าสุด` : 'ยังไม่มีข้อมูล', color: 'var(--success)' },
            ].map(item => (
              <div key={item.label} style={{ ...cardStyle, padding: '16px 18px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{item.label}</div>
                <div style={{ color: item.color, fontWeight: 800, fontSize: '1.65rem', marginTop: 2 }}>{item.value}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{item.detail}</div>
              </div>
            ))}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
            gap: 16,
            marginBottom: 16,
          }}>
            <section style={{ ...cardStyle, padding: 20 }}>
              <div style={{ fontWeight: 750, marginBottom: 4 }}>＋ เพิ่มมือถือรับแจ้งเตือน</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 16 }}>
                มือถือหนึ่งเครื่องควรใช้กับบัญชีรับเงินของบริษัทเดียว
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={inputLabelStyle}>ชื่อมือถือ</label>
                <input
                  className="input"
                  value={deviceName}
                  onChange={event => setDeviceName(event.target.value)}
                  placeholder="เช่น Samsung หน้าร้าน 1"
                  maxLength={80}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={inputLabelStyle}>Package ID แอปธนาคารที่อนุญาต (ตรงตัว)</label>
                <textarea
                  className="input"
                  value={packageInput}
                  onChange={event => setPackageInput(event.target.value)}
                  placeholder={'เช่น com.bank.mobile\nหลายรายการให้คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่'}
                  rows={4}
                  spellCheck={false}
                  style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
                />
                <div style={{ color: 'var(--warning)', fontSize: '0.68rem', marginTop: 6 }}>
                  ⚠️ ตรวจ Package ID จากหน้ารายละเอียดแอปในมือถือ ห้ามเดาชื่อ เพราะระบบจะปฏิเสธแอปที่ไม่ตรงทั้งหมด
                </div>
              </div>
              <button className="btn btn-primary" disabled={creating || !companyId} onClick={createDevice}>
                {creating && <span className="spinner" style={{ width: 15, height: 15 }} />}
                สร้างรหัสเชื่อมต่อ
              </button>
            </section>

            <section style={{
              ...cardStyle,
              padding: 20,
              background: 'linear-gradient(145deg, rgba(0,229,255,.055), var(--bg-secondary) 60%)',
              borderColor: 'rgba(0,229,255,.16)',
            }}>
              <div style={{ fontWeight: 750, marginBottom: 10 }}>🛡️ หลักการตรวจที่ปลอดภัย</div>
              <div style={{ display: 'grid', gap: 11 }}>
                {[
                  ['รับเฉพาะแอปที่อนุญาต', 'Package ID ต้องตรงกับรายการที่ตั้งไว้ ไม่มีการรับแจ้งเตือนจากแอปอื่น'],
                  ['ตรวจลายเซ็นแอปธนาคาร', 'ระบบ pin SHA-256 ของใบเซ็นแอปครั้งแรก และหยุดรับทันทีหากลายเซ็นเปลี่ยน'],
                  ['ลงลายเซ็นทุกคำขอ', 'มือถือใช้รหัสลับลงลายเซ็น HMAC พร้อมเวลาและ nonce เพื่อกันปลอมและส่งซ้ำ'],
                  ['ตรวจหลายหลักฐาน', 'ระบบเทียบยอด เวลา เลขอ้างอิง ธนาคาร และบัญชี ไม่อนุมัติจากยอดเงินอย่างเดียว'],
                  ['เก็บรหัสอย่างปลอดภัย', 'รหัสลับแสดงครั้งเดียว เก็บใน Android Keystore และเปลี่ยนรหัสได้เมื่อเครื่องสูญหาย'],
                ].map(([title, description]) => (
                  <div key={title} style={{ display: 'flex', gap: 10 }}>
                    <span style={{ color: 'var(--success)', paddingTop: 1 }}>✓</span>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 650 }}>{title}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.69rem', lineHeight: 1.55 }}>{description}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{
                marginTop: 15,
                padding: '10px 12px',
                borderRadius: 9,
                background: 'rgba(255,183,3,.07)',
                border: '1px solid rgba(255,183,3,.17)',
                color: 'var(--warning)',
                fontSize: '0.7rem',
                lineHeight: 1.55,
              }}>
                การแจ้งเตือนธนาคารเป็นหลักฐานประกอบ ไม่ควรใช้แทนการกระทบยอดบัญชีธนาคารหรือ API ธนาคารอย่างเป็นทางการ
              </div>
            </section>
          </div>

          <section style={{ ...cardStyle, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 750 }}>📱 อุปกรณ์ที่เชื่อมต่อ</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 2 }}>ระงับเครื่องที่สูญหายหรือไม่ได้ใช้งานทันที</div>
              </div>
            </div>

            {loadingData ? (
              <div style={{ textAlign: 'center', padding: 30 }}><span className="spinner" /></div>
            ) : devices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                ยังไม่มีมือถือที่ลงทะเบียน
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {devices.map(device => {
                  const packageNames = packagesFrom(device.allowedPackages);
                  const isSaving = savingDeviceId === device.id;
                  const recentSeen = device.lastSeenAt
                    ? Date.now() - new Date(device.lastSeenAt).getTime() < 10 * 60 * 1000
                    : false;

                  return (
                    <div key={device.id} style={{
                      padding: 14,
                      border: '1px solid var(--border)',
                      borderRadius: 11,
                      background: 'var(--bg-tertiary)',
                      opacity: device.isActive ? 1 : 0.7,
                    }}>
                      {editingId === device.id ? (
                        <div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                            <div>
                              <label style={inputLabelStyle}>ชื่อมือถือ</label>
                              <input className="input" value={editName} onChange={event => setEditName(event.target.value)} />
                            </div>
                            <div>
                              <label style={inputLabelStyle}>Package ID ที่อนุญาต</label>
                              <textarea
                                className="input"
                                rows={2}
                                value={editPackages}
                                onChange={event => setEditPackages(event.target.value)}
                                style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <button className="btn btn-primary btn-sm" disabled={isSaving} onClick={() => saveDevice(device)}>บันทึก</button>
                            <button className="btn btn-ghost btn-sm" disabled={isSaving} onClick={() => setEditingId(null)}>ยกเลิก</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 220, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700 }}>{device.name}</span>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                borderRadius: 20,
                                padding: '2px 8px',
                                fontSize: '0.65rem',
                                color: device.isActive ? 'var(--success)' : 'var(--text-muted)',
                                background: device.isActive ? 'rgba(6,214,160,.08)' : 'rgba(100,116,139,.1)',
                              }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: recentSeen && device.isActive ? 'var(--success)' : 'currentColor' }} />
                                {device.isActive ? (recentSeen ? 'เชื่อมต่อล่าสุด' : 'เปิดใช้งาน') : 'ระงับแล้ว'}
                              </span>
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 4 }}>
                              Device ID: <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{device.deviceId || device.publicId || device.id}</span>
                              {' · '}ติดต่อครั้งล่าสุด: {formatDate(device.lastSeenAt)}
                            </div>
                            {device.lastError && (
                              <div style={{ color: 'var(--danger)', fontSize: '0.66rem', marginTop: 4 }}>
                                ข้อผิดพลาดล่าสุด: {device.lastError}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                              {packageNames.length ? packageNames.map(packageName => (
                                <span key={packageName} style={{
                                  padding: '2px 7px',
                                  borderRadius: 5,
                                  background: 'rgba(0,229,255,.07)',
                                  border: '1px solid rgba(0,229,255,.13)',
                                  color: 'var(--teal)',
                                  fontFamily: 'monospace',
                                  fontSize: '0.65rem',
                                }}>{packageName}</span>
                              )) : (
                                <span style={{ color: 'var(--danger)', fontSize: '0.68rem' }}>ไม่มี Package ID ที่อนุญาต</span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost btn-sm" disabled={isSaving} onClick={() => beginEdit(device)}>แก้ไข</button>
                            <button className="btn btn-secondary btn-sm" disabled={isSaving} onClick={() => rotateSecret(device)}>เปลี่ยนรหัส</button>
                            <button
                              className={`btn ${device.isActive ? 'btn-danger' : 'btn-primary'} btn-sm`}
                              disabled={isSaving}
                              onClick={() => setDeviceActive(device, !device.isActive)}
                            >
                              {isSaving ? 'กำลังบันทึก...' : device.isActive ? 'ระงับ' : 'เปิดใช้งาน'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section style={{ ...cardStyle, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 750 }}>💸 รายการแจ้งเตือนเงินเข้า</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 2 }}>รายการล่าสุดจากมือถือและผลการจับคู่กับสลิป</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="input"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="ค้นหาธนาคาร, Ref, เหตุผล..."
                  style={{ width: 230, padding: '8px 11px' }}
                />
                <select
                  className="input"
                  value={statusFilter}
                  onChange={event => setStatusFilter(event.target.value)}
                  style={{ width: 155, padding: '8px 11px' }}
                >
                  <option value="all">ทุกสถานะ</option>
                  {statusOptions.map(status => (
                    <option key={status} value={status}>{statusStyle(status).label} ({status})</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
              <table style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>เวลาเงินเข้า</th>
                    <th>สถานะ</th>
                    <th style={{ textAlign: 'right' }}>จำนวนเงิน</th>
                    <th>ธนาคาร</th>
                    <th>เลขอ้างอิง</th>
                    <th>มือถือ / แอป</th>
                    <th>เหตุผลการจับคู่</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingData && !transactions.length ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 34 }}><span className="spinner" /></td></tr>
                  ) : visibleTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 34, color: 'var(--text-muted)' }}>
                        {transactions.length ? 'ไม่พบรายการตามตัวกรอง' : 'ยังไม่ได้รับแจ้งเตือนเงินเข้าจากมือถือ'}
                      </td>
                    </tr>
                  ) : visibleTransactions.map(transaction => {
                    const status = getTransactionStatus(transaction);
                    const appearance = statusStyle(status);
                    return (
                      <tr key={transaction.id || transaction.eventId}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.76rem' }}>{formatDate(getOccurredAt(transaction))}</td>
                        <td>
                          <span title={status} style={{
                            display: 'inline-block',
                            borderRadius: 20,
                            padding: '3px 9px',
                            fontSize: '0.68rem',
                            fontWeight: 650,
                            color: appearance.color,
                            background: appearance.background,
                            border: `1px solid ${appearance.border}`,
                            whiteSpace: 'nowrap',
                          }}>{appearance.label}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          {formatAmount(transaction)}
                        </td>
                        <td>{getBank(transaction)}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.73rem', maxWidth: 190, overflowWrap: 'anywhere' }}>
                          {getReference(transaction)}
                        </td>
                        <td style={{ fontSize: '0.72rem' }}>
                          <div>{transaction.deviceName || transaction.device?.name || '-'}</div>
                          {transaction.packageName && <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.62rem', marginTop: 2 }}>{transaction.packageName}</div>}
                        </td>
                        <td style={{ fontSize: '0.72rem', minWidth: 180, maxWidth: 300, color: 'var(--text-secondary)' }}>
                          {getMatchReason(transaction)}
                          {transaction.matchedSlipId && (
                            <div style={{ color: 'var(--success)', fontSize: '0.62rem', marginTop: 3, fontFamily: 'monospace' }}>
                              Slip: {transaction.matchedSlipId}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.66rem', marginTop: 8, textAlign: 'right' }}>
              แสดง {visibleTransactions.length} จาก {transactions.length} รายการล่าสุด
            </div>
          </section>
        </>
      )}

      {enrollment && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="enrollment-title">
          <div className="modal" style={{ maxWidth: 650, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ marginBottom: 14 }}>
              <div>
                <div id="enrollment-title" className="modal-title">🔐 ข้อมูลลงทะเบียนมือถือ</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 3 }}>นำข้อมูลนี้ไปกรอกในแอป Bank Notification Bridge</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEnrollment(null)} aria-label="ปิด">✕</button>
            </div>

            <div style={{
              padding: '11px 13px',
              borderRadius: 9,
              background: 'rgba(255,77,109,.09)',
              border: '1px solid rgba(255,77,109,.26)',
              color: '#ff7890',
              fontSize: '0.76rem',
              lineHeight: 1.55,
              marginBottom: 15,
            }}>
              <strong>แสดงรหัสลับครั้งเดียว:</strong> คัดลอกลงมือถือให้เรียบร้อยก่อนปิด ห้ามส่งรหัสนี้ในแชทหรือบันทึกภาพหน้าจอ หากรหัสรั่วให้กด “เปลี่ยนรหัส” ทันที
            </div>

            {[
              { label: 'URL รับข้อมูล', value: enrollment.serverUrl, secret: false },
              { label: 'Device ID', value: enrollment.deviceId, secret: false },
              { label: 'Device Secret', value: enrollment.secret, secret: true },
              { label: 'Package ID ที่อนุญาต', value: enrollment.allowedPackages.join(', '), secret: false },
            ].map(field => (
              <div key={field.label} style={{ marginBottom: 12 }}>
                <label style={inputLabelStyle}>{field.label}</label>
                <div style={{ display: 'flex', gap: 7 }}>
                  <input
                    className="input"
                    readOnly
                    value={field.value}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.76rem',
                      color: field.secret ? 'var(--warning)' : 'var(--text-primary)',
                    }}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={() => copyText(field.label, field.value)}>คัดลอก</button>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => copyText('ข้อมูลทั้งหมด', JSON.stringify({
                  serverUrl: enrollment.serverUrl,
                  deviceId: enrollment.deviceId,
                  secret: enrollment.secret,
                  allowedPackages: enrollment.allowedPackages,
                }, null, 2))}
              >
                📋 คัดลอกทั้งหมด
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setEnrollment(null)}>บันทึกแล้ว ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

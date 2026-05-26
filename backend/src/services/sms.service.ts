import axios from 'axios';
import prisma from '../lib/prisma';

// ─── SMS Provider Interface ───────────────────────────────────────────────────
interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  creditUsed: number;
}

// ─── Parse config helper ──────────────────────────────────────────────────────
function parseConfig(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

// ─── ThSMS Provider ───────────────────────────────────────────────────────────
async function sendViaTHSMS(phone: string, message: string, apiKey: string, sender: string): Promise<SmsResult> {
  try {
    // ThSMS API: https://www.thsms.com/api
    const res = await axios.post('https://www.thsms.com/api/rest', {
      method: 'send',
      username: apiKey.split(':')[0] || apiKey,
      password: apiKey.split(':')[1] || '',
      from:     sender,
      to:       phone.replace(/^0/, '66').replace(/^\+/, ''),
      message,
    }, { timeout: 10000 });

    if (res.data?.status === 'OK' || res.data?.result === 'success') {
      return { success: true, messageId: res.data?.msgId || res.data?.id, creditUsed: 1 };
    }
    return { success: false, error: res.data?.desc || res.data?.error || 'ส่งไม่สำเร็จ', creditUsed: 0 };
  } catch (e: any) {
    return { success: false, error: e.message, creditUsed: 0 };
  }
}

// ─── Mock Provider (ทดสอบ/Development) ───────────────────────────────────────
async function sendViaMock(phone: string, message: string): Promise<SmsResult> {
  console.log(`📱 [MOCK SMS] To: ${phone} | Message: ${message}`);
  // จำลอง delay
  await new Promise(r => setTimeout(r, 500));
  // 90% success rate สำหรับ mock
  const ok = Math.random() > 0.1;
  return {
    success: ok,
    messageId: ok ? `MOCK-${Date.now()}` : undefined,
    error: ok ? undefined : 'Mock failure (10% chance)',
    creditUsed: ok ? 1 : 0,
  };
}

// ─── Get SMS Config for Tenant ────────────────────────────────────────────────
async function getSmsConfig(tenantId: string): Promise<{
  provider: string;
  apiKey: string;
  sender: string;
} | null> {
  const channel = await prisma.channelConfig.findUnique({
    where: { tenantId_channel: { tenantId, channel: 'sms' } },
  });
  if (!channel || !channel.isActive) return null;
  const cfg = parseConfig(channel.config);
  return { provider: cfg.provider || 'mock', apiKey: cfg.apiKey || '', sender: cfg.sender || 'CRM' };
}

// ─── Main: Send SMS ───────────────────────────────────────────────────────────
export async function sendSMS(opts: {
  tenantId: string;
  phone: string;
  message: string;
  contactId?: string;
  broadcastId?: string;
}): Promise<{ success: boolean; logId: string; error?: string }> {
  const { tenantId, phone, message, contactId, broadcastId } = opts;

  // Normalize phone number
  const normalizedPhone = phone.replace(/\s|-/g, '').replace(/^0/, '66');

  // Get config
  const smsConfig = await getSmsConfig(tenantId);
  const provider  = smsConfig?.provider || 'mock';
  const sender    = smsConfig?.sender || 'CRM';

  // Create log (pending)
  const log = await prisma.smsLog.create({
    data: {
      tenantId,
      phone: normalizedPhone,
      message,
      sender,
      status: 'pending',
      provider,
      creditUsed: 0,
      contactId,
      broadcastId,
    },
  });

  // Send via provider
  let result: SmsResult;
  try {
    if (provider === 'thsms' && smsConfig?.apiKey) {
      result = await sendViaTHSMS(normalizedPhone, message, smsConfig.apiKey, sender);
    } else {
      result = await sendViaMock(normalizedPhone, message);
    }
  } catch (e: any) {
    result = { success: false, error: e.message, creditUsed: 0 };
  }

  // Update log
  await prisma.smsLog.update({
    where: { id: log.id },
    data: {
      status:       result.success ? 'sent' : 'failed',
      providerMsgId: result.messageId,
      creditUsed:   result.creditUsed,
      errorMsg:     result.error,
    },
  });

  return { success: result.success, logId: log.id, error: result.error };
}

// ─── Get SMS Balance ──────────────────────────────────────────────────────────
export async function getSmsBalance(tenantId: string): Promise<{
  balance: number | null;
  provider: string;
  configured: boolean;
}> {
  const smsConfig = await getSmsConfig(tenantId);
  if (!smsConfig) return { balance: null, provider: 'none', configured: false };

  if (smsConfig.provider === 'mock') {
    return { balance: 999, provider: 'mock', configured: true };
  }

  if (smsConfig.provider === 'thsms' && smsConfig.apiKey) {
    try {
      const res = await axios.post('https://www.thsms.com/api/rest', {
        method:   'balance',
        username: smsConfig.apiKey.split(':')[0],
        password: smsConfig.apiKey.split(':')[1] || '',
      }, { timeout: 8000 });
      return {
        balance: parseFloat(res.data?.balance ?? res.data?.credit ?? '0'),
        provider: 'thsms',
        configured: true,
      };
    } catch {
      return { balance: null, provider: 'thsms', configured: true };
    }
  }

  return { balance: null, provider: smsConfig.provider, configured: true };
}

// ─── Broadcast SMS (ส่งหลายเบอร์) ────────────────────────────────────────────
export async function broadcastSMS(opts: {
  tenantId: string;
  phones: string[];
  message: string;
  broadcastId?: string;
}): Promise<{ total: number; success: number; failed: number }> {
  const { tenantId, phones, message, broadcastId } = opts;
  let successCount = 0;
  let failedCount  = 0;

  // ส่งเป็น batch ทีละ 10 เพื่อไม่ให้ rate limit
  const BATCH = 10;
  for (let i = 0; i < phones.length; i += BATCH) {
    const batch = phones.slice(i, i + BATCH);
    await Promise.all(batch.map(async phone => {
      const r = await sendSMS({ tenantId, phone, message, broadcastId });
      if (r.success) successCount++; else failedCount++;
    }));
    // เว้น 500ms ระหว่าง batch
    if (i + BATCH < phones.length) await new Promise(r => setTimeout(r, 500));
  }

  return { total: phones.length, success: successCount, failed: failedCount };
}

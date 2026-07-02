/**
 * CRM LINE Sync — Background Service Worker (v2)
 */

const RETRY_QUEUE_KEY = 'crm_retry_queue';

// ── เปิด Side Panel เมื่อกดไอคอน ─────────────────────────────────────────────
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ── รับ message ทั้งหมดใน listener เดียว ──────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'CONTENT_READY') {
    console.log('[CRM Sync BG] Content ready:', msg.url);
    return false;
  }

  if (msg.type === 'LINE_ADMIN_REPLY') {
    handleAdminReply(msg.data);
    return false;
  }

  if (msg.type === 'TEST_CONNECTION') {
    // ทดสอบโดยยิงหา /api/auth/me เพื่อตรวจสอบสิทธิ์ token จริงๆ
    const testUrl = `${msg.crmUrl.replace(/\/$/, '')}/api/auth/me`;
    fetch(testUrl, {
      headers: { 'Authorization': `Bearer ${msg.token}` },
      signal: AbortSignal.timeout(5000), // timeout 5 วินาที
    })
      .then(res => {
        // หากส่งกลับมาเป็น 200 แสดงว่าสิทธิ์ผ่าน
        sendResponse({ ok: res.ok && res.status === 200, status: res.status });
      })
      .catch(e => sendResponse({ ok: false, error: e.message }));

    return true; // async response
  }

  return false;
});

// ── ส่งข้อมูลไป CRM Backend ───────────────────────────────────────────────────
async function handleAdminReply(data) {
  const config = await chrome.storage.local.get(['crmUrl', 'token', 'tenantId', 'enabled']);

  if (config.enabled === false) return;

  if (!config.crmUrl || !config.token || !config.tenantId) {
    console.warn('[CRM Sync BG] ยังไม่ได้ตั้งค่า');
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    return;
  }

  const payload = {
    tenantId: config.tenantId,
    userId: data.userId,
    text: data.text,
    timestamp: data.timestamp,
    source: data.source || 'extension',
  };

  try {
    const res = await fetch(`${config.crmUrl.replace(/\/$/, '')}/api/sync/line-reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      console.log('[CRM Sync BG] ✅ ส่งสำเร็จ:', data.text?.slice(0, 30));
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);

      // อัปเดต counter
      const s = await chrome.storage.local.get('syncCount');
      await chrome.storage.local.set({ syncCount: (s.syncCount || 0) + 1 });

      // แจ้ง popup
      chrome.runtime.sendMessage({ type: 'SYNC_SUCCESS', text: data.text }).catch(() => {});

    } else {
      const err = await res.text();
      console.warn('[CRM Sync BG] ❌ Backend error:', res.status, err);
      addToRetryQueue(payload);
      chrome.runtime.sendMessage({ type: 'SYNC_FAIL', error: `${res.status}` }).catch(() => {});
    }
  } catch (err) {
    console.error('[CRM Sync BG] ❌ Network error:', err.message);
    addToRetryQueue(payload);
    chrome.runtime.sendMessage({ type: 'SYNC_FAIL', error: err.message }).catch(() => {});
  }
}

// ── Retry Queue ───────────────────────────────────────────────────────────────
async function addToRetryQueue(payload) {
  const data = await chrome.storage.local.get(RETRY_QUEUE_KEY);
  const queue = data[RETRY_QUEUE_KEY] || [];
  queue.push({ ...payload, retryAt: Date.now() + 30000 });
  if (queue.length > 50) queue.shift();
  await chrome.storage.local.set({ [RETRY_QUEUE_KEY]: queue });
}

async function flushRetryQueue() {
  const data = await chrome.storage.local.get([RETRY_QUEUE_KEY, 'crmUrl', 'token']);
  const queue = data[RETRY_QUEUE_KEY] || [];
  if (!queue.length || !data.crmUrl) return;

  const now = Date.now();
  const remaining = [];

  for (const item of queue) {
    if (item.retryAt > now) { remaining.push(item); continue; }
    try {
      const res = await fetch(`${data.crmUrl.replace(/\/$/, '')}/api/sync/line-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.token}` },
        body: JSON.stringify(item),
      });
      if (!res.ok) remaining.push({ ...item, retryAt: Date.now() + 60000 });
    } catch {
      remaining.push({ ...item, retryAt: Date.now() + 60000 });
    }
  }

  await chrome.storage.local.set({ [RETRY_QUEUE_KEY]: remaining });
}

chrome.alarms.create('retry_queue', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'retry_queue') flushRetryQueue();
});

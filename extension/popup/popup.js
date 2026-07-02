/**
 * CRM LINE Sync — Popup Script
 */

const $ = id => document.getElementById(id);

// ── โหลดค่าที่บันทึกไว้ ──────────────────────────────────────────────────────
// ── ตัวแปรควบคุม HUD ────────────────────────────────────────────────────────
let currentActiveUserId = null;
let flexTemplatesLoaded = false;

// ── โหลดค่าที่บันทึกไว้ ──────────────────────────────────────────────────────
async function loadSettings() {
  const data = await chrome.storage.local.get([
    'crmUrl', 'token', 'tenantId', 'enabled',
    'syncCount', 'crm_retry_queue',
  ]);

  $('crmUrl').value    = data.crmUrl    || '';
  $('tenantId').value  = data.tenantId  || '';
  $('token').value     = data.token     || '';
  $('enabledToggle').checked = data.enabled !== false; // default true

  // Stats
  $('syncCount').textContent  = data.syncCount || 0;
  $('queueCount').textContent = (data.crm_retry_queue || []).length;

  // Session count จาก sessionStorage
  $('sessionCount').textContent = sessionStorage.getItem('crm_session_count') || 0;

  // ตั้งค่าสถานะเริ่มต้นตามข้อมูลการตั้งค่าที่มีอยู่
  if (data.crmUrl && data.tenantId && data.token) {
    if (data.enabled !== false) {
      setStatus('ok', 'พร้อมใช้งาน (เชื่อมต่อเรียบร้อย)');
    } else {
      setStatus('unknown', 'ปิดการซิงก์ข้อมูลชั่วคราว');
    }
  } else {
    setStatus('unknown', 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ');
  }

  // เริ่มต้นเช็คว่าหน้าเว็บ LINE OA กำลังคุยกับใครอยู่หรือไม่
  checkActiveChat();
}

// ── บันทึกค่า ─────────────────────────────────────────────────────────────────
$('saveBtn').addEventListener('click', async () => {
  const crmUrl   = $('crmUrl').value.trim().replace(/\/$/, '');
  const tenantId = $('tenantId').value.trim();
  const token    = $('token').value.trim();

  if (!crmUrl || !tenantId || !token) {
    setStatus('error', 'กรุณากรอกข้อมูลให้ครบทุกช่อง');
    return;
  }

  // ทำความสะอาด token กรณีที่แอดมินก๊อปปี้คำว่า "Bearer " ติดมาด้วย
  let sanitizedToken = token;
  if (sanitizedToken.startsWith('Bearer ')) {
    sanitizedToken = sanitizedToken.slice(7).trim();
  }

  await chrome.storage.local.set({ crmUrl, tenantId, token: sanitizedToken });
  flexTemplatesLoaded = false; // รีเซ็ตรายการ Flex Templates เพื่อโหลดใหม่จาก URL ล่าสุด
  setStatus('ok', 'บันทึกการตั้งค่าแล้ว');
  addLog('ok', 'บันทึกการตั้งค่าสำเร็จ');
  checkActiveChat();
});

// ── Toggle Enable/Disable ─────────────────────────────────────────────────────
$('enabledToggle').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ enabled: e.target.checked });
  if (e.target.checked) {
    const crmUrl = $('crmUrl').value.trim();
    if (crmUrl) {
      setStatus('ok', 'เปิดใช้งานการซิงก์ข้อมูล');
    } else {
      setStatus('unknown', 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ');
    }
  } else {
    setStatus('unknown', 'ปิดการซิงก์ข้อมูลชั่วคราว');
  }
});

// ── ทดสอบการเชื่อมต่อ ─────────────────────────────────────────────────────────
$('testBtn').addEventListener('click', async () => {
  const crmUrl = $('crmUrl').value.trim().replace(/\/$/, '');
  const token  = $('token').value.trim();

  if (!crmUrl || !token) {
    setStatus('error', 'กรุณากรอก URL และ Token ก่อนทดสอบ');
    return;
  }

  // ทำความสะอาด token กรณีที่แอดมินก๊อปปี้คำว่า "Bearer " ติดมาด้วย
  let sanitizedToken = token;
  if (sanitizedToken.startsWith('Bearer ')) {
    sanitizedToken = sanitizedToken.slice(7).trim();
  }

  setStatus('loading', 'กำลังทดสอบการเชื่อมต่อ...');
  $('testBtn').disabled = true;

  const result = await chrome.runtime.sendMessage({
    type: 'TEST_CONNECTION',
    crmUrl,
    token: sanitizedToken,
  });

  $('testBtn').disabled = false;

  if (result?.ok) {
    setStatus('ok', 'เชื่อมต่อสำเร็จ! Backend ตอบสนองปกติ');
    addLog('ok', `เชื่อมต่อ ${crmUrl} สำเร็จ`);
  } else {
    setStatus('error', `เชื่อมต่อไม่ได้: ${result?.error || 'status ' + result?.status}`);
    addLog('err', `เชื่อมต่อล้มเหลว: ${result?.error || result?.status}`);
  }
});

// ── Toggle Token Visibility ───────────────────────────────────────────────────
$('toggleToken').addEventListener('click', () => {
  const inp = $('token');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});

// ── Clear Log ─────────────────────────────────────────────────────────────────
$('clearLog').addEventListener('click', () => {
  $('logList').innerHTML = '<div class="log-empty">ยังไม่มี log</div>';
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(type, text) {
  const bar = $('statusBar');
  bar.className = `status-bar status-${type}`;
  $('statusText').textContent = text;
}

function addLog(type, msg) {
  const list = $('logList');
  const empty = list.querySelector('.log-empty');
  if (empty) empty.remove();

  const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const item = document.createElement('div');
  item.className = `log-item ${type}`;
  item.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-msg">${msg}</span>
  `;
  list.prepend(item);

  // จำกัด 10 บรรทัด
  while (list.children.length > 10) list.lastChild.remove();
}

// ── CRM Profile HUD & Quick Tools functions ───────────────────────────────────
async function checkActiveChat() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('chat.line.biz')) {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_ACTIVE_USER_ID' }, (response) => {
        if (chrome.runtime.lastError) {
          // content script อาจยังไม่โหลดหรือสลับไปหน้าอื่น
          fetchCRMProfile(null);
          return;
        }
        if (response && response.userId) {
          fetchCRMProfile(response.userId);
        } else {
          fetchCRMProfile(null);
        }
      });
    } else {
      fetchCRMProfile(null);
    }
  } catch (e) {
    fetchCRMProfile(null);
  }
}

async function fetchCRMProfile(lineUserId) {
  if (!lineUserId) {
    currentActiveUserId = null;
    $('crmHudSection').style.display = 'none';
    $('hudNoChatPlaceholder').style.display = 'block';
    return;
  }

  currentActiveUserId = lineUserId;
  $('hudNoChatPlaceholder').style.display = 'none';
  $('crmHudSection').style.display = 'block';
  $('hudLoading').style.display = 'block';
  $('hudLinked').style.display = 'none';
  $('hudNotLinked').style.display = 'none';
  $('hudFlexSenderSection').style.display = 'none'; // ซ่อนระหว่างโหลดข้อมูล

  const config = await chrome.storage.local.get(['crmUrl', 'token']);
  if (!config.crmUrl || !config.token) {
    $('hudLoading').style.display = 'none';
    $('crmHudSection').style.display = 'none';
    $('hudNoChatPlaceholder').textContent = '⚠️ กรุณาบันทึก URL และ Token ของ CRM ก่อนเริ่มใช้งาน';
    $('hudNoChatPlaceholder').style.display = 'block';
    return;
  }

  try {
    const res = await fetch(`${config.crmUrl.replace(/\/$/, '')}/api/contacts/by-line-user-id/${lineUserId}`, {
      headers: {
        'Authorization': `Bearer ${config.token}`,
      },
    });

    $('hudLoading').style.display = 'none';

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.contact) {
        showHUDLinked(data.contact);
      } else {
        showHUDNotLinked();
      }
      $('hudFlexSenderSection').style.display = 'block';
      loadFlexTemplatesDropdown();
    } else if (res.status === 404) {
      showHUDNotLinked();
      $('hudFlexSenderSection').style.display = 'block';
      loadFlexTemplatesDropdown();
    } else {
      addLog('err', `ดึงข้อมูลผิดพลาดจาก CRM: ${res.status}`);
      $('crmHudSection').style.display = 'none';
      $('hudNoChatPlaceholder').textContent = `⚠️ ดึงข้อมูลโปรไฟล์ล้มเหลว (Status ${res.status})`;
      $('hudNoChatPlaceholder').style.display = 'block';
    }
  } catch (e) {
    $('hudLoading').style.display = 'none';
    addLog('err', `ดึงข้อมูลโปรไฟล์ล้มเหลว: ${e.message}`);
    $('crmHudSection').style.display = 'none';
    $('hudNoChatPlaceholder').textContent = '⚠️ ไม่สามารถเชื่อมต่อกับ CRM ได้';
    $('hudNoChatPlaceholder').style.display = 'block';
  }
}

function showHUDLinked(contact) {
  $('hudLinked').style.display = 'block';
  $('hudNotLinked').style.display = 'none';

  // ── Blocked Status Banner ──────────────────────────────────────
  const blockedBanner = $('hudBlockedBanner');
  if (contact.isBlocked) {
    blockedBanner.style.display = 'flex';
  } else {
    blockedBanner.style.display = 'none';
  }

  // Profile data
  $('hudUsername').textContent = contact.username || contact.displayName || 'ไม่มี Username';
  $('hudPhone').textContent = contact.phone || '-';

  // VIP Level badge
  const badge = $('hudVipBadge');
  const type = contact.memberType || 'new';
  badge.textContent = type;
  badge.className = `hud-vip-badge ${type}`;

  // Stats formatting
  const fmt = (v) => '฿' + Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $('hudTotalDeposit').textContent = fmt(contact.totalDeposit);
  $('hudDepositCount').textContent = `${contact.depositCount || 0} ครั้ง`;
  $('hudTotalWithdraw').textContent = fmt(contact.totalWithdraw);
  $('hudWithdrawCount').textContent = `${contact.withdrawCount || 0} ครั้ง`;

  // Net profit (ยอดฝาก - ยอดถอน)
  const pnl = contact.totalProfit !== undefined ? contact.totalProfit : (contact.totalDeposit - contact.totalWithdraw);
  const pnlEl = $('hudNetProfit');
  pnlEl.textContent = fmt(pnl);
  if (pnl > 0) {
    pnlEl.className = 'val profit';
  } else if (pnl < 0) {
    pnlEl.className = 'val loss';
  } else {
    pnlEl.className = 'val';
  }

  // Tickets
  const tList = $('hudTicketsList');
  tList.innerHTML = '';
  if (contact.tickets && contact.tickets.length > 0) {
    $('hudTicketsSection').style.display = 'block';
    contact.tickets.forEach(t => {
      const div = document.createElement('div');
      div.className = 'hud-ticket-item';
      div.innerHTML = `
        <span class="title" title="${t.title}">${t.title}</span>
        <span class="badge ${t.status}">${t.status === 'open' ? 'รอดำเนินการ' : 'ตรวจเช็คอยู่'}</span>
      `;
      tList.appendChild(div);
    });
  } else {
    $('hudTicketsSection').style.display = 'none';
  }
}

function showHUDNotLinked() {
  $('hudLinked').style.display = 'none';
  $('hudNotLinked').style.display = 'block';
  $('linkUsername').value = '';
}

async function loadFlexTemplatesDropdown() {
  if (flexTemplatesLoaded) return;

  const config = await chrome.storage.local.get(['crmUrl', 'token']);
  try {
    const res = await fetch(`${config.crmUrl.replace(/\/$/, '')}/api/flex/templates`, {
      headers: {
        'Authorization': `Bearer ${config.token}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.templates) {
        const select = $('hudFlexSelect');
        select.innerHTML = '<option value="">-- เลือกแม่แบบ Flex --</option>';

        data.templates.forEach(tpl => {
          const opt = document.createElement('option');
          opt.value = tpl.id;
          opt.textContent = `${tpl.name} [${tpl.category}]`;
          opt.dataset.flexJson = tpl.flexJson;
          opt.dataset.altText = tpl.altText;
          select.appendChild(opt);
        });
        flexTemplatesLoaded = true;
      }
    }
  } catch (e) {
    console.error('Failed to load templates dropdown:', e.message);
  }
}

// ── Bind One-Click Account Linker ──────────────────────────────────────────────
$('linkBtn').addEventListener('click', async () => {
  const query = $('linkUsername').value.trim();
  if (!query) {
    alert('กรุณากรอก Username หรือเบอร์โทรศัพท์ของลูกค้า!');
    return;
  }

  if (!currentActiveUserId) return;

  const config = await chrome.storage.local.get(['crmUrl', 'token']);
  $('linkBtn').disabled = true;
  $('linkBtn').textContent = 'กำลังผูกบัญชี...';

  try {
    const isPhone = /^\d+$/.test(query) && query.length >= 9 && query.length <= 10;
    const payload = {
      lineUserId: currentActiveUserId,
      username: isPhone ? undefined : query,
      phone: isPhone ? query : undefined,
    };

    const res = await fetch(`${config.crmUrl.replace(/\/$/, '')}/api/contacts/link-line-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      addLog('ok', `✓ ผูกบัญชีสำเร็จ: ${query}`);
      fetchCRMProfile(currentActiveUserId);
    } else {
      addLog('err', `✗ ผูกบัญชีล้มเหลว: ${data.message || 'Error'}`);
      alert(data.message || 'ไม่สามารถผูกบัญชีได้');
    }
  } catch (e) {
    addLog('err', `✗ ระบบผิดพลาด: ${e.message}`);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล CRM');
  } finally {
    $('linkBtn').disabled = false;
    $('linkBtn').innerHTML = '🔗 ผูกบัญชีสมาชิก CRM';
  }
});

// ── Bind Quick Send Flex Message ──────────────────────────────────────────────
$('hudSendFlexBtn').addEventListener('click', async () => {
  const select = $('hudFlexSelect');
  const idx = select.selectedIndex;
  if (idx <= 0) {
    alert('กรุณาเลือก Flex Template ก่อนกดส่ง!');
    return;
  }

  if (!currentActiveUserId) {
    alert('ไม่พบผู้รับข้อความ Active Chat');
    return;
  }

  const opt = select.options[idx];
  const flexJsonStr = opt.dataset.flexJson;
  const altText = opt.dataset.altText;

  if (!flexJsonStr) return;

  const config = await chrome.storage.local.get(['crmUrl', 'token']);
  $('hudSendFlexBtn').disabled = true;
  $('hudSendFlexBtn').textContent = 'กำลังส่ง...';

  try {
    const flexJson = JSON.parse(flexJsonStr);
    const res = await fetch(`${config.crmUrl.replace(/\/$/, '')}/api/flex/send-by-line-user-id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        lineUserId: currentActiveUserId,
        altText: altText || 'ส่งข้อความ Flex',
        flexJson,
      }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      addLog('ok', `✓ ส่ง Flex "${opt.text}" สำเร็จ`);
      alert('ส่ง Flex Message ให้ลูกค้าเรียบร้อยแล้วค่ะ');
    } else {
      addLog('err', `✗ ส่ง Flex ล้มเหลว: ${data.message || 'Error'}`);
      alert(data.message || 'ส่ง Flex Message ล้มเหลว');
    }
  } catch (e) {
    addLog('err', `✗ ส่ง Flex ผิดพลาด: ${e.message}`);
    alert('การเชื่อมต่อส่งข้อความผิดพลาด');
  } finally {
    $('hudSendFlexBtn').disabled = false;
    $('hudSendFlexBtn').textContent = 'ส่ง Flex';
  }
});

// ── Listen ข้อความจาก background ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SYNC_SUCCESS') {
    const count = parseInt($('syncCount').textContent || '0') + 1;
    $('syncCount').textContent = count;

    const sess = parseInt(sessionStorage.getItem('crm_session_count') || '0') + 1;
    sessionStorage.setItem('crm_session_count', sess);
    $('sessionCount').textContent = sess;

    addLog('ok', `✓ ส่งสำเร็จ: "${msg.text?.slice(0, 25)}..."`);
  }
  if (msg.type === 'SYNC_FAIL') {
    addLog('err', `✗ ส่งล้มเหลว: ${msg.error}`);
  }
  if (msg.type === 'ACTIVE_CHAT_CHANGED') {
    fetchCRMProfile(msg.userId);
  }
});

// ── ดึง LINE ID จากหน้าเว็บ ───────────────────────────────────────────────────
$('exportBtn').addEventListener('click', async () => {
  setStatus('loading', 'กำลังดึงข้อมูล LINE ID...');
  $('exportBtn').disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('chat.line.biz')) {
      setStatus('error', 'กรุณาเปิดหน้าแชทหรือหน้ารายชื่อเพื่อนใน LINE OA');
      $('exportBtn').disabled = false;
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_LINE_IDS' });
    $('exportBtn').disabled = false;

    if (response?.ok && response.data && response.data.length > 0) {
      let csvContent = '\uFEFFName,LINE User ID\n';
      response.data.forEach(item => {
        const nameEscaped = `"${(item.name || 'Unknown').replace(/"/g, '""')}"`;
        csvContent += `${nameEscaped},${item.userId}\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `line_user_ids_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatus('ok', `ดึงข้อมูลสำเร็จ! พบ ${response.data.length} รายชื่อ`);
      addLog('ok', `Export สำเร็จ: พบ LINE ID ${response.data.length} คน`);
    } else {
      setStatus('error', 'ไม่พบข้อมูล LINE ID ในหน้านี้ (กรุณาเลื่อนลงเพื่อโหลดรายชื่อเพิ่ม)');
      addLog('err', 'Export ล้มเหลว: ไม่พบ LINE ID ในหน้าเว็บ');
    }
  } catch (e) {
    $('exportBtn').disabled = false;
    setStatus('error', 'กรุณารีโหลดหน้าเว็บ LINE OA แล้วลองอีกครั้ง');
    addLog('err', `Export ล้มเหลว: ${e.message}`);
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadSettings();

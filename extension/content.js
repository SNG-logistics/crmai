/**
 * CRM LINE Sync — Content Script (v2)
 * Strategy: ดักที่ Enter key / Send button โดยตรง (แม่นยำที่สุด)
 * ไม่พึ่ง Fetch interceptor หรือ MutationObserver เป็นหลัก
 */

(function () {
  'use strict';

  // ── ดึง userId จาก URL ──────────────────────────────────────────────────────
  // chat.line.biz format: /{accountId}/chat/{userId}
  function getCurrentUserId() {
    const parts = window.location.pathname.split('/');
    // หา segment ที่ขึ้นต้นด้วย U และยาวพอ (LINE userId)
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] && parts[i].length >= 10 && parts[i] !== parts[0]) {
        // ตรวจว่าเป็น userId (Uxxxxx) ไม่ใช่ accountId segment แรก
        if (i > 0) return parts[i];
      }
    }
    return null;
  }

  // ── Dedup ──────────────────────────────────────────────────────────────────
  const sent = new Set();
  function isDup(userId, text) {
    const k = `${userId}|${text.slice(0, 60)}`;
    if (sent.has(k)) return true;
    sent.add(k);
    setTimeout(() => sent.delete(k), 5000);
    return false;
  }

  // ── ส่งไป background ──────────────────────────────────────────────────────
  function ship(text, source) {
    const userId = getCurrentUserId();
    if (!userId || !text || text.length < 1) return;
    if (isDup(userId, text)) return;

    chrome.runtime.sendMessage({
      type: 'LINE_ADMIN_REPLY',
      data: { userId, text, timestamp: Date.now(), source },
    });
    console.log(`[CRM Sync] ✅ Sent (${source}): "${text.slice(0, 40)}"`);
  }

  // ── หา Input Element ที่กำลัง active ──────────────────────────────────────
  function getActiveInputText() {
    const active = document.activeElement;
    if (!active) return null;

    // contenteditable (LINE ใช้)
    if (active.isContentEditable) {
      const text = active.innerText?.trim() || active.textContent?.trim();
      return text || null;
    }

    // textarea / input
    if (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') {
      return active.value?.trim() || null;
    }

    return null;
  }

  // ── Fallback: ค้นหา input ทั่วหน้า ─────────────────────────────────────────
  function findInputText() {
    // contenteditable ที่ไม่ใช่ body หรือ html
    const editables = document.querySelectorAll('[contenteditable="true"]');
    for (const el of editables) {
      const text = el.innerText?.trim();
      // กรอง: ข้อความสั้นๆ (placeholders) หรือว่างเปล่า
      if (text && text.length > 0 && !text.startsWith('Enter:')) {
        return text;
      }
    }

    // textarea
    const ta = document.querySelector('textarea');
    if (ta?.value?.trim()) return ta.value.trim();

    return null;
  }

  // ── Main capture function ──────────────────────────────────────────────────
  let lastText = '';
  let lastSentAt = 0;

  function capture(source) {
    const text = getActiveInputText() || findInputText();
    if (!text) return;

    // ป้องกันส่งซ้ำภายใน 1 วินาที
    if (text === lastText && Date.now() - lastSentAt < 1000) return;

    lastText = text;
    lastSentAt = Date.now();
    ship(text, source);
  }

  // ── Enter Key ─────────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      capture('enter_key');
    }
  }, true);

  // ── Send Button ───────────────────────────────────────────────────────────
  // LINE ใช้ปุ่มส่งหลาย format — ใช้ pointer capture แทน click
  document.addEventListener('pointerdown', (e) => {
    const el = e.target;
    const btn = el.closest('button') || (el.tagName === 'BUTTON' ? el : null);
    if (!btn) return;

    // เช็คว่าเป็นปุ่ม send จริง
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    const testId = btn.getAttribute('data-testid') || '';
    const isClose = btn.closest('[role="dialog"]');

    const isSend = (
      label.includes('send') ||
      label.includes('ส่ง') ||
      testId.toLowerCase().includes('send') ||
      // LINE chat.biz ใช้ปุ่ม SVG ไม่มี aria — ตรวจจาก position ใกล้ input
      (!isClose && isNearInput(btn))
    );

    if (isSend) capture('send_button');
  }, true);

  function isNearInput(btn) {
    const rect = btn.getBoundingClientRect();
    const input = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
    if (!input) return false;
    const ir = input.getBoundingClientRect();
    // ปุ่มอยู่ภายใน 100px จาก input
    return Math.abs(rect.top - ir.top) < 100 && rect.left > ir.right - 50;
  }

  // ── MutationObserver (สำรอง — จับเฉพาะ message bubble ใหม่ฝั่ง admin) ──────
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        tryCaptureBubble(node);
      }
    }
  });

  function tryCaptureBubble(node) {
    // หา element ที่มี attribute บอกว่าเป็นฝั่ง admin/sent
    // LINE ใช้ data attribute หรือ class ที่สลับตำแหน่ง
    const isAdminSide = (
      node.querySelector?.('[class*="MessageBubbleSend"]') ||
      node.querySelector?.('[data-message-direction="out"]') ||
      node.matches?.('[data-message-direction="out"]')
    );
    if (!isAdminSide) return;

    // ดึงเฉพาะ text message (ไม่ใช่ image/sticker)
    const textEl = node.querySelector?.('p, [class*="TextMessage"], [class*="messageText"]');
    const text = textEl?.textContent?.trim();
    if (!text || text.match(/^\d{1,2}[:.]\d{2}/)) return; // กัน timestamp

    ship(text, 'mutation_bubble');
  }

  observer.observe(document.body, { childList: true, subtree: true });

  // ── Scraper Listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SCRAPE_LINE_IDS') {
      const userIds = new Set();
      const results = [];

      // ดึง account ID จาก URL เพื่อไม่ให้สับสนกับ User ID ของลูกค้า
      const parts = window.location.pathname.split('/');
      const accountId = (parts[1] || '').toLowerCase(); // U442a18eac...

      // ค้นหาทุกลิงก์และองค์ประกอบที่มีค่า attribute ตรงกับแพทเทิร์น LINE User ID
      document.querySelectorAll('*').forEach(el => {
        const attributes = el.attributes;
        if (!attributes) return;

        for (let i = 0; i < attributes.length; i++) {
          const attr = attributes[i];
          const val = attr.value || '';
          
          // ค้นหาแพทเทิร์น U ตามด้วยเลขฐาน 16 อีก 32 ตัว
          const matches = val.match(/\b(U[a-f0-9]{32})\b/gi);
          if (matches) {
            for (const userId of matches) {
              const uIdLower = userId.toLowerCase();
              
              // ต้องไม่ใช่ accountId ของแอดมินเอง และต้องยังไม่ซ้ำในลิสต์
              if (uIdLower !== accountId && !userIds.has(uIdLower)) {
                userIds.add(uIdLower);

                // ค้นหาชื่อเล่น/ชื่อแสดงผลลูกค้าจาก Parent Container ใกล้เคียง
                let name = '';
                const parentRow = el.closest('tr') || el.closest('li') || el.closest('[class*="item"]') || el.closest('[class*="row"]') || el.closest('[class*="ContactListItem"]') || el.closest('[class*="RoomListItem"]') || el.closest('[data-testid*="item"]');
                if (parentRow) {
                  const textElements = parentRow.querySelectorAll('span, div, p, td');
                  for (const te of textElements) {
                    const txt = te.textContent?.trim();
                    // กรองคำทั่วไปที่ไม่ใช่ชื่อแชท
                    if (txt && txt.length > 0 && txt.length < 50 && !txt.includes('แชท') && !txt.includes('ดูรายละเอียด') && !txt.includes('+ ใส่แท็ก')) {
                      name = txt;
                      break;
                    }
                  }
                }

                results.push({ name: name || 'Unknown', userId });
              }
            }
          }
        }
      });

      sendResponse({ ok: true, data: results });
      return false; // synchronous response
    }

    if (msg.type === 'GET_ACTIVE_USER_ID') {
      sendResponse({ userId: getCurrentUserId() });
      return false;
    }
  });

  // ── ตรวจจับการสลับหน้าแชท (URL เปลี่ยนแปลง) ───────────────────────────────────
  let lastActiveUserId = getCurrentUserId();
  setInterval(() => {
    const currentUserId = getCurrentUserId();
    if (currentUserId !== lastActiveUserId) {
      lastActiveUserId = currentUserId;
      // ส่งข้อมูลไปยัง Background และ Popup
      chrome.runtime.sendMessage({
        type: 'ACTIVE_CHAT_CHANGED',
        userId: currentUserId,
      }).catch(() => {}); // กัน error กรณี popup ปิดอยู่
      console.log('[CRM Sync] 🔄 Active chat changed to:', currentUserId);
    }
  }, 1000);

  // ── Ready ─────────────────────────────────────────────────────────────────
  chrome.runtime.sendMessage({ type: 'CONTENT_READY', url: window.location.href });
  console.log('[CRM Sync] v2 loaded on', window.location.hostname,
    '| userId:', getCurrentUserId());
})();

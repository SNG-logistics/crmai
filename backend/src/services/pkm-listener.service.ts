/**
 * PKM Real-time Listener Service
 * เชื่อมต่อ pkm-socket.gamingcenter.club แบบ background
 * รับ member_withdraw / member_notiwithdraw / member_deposit แล้ว
 * auto-update Contact ใน CRM + emit real-time notification
 */
import { io as ioClient, Socket } from 'socket.io-client';
import prisma from '../lib/prisma';
import { emitToTenant } from '../lib/socket';

const PKM_SOCKET_URL = 'https://pkm-socket.gamingcenter.club';

// ─── State ────────────────────────────────────────────────────────────────────
let socket: Socket | null = null;
let isRunning = false;
let reconnectTimer: NodeJS.Timeout | null = null;
const eventLog: Array<{ event: string; data: any; ts: string }> = [];
const stats = {
  connected: false,
  connectedAt: null as string | null,
  reconnects: 0,
  eventsReceived: 0,
  withdrawUpdated: 0,
  depositUpdated: 0,
  lastEvent: null as string | null,
  lastEventAt: null as string | null,
};

// ─── Known event → action mapping ────────────────────────────────────────────
const WITHDRAW_EVENTS = ['member_withdraw', 'member_notiwithdraw', 'withdraw', 'player_withdraw'];
const DEPOSIT_EVENTS  = ['member_deposit',  'member_notideposit',  'deposit',  'player_deposit'];
const ALL_EVENTS      = [...WITHDRAW_EVENTS, ...DEPOSIT_EVENTS];

// ─── Connect & start listening ────────────────────────────────────────────────
const MAX_RECONNECTS = parseInt(process.env.PKM_MAX_RECONNECTS || '10');

export function startPkmListener() {
  // ปิด PKM listener ได้โดยตั้ง PKM_ENABLED=false ใน .env
  if (process.env.PKM_ENABLED === 'false') {
    console.log('[PKM] ⏭️  PKM listener disabled (PKM_ENABLED=false)');
    return;
  }
  if (isRunning) return;
  isRunning = true;
  console.log('[PKM] 🔌 Starting real-time listener...');
  doConnect();
}

function doConnect() {
  try {
    socket = ioClient(PKM_SOCKET_URL, {
      transports: ['polling'],
      reconnection: false,
      timeout: 20000,
      extraHeaders: {
        'Origin':  'https://pkm-bo.gamingcenter.club',
        'Referer': 'https://pkm-bo.gamingcenter.club/',
      },
    });

    socket.on('connect', () => {
      stats.connected = true;
      stats.connectedAt = new Date().toISOString();
      console.log(`[PKM] ✅ Connected to pkm-socket (ID: ${socket?.id})`);
    });

    // ─── Listen to ALL events (catch unknown ones too) ─────────────────────
    socket.onAny((event: string, data: any) => {
      stats.eventsReceived++;
      stats.lastEvent   = event;
      stats.lastEventAt = new Date().toISOString();

      // เก็บ log ล่าสุด 50 รายการ
      eventLog.unshift({ event, data, ts: new Date().toISOString() });
      if (eventLog.length > 50) eventLog.pop();

      console.log(`[PKM] 📥 Event: ${event}`, JSON.stringify(data).substring(0, 200));

      // Route event → handler
      if (WITHDRAW_EVENTS.includes(event)) {
        handleTransactionEvent('withdraw', data).catch(console.error);
      } else if (DEPOSIT_EVENTS.includes(event)) {
        handleTransactionEvent('deposit', data).catch(console.error);
      } else if (event.toLowerCase().includes('member') || event.toLowerCase().includes('player')) {
        handleUnknownMemberEvent(event, data).catch(console.error);
      }
    });

    socket.on('disconnect', (reason) => {
      stats.connected = false;
      console.log(`[PKM] 🔌 Disconnected: ${reason}`);
      scheduleReconnect();
    });

    socket.on('connect_error', (err) => {
      console.log(`[PKM] ❌ Connect error: ${err.message}`);
      scheduleReconnect();
    });

  } catch (err) {
    console.error('[PKM] Fatal error:', err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (!isRunning) return;

  // หยุด reconnect เมื่อถึง MAX_RECONNECTS เพื่อป้องกัน infinite loop
  if (stats.reconnects >= MAX_RECONNECTS) {
    console.warn(`[PKM] ⛔ Max reconnect attempts (${MAX_RECONNECTS}) reached — giving up.`);
    console.warn('[PKM] 💡 ตั้ง PKM_ENABLED=false ใน .env เพื่อปิด listener นี้');
    isRunning = false;
    return;
  }

  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(30000, 5000 * (stats.reconnects + 1)); // 5s, 10s, 15s... max 30s
  console.log(`[PKM] 🔄 Reconnecting in ${delay / 1000}s... (${stats.reconnects + 1}/${MAX_RECONNECTS})`);
  reconnectTimer = setTimeout(() => {
    stats.reconnects++;
    doConnect();
  }, delay);
}

// ─── Handle withdraw / deposit event ─────────────────────────────────────────
async function handleTransactionEvent(type: 'withdraw' | 'deposit', data: any) {
  // data อาจเป็น: { pf, username, amount, userId, name, ... }
  const username   = data?.username || data?.userId   || data?.user   || data?.member  || null;
  const phone      = data?.phone    || data?.mobile   || data?.tel    || null;
  const amount     = parseFloat(data?.amount || data?.amt || '0') || 0;
  const pf         = data?.pf       || data?.platform || 'unknown';
  const rawAmount  = data?.amount   || 0;

  console.log(`[PKM] 💰 ${type.toUpperCase()} event — pf=${pf} user=${username} amount=${amount}`);

  // ถ้าไม่มี username/phone ยังไม่สามารถ match contact ได้
  // แต่ยังบันทึก raw event ไว้และ notify admin
  if (!username && !phone) {
    // Notify all tenants ที่ config PKM ไว้
    await broadcastPkmEvent(type, { pf, amount: rawAmount, rawData: data });
    return;
  }

  // หา tenant ที่ match
  const channels = await prisma.channelConfig.findMany({ where: { channel: 'pkm', isActive: true } });

  for (const ch of channels) {
    try {
      const contact = await prisma.contact.findFirst({
        where: {
          tenantId: ch.tenantId,
          OR: [
            username ? { username: { contains: username } } : {},
            username ? { username: username }                : {},
            phone    ? { phone: phone }                      : {},
          ].filter(o => Object.keys(o).length > 0) as any,
        },
      });

      if (contact) {
        // อัปเดตยอดเงิน
        const updateData: any = type === 'withdraw'
          ? { totalWithdraw: { increment: amount }, withdrawCount: { increment: amount > 0 ? 1 : 0 } }
          : { totalDeposit:  { increment: amount }, depositCount:  { increment: amount > 0 ? 1 : 0 },
              memberType: contact.memberType === 'new' ? 'regular' : contact.memberType };

        if (type === 'deposit' && amount > 0 && !contact.firstDepositAt) {
          updateData.firstDepositAt = new Date();
        }
        if (type === 'deposit' && amount > 0) {
          updateData.lastDepositAt = new Date();
        }

        await prisma.contact.update({ where: { id: contact.id }, data: updateData });

        const updated = await prisma.contact.findUnique({ where: { id: contact.id } });

        // Emit real-time update ไปยัง CRM inbox
        emitToTenant(ch.tenantId, 'pkm:transaction', {
          type, amount, pf, username,
          contactId: contact.id,
          contactName: contact.displayName,
          totalDeposit:  updated?.totalDeposit,
          totalWithdraw: updated?.totalWithdraw,
          netProfit: (updated?.totalDeposit || 0) - (updated?.totalWithdraw || 0),
          ts: new Date().toISOString(),
        });

        if (type === 'withdraw') stats.withdrawUpdated++;
        else stats.depositUpdated++;

        console.log(`[PKM] ✅ Updated ${contact.displayName}: ${type} ฿${amount}`);
      } else {
        // ไม่พบ contact แต่ยัง notify
        emitToTenant(ch.tenantId, 'pkm:unknown_member', { type, amount, pf, username, phone });
      }
    } catch (e: any) {
      console.error(`[PKM] Error updating contact:`, e.message);
    }
  }
}

// ─── Handle unknown member events ─────────────────────────────────────────────
async function handleUnknownMemberEvent(event: string, data: any) {
  const channels = await prisma.channelConfig.findMany({ where: { channel: 'pkm', isActive: true } }).catch(() => []);
  for (const ch of channels) {
    emitToTenant(ch.tenantId, 'pkm:raw_event', { event, data, ts: new Date().toISOString() });
  }
}

async function broadcastPkmEvent(type: string, data: any) {
  const channels = await prisma.channelConfig.findMany({ where: { channel: 'pkm', isActive: true } }).catch(() => []);
  for (const ch of channels) {
    emitToTenant(ch.tenantId, 'pkm:transaction', { type, ...data, ts: new Date().toISOString() });
  }
}

// ─── Stop listener ────────────────────────────────────────────────────────────
export function stopPkmListener() {
  isRunning = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (socket) { socket.disconnect(); socket = null; }
  stats.connected = false;
  console.log('[PKM] ⏹️  Listener stopped');
}

// ─── Get status (for API) ─────────────────────────────────────────────────────
export function getPkmListenerStatus() {
  return {
    ...stats,
    recentEvents: eventLog.slice(0, 20),
    socketUrl: PKM_SOCKET_URL,
  };
}

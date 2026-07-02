'use client';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getIdToken } from './firebase';

// เชื่อม socket ตรงไปยัง backend (NEXT_PUBLIC_WS_URL) — ห้ามพึ่ง Next rewrite
// เพราะ rewrite proxy ได้แค่ HTTP ไม่รองรับ WebSocket upgrade ทำให้ realtime ไม่ทำงาน
function resolveWsUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL || '';
  if (typeof window === 'undefined') return configured || 'http://localhost:4000';
  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  // ถ้าเปิดจากเครื่องอื่น (ไม่ใช่ localhost) แต่ config ชี้ localhost → ใช้ same-origin แทน
  // (กรณีนี้ต่อ socket ตรงไม่ได้อยู่แล้ว — ปล่อยให้ Next rewrite จัดการ)
  if (configured && /localhost|127\.0\.0\.1/.test(configured) && !isLocalHost) {
    return window.location.origin;
  }
  return configured || window.location.origin;
}
let socket: Socket | null = null;

// ─── Listeners ที่ subscribe เพื่อรับ socket change events ─────────────────
const changeListeners = new Set<() => void>();
function notifySocketChange() { changeListeners.forEach(fn => fn()); }

export function getSocket(): Socket | null { return socket; }

export function connectSocket(token?: string): Socket {
  if (socket?.connected) return socket;
  if (socket) { socket.disconnect(); socket = null; }

  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  socket = io(resolveWsUrl(), {
    // auth as a function → a fresh Firebase ID token is fetched on every
    // (re)connect, so the socket never authenticates with an expired token.
    auth: async (cb: (data: any) => void) => {
      let t: string | null = null;
      try { t = await getIdToken(); } catch { /* ignore */ }
      if (!t) t = token ?? (typeof window !== 'undefined' ? localStorage.getItem('crm_token') : null);
      cb({ token: t });
    },
    transports: isLocal ? ['websocket', 'polling'] : ['polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    extraHeaders: { 'ngrok-skip-browser-warning': 'true' },
  });

  socket.on('connect', () => {
    console.log('🔌 Socket connected');
    notifySocketChange(); // ← แจ้ง useSocket hooks ให้ re-register
  });
  socket.on('disconnect', () => console.log('🔌 Socket disconnected'));
  socket.on('connect_error', (e) => console.warn('Socket error:', e.message));

  notifySocketChange();
  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; notifySocketChange(); }
}

/**
 * useSocket — reactive hook ที่ลงทะเบียน event handler กับ socket
 * แก้ไข: re-register handler เมื่อ socket connect/reconnect
 */
export function useSocket(event: string, handler: (data: any) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  // rev จะ bump เมื่อ socket connect/disconnect → trigger re-effect
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const notify = () => setRev(r => r + 1);
    changeListeners.add(notify);
    // Check ทันทีว่า socket พร้อมหรือยัง
    if (socket?.connected) notify();
    return () => { changeListeners.delete(notify); };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const fn = (data: any) => handlerRef.current(data);
    socket.on(event, fn);
    return () => { socket?.off(event, fn); };
  }, [event, rev]); // ← re-run ทุกครั้งที่ rev เปลี่ยน (socket connected)
}

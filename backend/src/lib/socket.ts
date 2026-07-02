import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { verifyAuthToken } from '../middleware/auth';

let io: SocketServer;

// ─── Presence tracker: conversationId → Map<socketId, adminInfo> ──────────────
const convPresence = new Map<string, Map<string, { userId: string; displayName: string; username: string }>>();

function getPresenceInConv(conversationId: string) {
  return Array.from(convPresence.get(conversationId)?.values() || []);
}

export function initSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: {
      origin: (_origin, callback) => { callback(null, true); },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const result = await verifyAuthToken(token);
      if (!result) return next(new Error('Invalid token'));
      (socket as any).user = result.user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    console.log(`🔌 Socket connected: ${user?.username} (tenant: ${user?.tenantId})`);

    // Join tenant room for isolation
    socket.join(`tenant:${user.tenantId}`);

    // Track which conversation this socket is viewing
    let currentConvId: string | null = null;

    // ─── Join/Leave conversation room ─────────────────────────────────────────
    socket.on('join:conversation', (conversationId: string) => {
      // Leave previous conversation first
      if (currentConvId && currentConvId !== conversationId) {
        socket.leave(`conversation:${currentConvId}`);
        const prevPresence = convPresence.get(currentConvId);
        if (prevPresence) {
          prevPresence.delete(socket.id);
          if (prevPresence.size === 0) convPresence.delete(currentConvId);
        }
        // แจ้งคนอื่นใน conversation เดิมว่า admin ออกแล้ว
        socket.to(`conversation:${currentConvId}`).emit('admin_leave', {
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          conversationId: currentConvId,
          viewers: getPresenceInConv(currentConvId),
        });
      }

      // Join new conversation
      socket.join(`conversation:${conversationId}`);
      currentConvId = conversationId;

      // เพิ่มเข้า presence tracker
      if (!convPresence.has(conversationId)) convPresence.set(conversationId, new Map());
      convPresence.get(conversationId)!.set(socket.id, {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
      });

      // แจ้งคนอื่นใน conversation ว่า admin เข้ามาดูด้วย
      socket.to(`conversation:${conversationId}`).emit('admin_enter', {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        conversationId,
        viewers: getPresenceInConv(conversationId),
      });

      // ส่ง viewers ปัจจุบันกลับให้ socket ที่เพิ่งเข้า
      socket.emit('conversation_viewers', {
        conversationId,
        viewers: getPresenceInConv(conversationId),
      });
    });

    socket.on('leave:conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      const presence = convPresence.get(conversationId);
      if (presence) {
        presence.delete(socket.id);
        if (presence.size === 0) convPresence.delete(conversationId);
      }
      if (currentConvId === conversationId) currentConvId = null;

      socket.to(`conversation:${conversationId}`).emit('admin_leave', {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        conversationId,
        viewers: getPresenceInConv(conversationId),
      });
    });

    // ─── Typing indicator ────────────────────────────────────────────────────
    socket.on('typing', ({ conversationId }: { conversationId: string }) => {
      socket.to(`conversation:${conversationId}`).emit('admin_typing', {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        conversationId,
      });
    });

    // ─── Disconnect: clean up presence ───────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${user?.username}`);
      if (currentConvId) {
        const presence = convPresence.get(currentConvId);
        if (presence) {
          presence.delete(socket.id);
          if (presence.size === 0) convPresence.delete(currentConvId);
        }
        socket.to(`conversation:${currentConvId}`).emit('admin_leave', {
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          conversationId: currentConvId,
          viewers: getPresenceInConv(currentConvId),
        });
      }
    });
  });

  return io;
}

export function getIO(): SocketServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

/** Emit to all agents in a tenant */
export function emitToTenant(tenantId: string, event: string, data: any) {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit(event, data);
}

/** Emit to specific conversation room */
export function emitToConversation(conversationId: string, event: string, data: any) {
  if (!io) return;
  io.to(`conversation:${conversationId}`).emit(event, data);
}

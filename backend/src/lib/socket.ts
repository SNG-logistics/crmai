import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { verifyAuthToken } from '../middleware/auth';
import prisma from './prisma';
import { canAccessCompany, getUserCompanyIds } from './company-scope';

let io: SocketServer;

type CompanyScope = string[] | null;
type JoinAck = (result: { ok: boolean; error?: string }) => void;

const tenantRoom = (tenantId: string) => `tenant:${tenantId}`;
const unrestrictedTenantRoom = (tenantId: string) => `tenant:${tenantId}:unrestricted`;
const companyRoom = (tenantId: string, companyId: string) => `tenant:${tenantId}:company:${companyId}`;
const companyLookupInFlight = new Map<string, Promise<string | null>>();

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
      const allowedCompanyIds = await getUserCompanyIds(result.user.id);
      (socket as any).user = result.user;
      socket.data.allowedCompanyIds = allowedCompanyIds;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    const allowedCompanyIds = socket.data.allowedCompanyIds as CompanyScope;
    console.log(`🔌 Socket connected: ${user?.username} (tenant: ${user?.tenantId})`);

    // Every user receives explicitly tenant-wide operational events. Sensitive
    // company data is emitted separately to the unrestricted/company rooms.
    socket.join(tenantRoom(user.tenantId));
    if (allowedCompanyIds === null) {
      socket.join(unrestrictedTenantRoom(user.tenantId));
    } else {
      for (const companyId of allowedCompanyIds) {
        socket.join(companyRoom(user.tenantId, companyId));
      }
    }

    // Track which conversation this socket is viewing
    let currentConvId: string | null = null;
    let joinAttempt = 0;

    // ─── Join/Leave conversation room ─────────────────────────────────────────
    const leaveConversationRoom = (conversationId: string) => {
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
    };

    socket.on('join:conversation', async (rawConversationId: unknown, rawAck?: unknown) => {
      const ack = typeof rawAck === 'function' ? rawAck as JoinAck : undefined;
      const attempt = ++joinAttempt;
      if (typeof rawConversationId !== 'string' || !rawConversationId || rawConversationId.length > 128) {
        ack?.({ ok: false, error: 'Conversation access denied' });
        return;
      }
      const conversationId = rawConversationId;

      try {
        const conversation = await prisma.conversation.findFirst({
          where: { id: conversationId, tenantId: user.tenantId },
          select: { companyId: true },
        });

        // A slower, older lookup must never override a newer room selection.
        if (attempt !== joinAttempt) return;
        if (!conversation || !canAccessCompany(allowedCompanyIds, conversation.companyId)) {
          socket.emit('conversation_access_denied', { conversationId });
          ack?.({ ok: false, error: 'Conversation access denied' });
          return;
        }

        if (currentConvId === conversationId) {
          socket.emit('conversation_viewers', {
            conversationId,
            viewers: getPresenceInConv(conversationId),
          });
          ack?.({ ok: true });
          return;
        }

        // Do not leave the current authorized room until the new target passes
        // both tenant and company checks.
        if (currentConvId) leaveConversationRoom(currentConvId);

        socket.join(`conversation:${conversationId}`);
        currentConvId = conversationId;
        if (!convPresence.has(conversationId)) convPresence.set(conversationId, new Map());
        convPresence.get(conversationId)!.set(socket.id, {
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
        });

        socket.to(`conversation:${conversationId}`).emit('admin_enter', {
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          conversationId,
          viewers: getPresenceInConv(conversationId),
        });
        socket.emit('conversation_viewers', {
          conversationId,
          viewers: getPresenceInConv(conversationId),
        });
        ack?.({ ok: true });
      } catch {
        if (attempt !== joinAttempt) return;
        ack?.({ ok: false, error: 'Conversation access denied' });
      }
    });

    socket.on('leave:conversation', (conversationId: unknown, rawAck?: unknown) => {
      const ack = typeof rawAck === 'function' ? rawAck as JoinAck : undefined;
      if (typeof conversationId !== 'string' || conversationId !== currentConvId) {
        ack?.({ ok: false, error: 'Conversation access denied' });
        return;
      }
      ++joinAttempt;
      leaveConversationRoom(conversationId);
      ack?.({ ok: true });
    });

    // ─── Typing indicator ────────────────────────────────────────────────────
    socket.on('typing', (data: { conversationId?: unknown } | null) => {
      const conversationId = data?.conversationId;
      if (typeof conversationId !== 'string' || conversationId !== currentConvId) return;
      socket.to(`conversation:${conversationId}`).emit('admin_typing', {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        conversationId,
      });
    });

    // ─── Disconnect: clean up presence ───────────────────────────────────────
    socket.on('disconnect', () => {
      ++joinAttempt;
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

/** Force active sockets to re-authenticate after user/company permission changes. */
export function disconnectUserSockets(userId: string) {
  if (!io) return;
  for (const socket of io.sockets.sockets.values()) {
    // Closing the transport forces a fresh authenticated connection while
    // preserving Socket.IO's normal auto-reconnect behavior (including clients
    // that still have the previous frontend bundle open).
    if ((socket as any).user?.id === userId) socket.conn.close();
  }
}

function explicitCompanyId(data: any): string | null | undefined {
  const sources = [data, data?.conversation, data?.record];
  for (const source of sources) {
    if (!source || !Object.prototype.hasOwnProperty.call(source, 'companyId')) continue;
    return typeof source.companyId === 'string' && source.companyId
      ? source.companyId
      : null;
  }
  return undefined;
}

function eventConversationId(event: string, data: any): string | undefined {
  if (typeof data?.conversationId === 'string' && data.conversationId) {
    return data.conversationId;
  }
  // Several existing conversation_updated producers send the conversation as
  // { id } rather than { conversationId }. Keep those call sites compatible.
  if (event === 'conversation_updated' && typeof data?.id === 'string' && data.id) {
    return data.id;
  }
  return undefined;
}

function resolveConversationCompanyId(tenantId: string, conversationId: string): Promise<string | null> {
  const key = `${tenantId}:${conversationId}`;
  const existing = companyLookupInFlight.get(key);
  if (existing) return existing;

  const lookup = prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { companyId: true },
  }).then(conversation => conversation?.companyId || null)
    .catch(error => {
      console.error('[Socket] Failed to resolve company scope:', error?.message || error);
      return null;
    });
  companyLookupInFlight.set(key, lookup);
  void lookup.finally(() => {
    if (companyLookupInFlight.get(key) === lookup) companyLookupInFlight.delete(key);
  });
  return lookup;
}

/**
 * Emit to unrestricted tenant users immediately, then to the one matching
 * company room when the payload carries a companyId or a tenant-owned
 * conversationId can resolve it. Restricted users receive nothing when scope
 * cannot be proven.
 */
export function emitToTenant(tenantId: string, event: string, data: any) {
  if (!io) return;

  const explicit = explicitCompanyId(data);
  if (explicit !== undefined) {
    io.to(unrestrictedTenantRoom(tenantId)).emit(event, data);
    if (explicit) io.to(companyRoom(tenantId, explicit)).emit(event, data);
    return;
  }

  const conversationId = eventConversationId(event, data);
  if (!conversationId) {
    // These events are intentionally tenant-wide and do not carry customer or
    // conversation payloads. Unknown unscoped events remain unrestricted.
    if (event === 'agent_status_change') {
      io.to(tenantRoom(tenantId)).emit(event, data);
    } else {
      io.to(unrestrictedTenantRoom(tenantId)).emit(event, data);
    }
    return;
  }

  // Reuse an in-flight lookup for rapid customer/bot events in the same room.
  // Promise handlers run in registration order, preserving socket event order
  // for company-restricted agents without widening their access.
  io.to(unrestrictedTenantRoom(tenantId)).emit(event, data);
  void resolveConversationCompanyId(tenantId, conversationId).then(companyId => {
    if (companyId && io) {
      io.to(companyRoom(tenantId, companyId)).emit(event, data);
    }
  });
}

/** Emit to specific conversation room */
export function emitToConversation(conversationId: string, event: string, data: any) {
  if (!io) return;
  io.to(`conversation:${conversationId}`).emit(event, data);
}

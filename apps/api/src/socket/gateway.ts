import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config/env';
import { verifyJwt } from '../modules/auth/auth.service';
import { validateSender } from '../modules/messages/messages.service';
import { getAllowedCorsOrigins } from '../config/cors';
import { isAdminWallet } from '../middleware/admin.middleware';
import type { AdminActivityEvent } from '../modules/analytics/analytics.types';

let io: Server | null = null;
const PUBLIC_ACTIVITY_ROOM = 'public:activity';
const ADMIN_ACTIVITY_ROOM = 'admin:activity';

function emitPublicActivityUpdate(onChainId: number, type = 'DealUpdated'): void {
  if (!io) return;

  io.to(PUBLIC_ACTIVITY_ROOM).emit('public:activity:update', {
    onChainId,
    type,
    timestamp: new Date().toISOString(),
  });
}

function getPublicEventType(payload: unknown): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'type' in payload &&
    typeof (payload as { type?: unknown }).type === 'string'
  ) {
    return (payload as { type: string }).type;
  }

  return 'DealUpdated';
}

export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: getAllowedCorsOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use((socket, next) => {
    const rawToken = socket.handshake.auth?.token;
    const token = typeof rawToken === 'string'
      ? rawToken.replace(/^Bearer\s+/i, '').trim()
      : '';

    if (!token) {
      next(new Error('Unauthorized socket'));
      return;
    }

    const payload = verifyJwt(token);
    if (!payload?.wallet) {
      next(new Error('Unauthorized socket'));
      return;
    }

    socket.data.wallet = payload.wallet.toLowerCase();
    next();
  });

  io.on('connection', (socket: Socket) => {
    const wallet = typeof socket.data.wallet === 'string'
      ? socket.data.wallet.toLowerCase()
      : '';

    if (wallet) {
      socket.join(`user:${wallet}`);
      if (isAdminWallet(wallet)) {
        socket.join(ADMIN_ACTIVITY_ROOM);
      }
    }

    socket.on('join-deal', async ({ onChainId }: { onChainId: number }) => {
      const numericOnChainId = Number(onChainId);
      if (!Number.isInteger(numericOnChainId) || numericOnChainId <= 0 || !wallet) {
        socket.emit('deal-room:error', {
          onChainId,
          error: 'Invalid deal room',
        });
        return;
      }

      const access = await validateSender(numericOnChainId, wallet);
      if (!access.allowed || !access.canRead) {
        socket.emit('deal-room:error', {
          onChainId: numericOnChainId,
          error: 'Not authorized for this deal room',
        });
        return;
      }

      const room = `deal:${onChainId}`;
      socket.join(room);
    });

    socket.on('leave-deal', ({ onChainId }: { onChainId: number }) => {
      const room = `deal:${onChainId}`;
      socket.leave(room);
    });

    socket.on('join-user', () => {
      if (wallet) {
        socket.join(`user:${wallet}`);
      }
    });

    socket.on('join-public-activity', () => {
      socket.join(PUBLIC_ACTIVITY_ROOM);
    });

    socket.on('leave-public-activity', () => {
      socket.leave(PUBLIC_ACTIVITY_ROOM);
    });

    socket.on('join-admin-activity', () => {
      if (isAdminWallet(wallet)) {
        socket.join(ADMIN_ACTIVITY_ROOM);
      } else {
        socket.emit('admin:error', { error: 'Admin wallet required' });
      }
    });

    socket.on('leave-admin-activity', () => {
      socket.leave(ADMIN_ACTIVITY_ROOM);
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

export function getSocketIO(): Server | null {
  return io;
}

export function emitDealUpdate(onChainId: number, payload: unknown): void {
  if (!io) {
    console.warn('Socket.IO not initialized');
    return;
  }

  const room = `deal:${onChainId}`;
  io.to(room).emit('deal-updated', payload);
  emitPublicActivityUpdate(onChainId, getPublicEventType(payload));
}

export function emitDealMessage(onChainId: number, message: unknown): void {
  if (!io) {
    console.warn('[Socket] IO not initialized');
    return;
  }

  const room = `deal:${onChainId}`;
  io.to(room).emit('message:new', { onChainId, message });
  io.to(room).emit('deal-updated', {
    type: 'MessageCreated',
    onChainId,
  });
}

export function emitDealMessageUpdated(onChainId: number, message: unknown): void {
  if (!io) {
    console.warn('[Socket] IO not initialized');
    return;
  }

  const room = `deal:${onChainId}`;
  io.to(room).emit('message:updated', { onChainId, message });
}

export function emitDealMessageRead(onChainId: number, walletAddress: string): void {
  if (!io) {
    console.warn('[Socket] IO not initialized');
    return;
  }

  const wallet = walletAddress.toLowerCase();
  io.to(`user:${wallet}`).emit('messages:unread-updated', { onChainId });
  io.to(`deal:${onChainId}`).emit('message:read', { onChainId, walletAddress: wallet });
}

export function emitDealUpdateToUsers(
  onChainId: number,
  partyA: string,
  partyB: string,
  payload: unknown
): void {
  if (!io) {
    console.warn('[Socket] IO not initialized');
    return;
  }

  const room = `deal:${onChainId}`;
  io.to(room).emit('deal-updated', payload);
  io.to(`user:${partyA.toLowerCase()}`).emit('deal:update', payload);
  io.to(`user:${partyB.toLowerCase()}`).emit('deal:update', payload);
  emitPublicActivityUpdate(onChainId, getPublicEventType(payload));
}

export function emitToUser(walletAddress: string, event: string, data: unknown): void {
  if (!io) {
    console.warn('[Socket] IO not initialized');
    return;
  }
  io.to(`user:${walletAddress.toLowerCase()}`).emit(event, data);
}

export function emitAdminActivity(activity: AdminActivityEvent): void {
  if (!io) {
    return;
  }

  io.to(ADMIN_ACTIVITY_ROOM).emit('admin:activity', activity);
}

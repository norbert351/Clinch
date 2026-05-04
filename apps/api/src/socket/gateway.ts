import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config/env';

let io: Server | null = null;

export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: config.cors.origin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket: Socket) => {
    socket.on('join-deal', ({ onChainId }: { onChainId: number }) => {
      const room = `deal:${onChainId}`;
      socket.join(room);
    });

    socket.on('leave-deal', ({ onChainId }: { onChainId: number }) => {
      const room = `deal:${onChainId}`;
      socket.leave(room);
    });

    socket.on('join-user', ({ address }: { address: string }) => {
      if (address) {
        const room = `user:${address.toLowerCase()}`;
        socket.join(room);
      }
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
}

export function emitToUser(walletAddress: string, event: string, data: unknown): void {
  if (!io) {
    console.warn('[Socket] IO not initialized');
    return;
  }
  io.to(`user:${walletAddress.toLowerCase()}`).emit(event, data);
}

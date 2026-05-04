import 'dotenv/config';
import http from 'http';
import app from './app';
import { config } from './config/env';
import { initializeSocket } from './socket/gateway';
import { startListener } from './blockchain/listener';

const server = http.createServer(app);

initializeSocket(server);

async function main(): Promise<void> {
  try {
    await startListener();
    console.log('✅ Blockchain event listener started');
  } catch (err) {
    console.error('❌ Failed to start blockchain listener:', err);
  }

  server.listen(config.server.port, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🏦 Clinch API Server                                ║
║                                                       ║
║   Server running on http://localhost:${config.server.port}             ║
║   WebSocket ready for connections                     ║
║                                                       ║
║   Endpoints:                                          ║
║   - GET  /api/health                                  ║
║   - GET  /api/auth/nonce                              ║
║   - POST /api/auth/verify                             ║
║   - GET  /api/users/me                                ║
║   - GET  /api/deals                                   ║
║   - GET  /api/deals/:onChainId                        ║
║   - POST /api/disputes/:onChainId/raise               ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
    `);
  });
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

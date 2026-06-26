import type { CorsOptions } from 'cors';
import { config } from './env';

const configuredOrigins = [
  ...config.cors.origins,
  ...(process.env.NODE_ENV === 'development'
    ? ['http://localhost:3002']
    : []),
];

const allowedOrigins = Array.from(new Set(configuredOrigins));

function isAllowedOrigin(origin: string): boolean {
  const normalizedOrigin = origin.replace(/\/$/, '');
  return allowedOrigins.some((allowed) => {
    const normalizedAllowed = allowed.replace(/\/$/, '');
    return normalizedOrigin === normalizedAllowed;
  });
}

export function getAllowedCorsOrigins(): string[] {
  return [...allowedOrigins];
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, health checks, curl)
    if (!origin) return callback(null, true);

    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    console.warn('[CORS] Blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Circle-Key-Id', 'X-Circle-Signature'],
  exposedHeaders: ['Authorization'],
};

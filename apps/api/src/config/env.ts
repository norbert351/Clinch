import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DYNAMIC_ENVIRONMENT_ID: z.string().uuid().optional(),
  RPC_URL: z.string().url().optional(),
  RPC_URLS: z.string().optional(),
  WS_RPC_URL: z.string().url().optional(),
  WS_RPC_URLS: z.string().optional(),
  CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  ADMIN_WALLET: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  JWT_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  FRONTEND_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;

export const config = {
  database: {
    url: env.DATABASE_URL,
  },
  blockchain: {
    rpcUrl: env.RPC_URL || env.RPC_URLS?.split(',')[0] || 'https://rpc.testnet.arc.network',
    wsRpcUrl: env.WS_RPC_URL || env.WS_RPC_URLS?.split(',')[0] || 'wss://rpc.testnet.arc.network',
    contractAddress: env.CONTRACT_ADDRESS,
  },
  auth: {
    jwtSecret: env.JWT_SECRET,
    expiresIn: '7d',
  },
  dynamic: {
    environmentId: env.DYNAMIC_ENVIRONMENT_ID,
  },
  admin: {
    wallet: env.ADMIN_WALLET,
    arbitrator: process.env.PLATFORM_ARBITRATOR || '0xdd4c983Cd57Ee7A6F8Ef0BbB8715B19bdF5C1b61',
  },
  email: {
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM_EMAIL,
  },
  cors: {
    origin: env.FRONTEND_URL,
  },
  server: {
    port: env.PORT,
  },
  fees: {
    platformFee: 25,
  },
} as const;

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
  CIRCLE_API_KEY: z.string().optional(),
  CIRCLE_ENTITY_SECRET: z.string().optional(),
  CIRCLE_WALLET_SET_ID: z.string().optional(),
  CIRCLE_DEVELOPER_WALLET_ID: z.string().optional(),
  CIRCLE_WEBHOOK_SECRET: z.string().optional(),
  CIRCLE_ENVIRONMENT: z.enum(['testnet', 'mainnet']).default('testnet'),
  GATEWAY_WALLET_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  GATEWAY_MINTER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  X402_SELLER_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default('0xBd1e427b1177f82C4255eB24172895A2a17eD686'),
  X402_FACILITATOR_URL: z.string().url().default('https://gateway-api-testnet.circle.com'),
  X402_NETWORK: z.string().regex(/^eip155:\d+$/).default('eip155:5042002'),
  X402_ENABLED: z.string().default('false'),
  CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  ADMIN_WALLET: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  PLATFORM_ARBITRATOR: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  JWT_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  OPENROUTER_API_KEY: z.string().optional(),
  APP_URL: z.string().url().default('http://localhost:3002'),
  FRONTEND_URL: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  ADMIN_WALLETS: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});

const parsed = envSchema
  .refine((value) => Boolean(value.ADMIN_WALLET || value.ADMIN_WALLETS), {
    message: 'ADMIN_WALLETS or ADMIN_WALLET is required',
    path: ['ADMIN_WALLETS'],
  })
  .safeParse(process.env);

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
  circle: {
    apiKey: env.CIRCLE_API_KEY || '',
    entitySecret: env.CIRCLE_ENTITY_SECRET || '',
    walletSetId: env.CIRCLE_WALLET_SET_ID || '',
    developerWalletId: env.CIRCLE_DEVELOPER_WALLET_ID || '',
    webhookSecret: env.CIRCLE_WEBHOOK_SECRET || '',
    environment: env.CIRCLE_ENVIRONMENT,
    gatewayWalletAddress:
      env.GATEWAY_WALLET_ADDRESS || '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
    gatewayMinterAddress:
      env.GATEWAY_MINTER_ADDRESS || '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B',
  },
  x402: {
    enabled: env.X402_ENABLED === 'true',
    sellerAddress: env.X402_SELLER_ADDRESS,
    facilitatorUrl: env.X402_FACILITATOR_URL,
    network: env.X402_NETWORK,
  },
  auth: {
    jwtSecret: env.JWT_SECRET,
    expiresIn: '7d',
  },
  dynamic: {
    environmentId: env.DYNAMIC_ENVIRONMENT_ID,
  },
  admin: {
    wallet: (env.ADMIN_WALLET || env.ADMIN_WALLETS?.split(',')[0] || '').trim().toLowerCase(),
    wallets: (env.ADMIN_WALLETS || env.ADMIN_WALLET || '')
      .split(',')
      .map((wallet) => wallet.trim().toLowerCase())
      .filter(Boolean),
    arbitrator: env.PLATFORM_ARBITRATOR || '',
  },
  openrouter: {
    apiKey: env.OPENROUTER_API_KEY || '',
  },
  email: {
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM_EMAIL,
  },
  cors: {
    origins: (env.ALLOWED_ORIGINS || env.FRONTEND_URL || env.APP_URL)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  app: {
    url: env.APP_URL,
  },
  server: {
    port: env.PORT,
  },
  fees: {
    platformFee: 25,
  },
} as const;

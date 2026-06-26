import { db } from '../../config/db';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { SiweMessage } from 'siwe';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { config } from '../../config/env';
import { User } from '../../db/schema';

export interface JwtPayload {
  wallet: string;
}

export interface UpsertUserResult {
  user: User;
  created: boolean;
}

const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

const NONCE_EXPIRY_MS = 5 * 60 * 1000;

export function generateNonce(address: string): string {
  const nonce = Array.from({ length: 16 }, () => Math.random().toString(36).charAt(2)).join('');
  nonceStore.set(address.toLowerCase(), { nonce, expiresAt: Date.now() + NONCE_EXPIRY_MS });
  return nonce;
}

export function getNonce(address: string): string | undefined {
  const stored = nonceStore.get(address.toLowerCase());
  if (!stored) return undefined;
  if (Date.now() > stored.expiresAt) {
    nonceStore.delete(address.toLowerCase());
    return undefined;
  }
  return stored.nonce;
}

export function deleteNonce(address: string): void {
  nonceStore.delete(address.toLowerCase());
}

export async function verifySiwe(
  message: string,
  signature: string
): Promise<{ address: string } | null> {
  try {
    const siweMessage = new SiweMessage(message);
    const { data: fields, success, error } = await siweMessage.verify({
      signature,
    });

    if (!success || !fields) {
      console.warn('SIWE verification failed');
      return null;
    }

    return { address: fields.address };
  } catch (err) {
    console.warn('SIWE verification error');
    return null;
  }
}

export async function upsertUser(walletAddress: string): Promise<UpsertUserResult> {
  const lowerAddress = walletAddress.toLowerCase();
  
  const existing = await db.query.users.findFirst({
    where: eq(users.walletAddress, lowerAddress),
  });

  if (existing) {
    return { user: existing, created: false };
  }

  const [newUser] = await db
    .insert(users)
    .values({ walletAddress: lowerAddress })
    .returning();

  return { user: newUser, created: true };
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign({ wallet: payload.wallet.toLowerCase() }, config.auth.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.auth.expiresIn,
  });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret, {
      algorithms: ['HS256'],
    }) as JwtPayload;

    if (!payload.wallet) {
      return null;
    }

    return { wallet: payload.wallet.toLowerCase() };
  } catch {
    return null;
  }
}

let _jwksClient: ReturnType<typeof jwksClient> | null = null;

function getJwksClient(): ReturnType<typeof jwksClient> {
  if (!_jwksClient) {
    const envId = config.dynamic.environmentId;
    if (!envId) throw new Error('DYNAMIC_ENVIRONMENT_ID not configured');
    _jwksClient = jwksClient({
      jwksUri: `https://app.dynamic.xyz/api/v0/sdk/${envId}/.well-known/jwks`,
      cache: true,
      cacheMaxAge: 600_000,
    });
  }
  return _jwksClient;
}

export async function verifyDynamicJWT(token: string): Promise<{
  sub: string;
  verified_credentials: Array<{ address: string; chain: string; format: string }>;
  environment_id: string;
}> {
  if (!config.dynamic.environmentId) {
    throw new Error('DYNAMIC_ENVIRONMENT_ID not configured on server');
  }

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      (header, callback) => {
        getJwksClient().getSigningKey(header.kid, (err, key) => {
          if (err) return callback(err);
          callback(null, key?.getPublicKey());
        });
      },
      { algorithms: ['RS256'] },
      (err, decoded) => {
        if (err) reject(new Error('Invalid Dynamic JWT: ' + err.message));
        else resolve(decoded as any);
      },
    );
  });
}

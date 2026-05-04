import { db } from '../../config/db';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { SiweMessage } from 'siwe';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { User } from '../../db/schema';

export interface JwtPayload {
  wallet: string;
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
      console.error('SIWE verification failed:', error);
      return null;
    }

    return { address: fields.address };
  } catch (err) {
    console.error('SIWE verification error:', err);
    return null;
  }
}

export async function upsertUser(walletAddress: string): Promise<User> {
  const lowerAddress = walletAddress.toLowerCase();
  
  const existing = await db.query.users.findFirst({
    where: eq(users.walletAddress, lowerAddress),
  });

  if (existing) {
    return existing;
  }

  const [newUser] = await db
    .insert(users)
    .values({ walletAddress: lowerAddress })
    .returning();

  return newUser;
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.expiresIn,
  });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}

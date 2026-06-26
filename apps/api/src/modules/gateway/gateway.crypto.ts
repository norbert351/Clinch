import { publicEncrypt, createPublicKey, randomBytes } from 'crypto';
import { CIRCLE_API_KEY, CIRCLE_API_URL, CIRCLE_ENTITY_SECRET } from './gateway.config';

interface CirclePublicKeyResponse {
  data?: {
    publicKey: string;
  };
  publicKey?: string;
}

const publicKeyCache = new Map<string, { publicKey: string; expiresAt: number }>();

export async function fetchCirclePublicKey(): Promise<string> {
  const cached = publicKeyCache.get('entity');
  if (cached && cached.expiresAt > Date.now()) {
    return cached.publicKey;
  }

  if (!CIRCLE_API_KEY) {
    throw new Error('CIRCLE_API_KEY is required to fetch Circle public key');
  }

  const response = await fetch(`${CIRCLE_API_URL}/v1/config/entity/publicKey`, {
    headers: {
      Authorization: `Bearer ${CIRCLE_API_KEY}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Circle public key fetch failed: ${response.status} ${detail}`);
  }

  const json = (await response.json()) as CirclePublicKeyResponse;
  const publicKey = json.data?.publicKey || json.publicKey;
  if (!publicKey) {
    throw new Error('Circle public key response missing publicKey');
  }

  publicKeyCache.set('entity', {
    publicKey,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });

  return publicKey;
}

export function encryptEntitySecret(
  publicKeyPem: string,
  entitySecretHex: string,
): string {
  const keyObject = createPublicKey({
    key: Buffer.from(publicKeyPem, 'utf8'),
    format: 'pem',
    type: 'spki',
  });

  const entitySecretBytes = Buffer.from(entitySecretHex, 'hex');
  const ciphertext = publicEncrypt(
    {
      key: keyObject,
      oaepHash: 'sha256',
      padding: 4,
    },
    entitySecretBytes,
  );

  return ciphertext.toString('base64');
}

export async function createEntitySecretCiphertext(): Promise<string> {
  if (!CIRCLE_ENTITY_SECRET) {
    throw new Error('CIRCLE_ENTITY_SECRET is not configured');
  }

  const publicKey = await fetchCirclePublicKey();
  return encryptEntitySecret(publicKey, CIRCLE_ENTITY_SECRET);
}

export function generateIdempotencyKey(): string {
  const bytes = randomBytes(32);
  return bytes.toString('hex');
}

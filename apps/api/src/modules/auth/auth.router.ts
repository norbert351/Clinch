import { Request, Response, NextFunction } from 'express';
import {
  generateNonce,
  getNonce,
  deleteNonce,
  verifySiwe,
  upsertUser,
  signJwt,
} from './auth.service';
import { successResponse, errorResponse } from '../../middleware/error.middleware';
import { SiweMessage } from 'siwe';

export async function getNonceHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { address } = req.query;

    if (!address || typeof address !== 'string') {
      res.status(400).json(errorResponse('Address query parameter is required'));
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json(errorResponse('Invalid Ethereum address'));
      return;
    }

    const nonce = generateNonce(address);
    console.log('[Auth] Nonce generated for', address, ':', nonce);
    res.json(successResponse({ nonce }));
  } catch (err) {
    next(err);
  }
}

export async function verifyHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { message, signature } = req.body as { message: string; signature: string };

    if (!message || !signature) {
      res.status(400).json(errorResponse('Message and signature are required'));
      return;
    }

    const siwe = new SiweMessage(message);
    console.log('[Auth] SIWE verify - address:', siwe.address, 'nonce:', siwe.nonce, 'domain:', siwe.domain);

    const { data: fields, success, error } = await siwe.verify({
      signature,
      domain: siwe.domain,
      nonce: siwe.nonce,
    });

    if (!success || !fields) {
      console.error('[Auth] SIWE verification failed:', error);
      res.status(401).json(errorResponse('SIWE verification failed'));
      return;
    }

    const address = fields.address.toLowerCase();
    const storedNonce = getNonce(address);
    console.log('[Auth] Stored nonce for', address, ':', storedNonce, '| Message nonce:', fields.nonce);

    if (!storedNonce) {
      console.error('[Auth] Nonce not found for', address);
      res.status(401).json(errorResponse('Nonce not found. Please request a new nonce.'));
      return;
    }

    if (fields.nonce !== storedNonce) {
      console.error('[Auth] Nonce mismatch for', address, '- stored:', storedNonce, '| received:', fields.nonce);
      res.status(401).json(errorResponse('Invalid nonce'));
      return;
    }

    deleteNonce(address);
    console.log('[Auth] Nonce validated and deleted for', address);

    const user = await upsertUser(address);
    console.log('[Auth] User upserted:', user.walletAddress);

    const token = signJwt({ wallet: user.walletAddress });
    console.log('[Auth] JWT signed for', user.walletAddress);

    res.json(successResponse({
      token,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        email: user.email,
      },
    }));
  } catch (err) {
    console.error('[Auth] Verify handler error:', err);
    next(err);
  }
}

export function logoutHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    res.json(successResponse({ message: 'Logged out successfully' }));
  } catch (err) {
    next(err);
  }
}

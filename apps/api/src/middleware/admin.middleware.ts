import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config/env';
import { errorResponse } from './error.middleware';
import { validateAddress } from './validate';

const adminWallets = new Set(
  config.admin.wallets
    .map((wallet) => {
      try {
        return validateAddress(wallet);
      } catch {
        return '';
      }
    })
    .filter(Boolean),
);

export const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 80,
  standardHeaders: true,
  legacyHeaders: false,
});

export function isAdminWallet(walletAddress: string | null | undefined): boolean {
  if (!walletAddress) return false;

  try {
    return adminWallets.has(validateAddress(walletAddress));
  } catch {
    return false;
  }
}

export function adminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const wallet = req.wallet;

  if (!wallet) {
    res.status(401).json(errorResponse('Wallet authentication required'));
    return;
  }

  if (!isAdminWallet(wallet)) {
    res.status(403).json(errorResponse('Admin wallet required'));
    return;
  }

  next();
}

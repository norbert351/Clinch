import { Request, Response, NextFunction } from 'express';
import { successResponse, errorResponse } from '../../middleware/error.middleware';
import { jwtMiddleware } from '../auth/jwt.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import {
  getOrCreateAgentWallet,
  getAgentWalletBalance,
  getAgentMetrics,
  findStaleDeals,
  generateAgentServiceManifest,
} from './agent.service';

export async function getAgentWalletHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallet = await getOrCreateAgentWallet();
    res.json(successResponse({
      walletId: wallet.walletId,
      address: wallet.walletAddress,
      balance: wallet.balance,
    }));
  } catch (err) {
    next(err);
  }
}

export async function getAgentBalanceHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const balance = await getAgentWalletBalance();
    res.json(successResponse({ balance }));
  } catch (err) {
    next(err);
  }
}

export async function getAgentMetricsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const metrics = await getAgentMetrics();
    res.json(successResponse(metrics));
  } catch (err) {
    next(err);
  }
}

export async function getStaleDealsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stale = await findStaleDeals();
    res.json(successResponse(stale));
  } catch (err) {
    next(err);
  }
}

export async function getServiceManifestHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const manifest = await generateAgentServiceManifest();
    res.json(successResponse(manifest));
  } catch (err) {
    next(err);
  }
}

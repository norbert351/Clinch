import { Request, Response, NextFunction } from 'express';
import {
  getUserDashboardStats,
  getGlobalDashboardStats,
} from './dashboard.service';
import { successResponse, errorResponse } from '../../middleware/error.middleware';
import { validateAddress } from '../../middleware/validate';

export async function getUserDashboardHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const address = req.wallet ? validateAddress(req.wallet) : null;
    
    if (!address) {
      res.status(401).json(errorResponse('Wallet authentication required'));
      return;
    }

    const stats = await getUserDashboardStats(address);
    res.json(successResponse(stats));
  } catch (err) {
    next(err);
  }
}

export async function getGlobalDashboardHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getGlobalDashboardStats();
    res.json(successResponse(stats));
  } catch (err) {
    next(err);
  }
}

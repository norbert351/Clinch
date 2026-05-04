import { Request, Response, NextFunction } from 'express';
import {
  getUserDashboardStats,
  getGlobalDashboardStats,
} from './dashboard.service';
import { successResponse, errorResponse } from '../../middleware/error.middleware';

export async function getUserDashboardHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const address = (req.query.address as string) || req.wallet;
    
    if (!address) {
      res.status(400).json(errorResponse('Address is required'));
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
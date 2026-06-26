import { Request, Response, NextFunction } from 'express';
import { successResponse, errorResponse } from '../../middleware/error.middleware';
import { getPublicActivity, getPublicMetrics } from './public.service';

export async function getPublicMetricsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const metrics = await getPublicMetrics();
    res.json(successResponse(metrics));
  } catch (err) {
    next(err);
  }
}

export async function getPublicActivityHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    if (!Number.isFinite(limit)) {
      res.status(400).json(errorResponse('Invalid limit'));
      return;
    }

    const items = await getPublicActivity(limit);
    res.json(successResponse({ items }));
  } catch (err) {
    next(err);
  }
}

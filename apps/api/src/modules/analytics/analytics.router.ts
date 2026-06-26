import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { errorResponse, successResponse } from '../../middleware/error.middleware';
import { validateAddress } from '../../middleware/validate';
import {
  generateAnalyticsSnapshot,
  getAdminActivity,
  getAdminAnalyticsOverview,
  getAnalyticsSnapshots,
  getUserAnalytics,
  logInviteAccepted,
} from './analytics.service';

const rangeQuerySchema = z.object({
  rangeDays: z.coerce.number().int().min(7).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const inviteAcceptedSchema = z.object({
  onChainId: z.coerce.number().int().positive(),
  inviteToken: z.string().min(1).max(128).optional(),
});

export async function getMyAnalyticsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallet = req.wallet ? validateAddress(req.wallet) : null;

    if (!wallet) {
      res.status(401).json(errorResponse('Wallet authentication required'));
      return;
    }

    const stats = await getUserAnalytics(wallet);
    res.json(successResponse(stats));
  } catch (err) {
    next(err);
  }
}

export async function recordInviteAcceptedHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallet = req.wallet ? validateAddress(req.wallet) : null;
    if (!wallet) {
      res.status(401).json(errorResponse('Wallet authentication required'));
      return;
    }

    const parsed = inviteAcceptedSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorResponse('Invalid invite acceptance payload'));
      return;
    }

    const event = await logInviteAccepted({
      walletAddress: wallet,
      onChainId: parsed.data.onChainId,
      inviteToken: parsed.data.inviteToken,
    });

    res.json(successResponse(event));
  } catch (err) {
    next(err);
  }
}

export async function getAdminOverviewHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = rangeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json(errorResponse('Invalid analytics query'));
      return;
    }

    const overview = await getAdminAnalyticsOverview(parsed.data);
    res.json(successResponse(overview));
  } catch (err) {
    next(err);
  }
}

export async function getAdminActivityHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = activityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json(errorResponse('Invalid activity query'));
      return;
    }

    const activity = await getAdminActivity(parsed.data.limit);
    res.json(successResponse({ items: activity }));
  } catch (err) {
    next(err);
  }
}

export async function createAdminSnapshotHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const snapshot = await generateAnalyticsSnapshot();
    res.status(201).json(successResponse(snapshot));
  } catch (err) {
    next(err);
  }
}

export async function getAdminSnapshotsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = activityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json(errorResponse('Invalid snapshots query'));
      return;
    }

    const snapshots = await getAnalyticsSnapshots(parsed.data.limit);
    res.json(successResponse({ items: snapshots }));
  } catch (err) {
    next(err);
  }
}

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  getUserByAddress,
  updateUser,
  getUserDeals,
} from './users.service';
import { successResponse, errorResponse } from '../../middleware/error.middleware';
import { validateAddress } from '../../middleware/validate';

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(100).optional(),
  emailNotifications: z.boolean().optional(),
});

export async function getMeHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const wallet = req.wallet!;
    const user = await getUserByAddress(wallet);

    if (!user) {
      res.status(404).json(errorResponse('User not found'));
      return;
    }

    res.json(successResponse({
      id: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      displayName: user.displayName,
      emailNotifications: user.emailNotifications,
      createdAt: user.createdAt,
    }));
  } catch (err) {
    next(err);
  }
}

export async function updateMeHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const wallet = req.wallet!;
    const parsed = updateUserSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json(errorResponse(parsed.error.message));
      return;
    }

    const user = await updateUser(wallet, parsed.data);

    if (!user) {
      res.status(404).json(errorResponse('User not found'));
      return;
    }

    res.json(successResponse({
      id: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      displayName: user.displayName,
      emailNotifications: user.emailNotifications,
      createdAt: user.createdAt,
    }));
  } catch (err) {
    next(err);
  }
}

export async function getUserDealsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { address } = req.params;
    const addressStr = Array.isArray(address) ? address[0] : address;
    const wallet = req.wallet ? validateAddress(req.wallet) : null;
    const requestedAddress = validateAddress(addressStr);

    if (!wallet) {
      res.status(401).json(errorResponse('Wallet authentication required'));
      return;
    }

    if (wallet !== requestedAddress) {
      res.status(403).json(errorResponse('Not authorized to view these deals'));
      return;
    }

    const userDeals = await getUserDeals(requestedAddress);
    res.json(successResponse(userDeals));
  } catch (err) {
    next(err);
  }
}

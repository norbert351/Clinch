import { Router, Request, Response, NextFunction } from 'express';
import { jwtMiddleware } from '../auth/jwt.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import { successResponse, errorResponse } from '../../middleware/error.middleware';
import { getAnalyticsDashboard } from './analytics.service';

const router = Router();

router.get(
  '/analytics',
  jwtMiddleware,
  adminMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[GET /admin/analytics] Requested by:', req.wallet);
      const data = await getAnalyticsDashboard();
      res.json(successResponse(data));
    } catch (err) {
      next(err);
    }
  },
);

export default router;

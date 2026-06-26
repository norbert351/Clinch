import { Router } from 'express';
import { adminMiddleware, adminRateLimiter } from '../../middleware/admin.middleware';
import { jwtMiddleware } from '../auth/jwt.middleware';
import {
  createAdminSnapshotHandler,
  getAdminActivityHandler,
  getAdminOverviewHandler,
  getAdminSnapshotsHandler,
  getMyAnalyticsHandler,
  recordInviteAcceptedHandler,
} from './analytics.router';
import { successResponse } from '../../middleware/error.middleware';

export const adminRouter = Router();

adminRouter.use(jwtMiddleware, adminMiddleware, adminRateLimiter);
adminRouter.get('/me', (_req, res) => {
  res.json(successResponse({ authorized: true }));
});
adminRouter.get('/analytics', getAdminOverviewHandler);
adminRouter.get('/activity', getAdminActivityHandler);
adminRouter.get('/snapshots', getAdminSnapshotsHandler);
adminRouter.post('/snapshots', createAdminSnapshotHandler);

const analyticsRouter = Router();

analyticsRouter.get('/me', jwtMiddleware, getMyAnalyticsHandler);
analyticsRouter.post('/invite-accepted', jwtMiddleware, recordInviteAcceptedHandler);

export default analyticsRouter;

import { Router } from 'express';
import { jwtMiddleware } from '../auth/jwt.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import {
  getAgentWalletHandler,
  getAgentBalanceHandler,
  getAgentMetricsHandler,
  getStaleDealsHandler,
  getServiceManifestHandler,
} from './agent.router';

const router = Router();

// Public endpoints (no auth needed)
router.get('/manifest', getServiceManifestHandler);
router.get('/wallet', getAgentWalletHandler);
router.get('/balance', getAgentBalanceHandler);
router.get('/metrics', getAgentMetricsHandler);

// Admin-only endpoints
router.use(jwtMiddleware);
router.get('/stale', adminMiddleware, getStaleDealsHandler);

export default router;

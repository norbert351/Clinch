import { Router } from 'express';
import { adminMiddleware, adminRateLimiter } from '../../middleware/admin.middleware';
import { jwtMiddleware } from '../auth/jwt.middleware';
import {
  getUserDashboardHandler,
  getGlobalDashboardHandler,
} from './dashboard.router';

const router = Router();

router.get('/me', jwtMiddleware, getUserDashboardHandler);
router.get('/global', jwtMiddleware, adminMiddleware, adminRateLimiter, getGlobalDashboardHandler);

export default router;

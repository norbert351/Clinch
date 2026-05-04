import { Router } from 'express';
import {
  getUserDashboardHandler,
  getGlobalDashboardHandler,
} from './dashboard.router';

const router = Router();

router.get('/me', getUserDashboardHandler);
router.get('/global', getGlobalDashboardHandler);

export default router;
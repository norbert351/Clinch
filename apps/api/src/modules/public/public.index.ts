import { Router } from 'express';
import {
  getPublicActivityHandler,
  getPublicMetricsHandler,
} from './public.router';

const router = Router();

router.get('/metrics', getPublicMetricsHandler);
router.get('/activity', getPublicActivityHandler);

export default router;

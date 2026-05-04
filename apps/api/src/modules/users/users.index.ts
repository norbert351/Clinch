import { Router } from 'express';
import { jwtMiddleware } from '../auth/jwt.middleware';
import {
  getMeHandler,
  updateMeHandler,
  getUserDealsHandler,
} from './users.router';

const router = Router();

router.get('/me', jwtMiddleware, getMeHandler);
router.patch('/me', jwtMiddleware, updateMeHandler);
router.get('/:address/deals', getUserDealsHandler);

export default router;

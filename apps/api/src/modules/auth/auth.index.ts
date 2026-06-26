import { Router } from 'express';
import {
  developmentSessionHandler,
  dynamicAuthHandler,
  getNonceHandler,
  logoutHandler,
  verifyHandler,
} from './auth.router';

const router = Router();

router.get('/nonce', getNonceHandler);
router.post('/verify', verifyHandler);
router.post('/dynamic', dynamicAuthHandler);
router.post('/dev-session', developmentSessionHandler);
router.post('/logout', logoutHandler);

export default router;

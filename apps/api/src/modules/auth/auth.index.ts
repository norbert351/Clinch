import { Router } from 'express';
import { getNonceHandler, verifyHandler, dynamicAuthHandler, logoutHandler } from './auth.router';

const router = Router();

router.get('/nonce', getNonceHandler);
router.post('/verify', verifyHandler);
router.post('/dynamic', dynamicAuthHandler);
router.post('/logout', logoutHandler);

export default router;

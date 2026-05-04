import { Router } from 'express';
import { getNonceHandler, verifyHandler, logoutHandler } from './auth.router';

const router = Router();

router.get('/nonce', getNonceHandler);
router.post('/verify', verifyHandler);
router.post('/logout', logoutHandler);

export default router;

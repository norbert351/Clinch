import { Router } from 'express';
import { jwtMiddleware } from '../auth/jwt.middleware';
import {
  createDepositIntentHandler,
  createTransferIntentHandler,
  getBalanceBreakdownHandler,
  getCompletedTransfersHandler,
  getGatewayChainsHandler,
  getPendingTransfersHandler,
  getUnifiedBalanceHandler,
  markDepositSubmittedHandler,
  markTransferFailedHandler,
  markTransferMintSubmittedHandler,
  submitTransferSignatureHandler,
} from './gateway.router';

const router = Router();

router.use(jwtMiddleware);

router.get('/chains', getGatewayChainsHandler);
router.get('/balance', getUnifiedBalanceHandler);
router.get('/balance/breakdown', getBalanceBreakdownHandler);
router.get('/transfers/pending', getPendingTransfersHandler);
router.get('/transfers/completed', getCompletedTransfersHandler);
router.post('/deposits', createDepositIntentHandler);
router.patch('/deposits/:transferId/submitted', markDepositSubmittedHandler);
router.post('/transfers', createTransferIntentHandler);
router.post('/transfers/:transferId/signature', submitTransferSignatureHandler);
router.patch('/transfers/:transferId/mint-submitted', markTransferMintSubmittedHandler);
router.patch('/transfers/:transferId/fail', markTransferFailedHandler);

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import { jwtMiddleware } from '../auth/jwt.middleware';
import {
  getPendingDisputesHandler,
  raiseDisputeHandler,
  getDisputeByDealHandler,
} from './disputes.router';
import { updateDisputeRuling, getDisputesForArbitrator } from './disputes.service';
import { getDealByOnChainId } from '../deals/deals.service';
import { successResponse, errorResponse } from '../../middleware/error.middleware';

const PLATFORM_ARBITRATOR = '0xdd4c983Cd57Ee7A6F8Ef0BbB8715B19bdF5C1b61';

const router = Router();

router.get('/pending', jwtMiddleware, getPendingDisputesHandler);
router.get('/deal/:onChainId', jwtMiddleware, getDisputeByDealHandler);
router.post('/:onChainId/raise', jwtMiddleware, raiseDisputeHandler);

export async function ruleDisputeHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const wallet = req.wallet!;
    const { onChainId } = req.params;
    const { outcome } = req.body as { outcome: string };
    const onChainIdNum = parseInt(onChainId as string);

    if (isNaN(onChainIdNum)) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    const validOutcomes = ['PartyAWins', 'PartyBWins', 'Split'];
    if (!validOutcomes.includes(outcome)) {
      res.status(400).json(errorResponse('Invalid outcome. Must be PartyAWins, PartyBWins, or Split'));
      return;
    }

    const deal = await getDealByOnChainId(BigInt(onChainIdNum));
    if (!deal) {
      res.status(404).json(errorResponse('Deal not found'));
      return;
    }

    // Check if the wallet is either the deal's arbitrator or the platform arbitrator
    const dealArbitrator = deal.arbitratorWallet?.toLowerCase() || '';
    const walletLower = wallet.toLowerCase();
    const isAuthorized = 
      dealArbitrator === walletLower || 
      walletLower === PLATFORM_ARBITRATOR.toLowerCase();

    if (!isAuthorized) {
      res.status(403).json(errorResponse('Not authorized to rule this dispute'));
      return;
    }

    const dispute = await updateDisputeRuling(BigInt(onChainIdNum), outcome, wallet);
    
    res.json(successResponse({ dispute, outcome }));
  } catch (err) {
    next(err);
  }
}

router.get('/arbitration/pending', jwtMiddleware, getPendingDisputesHandler);
router.post('/arbitration/:onChainId/rule', jwtMiddleware, ruleDisputeHandler);

export default router;
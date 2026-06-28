import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  getDisputesForArbitrator,
  getDisputeByOnChainId,
  createDispute,
} from './disputes.service';
import {
  generateDisputeAnalysis,
} from '../ai/ai.service';
import { getDealByOnChainId } from '../deals/deals.service';
import { successResponse, errorResponse } from '../../middleware/error.middleware';
import { config } from '../../config/env';

// x402 middleware - lazily initialized to avoid auto-connect at import time
let aiAnalysisPaymentMiddleware = (_req: any, _res: any, next: any) => next();

// When x402 is enabled, dynamically import and initialize the payment middleware
if (config.x402.enabled) {
  (async () => {
    try {
      const x402Express = await import('@x402/express');
      const x402Core = await import('@x402/core/server');
      const x402Evm = await import('@x402/evm/exact/server');
      
      const HTTPFacilitatorClient = x402Core.HTTPFacilitatorClient;
      const ExactEvmScheme = x402Evm.ExactEvmScheme;

      const facilitatorClient = new HTTPFacilitatorClient({
        url: config.x402.facilitatorUrl,
      });
      const x402Server = new x402Express.x402ResourceServer(facilitatorClient)
        .register(config.x402.network, new ExactEvmScheme());

      aiAnalysisPaymentMiddleware = x402Express.paymentMiddleware(
        {
          'POST /:onChainId/ai-analysis': {
            accepts: [{
              scheme: 'exact',
              price: '$0.001',
              network: config.x402.network,
              payTo: config.x402.sellerAddress as `0x${string}`,
            }],
            description: 'Clinch AI Dispute Analysis - $0.001 USDC',
            mimeType: 'application/json',
          },
        },
        x402Server,
      );
    } catch (err) {
      console.warn('[x402] Failed to initialize payment middleware:', err);
    }
  })();
}

const onChainIdSchema = z.coerce.number().int().positive();

function parseOnChainId(value: unknown): number | null {
  const parsed = onChainIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function getPendingDisputesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const wallet = req.wallet!;
    console.log('[GET /disputes/pending] arbitrator wallet:', wallet);
    
    const result = await getDisputesForArbitrator(wallet);
    
    console.log('[GET /disputes/pending] returning:', result.length, 'disputes');
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
}

export async function getDisputeByDealHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { onChainId } = req.params;
    const onChainIdNum = parseOnChainId(onChainId);

    if (!onChainIdNum) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    const dispute = await getDisputeByOnChainId(BigInt(onChainIdNum));
    res.json(successResponse(dispute || null));
  } catch (err) {
    next(err);
  }
}

export async function raiseDisputeHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const wallet = req.wallet!;
    const { onChainId } = req.params;
    const { reasonText } = req.body as { reasonText?: string };
    const onChainIdNum = parseOnChainId(onChainId);

    if (!onChainIdNum) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    const existing = await getDisputeByOnChainId(BigInt(onChainIdNum));
    if (existing) {
      res.status(400).json(errorResponse('Dispute already exists for this deal'));
      return;
    }

    const dispute = await createDispute(BigInt(onChainIdNum), wallet, reasonText);
    res.json(successResponse(dispute));
  } catch (err) {
    next(err);
  }
}

export async function getDisputeAIAnalysisHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const onChainIdNum = parseOnChainId(req.params.onChainId);
    if (!onChainIdNum) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    const dispute = await getDisputeByOnChainId(BigInt(onChainIdNum));

    if (!dispute?.aiAnalysis) {
      res.json(successResponse(null));
      return;
    }

    res.json(successResponse({
      analysis: typeof dispute.aiAnalysis === 'string'
        ? dispute.aiAnalysis
        : dispute.aiAnalysis.analysis,
      recommendedOutcome: dispute.aiRecommendedOutcome,
      confidence: dispute.aiConfidence,
      creatorScore: dispute.aiCreatorScore,
      counterpartyScore: dispute.aiCounterpartyScore,
      cached: true,
    }));
  } catch (err) {
    next(err);
  }
}

async function handleGenerateDisputeAIAnalysis(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const onChainIdNum = parseOnChainId(req.params.onChainId);
    if (!onChainIdNum) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    console.log(
      '[POST /disputes/:id/ai-analysis]',
      'x402 payment verified - generating analysis for:',
      onChainIdNum,
    );

    const analysis = await generateDisputeAnalysis(onChainIdNum);

    if (!analysis) {
      res.status(500).json(
        errorResponse('AI analysis failed - check OPENROUTER_API_KEY')
      );
      return;
    }

    res.json(successResponse({
      analysis: analysis.analysis,
      recommendedOutcome: analysis.recommendedOutcome,
      confidence: analysis.confidence,
      creatorScore: analysis.creatorScore,
      counterpartyScore: analysis.counterpartyScore,
      cached: false,
    }));
  } catch (err) {
    console.error('[DisputeAI] Generation failed:', err);
    res.status(502).json(errorResponse('AI analysis unavailable'));
  }
}

export const generateDisputeAIAnalysisHandler = [
  aiAnalysisPaymentMiddleware,
  handleGenerateDisputeAIAnalysis,
];

export async function getDisputeContextHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const onChainIdNum = parseOnChainId(req.params.onChainId);
    if (!onChainIdNum) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    const dispute = await getDisputeByOnChainId(BigInt(onChainIdNum));
    const context = dispute?.aiAnalysis || null;
    res.json(successResponse(context));
  } catch (err) {
    next(err);
  }
}

export async function generateDisputeContextHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const onChainIdNum = parseOnChainId(req.params.onChainId);
    if (!onChainIdNum) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    const deal = await getDealByOnChainId(BigInt(onChainIdNum));
    if (!deal) {
      res.status(404).json(errorResponse('Deal not found'));
      return;
    }

    if (deal.status !== 'Disputed') {
      res.status(409).json(errorResponse('AI context is only available for disputed deals'));
      return;
    }

    const analysis = await generateDisputeAnalysis(onChainIdNum);
    res.json(successResponse({ context: analysis?.analysis || null }));
  } catch (err) {
    console.error('[DisputeAI] Context generation failed:', err);
    res.status(502).json(errorResponse('AI context unavailable'));
  }
}

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

type GatewayMiddlewareFunction = (
  req: Request,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

type CreateGatewayMiddleware = (config: {
  sellerAddress: string;
  facilitatorUrl?: string;
  networks?: string | string[];
  description?: string;
}) => {
  require: (price: string) => GatewayMiddlewareFunction;
};

const onChainIdSchema = z.coerce.number().int().positive();
const X402_PAYMENT_HEADERS = 'PAYMENT-REQUIRED, PAYMENT-RESPONSE';
const { createGatewayMiddleware } = require('@circle-fin/x402-batching/server') as {
  createGatewayMiddleware: CreateGatewayMiddleware;
};
const gateway = createGatewayMiddleware({
  sellerAddress: config.x402.sellerAddress,
  facilitatorUrl: config.x402.facilitatorUrl,
  networks: [config.x402.network],
  description: 'Clinch AI dispute analysis',
});
const requireDisputeAIAnalysisPayment = gateway.require('$0.001');

function parseOnChainId(value: unknown): number | null {
  const parsed = onChainIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function optionalX402(): GatewayMiddlewareFunction {
  if (config.x402.enabled) {
    return requireDisputeAIAnalysisPayment;
  }
  return (_req: Request, _res: Response, next: NextFunction) => next();
}

function exposeX402Headers(req: Request, res: Response, next: NextFunction): void {
  const existing = res.getHeader('Access-Control-Expose-Headers');
  const values = Array.isArray(existing) ? existing.join(', ') : existing?.toString() || '';
  res.setHeader(
    'Access-Control-Expose-Headers',
    values ? `${values}, ${X402_PAYMENT_HEADERS}` : X402_PAYMENT_HEADERS
  );
  next();
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

    console.log('[POST /disputes/:id/ai-analysis] wallet:', req.wallet);

    const analysis = await generateDisputeAnalysis(onChainIdNum);

    if (!analysis) {
      res.status(500).json(errorResponse('AI analysis failed or no dispute found'));
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
  exposeX402Headers,
  optionalX402(),
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

import { Request, Response } from "express";
import { successResponse, errorResponse } from "../../middleware/error.middleware";
import { getDealByOnChainId, createDeal } from "../deals/deals.service";
import { getDisputeByOnChainId } from "../disputes/disputes.service";

// Create an escrow deal via API
export async function createDealHandler(req: Request, res: Response) {
  try {
    const { partyB, amountA, amountB, dealType, title, description } = req.body || {};
    if (!partyB || !amountA || !dealType) {
      return res.status(400).json(errorResponse("partyB, amountA, dealType required"));
    }
    // The caller is identified as partyA via their API key
    const partyA = (req as any).developer.email;
    // Note: In production this would create an on-chain deal
    // For now, return the expected format
    res.json(successResponse({
      message: "Deal creation initiated",
      partyA,
      partyB,
      amountA,
      amountB,
      dealType,
    }));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message));
  }
}

// Get deal status
export async function getDealHandler(req: Request, res: Response) {
  try {
    const onChainId = Number(req.params.onChainId);
    if (!onChainId) return res.status(400).json(errorResponse("Invalid onChainId"));
    const deal = await getDealByOnChainId(BigInt(onChainId));
    if (!deal) return res.status(404).json(errorResponse("Deal not found"));
    res.json(successResponse({
      onChainId: Number(deal.onChainId),
      status: deal.status,
      dealType: deal.dealType,
      amountA: deal.amountA,
      amountB: deal.amountB,
      partyA: deal.partyA,
      partyB: deal.partyB,
      winner: deal.winner,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
    }));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message));
  }
}

// Get AI dispute analysis
export async function getDisputeAnalysisHandler(req: Request, res: Response) {
  try {
    const onChainId = Number(req.params.onChainId);
    if (!onChainId) return res.status(400).json(errorResponse("Invalid onChainId"));
    const dispute = await getDisputeByOnChainId(BigInt(onChainId));
    if (!dispute) return res.status(404).json(errorResponse("No dispute found for this deal"));
    res.json(successResponse({
      onChainId: Number(dispute.onChainId),
      analysis: dispute.aiAnalysis || null,
      recommendedOutcome: dispute.aiRecommendedOutcome || null,
      confidence: dispute.aiConfidence || null,
      cached: true,
    }));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message));
  }
}
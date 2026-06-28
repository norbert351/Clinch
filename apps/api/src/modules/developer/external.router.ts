import { Router } from "express";
import { apiKeyMiddleware } from "./developer.service";
import {
  createDealHandler,
  getDealHandler,
  getDisputeAnalysisHandler,
} from "./developer.external";

const router = Router();

// External API endpoints (authenticated via API key)
// These let external builders interact with Clinch programmatically.
router.use(apiKeyMiddleware);

// Create an escrow deal
router.post("/deals", createDealHandler);

// Get deal status
router.get("/deals/:onChainId", getDealHandler);

// Get AI dispute analysis
router.get("/deals/:onChainId/analysis", getDisputeAnalysisHandler);

export default router;
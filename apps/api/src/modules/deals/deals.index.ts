import { Router } from "express";
import { jwtMiddleware } from "../auth/jwt.middleware";
import {
  getDealsHandler,
  getDealByIdHandler,
  getDealByInviteTokenHandler,
  getUserDealsHandler,
  updateMetadataHandler,
  backfillDealHandler,
  triggerAISummaryHandler,
  getPublicPlatformStatsHandler,
} from "./deals.router";
import { resolveDisputeHandler } from "./dispute-resolver.router";

const router = Router();

router.post("/backfill/:onChainId", jwtMiddleware, backfillDealHandler);
router.get("/invite/:token", getDealByInviteTokenHandler);
router.get("/user/:address", jwtMiddleware, getUserDealsHandler);
router.post("/ai-summary/:onChainId", jwtMiddleware, triggerAISummaryHandler);
router.get("/stats/public", getPublicPlatformStatsHandler);
router.get("/:onChainId", getDealByIdHandler);
router.get("/", jwtMiddleware, getDealsHandler);
router.patch("/metadata", jwtMiddleware, updateMetadataHandler);
router.post("/resolve-dispute", jwtMiddleware, resolveDisputeHandler);

export default router;

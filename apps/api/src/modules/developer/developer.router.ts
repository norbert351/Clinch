import { Router } from "express";
import { successResponse, errorResponse } from "../../middleware/error.middleware";
import { generateApiKey, revokeApiKey, addWebhook, removeWebhook, apiKeyMiddleware } from "./developer.service";

const router = Router();

// ── Developer registration (open) ──
router.post("/register", (req: any, res: any) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json(errorResponse("name and email required"));
  const key = generateApiKey(name, email);
  res.json(successResponse({ apiKey: key, message: "Save this key - it won't be shown again." }));
});

// ── Revoke key ──
router.post("/revoke", (req: any, res: any) => {
  const { apiKey } = req.body || {};
  if (!apiKey) return res.status(400).json(errorResponse("apiKey required"));
  if (revokeApiKey(apiKey)) return res.json(successResponse({ revoked: true }));
  res.status(404).json(errorResponse("Key not found"));
});

// ── Webhook management (authenticated) ──
router.post("/webhooks", apiKeyMiddleware, (req: any, res: any) => {
  const { url, events } = req.body || {};
  if (!url || !Array.isArray(events)) return res.status(400).json(errorResponse("url and events[] required"));
  if (addWebhook(req.developer.apiKey, url, events)) return res.json(successResponse({ url, events }));
  res.status(500).json(errorResponse("Failed"));
});

router.delete("/webhooks", apiKeyMiddleware, (req: any, res: any) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json(errorResponse("url required"));
  if (removeWebhook(req.developer.apiKey, url)) return res.json(successResponse({ removed: true }));
  res.status(404).json(errorResponse("Webhook not found"));
});

// ── Developer info ──
router.get("/me", apiKeyMiddleware, (req: any, res: any) => {
  const dev = req.developer;
  res.json(successResponse({
    name: dev.name,
    email: dev.email,
    apiKeyPrefix: dev.apiKeyPrefix,
    webhooks: dev.webhooks.map((w: any) => ({ url: w.url, events: w.events, enabled: w.enabled })),
    createdAt: dev.createdAt,
  }));
});

export default router;
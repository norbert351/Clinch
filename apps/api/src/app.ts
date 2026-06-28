import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { corsOptions } from "./config/cors";
import { globalErrorHandler } from "./middleware/error.middleware";
import authRouter from "./modules/auth/auth.index";
import usersRouter from "./modules/users/users.index";
import dealsRouter from "./modules/deals/deals.index";
import disputesRouter from "./modules/disputes/disputes.index";
import dashboardRouter from "./modules/dashboard/dashboard.index";
import notificationsRouter from "./modules/notifications/notifications.index";
import publicRouter from "./modules/public/public.index";
import gatewayRouter from "./modules/gateway/gateway.index";
import { circleWebhookHandler } from "./modules/gateway/gateway.router";
import messagesRouter from "./modules/messages/messages.index";
import analyticsRouter, { adminRouter } from "./modules/analytics/analytics.index";
import adminDashboardRouter from "./modules/admin";
import devRouter from "./modules/developer/developer.router";
import externalRouter from "./modules/developer/external.router";
import agentRouter from "./modules/agent/agent.index";

const app = express();

const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/api/health",
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const circleWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const x402CorsOptions = {
  ...corsOptions,
  allowedHeaders: Array.from(new Set([
    ...(corsOptions.allowedHeaders as string[]),
    "PAYMENT-SIGNATURE",
    "X-PAYMENT",
    "X-API-Key",
  ])),
  exposedHeaders: Array.from(new Set([
    ...(corsOptions.exposedHeaders as string[]),
    "PAYMENT-REQUIRED",
    "PAYMENT-RESPONSE",
    "X-PAYMENT-RESPONSE",
  ])),
};

app.use(cors(x402CorsOptions));

// Handle preflight requests for all routes
app.options("*", cors(x402CorsOptions));

app.post(
  "/api/webhooks/circle",
  circleWebhookLimiter,
  express.raw({ type: "application/json", limit: "1mb" }),
  circleWebhookHandler,
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(globalApiLimiter);

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { status: "ok", timestamp: new Date().toISOString() },
  });
});

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/users", usersRouter);
app.use("/api/deals", dealsRouter);
app.use("/api/disputes", disputesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/public", publicRouter);
app.use("/api/gateway", gatewayRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/admin", adminDashboardRouter);
app.use("/api/admin", adminRouter);
app.use("/api/dev", devRouter);
app.use("/api/external", externalRouter);
app.use("/api/agent", agentRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

app.use(globalErrorHandler);

export default app;

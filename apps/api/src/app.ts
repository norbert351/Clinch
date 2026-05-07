import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { config } from "./config/env";
import { globalErrorHandler } from "./middleware/error.middleware";
import authRouter from "./modules/auth/auth.index";
import usersRouter from "./modules/users/users.index";
import dealsRouter from "./modules/deals/deals.index";
import disputesRouter from "./modules/disputes/disputes.index";
import dashboardRouter from "./modules/dashboard/dashboard.index";
import notificationsRouter from "./modules/notifications/notifications.index";

const app = express();

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "https://clinch-one.vercel.app,http://localhost:3000"
)
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, health checks, curl)
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.replace(/\/$/, "");
      const isAllowed = allowedOrigins.some((allowed) => {
        const normalizedAllowed = allowed.replace(/\/$/, "");
        return normalizedOrigin === normalizedAllowed;
      });

      if (isAllowed) {
        return callback(null, true);
      }

      console.warn("[CORS] Blocked origin:", origin);
      callback(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Authorization"],
  }),
);

// Handle preflight requests for all routes
app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { status: "ok", timestamp: new Date().toISOString() },
  });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/deals", dealsRouter);
app.use("/api/disputes", disputesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/notifications", notificationsRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

app.use(globalErrorHandler);

export default app;

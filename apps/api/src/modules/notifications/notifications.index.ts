import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { jwtMiddleware } from "../auth/jwt.middleware";
import { successResponse } from "../../middleware/error.middleware";
import { db } from "../../config/db";
import { notifications } from "../../db/schema";

const router = Router();

router.get("/", jwtMiddleware, async (req, res, next) => {
  try {
    const wallet = (req.wallet as string) || '';
    if (!wallet) {
      res.status(401).json(successResponse());
      return;
    }
    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.walletAddress, wallet.toLowerCase()))
      .orderBy(desc(notifications.sentAt))
      .limit(50);
    res.json(successResponse(notifs));
  } catch (err) {
    next(err);
  }
});

router.get("/unread-count", jwtMiddleware, async (req, res, next) => {
  try {
    const wallet = (req.wallet as string) || '';
    if (!wallet) {
      res.status(401).json(successResponse({ count: 0 }));
      return;
    }
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        eq(notifications.walletAddress, wallet.toLowerCase()) &&
        eq(notifications.read, false)
      );
    res.json(successResponse({ count: result[0]?.count ?? 0 }));
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/read", jwtMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const notifId = Array.isArray(id) ? id[0] : id;
    const wallet = (req.wallet as string) || '';

    const [updated] = await db
      .update(notifications)
      .set({ read: true, readAt: new Date() })
      .where(
        eq(notifications.id, notifId) &&
        eq(notifications.walletAddress, wallet.toLowerCase())
      )
      .returning();

    if (!updated) {
      res.status(404).json(successResponse({ error: 'Notification not found' }));
      return;
    }

    res.json(successResponse({ ok: true }));
  } catch (err) {
    next(err);
  }
});

router.patch("/read-all", jwtMiddleware, async (req, res, next) => {
  try {
    const wallet = (req.wallet as string) || '';
    if (!wallet) {
      res.status(401).json(successResponse());
      return;
    }
    await db
      .update(notifications)
      .set({ read: true, readAt: new Date() })
      .where(eq(notifications.walletAddress, wallet.toLowerCase()));
    res.json(successResponse({ ok: true }));
  } catch (err) {
    next(err);
  }
});

export default router;
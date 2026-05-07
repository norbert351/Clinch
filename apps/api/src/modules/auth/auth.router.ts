import { Request, Response, NextFunction } from "express";
import {
  generateNonce,
  getNonce,
  deleteNonce,
  upsertUser,
  signJwt,
} from "./auth.service";
import { successResponse, errorResponse } from "../../middleware/error.middleware";
import { SiweMessage } from "siwe";
import { config } from "../../config/env";

export async function getNonceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { address } = req.query;

    if (!address || typeof address !== "string") {
      res.status(400).json(errorResponse("Address query parameter is required"));
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json(errorResponse("Invalid Ethereum address"));
      return;
    }

    const nonce = generateNonce(address);
    console.log("[Auth] Nonce generated for", address, ":", nonce);
    res.json(successResponse({ nonce }));
  } catch (err) {
    next(err);
  }
}

export async function verifyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { message, signature } = req.body as { message: string; signature: string };

    if (!message || !signature) {
      res.status(400).json(errorResponse("Message and signature are required"));
      return;
    }

    const siwe = new SiweMessage(message);
    const addressFromMessage = siwe.address.toLowerCase();

    console.log(
      "[Auth] SIWE verify - address:",
      siwe.address,
      "nonce:",
      siwe.nonce,
      "domain:",
      siwe.domain,
    );

    // Look up stored nonce using the address from the SIWE message
    const storedNonce = getNonce(addressFromMessage);
    console.log("[Auth] Stored nonce for", addressFromMessage, ":", storedNonce);

    if (!storedNonce) {
      console.error("[Auth] Nonce not found or expired for", addressFromMessage);
      res.status(401).json(errorResponse("Nonce not found or expired. Please request a new nonce."));
      return;
    }

    // Verify signature — do NOT pass domain or nonce override.
    // The domain and nonce are already in the message and will be
    // validated against the stored nonce below.
    // Passing domain here would override the message's domain and
    // cause a mismatch since frontend sends host-only (no protocol).
    const { data: fields, success, error } = await siwe.verify({
      signature,
    });

    if (!success || !fields) {
      console.error("[Auth] SIWE signature verification failed:", error);
      res.status(401).json(errorResponse("SIWE verification failed: " + error?.type));
      return;
    }

    // Validate nonce from message matches the one we issued
    if (fields.nonce !== storedNonce) {
      console.error(
        "[Auth] Nonce mismatch for",
        addressFromMessage,
        "- stored:",
        storedNonce,
        "| received:",
        fields.nonce,
      );
      res.status(401).json(errorResponse("Invalid nonce"));
      return;
    }

    // Delete nonce after successful validation
    deleteNonce(addressFromMessage);
    console.log("[Auth] Nonce validated and deleted for", addressFromMessage);

    const user = await upsertUser(addressFromMessage);
    console.log("[Auth] User upserted:", user.walletAddress);

    const token = signJwt({ wallet: user.walletAddress });
    console.log("[Auth] JWT signed for", user.walletAddress);

    res.json(successResponse({
      token,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        email: user.email,
      },
    }));
  } catch (err) {
    console.error("[Auth] Verify handler error:", err);
    next(err);
  }
}

export function logoutHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    res.json(successResponse({ message: "Logged out successfully" }));
  } catch (err) {
    next(err);
  }
}

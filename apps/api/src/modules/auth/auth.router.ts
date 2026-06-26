import { Request, Response, NextFunction } from "express";
import {
  generateNonce,
  getNonce,
  deleteNonce,
  upsertUser,
  signJwt,
  verifyDynamicJWT,
} from "./auth.service";
import { successResponse, errorResponse } from "../../middleware/error.middleware";
import { SiweMessage } from "siwe";
import { trackAnalyticsEvent } from "../analytics/analytics.service";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function isLocalDevelopmentRequest(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;

  const hostname = req.hostname.toLowerCase();
  return ["localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
    hostname,
  );
}

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

    if (!ADDRESS_RE.test(address)) {
      res.status(400).json(errorResponse("Invalid Ethereum address"));
      return;
    }

    const nonce = generateNonce(address);
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

    // Look up stored nonce using the address from the SIWE message
    const storedNonce = getNonce(addressFromMessage);

    if (!storedNonce) {
      console.warn("[Auth] Nonce not found or expired for", shortAddress(addressFromMessage));
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
      console.warn("[Auth] SIWE signature verification failed for", shortAddress(addressFromMessage), error?.type);
      res.status(401).json(errorResponse("SIWE verification failed: " + error?.type));
      return;
    }

    // Validate nonce from message matches the one we issued
    if (fields.nonce !== storedNonce) {
      console.warn("[Auth] Nonce mismatch for", shortAddress(addressFromMessage));
      res.status(401).json(errorResponse("Invalid nonce"));
      return;
    }

    // Delete nonce after successful validation
    deleteNonce(addressFromMessage);

    const { user, created } = await upsertUser(addressFromMessage);

    const token = signJwt({ wallet: user.walletAddress });
    trackAnalyticsEvent({
      type: created ? "USER_CONNECTED" : "USER_RETURNED",
      wallet: user.walletAddress,
      metadata: {
        provider: "siwe",
      },
    });

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
    console.warn("[Auth] Verify handler failed");
    next(err);
  }
}

export async function dynamicAuthHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { dynamicToken, address } = req.body as { dynamicToken: string; address: string };

    if (!dynamicToken || !address) {
      res.status(400).json(errorResponse('dynamicToken and address are required'));
      return;
    }

    if (!ADDRESS_RE.test(address)) {
      res.status(400).json(errorResponse('Invalid Ethereum address'));
      return;
    }

    // Verify the Dynamic JWT
    const payload = await verifyDynamicJWT(dynamicToken);

    // Confirm address matches one in the verified credentials
    const walletCred = payload.verified_credentials?.find(
      (c) => c.address?.toLowerCase() === address?.toLowerCase(),
    );
    if (!walletCred) {
      throw new Error('Address mismatch in Dynamic JWT');
    }

    // Create or update user in DB
    const { user, created } = await upsertUser(address.toLowerCase());

    // Issue your own JWT (same format as existing SIWE flow)
    const token = signJwt({ wallet: user.walletAddress });
    trackAnalyticsEvent({
      type: created ? 'USER_CONNECTED' : 'USER_RETURNED',
      wallet: user.walletAddress,
      metadata: {
        provider: 'dynamic',
      },
    });

    res.json(successResponse({
      token,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        email: user.email,
      },
    }));
  } catch (err: any) {
    res.status(401).json(errorResponse(err.message || 'Dynamic auth failed'));
  }
}

export async function developmentSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!isLocalDevelopmentRequest(req)) {
      res.status(404).json(errorResponse("Route not found"));
      return;
    }

    const { address } = req.body as { address?: string };

    if (!address || typeof address !== "string") {
      res.status(400).json(errorResponse("Address is required"));
      return;
    }

    if (!ADDRESS_RE.test(address)) {
      res.status(400).json(errorResponse("Invalid Ethereum address"));
      return;
    }

    const { user, created } = await upsertUser(address.toLowerCase());
    const token = signJwt({ wallet: user.walletAddress });
    trackAnalyticsEvent({
      type: created ? "USER_CONNECTED" : "USER_RETURNED",
      wallet: user.walletAddress,
      metadata: {
        provider: "development",
      },
    });

    res.json(successResponse({
      token,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        email: user.email,
        emailNotifications: user.emailNotifications,
        createdAt: user.createdAt,
      },
    }));
  } catch (err) {
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

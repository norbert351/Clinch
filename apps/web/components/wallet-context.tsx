"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { SiweMessage } from "siwe";
import {
  getNonce,
  verifySiwe,
  setToken,
  clearToken,
  getToken,
  getCurrentUser,
} from "@/lib/api";
import toast from "react-hot-toast";
import type { User, WalletState } from "@/lib/types";

interface WalletContextType extends WalletState {
  connect: () => void;
  disconnect: () => void;
  isSigning: boolean;
  hasSigned: boolean;
  signMessage: () => Promise<void>;
  user: User | null;
  isAuthLoading: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

function isTokenValid(token: string | null): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false;
    // Add 30 second buffer to handle clock skew
    return payload.exp * 1000 > Date.now() + 30_000;
  } catch {
    return false;
  }
}

async function getNonceWithRetry(
  address: string,
  retries = 3,
  delayMs = 3000,
): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      return await getNonce(address);
    } catch (err: any) {
      if (i === retries - 1) throw err;
      console.warn(
        `[SIWE] Nonce attempt ${i + 1} failed, retrying in ${delayMs}ms...`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Failed to get nonce after retries");
}

function getDomain(): string {
  if (typeof window !== "undefined") {
    return window.location.host.replace(/\/$/, "");
  }
  return "clinch-one.vercel.app";
}

function getUri(): string {
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://clinch-one.vercel.app";
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnected, chainId } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { openConnectModal } = useConnectModal();

  const isSigningRef = useRef(false);
  const signAttemptedRef = useRef(false);

  const [isSigning, setIsSigning] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const loadUser = useCallback(async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch {
      setUser(null);
    }
  }, []);

  const signIn = useCallback(async () => {
    if (!address || isSigningRef.current) return;
    if (!chainId && !address) return;

    isSigningRef.current = true;
    setIsSigning(true);

    try {
      const chainIdNum = chainId ?? 5042002;

      const nonce = await getNonceWithRetry(address);

      const siweMessage = new SiweMessage({
        domain: getDomain(),
        address,
        statement: "Sign in with Ethereum to Clinch",
        uri: getUri(),
        version: "1",
        chainId: chainIdNum,
        nonce,
        issuedAt: new Date().toISOString(),
        expirationTime: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await signMessageAsync({ message });

      const { token, user: userData } = await verifySiwe(message, signature);

      setToken(token);
      setUser(userData);
      setHasSigned(true);
      console.log("[SIWE] Sign in successful");
    } catch (error: any) {
      console.error("[SIWE] Signing failed:", error?.message || error);
      setHasSigned(false);
      clearToken();
    } finally {
      isSigningRef.current = false;
      setIsSigning(false);
    }
    // CRITICAL: isSigningRef is NOT in deps — ref changes don't cause re-creation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId, signMessageAsync]);

  useEffect(() => {
    if (!isConnected || !address) {
      setHasSigned(false);
      setUser(null);
      signAttemptedRef.current = false;
      isSigningRef.current = false;
      return;
    }

    const existingToken = getToken();
    if (existingToken && isTokenValid(existingToken)) {
      console.log("[Auth] Valid token found, restoring session");
      setHasSigned(true);
      loadUser();
      return;
    }

    if (signAttemptedRef.current) {
      console.log("[Auth] Sign already attempted for this session, skipping");
      return;
    }
    signAttemptedRef.current = true;

    clearToken();
    signIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  const connect = useCallback(() => {
    if (openConnectModal && !isConnected) {
      openConnectModal();
    }
  }, [openConnectModal, isConnected]);

  const disconnect = useCallback(() => {
    wagmiDisconnect();
    clearToken();
    setHasSigned(false);
    setUser(null);
    isSigningRef.current = false;
    signAttemptedRef.current = false;
  }, [wagmiDisconnect]);

  const signMessage = useCallback(async () => {
    if (!address || isSigningRef.current) return;
    isSigningRef.current = true;
    setIsSigning(true);

    try {
      const chainIdNum = chainId ?? 5042002;
      const nonce = await getNonceWithRetry(address);

      const siweMessage = new SiweMessage({
        domain: getDomain(),
        address,
        statement: "Sign in with Ethereum to Clinch",
        uri: getUri(),
        version: "1",
        chainId: chainIdNum,
        nonce,
        issuedAt: new Date().toISOString(),
        expirationTime: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      const message = siweMessage.prepareMessage();
      const signature = await signMessageAsync({ message });

      const { token, user: userData } = await verifySiwe(message, signature);

      setToken(token);
      setUser(userData);
      setHasSigned(true);
      console.log("[SIWE] Manual sign in successful");
    } catch (error: any) {
      console.error("[SIWE] Signing failed:", error?.message || error);
      const errorMsg =
        error?.response?.data?.error || error?.message || "Sign-in failed";
      toast.error(errorMsg);
      setHasSigned(false);
      clearToken();
    } finally {
      isSigningRef.current = false;
      setIsSigning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId, signMessageAsync]);

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        address,
        chainId,
        connect,
        disconnect,
        isSigning,
        hasSigned,
        signMessage,
        user,
        isAuthLoading: isSigning,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}

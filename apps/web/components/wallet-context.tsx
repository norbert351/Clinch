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
import { useAccount } from "wagmi";
import {
  useDynamicContext,
  useIsLoggedIn,
} from "@dynamic-labs/sdk-react-core";
import {
  clearToken,
  getToken,
  getCurrentUser,
} from "@/lib/api";
import type { User, WalletState } from "@/lib/types";

interface WalletContextType extends WalletState {
  connect: () => void;
  disconnect: () => void;
  isSigning: boolean;
  hasSigned: boolean;
  signMessage: () => void;
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
    return payload.exp * 1000 > Date.now() + 30_000;
  } catch {
    return false;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnected, chainId } = useAccount();
  const {
    handleLogOut,
    setShowAuthFlow,
    sdkHasLoaded,
  } = useDynamicContext();
  const isLoggedIn = useIsLoggedIn();
  const waitRef = useRef(false);

  const [isSigning, setIsSigning] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !address) {
      if (hasSigned) {
        clearToken();
        setUser(null);
        setHasSigned(false);
      }
      return;
    }

    const existingToken = getToken();
    if (existingToken && isTokenValid(existingToken)) {
      setHasSigned(true);
      loadUser();
      return;
    }

    // Token exchange happens in onAuthSuccess (providers.tsx).
    // If token not ready yet, poll briefly.
    if (waitRef.current) return;
    waitRef.current = true;
    setIsSigning(true);
    setIsAuthLoading(true);

    const checkInterval = setInterval(() => {
      const token = getToken();
      if (token && isTokenValid(token)) {
        setHasSigned(true);
        setIsSigning(false);
        setIsAuthLoading(false);
        loadUser();
        clearInterval(checkInterval);
        waitRef.current = false;
      }
    }, 500);

    setTimeout(() => {
      clearInterval(checkInterval);
      setIsSigning(false);
      setIsAuthLoading(false);
      waitRef.current = false;
    }, 15000);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, address]);

  useEffect(() => {
    if (!isLoggedIn && !address) {
      clearToken();
      setHasSigned(false);
      setUser(null);
      waitRef.current = false;
    }
  }, [isLoggedIn, address]);

  const connect = useCallback(() => {
    setShowAuthFlow(true);
  }, [setShowAuthFlow]);

  const disconnect = useCallback(async () => {
    await handleLogOut();
    clearToken();
    setHasSigned(false);
    setUser(null);
  }, [handleLogOut]);

  const signMessage = useCallback(() => {
    setShowAuthFlow(true);
  }, [setShowAuthFlow]);

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        address: address as `0x${string}` | undefined,
        chainId,
        connect,
        disconnect,
        isSigning,
        hasSigned,
        signMessage,
        user,
        isAuthLoading,
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

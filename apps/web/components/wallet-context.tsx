"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
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
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnected, chainId } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { openConnectModal } = useConnectModal();

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
  const signIn = useCallback(async () => {
    if (!address || isSigning) return;

    // Wait for chainId — connector may not be ready immediately after connect
    let chainIdNum = chainId;
    if (!chainIdNum) {
      chainIdNum = 5042002; // Arc testnet fallback
    }

    setIsSigning(true);
    try {
      const nonce = await getNonce(address);

      const siweMessage = new SiweMessage({
        domain: window.location.host, // e.g. clinch-one.vercel.app
        address,
        statement: "Sign in with Ethereum to Clinch",
        uri: window.location.origin, // e.g. https://clinch-one.vercel.app
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
      console.log("[SIWE] Signed in successfully");
    } catch (error: any) {
      console.error("[SIWE] Signing failed:", error?.message || error);
      setHasSigned(false);
    } finally {
      setIsSigning(false);
    }
  }, [address, chainId, isSigning, signMessageAsync]);

  useEffect(() => {
    if (!isConnected || !address) {
      setHasSigned(false);
      setUser(null);
      return;
    }

    const existingToken = getToken();
    if (existingToken && isTokenValid(existingToken)) {
      setHasSigned(true);
      loadUser();
    } else {
      clearToken();
      setTimeout(() => {
        signIn();
      }, 0);
    }
  }, [isConnected, address, loadUser, signIn]);

  const connect = useCallback(() => {
    if (openConnectModal && !isConnected) {
      openConnectModal(); // Opens RainbowKit modal
    }
  }, [openConnectModal, isConnected]);

  const disconnect = useCallback(() => {
    wagmiDisconnect();
    clearToken();
    setHasSigned(false);
    setUser(null);
  }, [wagmiDisconnect]);

  const signMessage = useCallback(async () => {
    await signIn();
  }, [signIn]);

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

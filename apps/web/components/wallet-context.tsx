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
  const signingRef = useRef(false);
  const signedInAddressRef = useRef<string | null>(null);

  const addressRef = useRef(address);
  const chainIdRef = useRef(chainId);
  const signMessageAsyncRef = useRef(signMessageAsync);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  useEffect(() => {
    chainIdRef.current = chainId;
  }, [chainId]);

  useEffect(() => {
    signMessageAsyncRef.current = signMessageAsync;
  }, [signMessageAsync]);

  const loadUser = useCallback(async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !address) {
      setHasSigned(false);
      setUser(null);
      signingRef.current = false;
      signedInAddressRef.current = null;
      return;
    }

    const existingToken = getToken();
    if (existingToken && isTokenValid(existingToken)) {
      console.log("[Auth] Valid token found, loading user");
      setHasSigned(true);
      loadUser();
      return;
    }

    if (signingRef.current) {
      console.log("[Auth] Signing already in progress, skipping");
      return;
    }

    if (signedInAddressRef.current === address) {
      console.log("[Auth] Already attempted sign-in for this address, skipping");
      return;
    }

    console.log("[Auth] No valid token, starting SIWE flow");
    clearToken();
    signingRef.current = true;
    signedInAddressRef.current = address;
    setIsSigning(true);

    const currentAddress = address;
    const currentChainId = chainIdRef.current || 5042002;
    const currentSignMessage = signMessageAsyncRef.current;

    (async () => {
      try {
        const nonce = await getNonce(currentAddress);
        console.log("[SIWE] Nonce received:", nonce);

        const siweMessage = new SiweMessage({
          domain: window.location.host,
          address: currentAddress,
          statement: "Sign in with Ethereum to Clinch",
          uri: window.location.origin,
          version: "1",
          chainId: currentChainId,
          nonce,
          issuedAt: new Date().toISOString(),
          expirationTime: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        });

        const message = siweMessage.prepareMessage();
        console.log("[SIWE] Message to sign:", message);

        const signature = await currentSignMessage({ message });
        console.log("[SIWE] Signature received:", signature);

        const { token, user: userData } = await verifySiwe(message, signature);
        console.log("[SIWE] Verify response - token received:", !!token);

        setToken(token);
        setUser(userData);
        setHasSigned(true);
        console.log("[SIWE] Signed in successfully");
      } catch (error: any) {
        console.error("[SIWE] Signing failed:", error?.message || error);
        const errorMsg = error?.response?.data?.error || error?.message || "Sign-in failed";
        toast.error(errorMsg);
        setHasSigned(false);
        clearToken();
        signedInAddressRef.current = null;
      } finally {
        setIsSigning(false);
        signingRef.current = false;
      }
    })();
  }, [isConnected, address, loadUser]);

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
    signingRef.current = false;
    signedInAddressRef.current = null;
  }, [wagmiDisconnect]);

  const signMessage = useCallback(async () => {
    if (!addressRef.current || signingRef.current) return;

    signingRef.current = true;
    signedInAddressRef.current = addressRef.current;
    setIsSigning(true);

    const currentAddress = addressRef.current;
    const currentChainId = chainIdRef.current || 5042002;
    const currentSignMessage = signMessageAsyncRef.current;

    try {
      const nonce = await getNonce(currentAddress);
      console.log("[SIWE] Nonce received:", nonce);

      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address: currentAddress,
        statement: "Sign in with Ethereum to Clinch",
        uri: window.location.origin,
        version: "1",
        chainId: currentChainId,
        nonce,
        issuedAt: new Date().toISOString(),
        expirationTime: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      const message = siweMessage.prepareMessage();
      console.log("[SIWE] Message to sign:", message);

      const signature = await currentSignMessage({ message });
      console.log("[SIWE] Signature received:", signature);

      const { token, user: userData } = await verifySiwe(message, signature);
      console.log("[SIWE] Verify response - token received:", !!token);

      setToken(token);
      setUser(userData);
      setHasSigned(true);
      console.log("[SIWE] Signed in successfully");
    } catch (error: any) {
      console.error("[SIWE] Signing failed:", error?.message || error);
      const errorMsg = error?.response?.data?.error || error?.message || "Sign-in failed";
      toast.error(errorMsg);
      setHasSigned(false);
      clearToken();
      signedInAddressRef.current = null;
    } finally {
      setIsSigning(false);
      signingRef.current = false;
    }
  }, []);

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

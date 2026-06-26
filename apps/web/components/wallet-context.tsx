"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAccount, useDisconnect, useWalletClient } from "wagmi";
import {
  useDynamicContext,
  useIsLoggedIn,
} from "@dynamic-labs/sdk-react-core";
import {
  clearToken,
  createDevelopmentSession,
  getToken,
  getCurrentUser,
  setToken,
  API_URL,
} from "@/lib/api";
import type { User, WalletState } from "@/lib/types";

const isDev = process.env.NODE_ENV === "development";

interface WalletContextType extends WalletState {
  connect: () => void;
  disconnect: () => void;
  canConnect: boolean;
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
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), "=");
    const payload = JSON.parse(atob(padded));
    if (!payload.exp) return false;
    return payload.exp * 1000 > Date.now() + 30_000;
  } catch {
    return false;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnected, chainId, connector, status } = useAccount();
  const { disconnectAsync: disconnectWallet } = useDisconnect();
  const walletClientQueryEnabled = Boolean(
    address &&
      connector &&
      (status === "connected" || status === "reconnecting"),
  );
  const {
    data: walletClient,
    isLoading: isWalletClientLoading,
    isFetching: isWalletClientFetching,
  } = useWalletClient({
    account: address,
    chainId,
    connector,
    query: {
      enabled: walletClientQueryEnabled,
    },
  });
  const {
    handleLogOut,
    setShowAuthFlow,
    sdkHasLoaded,
    authMode,
  } = useDynamicContext();
  const isLoggedIn = useIsLoggedIn();
  const waitRef = useRef(false);
  const sessionRequestRef = useRef(0);
  const latestAddressRef = useRef<string | undefined>(undefined);
  const lastWalletLogRef = useRef<string>("");
  const isLocalConnectOnly = isDev && authMode === "connect-only";

  const [isSigning, setIsSigning] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const walletClientAddress = walletClient?.account?.address?.toLowerCase();
  const walletClientChainId = walletClient?.chain?.id;
  const isWalletClientReady = useMemo(() => {
    if (!isConnected || !address || !walletClient) return false;
    const signerMatches = walletClientAddress
      ? walletClientAddress === address.toLowerCase()
      : true;
    const chainMatches = chainId && walletClientChainId
      ? walletClientChainId === chainId
      : true;
    return signerMatches && chainMatches;
  }, [
    address,
    chainId,
    isConnected,
    walletClient,
    walletClientAddress,
    walletClientChainId,
  ]);
  const walletClientInitializing = Boolean(
    address &&
      connector &&
      !isWalletClientReady &&
      (isWalletClientLoading ||
        isWalletClientFetching ||
        status === "reconnecting"),
  );

  const loadUser = useCallback(async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    latestAddressRef.current = address?.toLowerCase();
  }, [address]);

  useEffect(() => {
    if (!isConnected && !address) {
      waitRef.current = false;
      sessionRequestRef.current += 1;
      setIsSigning(false);
      setIsAuthLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    if (!isDev) return;

    const logKey = [
      address?.toLowerCase() || "no-address",
      chainId || "no-chain",
      connector?.uid || "no-connector",
      status,
      isWalletClientReady ? "ready" : "not-ready",
      walletClientChainId || "no-client-chain",
    ].join(":");

    if (lastWalletLogRef.current === logKey) return;
    lastWalletLogRef.current = logKey;

    console.info("[wallet state]", {
      address,
      chainId,
      connector: connector?.name,
      status,
      apiUrl: API_URL,
      walletClientReady: isWalletClientReady,
      walletClientLoading: walletClientInitializing,
      walletClientAddress,
      walletClientChainId,
    });
  }, [
    address,
    chainId,
    connector?.name,
    connector?.uid,
    isWalletClientReady,
    status,
    walletClientAddress,
    walletClientChainId,
    walletClientInitializing,
  ]);

  useEffect(() => {
    const resetPendingAuth = () => {
      sessionRequestRef.current += 1;
      waitRef.current = false;
      setIsSigning(false);
      setIsAuthLoading(false);
    };

    window.addEventListener("clinch:auth-reset", resetPendingAuth);
    return () => {
      window.removeEventListener("clinch:auth-reset", resetPendingAuth);
    };
  }, []);

  const establishLocalSession = useCallback(async () => {
    if (!address) return;

    const requestedAddress = address.toLowerCase();
    const requestId = ++sessionRequestRef.current;

    try {
      const { token, user: sessionUser } = await createDevelopmentSession(
        address,
      );
      if (
        requestId !== sessionRequestRef.current ||
        latestAddressRef.current !== requestedAddress
      ) {
        return;
      }

      setToken(token);
      setUser(sessionUser);
      setHasSigned(true);
      setIsSigning(false);
      setIsAuthLoading(false);
    } catch {
      if (
        requestId !== sessionRequestRef.current ||
        latestAddressRef.current !== requestedAddress
      ) {
        return;
      }

      setUser({
        id: `local-${requestedAddress}`,
        walletAddress: requestedAddress,
        emailNotifications: true,
        createdAt: new Date(0).toISOString(),
      });
      setHasSigned(true);
      setIsSigning(false);
      setIsAuthLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isLocalConnectOnly) {
      if (address) {
        setIsSigning(true);
        setIsAuthLoading(true);
        void establishLocalSession();
      } else {
        sessionRequestRef.current += 1;
        clearToken();
        setUser(null);
        setHasSigned(false);
        setIsSigning(false);
        setIsAuthLoading(false);
      }

      waitRef.current = false;
      return;
    }

    if (!isLoggedIn || !address) {
      waitRef.current = false;
      setIsSigning(false);
      setIsAuthLoading(false);
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
  }, [establishLocalSession, isLoggedIn, address, isLocalConnectOnly]);

  useEffect(() => {
    if (isLocalConnectOnly) return;

    if (!isLoggedIn && !address) {
      clearToken();
      setHasSigned(false);
      setUser(null);
      waitRef.current = false;
    }
  }, [isLoggedIn, address, isLocalConnectOnly]);

  const connect = useCallback(() => {
    if (!sdkHasLoaded) return;
    if (isDev) {
      console.log("[wallet connect]", {
        address,
        chainId,
        sdkHasLoaded,
        apiUrl: API_URL,
      });
    }
    waitRef.current = false;
    setIsSigning(false);
    setIsAuthLoading(false);
    setShowAuthFlow(true);
  }, [address, chainId, sdkHasLoaded, setShowAuthFlow]);

  const disconnect = useCallback(async () => {
    sessionRequestRef.current += 1;
    console.log("[wallet disconnect]", { address, chainId });

    try {
      // Dynamic Labs first — owns the session
      if (typeof handleLogOut === 'function') {
        await handleLogOut();
      }
    } catch (err) {
      console.error("[wallet disconnect] handleLogOut failed:", err);
    }

    try {
      await disconnectWallet();
    } catch (err) {
      console.error("[wallet disconnect] disconnectWallet failed:", err);
    }

    clearToken();
    setHasSigned(false);
    setUser(null);
    setIsSigning(false);
    setIsAuthLoading(false);
  }, [address, chainId, disconnectWallet, handleLogOut]);

  const signMessage = useCallback(() => {
    if (isLocalConnectOnly && address) {
      void establishLocalSession();
      return;
    }

    if (!sdkHasLoaded) return;
    waitRef.current = false;
    setIsSigning(false);
    setIsAuthLoading(false);
    setShowAuthFlow(true);
  }, [address, establishLocalSession, isLocalConnectOnly, sdkHasLoaded, setShowAuthFlow]);

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        address: address as `0x${string}` | undefined,
        chainId,
        isWalletClientReady,
        isWalletClientLoading: walletClientInitializing,
        connect,
        disconnect,
        canConnect: sdkHasLoaded,
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

export function WalletProviderFallback({ children }: { children: ReactNode }) {
  const connect = useCallback(() => {}, []);
  const disconnect = useCallback(() => {}, []);
  const signMessage = useCallback(() => {}, []);

  return (
    <WalletContext.Provider
      value={{
        isConnected: false,
        address: undefined,
        chainId: undefined,
        isWalletClientReady: false,
        isWalletClientLoading: false,
        connect,
        disconnect,
        canConnect: false,
        isSigning: false,
        hasSigned: false,
        signMessage,
        user: null,
        isAuthLoading: false,
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

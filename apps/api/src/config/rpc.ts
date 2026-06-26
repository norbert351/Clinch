import { createPublicClient, http, webSocket, fallback } from 'viem';

const HTTP_RPCS = [
  'https://rpc.testnet.arc.network',
  'https://rpc.blockdaemon.testnet.arc.network',
  'https://rpc.drpc.testnet.arc.network',
  'https://rpc.quicknode.testnet.arc.network',
];

const WS_RPCS = [
  'wss://rpc.testnet.arc.network',
  'wss://rpc.drpc.testnet.arc.network',
  'wss://rpc.quicknode.testnet.arc.network',
];

const ARC_CHAIN = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'Arc', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: HTTP_RPCS },
  },
};

let publicClientInstance: ReturnType<typeof createPublicClient> | null = null;
let wsClientInstance: ReturnType<typeof createPublicClient> | null = null;
let wsDisconnectLogged = false;

export function getPublicClient() {
  if (!publicClientInstance) {
    publicClientInstance = createPublicClient({
      chain: ARC_CHAIN,
      transport: fallback(HTTP_RPCS.map((url) => http(url, { timeout: 15000 }))),
    });
    console.log('[RPC] Initialized HTTP fallback client with', HTTP_RPCS.length, 'endpoints');
  }
  return publicClientInstance;
}

export function getWsClient() {
  if (wsClientInstance) return wsClientInstance;

  try {
    const wsTransports = WS_RPCS.map((url) => {
      try {
        return webSocket(url, { timeout: 15000 });
      } catch {
        return null;
      }
    }).filter(Boolean);

    const httpTransports = HTTP_RPCS.map((url) => {
      try {
        return http(url, { timeout: 15000 });
      } catch {
        return null;
      }
    }).filter(Boolean);

    if (wsTransports.length > 0) {
      wsClientInstance = createPublicClient({
        chain: ARC_CHAIN,
        transport: fallback([...wsTransports, ...httpTransports] as any),
      });
    } else {
      wsClientInstance = getPublicClient();
    }
  } catch {
    if (!wsDisconnectLogged) {
      console.log('[RPC] websocket unavailable, using HTTP only');
      wsDisconnectLogged = true;
    }
    wsClientInstance = getPublicClient();
  }

  return wsClientInstance;
}

export function resetWsClient(): void {
  if (wsClientInstance) {
    wsClientInstance = null;
  }
}

export const RPC_ERRORS = {
  CONNECT_TIMEOUT: 'CONNECT_TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  FETCH_ERROR: 'FETCH_ERROR',
} as const;

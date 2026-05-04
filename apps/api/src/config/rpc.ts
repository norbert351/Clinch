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
let currentHttpRpc = HTTP_RPCS[0];
let currentWsRpc = WS_RPCS[0];

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
  if (!wsClientInstance) {
    console.log('[RPC] Initializing WS client...');
    
    const wsTransports = WS_RPCS.map((url) => {
      try {
        console.log('[RPC] Trying WS:', url);
        return webSocket(url, { timeout: 15000 });
      } catch (e) {
        console.warn('[RPC] Failed to create WS transport for:', url);
        return null;
      }
    }).filter(Boolean);

    const httpTransports = HTTP_RPCS.map((url) => {
      try {
        console.log('[RPC] Adding HTTP fallback:', url);
        return http(url, { timeout: 15000 });
      } catch (e) {
        console.warn('[RPC] Failed to create HTTP transport for:', url);
        return null;
      }
    }).filter(Boolean);

    if (wsTransports.length > 0) {
      const allTransports = [...wsTransports, ...httpTransports];
      wsClientInstance = createPublicClient({
        chain: ARC_CHAIN,
        transport: fallback(allTransports as any),
      });
      console.log('[RPC] Initialized WS+HTTP fallback client with', allTransports.length, 'endpoints');
    } else if (httpTransports.length > 0) {
      console.warn('[RPC] No WS transports available, using HTTP only');
      wsClientInstance = createPublicClient({
        chain: ARC_CHAIN,
        transport: fallback(httpTransports as any),
      });
    } else {
      console.warn('[RPC] No transports available, using default HTTP');
      wsClientInstance = getPublicClient();
    }
  }
  return wsClientInstance;
}

export function getCurrentRpc() {
  return currentHttpRpc;
}

export function getCurrentWsRpc() {
  return currentWsRpc;
}

export const RPC_ERRORS = {
  CONNECT_TIMEOUT: 'CONNECT_TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  FETCH_ERROR: 'FETCH_ERROR',
} as const;
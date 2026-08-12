// =============================================================================
// HYPERCYCLE NODE MANAGER CLIENT
// Queries localhost:8006 for live factory/node data
// Fallback to RPC if Node Manager is offline
// =============================================================================

const NODE_MANAGER_URL = "http://localhost:8006";
const TIMEOUT_MS = 5000;

export interface NodeManagerFactory {
  factory_id: string;
  name: string;
  chain: string;
  owner: string;
  collection_access: string[];
  isActive: boolean;
  registered_at: number;
  total_requests: number;
  success_rate: number;
  avg_latency_ms: number;
  last_updated: number;
}

export interface NodeManagerNode {
  nodeId: string;
  name: string;
  status: "healthy" | "degraded" | "down" | "booting";
  ip: string;
  port: number;
  licenseKey: string;
  factoryId?: string;
  aimCount: number;
  model: string;
  version: string;
  lastHeartbeat: number;
}

export interface NodeManagerStatus {
  online: boolean;
  version: string;
  uptime: number;
  factories: NodeManagerFactory[];
  nodes: NodeManagerNode[];
}

class HyperCycleNodeManagerClient {

  /** Probe if Node Manager is running */
  async isOnline(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${NODE_MANAGER_URL}/health`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Get full status: factories + nodes */
  async getStatus(): Promise<NodeManagerStatus | null> {
    try {
      const res = await fetchWithTimeout(`${NODE_MANAGER_URL}/api/status`, TIMEOUT_MS);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn("[NodeManager] getStatus failed:", e);
      return null;
    }
  }

  /** Get factories owned by a wallet address */
  async getFactoriesByWallet(walletAddress: string): Promise<NodeManagerFactory[]> {
    try {
      const res = await fetchWithTimeout(
        `${NODE_MANAGER_URL}/api/factories?owner=${encodeURIComponent(walletAddress)}`,
        TIMEOUT_MS,
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.factories) ? data.factories : [];
    } catch (e) {
      console.warn("[NodeManager] getFactoriesByWallet failed:", e);
      return [];
    }
  }

  /** Get all nodes (Hboxes) */
  async getNodes(): Promise<NodeManagerNode[]> {
    try {
      const res = await fetchWithTimeout(`${NODE_MANAGER_URL}/api/nodes`, TIMEOUT_MS);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.nodes) ? data.nodes : [];
    } catch (e) {
      console.warn("[NodeManager] getNodes failed:", e);
      return [];
    }
  }

  /** Get nodes by factory */
  async getNodesByFactory(factoryId: string): Promise<NodeManagerNode[]> {
    try {
      const res = await fetchWithTimeout(
        `${NODE_MANAGER_URL}/api/factories/${encodeURIComponent(factoryId)}/nodes`,
        TIMEOUT_MS,
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.nodes) ? data.nodes : [];
    } catch (e) {
      console.warn("[NodeManager] getNodesByFactory failed:", e);
      return [];
    }
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

export default HyperCycleNodeManagerClient;

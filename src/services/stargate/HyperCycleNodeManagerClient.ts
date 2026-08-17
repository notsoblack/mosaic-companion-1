// =============================================================================
// HYPERCYCLE NODE MANAGER CLIENT
// Queries localhost:8000 for live node data
// Port 8000: Node info (/info), Admin config (/config on 8005)
// Port 8006 was incorrect — Node Manager uses 8000 for main API
// =============================================================================

const NODE_MANAGER_URL = "http://localhost:8000";
const ADMIN_URL = "http://localhost:8005";
const TIMEOUT_MS = 5000;

export interface NodeManagerStatus {
  online: boolean;
  version: string;
  address: string;
  nodeId: string;
  network: string;
  platform: string;
  license: string;
  uptimePercent: number;
  heartbeats: number;
  hardware: {
    memoryGB: number;
    cpuCount: number;
    diskGB: number;
    diskFreeGB: number;
  };
  aims: NodeManagerAIM[];
}

export interface NodeManagerAIM {
  imageId: string;
  imageName: string;
  imageTag: string;
  status: string;
  port: number;
  slot: number;
  whitelisted: boolean;
}

export interface NodeManagerConfig {
  nodeId: string;
  nodeName: string;
  nodeAddress: string;
  nodePort: number;
  adminPort: number;
  network: string;
  dbHost: string;
  dbPort: number;
  aimStartPort: number;
  aimEndPort: number;
}

class HyperCycleNodeManagerClient {

  /** Probe if Node Manager is running — uses /info which returns {"status":"alive"} */
  async isOnline(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${NODE_MANAGER_URL}/info`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Get full node status from /info endpoint */
  async getStatus(): Promise<NodeManagerStatus | null> {
    try {
      const res = await fetchWithTimeout(`${NODE_MANAGER_URL}/info`, TIMEOUT_MS);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status !== "alive") return null;

      const memGB = Math.round((data.hardware?.memory || 0) / 1024 / 1024 / 1024);
      const diskGB = Math.round((data.hardware?.disk_space || 0) / 1024 / 1024 / 1024);
      const diskFreeGB = Math.round((data.hardware?.disk_space_free || 0) / 1024 / 1024 / 1024);

      return {
        online: true,
        version: data.node_version || "unknown",
        address: data.address || "",
        nodeId: data.node_id || "",
        network: data.network || "unknown",
        platform: data.platform || "unknown",
        license: data.license || "",
        uptimePercent: data.uptime_summary?.percent_up || 0,
        heartbeats: data.uptime_summary?.heartbeats || 0,
        hardware: {
          memoryGB: memGB,
          cpuCount: data.hardware?.cpu_count || 0,
          diskGB,
          diskFreeGB,
        },
        aims: (data.aim?.aims || []).map((a: any) => ({
          imageId: a.image_id,
          imageName: a.image_name,
          imageTag: a.image_tag,
          status: a.status,
          port: a.port,
          slot: a.slot,
          whitelisted: a.whitelisted,
        })),
      };
    } catch (e) {
      console.warn("[NodeManager] getStatus failed:", e);
      return null;
    }
  }

  /** Get node config from admin port */
  async getConfig(): Promise<NodeManagerConfig | null> {
    try {
      const res = await fetchWithTimeout(`${ADMIN_URL}/config`, TIMEOUT_MS);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        nodeId: data.node_id || "",
        nodeName: data.node_name || "",
        nodeAddress: data.node_address || "",
        nodePort: data.node_port || 8000,
        adminPort: data.admin_port || 8005,
        network: data.network || "unknown",
        dbHost: data.db_host || "localhost",
        dbPort: data.db_port || 27017,
        aimStartPort: data.aim_start_port || 9000,
        aimEndPort: data.aim_end_port || 9100,
      };
    } catch (e) {
      console.warn("[NodeManager] getConfig failed:", e);
      return null;
    }
  }

  /** Get factories owned by a wallet address */
  async getFactoriesByWallet(walletAddress: string): Promise<any[]> {
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

  /** Get ANFE licenses from Node Manager */
  async getLicenses(walletAddress?: string): Promise<any[]> {
    try {
      const url = walletAddress
        ? `${NODE_MANAGER_URL}/api/licenses?owner=${encodeURIComponent(walletAddress)}`
        : `${NODE_MANAGER_URL}/api/licenses`;
      const res = await fetchWithTimeout(url, TIMEOUT_MS);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.licenses) ? data.licenses : (Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("[NodeManager] getLicenses failed:", e);
      return [];
    }
  }

  /** Get all nodes (fallback — returns empty for now) */
  async getNodes(): Promise<any[]> {
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

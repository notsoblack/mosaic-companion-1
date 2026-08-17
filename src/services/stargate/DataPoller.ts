// =============================================================================
// STARGATE DATA POLLER — Fixed to use correct IPC APIs
// Sources:
//   1. Node Manager (localhost:8000 /info) — node status + ANFEs
//   2. Web3 (electronAPI.web3.getAddress/getBalance) — wallet + balances
//   3. MCP (mcpAPI.listServers) — servers + tools
//   4. Vault (electronAPI.vault.getBoxes) — boxes
//   5. Midnight City (electronAPI.midnightCity) — agent status
// =============================================================================

import { useStargateStore } from "../../stores/stargateStore";
import HyperCycleNodeManagerClient from "./HyperCycleNodeManagerClient";

const POLL_INTERVALS = {
  nodeManager: 30000,  // 30s
  midnight: 10000,     // 10s
  web3: 15000,         // 15s
  mcp: 20000,          // 20s
  vault: 60000,        // 60s
};

let pollersRunning = false;
let intervals: ReturnType<typeof setInterval>[] = [];

export function startStargatePollers(): void {
  if (pollersRunning) return;
  pollersRunning = true;

  const store = useStargateStore.getState();
  const addLog = store.addLog;

  addLog("sidebar", "info", "Command Center pollers started");

  // ── 1. Node Manager Poller ──
  const pollNodeManager = async () => {
    try {
      const client = new HyperCycleNodeManagerClient();
      const status = await client.getStatus();
      if (status) {
        useStargateStore.getState().setNodeStatus(status);
        if (status.aims?.length > 0) {
          addLog("nodeManager", "info", `${status.aims.length} AIMs registered`);
        }
      }
    } catch {
      // Node Manager may be offline
    }
  };
  pollNodeManager();
  intervals.push(setInterval(pollNodeManager, POLL_INTERVALS.nodeManager));

  // ── 2. Midnight City Poller ──
  const pollMidnight = async () => {
    try {
      const midnightApi = (window as any).electronAPI?.midnightCity;
      if (!midnightApi) return;
      const status = await midnightApi.getStatus();
      if (status?.agent) {
        const agent = status.agent;
        useStargateStore.getState().setMidnightAgent({
          agentId: agent.id || "",
          profession: agent.profession || "unknown",
          hunger: agent.hunger?.value ?? 0,
          energy: agent.energy?.value ?? 0,
          crystals: agent.crystals || 0,
          spaceId: agent.position?.spaceId || "",
          isAutoWorking: status.autoWork?.enabled || false,
        });
      }
    } catch {
      // 404s suppressed
    }
  };
  intervals.push(setInterval(pollMidnight, POLL_INTERVALS.midnight));

  // ── 3. Web3 Wallet Poller (FIXED: handle object response) ──
  const pollWeb3 = async () => {
    try {
      const web3Api = (window as any).electronAPI?.web3;
      if (!web3Api?.getAddress) return;

      const result = await web3Api.getAddress();
      // Web3 API returns { success: true, data: { address: "0x..." } }
      const address = result?.data?.address || result?.address;
      if (address && typeof address === "string" && address.startsWith("0x")) {
        useStargateStore.getState().setWallet(address);
        addLog("web3", "info", `Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`);

        // Try to get balance
        try {
          const balResult = await web3Api.getBalance?.();
          if (balResult?.data) {
            const eth = Number(balResult.data.eth || 0).toFixed(6);
            addLog("web3", "info", `Balance: ${eth} ETH`);
          }
        } catch {
          // Balances may not be available
        }
      }
    } catch (e: any) {
      // Wallet not connected or API error
      console.warn("[DataPoller] Web3 poll failed:", e?.message || e);
    }
  };
  pollWeb3(); // immediate first call
  intervals.push(setInterval(pollWeb3, POLL_INTERVALS.web3));

  // ── 4. MCP Server Poller (FIXED: handle initialized vs connected) ──
  const pollMCP = async () => {
    try {
      const mcpApi = (window as any).electronAPI?.mcpAPI;
      if (!mcpApi?.listServers) return;

      const result = await mcpApi.listServers();
      // mcpAPI.listServers returns { success, data: { servers: [...] } }
      // OR directly an array depending on version
      let servers: any[] = [];
      if (Array.isArray(result)) {
        servers = result;
      } else if (result?.data?.servers) {
        servers = result.data.servers;
      } else if (result?.servers) {
        servers = result.servers;
      }

      const mapped = servers.map((s: any) => ({
        name: s.name || "unknown",
        toolCount: (s.tools || []).length || (s.toolCount || 0),
        // MCP servers use "initialized" not "connected"
        status: (s.initialized ? "connected" : "disconnected") as "connected" | "disconnected",
      }));

      useStargateStore.getState().setMcpServers(mapped);

      const totalTools = mapped.reduce((a, s) => a + s.toolCount, 0);
      if (mapped.length > 0) {
        addLog("mcp", "info", `${mapped.length} servers · ${totalTools} tools`);
      }
    } catch (e: any) {
      console.warn("[DataPoller] MCP poll failed:", e?.message || e);
    }
  };
  pollMCP(); // immediate first call
  intervals.push(setInterval(pollMCP, POLL_INTERVALS.mcp));

  // ── 5. Vault Box Poller ──
  const pollVault = async () => {
    try {
      const vaultApi = (window as any).electronAPI?.vault;
      if (!vaultApi) return;
      const result = await vaultApi.getBoxes();
      const boxes = Array.isArray(result) ? result : (result?.data || []);
      useStargateStore.getState().setVaultBoxes(
        (boxes || []).map((b: any) => ({
          id: b.id || "",
          name: b.name || "Unnamed",
          entryCount: b.entries?.length || b.entryCount || 0,
        }))
      );
    } catch {
      // Vault may not be initialized
    }
  };
  pollVault(); // immediate first call
  intervals.push(setInterval(pollVault, POLL_INTERVALS.vault));

  // ── 6. ANFE Discovery Poller ──
  const pollANFEs = async () => {
    try {
      const { discoverAllANFEs } = await import("./ANFEDiscoveryService");
      const result = await discoverAllANFEs();
      useStargateStore.getState().setAnfes(result.anfes);
      if (result.anfes.length > 0) {
        addLog(
          "anfe",
          "info",
          `${result.anfes.length} ANFEs total (${result.sources.nodeManager} Node · ${result.sources.web3} Web3)`
        );
      }
    } catch (e: any) {
      console.warn("[DataPoller] ANFE discovery failed:", e?.message || e);
    }
  };
  pollANFEs(); // immediate first call
  intervals.push(setInterval(pollANFEs, POLL_INTERVALS.vault));
}

export function stopStargatePollers(): void {
  if (!pollersRunning) return;
  intervals.forEach(clearInterval);
  intervals = [];
  pollersRunning = false;
  useStargateStore.getState().addLog("sidebar", "info", "Command Center pollers stopped");
}

export function arePollersRunning(): boolean {
  return pollersRunning;
}

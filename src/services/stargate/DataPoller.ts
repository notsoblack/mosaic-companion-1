// =============================================================================
// STARGATE DATA POLLER — Unified background polling for Command Center
// Polls: Node Manager (/info), Midnight City (status), Web3 (wallet), MCP (servers)
// All results feed into useStargateStore
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

/**
 * Start all Stargate data pollers.
 * Call this once when Stargate tab becomes active.
 */
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
        // Also update AIM list in logs if changed
        if (status.aims?.length > 0) {
          addLog("nodeManager", "info", `${status.aims.length} AIMs registered`);
        }
      }
    } catch (e: any) {
      // Silent — Node Manager may be offline
    }
  };
  pollNodeManager(); // immediate first call
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
    } catch (e: any) {
      // 404s suppressed — Midnight endpoints may not exist yet
    }
  };
  intervals.push(setInterval(pollMidnight, POLL_INTERVALS.midnight));

  // ── 3. Web3 Wallet Poller ──
  const pollWeb3 = async () => {
    try {
      const web3Api = (window as any).electronAPI?.web3;
      if (!web3Api) return;
      const address = await web3Api.getAddress();
      if (address) {
        useStargateStore.getState().setWallet(address);
        // Try to get ANFE count from local node
        try {
          const localNode = (window as any).electronAPI?.localNode;
          if (localNode) {
            const info = await localNode.getInfo();
            if (info?.anfe) {
              useStargateStore.getState().setAnfeCount(1);
            }
          }
        } catch {
          // ANFE may not be loaded
        }
      }
    } catch {
      // Wallet not connected
    }
  };
  intervals.push(setInterval(pollWeb3, POLL_INTERVALS.web3));

  // ── 4. MCP Server Poller ──
  const pollMCP = async () => {
    try {
      const mcpApi = (window as any).electronAPI?.mcpAPI;
      if (!mcpApi) return;
      const servers = await mcpApi.listServers();
      useStargateStore.getState().setMcpServers(
        (servers || []).map((s: any) => ({
          name: s.name || "unknown",
          toolCount: s.tools?.length || 0,
          status: s.connected ? "connected" : "disconnected",
        }))
      );
    } catch {
      // MCP not available
    }
  };
  intervals.push(setInterval(pollMCP, POLL_INTERVALS.mcp));

  // ── 5. Vault Box Poller ──
  const pollVault = async () => {
    try {
      const vaultApi = (window as any).electronAPI?.vault;
      if (!vaultApi) return;
      const boxes = await vaultApi.getBoxes();
      useStargateStore.getState().setVaultBoxes(
        (boxes || []).map((b: any) => ({
          id: b.id || "",
          name: b.name || "Unnamed",
          entryCount: b.entries?.length || 0,
        }))
      );
    } catch {
      // Vault may not be initialized
    }
  };
  intervals.push(setInterval(pollVault, POLL_INTERVALS.vault));
}

/**
 * Stop all pollers. Call when Stargate tab is hidden.
 */
export function stopStargatePollers(): void {
  if (!pollersRunning) return;
  intervals.forEach(clearInterval);
  intervals = [];
  pollersRunning = false;
  useStargateStore.getState().addLog("sidebar", "info", "Command Center pollers stopped");
}

/**
 * Check if pollers are running.
 */
export function arePollersRunning(): boolean {
  return pollersRunning;
}

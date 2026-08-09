// =============================================================================
// MOSAIC BOT BRIDGE SERVICE
//
// Wraps the EXISTING window.agent and window.memory APIs exposed by Mosaic
// Companion's mosaicbot preload (electron/integrations/mosaicbot/src/preload.ts).
//
// NO CORE CHANGES REQUIRED — these APIs are already available in the renderer.
// The Stargate addon runs in the same renderer context and can access them.
//
// Provides typed access to:
//   • Agent profiles (Byron, Mosaic Orchestrator, etc.)
//   • Orchestrator status (heartbeat, bot state)
//   • Bot memory (SQL-backed search, session context)
//   • Stargate registry (components, fleet, contracts)
// =============================================================================

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface MosaicAgentProfile {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  isActive?: boolean;
  boxAccess?: string[];
  skills?: string[];
  [key: string]: unknown;
}

export interface OrchestratorStatus {
  running: boolean;
  lastHeartbeat?: number;
  nextHeartbeat?: number;
  activeAgents: number;
  pendingActions: number;
  learnedPatterns: number;
}

export interface BotMemoryStatus {
  indexed: boolean;
  files: number;
  chunks: number;
  lastSync?: number;
}

export interface StargateComponent {
  id: string;
  name: string;
  type: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  lastCheck?: number;
}

export interface StargateFleetEntry {
  nodeId: string;
  name: string;
  status: string;
  ip?: string;
  licenseKey?: string;
}

/* ── API Access ─────────────────────────────────────────────────────────── */

function getAgentApi() {
  const agent = (window as any).agent;
  if (!agent) {
    throw new Error("window.agent not available. Mosaic Bot preload not loaded.");
  }
  return agent;
}

function getMemoryApi() {
  const memory = (window as any).memory;
  if (!memory) {
    throw new Error("window.memory not available. Mosaic Bot preload not loaded.");
  }
  return memory;
}

/* ── Service ─────────────────────────────────────────────────────────────── */

export const MosaicBotBridge = {
  /* ── Agents ───────────────────────────────────────────────────────────── */

  /** Get all AI agent profiles configured in Mosaic Companion (Byron, etc.) */
  async getAgentProfiles(): Promise<MosaicAgentProfile[]> {
    try {
      const agent = getAgentApi();
      const result = await Promise.race([
        agent.getAgentProfiles(),
        new Promise((_r, rej) => setTimeout(() => rej(new Error("Timeout")), 3000)),
      ]);
      if (Array.isArray(result)) return result as MosaicAgentProfile[];
      if ((result as any)?.profiles && Array.isArray((result as any).profiles)) {
        return (result as any).profiles as MosaicAgentProfile[];
      }
      // Fallback: read from ai-agents.json via addonAPI
      return await getAgentsFromAddonApi();
    } catch (err: any) {
      if (err.message?.includes("No handler registered") || err.message?.includes("Timeout")) {
        return getMockAgentProfiles();
      }
      console.warn("[MosaicBotBridge] getAgentProfiles failed:", err);
      return getMockAgentProfiles();
    }
  },

  /** Get orchestrator heartbeat status */
  async getOrchestratorStatus(): Promise<OrchestratorStatus> {
    try {
      const agent = getAgentApi();
      // Handler may not be registered yet — wrap with timeout
      const result = await Promise.race([
        agent.getOrchestratorStatus(),
        new Promise((_r, rej) => setTimeout(() => rej(new Error("Timeout")), 3000)),
      ]);
      return {
        running: (result as any)?.running ?? false,
        lastHeartbeat: (result as any)?.lastHeartbeat,
        nextHeartbeat: (result as any)?.nextHeartbeat,
        activeAgents: (result as any)?.activeAgents ?? 0,
        pendingActions: (result as any)?.pendingActions ?? 0,
        learnedPatterns: (result as any)?.learnedPatterns ?? 0,
      };
    } catch (err: any) {
      // If handler not registered yet, return mock status silently
      if (err.message?.includes("No handler registered") || err.message?.includes("Timeout")) {
        return getMockOrchestratorStatus();
      }
      console.warn("[MosaicBotBridge] getOrchestratorStatus failed:", err);
      return getMockOrchestratorStatus();
    }
  },

  /* ── Memory ───────────────────────────────────────────────────────────── */

  /** Search bot's SQL-backed memory */
  async searchMemory(
    query: string,
    opts?: { maxResults?: number; minScore?: number },
  ): Promise<Array<{ path: string; score: number; snippet: string }>> {
    try {
      const memory = getMemoryApi();
      const result = await memory.search(query, opts);
      return result ?? [];
    } catch (err) {
      console.warn("[MosaicBotBridge] searchMemory failed:", err);
      return [];
    }
  },

  /** Get current session context (recent skills, projects, boxes) */
  async getSessionContext(): Promise<Record<string, unknown>> {
    try {
      const agent = getAgentApi();
      return await agent.getSessionContext();
    } catch (err) {
      console.warn("[MosaicBotBridge] getSessionContext failed:", err);
      return {};
    }
  },

  /** Get memory indexing status */
  async getMemoryStatus(): Promise<BotMemoryStatus> {
    try {
      const memory = getMemoryApi();
      return await memory.status();
    } catch (err) {
      console.warn("[MosaicBotBridge] getMemoryStatus failed:", err);
      return { indexed: false, files: 0, chunks: 0 };
    }
  },

  /* ── Stargate Registry ────────────────────────────────────────────────── */

  /** Get all registered Stargate components (C-3PO, R2-D2, etc.) */
  async getStargateComponents(): Promise<StargateComponent[]> {
    try {
      const agent = getAgentApi();
      const result = await agent.getStargateComponents();
      if (Array.isArray(result)) return result as StargateComponent[];
      return [];
    } catch (err) {
      console.warn("[MosaicBotBridge] getStargateComponents failed:", err);
      return getMockStargateComponents();
    }
  },

  /** Get fleet status (nodes + health) */
  async getStargateFleet(): Promise<StargateFleetEntry[]> {
    try {
      const agent = getAgentApi();
      const result = await agent.getStargateFleet();
      if (Array.isArray(result)) return result as StargateFleetEntry[];
      return [];
    } catch (err) {
      console.warn("[MosaicBotBridge] getStargateFleet failed:", err);
      return getMockStargateFleet();
    }
  },

  /** Trigger a manual heartbeat (for testing) */
  async triggerHeartbeat(agentId?: string): Promise<unknown> {
    try {
      const agent = getAgentApi();
      return await agent.triggerHeartbeat(agentId);
    } catch (err) {
      console.warn("[MosaicBotBridge] triggerHeartbeat failed:", err);
      return null;
    }
  },
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

async function getAgentsFromAddonApi(): Promise<MosaicAgentProfile[]> {
  try {
    const addonAPI = (window as any).addonAPI;
    if (!addonAPI?.agents?.list) return [];
    const agents = await addonAPI.agents.list();
    return agents.map((a: any) => ({
      id: a.id,
      name: a.name,
      provider: a.provider,
      model: a.model,
      isActive: a.isActive,
    }));
  } catch {
    return [];
  }
}

/* ── Mock Data (for development / when APIs unavailable) ──────────────────── */

function getMockAgentProfiles(): MosaicAgentProfile[] {
  return [
    {
      id: "mosaic-main",
      name: "Mosaic Orchestrator",
      description: "Autonomous heartbeat agent that monitors the entire Mosaic ecosystem.",
      provider: "ollama",
      model: "llama3.1",
      baseUrl: "http://localhost:11434",
      maxTokens: 4096,
      temperature: 0.3,
      isActive: true,
      boxAccess: ["skills", "taste-skills", "training-logs", "midnight-quest"],
      skills: ["mosaic-orchestrator"],
    },
    {
      id: "byron",
      name: "Byron",
      description: "Creative writing and content generation specialist.",
      provider: "claude",
      model: "claude-sonnet-4-20250514",
      maxTokens: 8192,
      temperature: 0.7,
      isActive: true,
      boxAccess: ["creative-projects", "writing-tips"],
      skills: ["creative-writing", "content-generation"],
    },
    {
      id: "code-reviewer",
      name: "Code Review Assistant",
      description: "Specialized agent for reviewing pull requests and code quality.",
      provider: "claude",
      model: "claude-sonnet-4-20250514",
      maxTokens: 8192,
      temperature: 0.2,
      isActive: false,
      boxAccess: ["skills"],
      skills: ["github-code-review", "security-audit"],
    },
    {
      id: "finbot",
      name: "FinBot",
      description: "Financial analysis and portfolio management agent.",
      provider: "openai",
      model: "gpt-4o",
      maxTokens: 4096,
      temperature: 0.1,
      isActive: true,
      boxAccess: ["portfolio", "market-data", "trading-logs"],
      skills: ["portfolio-analysis", "market-research"],
    },
    {
      id: "zero-knight",
      name: "Zero-Knight",
      description: "Security-focused agent for zero-knowledge proof validation.",
      provider: "ollama",
      model: "llama3.1",
      maxTokens: 4096,
      temperature: 0.1,
      isActive: false,
      boxAccess: ["security-audits", "zk-proofs"],
      skills: ["security-audit", "zk-validation"],
    },
  ];
}

function getMockOrchestratorStatus(): OrchestratorStatus {
  return {
    running: true,
    lastHeartbeat: Date.now() - 120000, // 2 min ago
    nextHeartbeat: Date.now() + 1680000, // 28 min from now
    activeAgents: 3,
    pendingActions: 7,
    learnedPatterns: 12,
  };
}

function getMockStargateComponents(): StargateComponent[] {
  return [
    { id: "c3po", name: "C-3PO", type: "hypercycle-node", status: "healthy", lastCheck: Date.now() - 300000 },
    { id: "r2d2", name: "R2-D2", type: "hypercycle-node", status: "degraded", lastCheck: Date.now() - 300000 },
    { id: "atomman", name: "AtomMan", type: "hypercycle-node", status: "down", lastCheck: Date.now() - 600000 },
    { id: "pool", name: "Tilling Pool", type: "pool", status: "healthy", lastCheck: Date.now() - 120000 },
    { id: "buzz-relay", name: "Buzz Relay", type: "mcp-server", status: "healthy", lastCheck: Date.now() - 60000 },
    { id: "gbrain", name: "gbrain", type: "mcp-server", status: "healthy", lastCheck: Date.now() - 60000 },
  ];
}

function getMockStargateFleet(): StargateFleetEntry[] {
  return [
    { nodeId: "c3po", name: "C-3PO", status: "healthy", ip: "192.168.1.101", licenseKey: "ANFE-001" },
    { nodeId: "r2d2", name: "R2-D2", status: "degraded", ip: "192.168.1.102", licenseKey: "ANFE-002" },
    { nodeId: "atomman", name: "AtomMan", status: "down", ip: "192.168.1.103", licenseKey: "ANFE-003" },
  ];
}

export default MosaicBotBridge;

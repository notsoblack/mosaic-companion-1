// =============================================================================
// STARGATE STORE — Zustand
// Single source of truth for Stargate Command Center state
// Connects: Node Manager, Midnight City, Web3, Loops, MCP, Vault, Skills
// =============================================================================

import { create } from "zustand";

// ── Types ────────────────────────────────────────────────────────────────────

export type StargateTab =
  | "start"
  | "skills"
  | "graph"
  | "midnight"
  | "loops"
  | "factories"
  | "network";

export interface LogEntry {
  id: string;
  source: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  time: number;
}

// ── Skill Types (ported from Hermes) ─────────────────────────────────────────

export type SkillProvenance = "builtin" | "hub" | "local" | "learned";

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  provenance: SkillProvenance;
  usage: number;
  version?: string;
  author?: string;
  license?: string;
  platforms?: string[];
  tags?: string[];
  relatedSkills?: string[];
  githubUrl?: string;
  toggling?: boolean;
}

export interface HubAction {
  running: boolean;
  error?: string;
  startedAt: number;
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

export interface MidnightAgent {
  agentId: string;
  profession: string;
  hunger: number;
  energy: number;
  crystals: number;
  spaceId: string;
  isAutoWorking: boolean;
}

export interface ActiveLoop {
  id: string;
  name: string;
  status: "running" | "paused" | "dry-run" | "cron";
  startTime: number;
  agentId?: string;
}

export interface MCPServerBrief {
  name: string;
  toolCount: number;
  status: "connected" | "disconnected" | "error";
}

export interface ANFEAsset {
  id: string;              // token ID or license number
  source: "node-manager" | "web3";  // Where it was discovered
  level: number;
  name: string;
  status: string;          // "Owned", "Delegated", "Active", etc.
  ownerAddress?: string;   // The wallet that owns it
  chain?: string;          // "ethereum", "base", "mainnet"
  delegatedTo?: string;    // If delegated
  image?: string;          // NFT image URL
}

export interface VaultBoxBrief {
  id: string;
  name: string;
  entryCount: number;
}

// ── Store ────────────────────────────────────────────────────────────────────

interface StargateState {
  // Tab
  activeTab: StargateTab;
  setActiveTab: (tab: StargateTab) => void;

  // Node Manager
  nodeStatus: NodeManagerStatus | null;
  setNodeStatus: (s: NodeManagerStatus | null) => void;

  // Web3 + Node Manager ANFEs
  walletAddress: string | null;
  walletBalance: string | null;
  anfes: ANFEAsset[];           // Unified: both Node Manager + Web3 ANFEs
  setWallet: (address: string | null, balance?: string | null) => void;
  setAnfes: (assets: ANFEAsset[]) => void;

  // Midnight
  midnightAgent: MidnightAgent | null;
  setMidnightAgent: (a: MidnightAgent | null) => void;
  updateMidnightNeeds: (hunger: number, energy: number) => void;
  setMidnightAutoWork: (v: boolean) => void;

  // Loops
  activeLoops: ActiveLoop[];
  addLoop: (loop: ActiveLoop) => void;
  removeLoop: (id: string) => void;
  updateLoopStatus: (id: string, status: ActiveLoop["status"]) => void;

  // MCP
  mcpServers: MCPServerBrief[];
  setMcpServers: (servers: MCPServerBrief[]) => void;

  // Vault
  vaultBoxes: VaultBoxBrief[];
  setVaultBoxes: (boxes: VaultBoxBrief[]) => void;

  // Skills (ported from Hermes)
  skills: SkillInfo[];
  setSkills: (skills: SkillInfo[]) => void;
  selectedSkillId: string | null;
  setSelectedSkillId: (id: string | null) => void;
  /** Optimistic toggle — updates UI immediately, syncs backend */
  toggleSkill: (skillId: string) => Promise<void>;
  /** Track skill usage (called when skill is injected into prompt) */
  trackSkillUsage: (skillId: string) => void;
  /** Hub actions (install/uninstall in progress) */
  hubActions: Record<string, HubAction>;
  setHubAction: (skillId: string, action: HubAction | undefined) => void;
  /** Hub installed override (optimistic state before sources reconcile) */
  hubInstalledOverride: Record<string, boolean>;
  setHubInstalledOverride: (skillId: string, installed: boolean | undefined) => void;
  /** Search query for skills */
  skillSearchQuery: string;
  setSkillSearchQuery: (query: string) => void;
  /** Skills sort direction */
  skillsSortDesc: boolean;
  setSkillsSortDesc: (v: boolean) => void;

  // Activity Feed
  logs: LogEntry[];
  addLog: (source: string, level: LogEntry["level"], message: string) => void;
  clearLogs: () => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (v: boolean) => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useStargateStore = create<StargateState>((set, get) => ({
  // Tab
  activeTab: "graph",
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Node Manager
  nodeStatus: null,
  setNodeStatus: (status) => set({ nodeStatus: status }),

  // Web3
  walletAddress: null,
  walletBalance: null,
  anfes: [],
  setWallet: (address, balance = null) =>
    set({ walletAddress: address, walletBalance: balance }),
  setAnfes: (assets) => set({ anfes: assets }),

  // Midnight
  midnightAgent: null,
  setMidnightAgent: (agent) => set({ midnightAgent: agent }),
  updateMidnightNeeds: (hunger, energy) =>
    set((state) => ({
      midnightAgent: state.midnightAgent
        ? { ...state.midnightAgent, hunger, energy }
        : null,
    })),
  setMidnightAutoWork: (v) =>
    set((state) => ({
      midnightAgent: state.midnightAgent
        ? { ...state.midnightAgent, isAutoWorking: v }
        : null,
    })),

  // Loops
  activeLoops: [],
  addLoop: (loop) =>
    set((state) => ({
      activeLoops: [...state.activeLoops, loop],
    })),
  removeLoop: (id) =>
    set((state) => ({
      activeLoops: state.activeLoops.filter((l) => l.id !== id),
    })),
  updateLoopStatus: (id, status) =>
    set((state) => ({
      activeLoops: state.activeLoops.map((l) =>
        l.id === id ? { ...l, status } : l
      ),
    })),

  // MCP
  mcpServers: [],
  setMcpServers: (servers) => set({ mcpServers: servers }),

  // Vault
  vaultBoxes: [],
  setVaultBoxes: (boxes) => set({ vaultBoxes: boxes }),

  // Skills
  skills: [],
  setSkills: (skills) => set({ skills }),
  selectedSkillId: null,
  setSelectedSkillId: (id) => set({ selectedSkillId: id }),
  toggleSkill: async (skillId) => {
    const state = get();
    const skill = state.skills.find((s) => s.id === skillId);
    if (!skill) return;

    // Optimistic: mark as toggling + flip enabled
    const newEnabled = !skill.enabled;
    set((state) => ({
      skills: state.skills.map((s) =>
        s.id === skillId ? { ...s, enabled: newEnabled, toggling: true } : s
      ),
    }));

    // Sync backend (best-effort)
    try {
      const api = (window as any).electronAPI?.skills;
      if (api?.setEnabled) {
        await api.setEnabled(skill.name, newEnabled);
      }
      get().addLog("skills", "info", `${newEnabled ? "Enabled" : "Disabled"} skill "${skill.name}"`);
    } catch (err: any) {
      // Rollback on error
      set((state) => ({
        skills: state.skills.map((s) =>
          s.id === skillId
            ? { ...s, enabled: skill.enabled, toggling: false }
            : s
        ),
      }));
      get().addLog(
        "skills",
        "error",
        `Failed to toggle skill "${skill.name}": ${err.message || err}`
      );
      throw err;
    } finally {
      // Clear toggling flag
      set((state) => ({
        skills: state.skills.map((s) =>
          s.id === skillId ? { ...s, toggling: false } : s
        ),
      }));
    }
  },
  trackSkillUsage: (skillId) => {
    set((state) => ({
      skills: state.skills.map((s) =>
        s.id === skillId ? { ...s, usage: s.usage + 1 } : s
      ),
    }));
  },
  hubActions: {},
  setHubAction: (skillId, action) =>
    set((state) => ({
      hubActions: action
        ? { ...state.hubActions, [skillId]: action }
        : Object.fromEntries(
            Object.entries(state.hubActions).filter(([k]) => k !== skillId)
          ),
    })),
  hubInstalledOverride: {},
  setHubInstalledOverride: (skillId, installed) =>
    set((state) => ({
      hubInstalledOverride: installed !== undefined
        ? { ...state.hubInstalledOverride, [skillId]: installed }
        : Object.fromEntries(
            Object.entries(state.hubInstalledOverride).filter(([k]) => k !== skillId)
          ),
    })),
  skillSearchQuery: "",
  setSkillSearchQuery: (query) => set({ skillSearchQuery: query }),
  skillsSortDesc: true,
  setSkillsSortDesc: (v) => set({ skillsSortDesc: v }),

  // Activity Feed
  logs: [],
  addLog: (source, level, message) =>
    set((state) => ({
      logs: [
        ...state.logs.slice(-499),
        { id: generateId(), source, level, message, time: Date.now() },
      ],
    })),
  clearLogs: () => set({ logs: [] }),

  // Sidebar
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}));

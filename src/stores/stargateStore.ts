// =============================================================================
// STARGATE STORE — Zustand
// Single source of truth for Stargate Command Center state
// Connects: Node Manager, Midnight City, Web3, Loops, MCP, Vault
// =============================================================================

import { create } from "zustand";

// ── Types ────────────────────────────────────────────────────────────────────

export type StargateTab =
  | "start"
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

  // Web3
  walletAddress: string | null;
  walletBalance: string | null;
  anfeCount: number;
  setWallet: (address: string | null, balance?: string | null) => void;
  setAnfeCount: (n: number) => void;

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
  anfeCount: 0,
  setWallet: (address, balance = null) =>
    set({ walletAddress: address, walletBalance: balance }),
  setAnfeCount: (n) => set({ anfeCount: n }),

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

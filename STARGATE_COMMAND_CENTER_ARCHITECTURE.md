# Stargate Command Center — Deep Architecture Analysis

**Date:** 2026-08-16
**Author:** Vibecoder Profile Analysis
**Goal:** Design how the Command Center integrates Stargate tabs WITH Mosaic Companion components

---

## 1. Current Architecture Snapshot

### Mosaic Companion Shell (App.tsx)

```
App.tsx (root)
├── Sidebar.tsx          ← Left nav (Home, AI Chat, MCP, Vault, Web3, Stargate...)
├── TopBar.tsx           ← Window controls + URL bar
├── ContentArea.tsx      ← Main content area
│   └── TabStrip         ← Browser-style tabs
│       └── Tab Content  ← Renders based on URL
│           ├── Home     ← Browser view
│           ├── AI Chat  ← Chatview.tsx
│           ├── Stargate ← AdaPortalPanel.tsx (current)
│           ├── Vault    ← VaultPanel
│           └── Web3     ← Web3Page
└── BottomBar.tsx        ← Global status
```

### Stargate Current State (AdaPortalPanel.tsx)

```
AdaPortalPanel.tsx (4,635 lines)
├── Tab Bar (inline, top of panel)
│   ├── Start
│   ├── Agent Forge
│   ├── Skills
│   ├── Compute
│   ├── Command Center
│   ├── Factories
│   ├── Midnight
│   ├── Network
│   ├── Graph
│   └── Loops
└── Content Area (switches based on activeTab)
    ├── renderStart()         — Action cards
    ├── renderMarketplace()   — Agent hiring
    ├── <StargateSkillsMarketplacePanel />
    ├── renderCompute() + renderNodes()
    ├── renderDashboard()     — Command Center (existing)
    ├── renderStargatePool()  — Factories/ANFE
    ├── <MidnightCityCommandPanel /> — v2.0 economy
    ├── <StargateBuzzPanel /> — Network
    ├── <StargateGraphPanel /> — Graph
    └── <LoopsPanel />        — Loops
```

**Problem:** Stargate is a "page" inside Mosaic. It has its OWN tab bar, disconnected from Mosaic's sidebar. It doesn't integrate with Vault, MCP, or AI Chat.

---

## 2. The Vision: Command Center as Integration Layer

The Command Center should be a **dashboard** that aggregates data from:
- **Stargate systems:** Nodes, AIMs, Factories, Midnight agents, Loops, Graph
- **Mosaic systems:** Vault boxes, MCP servers, Web3 wallet, Byron agent

Like VS Code's Activity Bar + Sidebar + Editor panels — everything context-aware.

### Key Design Principles

1. **Unified Header** — One status bar showing ALL systems (not just Stargate)
2. **Context-Aware Sidebar** — Left panel changes based on selected Stargate tab
3. **Shared State** — Zustand store connects Stargate tabs to Mosaic components
4. **Event Bus** — Real-time updates flow between systems (no polling hell)
5. **Byron Integration** — AI Chat sees Stargate context; can trigger actions

---

## 3. Proposed Architecture

### 3.1 Component Hierarchy

```
StargateCommandCenter.tsx (NEW — replaces AdaPortalPanel as entry point)
├── StargateHeader.tsx (NEW)
│   ├── NodeManagerStatusBadge    ← Port 8000 /info
│   ├── Web3WalletBadge           ← Connected wallet + balance
│   ├── MidnightAgentBadge        ← Agent status, hunger, crystals
│   ├── ActiveLoopsBadge          ← Running loop count + glow
│   ├── MCPStatusBadge            ← Connected MCP servers
│   └── ANFEBadge                 ← Local ANFE license
├── StargateLayout.tsx (NEW)
│   ├── StargateSidebar.tsx (NEW) ← Context-aware left panel
│   │   ├── TabSwitcher           ← Same tabs, but vertical + icon-only option
│   │   └── ContextActions        ← Changes per tab (see below)
│   ├── MainStage.tsx (NEW)       ← Tab content area
│   │   ├── GraphTab              ← StargateGraphPanel
│   │   ├── MidnightTab           ← MidnightCityCommandPanel
│   │   ├── LoopsTab              ← LoopsPanel
│   │   ├── FactoriesTab          ← NodeFactoryTrackerPanel + StargatePoolHub
│   │   ├── NetworkTab            ← StargateBuzzPanel
│   │   └── StartTab              ← Action cards + quick links
│   └── ActivityFeed.tsx (NEW)    ← Bottom panel — unified logs
└── QuickActionsFAB.tsx (NEW)     ← Floating buttons (Eat, Auto-Work, etc.)
```

### 3.2 Context-Aware Sidebar Actions

The sidebar shows **different actions based on active tab**:

| Active Tab | Sidebar Actions |
|------------|----------------|
| **Graph** | Create Loop, Refresh Nodes, Export Image, Toggle Constellation Mode, Filter by MCP/Vault/Web3 |
| **Midnight** | Eat, Sleep, Buy Supplies, Toggle Auto-Work, Connect Agent, Check Inventory |
| **Loops** | New Loop, Import JSON, Dry Run, Export Topology, Load Preset |
| **Factories** | Load from Chain, Provision Node, Check License, Refresh Status |
| **Network** | Refresh Buzz, Post Message, Check Node Health |
| **Start** | Quick Links: Open Node Manager (8006), Open AI Chat, Open Vault |

These actions **call existing functions** — no new logic needed, just a new UI surface.

### 3.3 Activity Feed — Unified Logging

All systems pipe logs into one feed:

```
[14:32:01] [Midnight] Agent ate bread — hunger: 45% → 78%
[14:32:15] [NodeManager] HyperCycle node status: alive (98% uptime)
[14:32:30] [LoopEngine] Loop "byron-midnight" started — dry-run mode
[14:32:45] [Vault] Box "midnight-config" accessed by Byron
[14:33:00] [MCP] Tool "midnight_city_wallet" executed successfully
[14:33:15] [Web3] Wallet 0x48...1484 connected on Base
```

**Sources:**
- Midnight City API calls
- Node Manager /info polling
- LoopEngine execution
- Vault IPC calls
- MCP tool executions
- Web3 wallet events

---

## 4. State Architecture (Zustand)

### 4.1 The Store

```typescript
// src/stores/stargateStore.ts
import { create } from 'zustand';

interface StargateState {
  // ── Tab State ──
  activeTab: 'start' | 'graph' | 'midnight' | 'loops' | 'factories' | 'network';
  setActiveTab: (tab: StargateState['activeTab']) => void;

  // ── Node Manager State ──
  nodeStatus: NodeManagerStatus | null;
  setNodeStatus: (status: NodeManagerStatus | null) => void;

  // ── Web3 State ──
  walletAddress: string | null;
  walletBalance: string | null;
  setWallet: (address: string | null, balance: string | null) => void;

  // ── Midnight State ──
  midnightAgent: {
    agentId: string;
    profession: string;
    hunger: number;
    energy: number;
    crystals: number;
    spaceId: string;
    isAutoWorking: boolean;
  } | null;
  setMidnightAgent: (agent: StargateState['midnightAgent']) => void;
  updateMidnightNeeds: (hunger: number, energy: number) => void;

  // ── Loops State ──
  activeLoops: Loop[];
  addLoop: (loop: Loop) => void;
  removeLoop: (id: string) => void;

  // ── Activity Feed ──
  logs: LogEntry[];
  addLog: (source: string, level: 'info'|'warn'|'error'|'success', message: string) => void;
  clearLogs: () => void;

  // ── MCP State ──
  mcpServers: MCPServer[];
  setMcpServers: (servers: MCPServer[]) => void;

  // ── Vault State ──
  vaultBoxes: VaultBox[];
  setVaultBoxes: (boxes: VaultBox[]) => void;
}

export const useStargateStore = create<StargateState>((set, get) => ({
  activeTab: 'graph',
  setActiveTab: (tab) => set({ activeTab: tab }),

  nodeStatus: null,
  setNodeStatus: (status) => set({ nodeStatus: status }),

  walletAddress: null,
  walletBalance: null,
  setWallet: (address, balance) => set({ walletAddress: address, walletBalance: balance }),

  midnightAgent: null,
  setMidnightAgent: (agent) => set({ midnightAgent: agent }),
  updateMidnightNeeds: (hunger, energy) =>
    set((state) => ({
      midnightAgent: state.midnightAgent
        ? { ...state.midnightAgent, hunger, energy }
        : null,
    })),

  activeLoops: [],
  addLoop: (loop) => set((state) => ({ activeLoops: [...state.activeLoops, loop] })),
  removeLoop: (id) => set((state) => ({ activeLoops: state.activeLoops.filter((l) => l.id !== id) })),

  logs: [],
  addLog: (source, level, message) =>
    set((state) => ({
      logs: [...state.logs.slice(-499), { id: crypto.randomUUID(), source, level, message, time: Date.now() }],
    })),
  clearLogs: () => set({ logs: [] }),

  mcpServers: [],
  setMcpServers: (servers) => set({ mcpServers: servers }),

  vaultBoxes: [],
  setVaultBoxes: (boxes) => set({ vaultBoxes: boxes }),
}));
```

### 4.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  EXTERNAL SYSTEMS                                                │
│  ├── Node Manager (localhost:8000)                              │
│  ├── Midnight City API                                          │
│  ├── Web3 Wallet (MetaMask / Mosaic)                            │
│  ├── MCP Servers (8+ servers, 123 tools)                        │
│  └── Vault (JSON files in ~/.config)                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ IPC / fetch
┌─────────────────────────────────────────────────────────────────┐
│  DATA LAYER (Background polling + event listeners)              │
│  ├── NodeManagerPoller → calls /info every 30s                  │
│  ├── MidnightSyncService → syncs agent state every 10s          │
│  ├── Web3WalletListener → listens for wallet events             │
│  ├── MCPDiscoveryService → watches server connections           │
│  └── VaultWatcher → watches file changes                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓ setState
┌─────────────────────────────────────────────────────────────────┐
│  ZUSTAND STORE (Single source of truth)                        │
│  ├── nodeStatus                                                 │
│  ├── midnightAgent                                              │
│  ├── walletAddress / walletBalance                              │
│  ├── activeLoops                                                │
│  ├── mcpServers                                                 │
│  ├── vaultBoxes                                                 │
│  └── logs                                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓ subscribe
┌─────────────────────────────────────────────────────────────────┐
│  UI COMPONENTS (Reactive renders)                              │
│  ├── StargateHeader → watches nodeStatus, wallet, loops        │
│  ├── StargateSidebar → watches activeTab                       │
│  ├── MainStage → watches activeTab + specific data            │
│  ├── ActivityFeed → watches logs                               │
│  └── QuickActionsFAB → watches midnightAgent, loops           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Integration Points with Mosaic Companion

### 5.1 Sidebar Integration

**Current:** Sidebar has "Stargate" as one item. Clicking it opens AdaPortalPanel.

**Proposed:** Keep "Stargate" in sidebar. But add **live indicators**:

```
Sidebar Item: Stargate 🌐
├── Badge: Active loops count (e.g., "2")
├── Badge: Node Manager status (green dot = alive)
└── Tooltip: "HyperCycle: 98% uptime | Midnight: Mining | 2 Loops running"
```

**Implementation:**
- Sidebar.tsx subscribes to `useStargateStore` for nodeStatus + activeLoops
- Shows dot/badges without major refactoring

### 5.2 AI Chat Integration

**Current:** Byron in AI Chat can trigger tools. Auto-dispatch exists for Midnight City.

**Proposed:** When user is on Stargate tab, AI Chat gets **Stargate context injected**:

```
[System Prompt Addition]
Current Stargate Status:
- HyperCycle Node: AtomMan (x86_64, 22 CPUs, 64GB, 98% uptime)
- AIMs: mosaic-hermes-aim (virtual), hyperbox-tiller (running)
- Midnight Agent: user-agent-61gxq6yztb3uyvd at miner-central
  - Hunger: 45%, Energy: 78%, Crystals: 1,475,023
  - Auto-work: ON
- Active Loops: 2 (byron-midnight, auto-restock)
- Vault Boxes: 8 accessible (midnight-config, agent-briefs, etc.)
- MCP Servers: 8 connected (123 tools available)
```

**Implementation:**
- When active tab URL is Stargate, Chatview.tsx reads store state
- Injects summary into system prompt before sending to Byron

### 5.3 Vault Integration

**Current:** Vault is separate tab. Stargate never writes to Vault.

**Proposed:** Command Center shows **Vault boxes as context**:

```
Sidebar Panel (when Vault-related action selected):
┌─ Vault Context ─────────────────┐
│ Boxes accessible to Byron:      │
│ • midnight-config (6 entries)   │
│ • agent-briefs (12 entries)   │
│ • stargate-pools (4 entries)   │
│                                 │
│ [View in Vault]                 │
└─────────────────────────────────┘
```

**Implementation:**
- StargateSidebar reads vaultBoxes from store
- "View in Vault" button navigates to Vault tab via `onNavigate`

### 5.4 MCP Integration

**Current:** MCP Servers tab shows connected servers. Stargate Graph shows them as nodes.

**Proposed:** Command Center shows **MCP health in header**:

```
Header Badge: MCP ● 8 servers, 123 tools
├── Hover: List of servers (filesystem, web_search, etc.)
└── Click: Navigate to MCP Servers tab
```

### 5.5 Web3 Integration

**Current:** Web3 is separate tab. Stargate shows ANFE/factories if wallet connected.

**Proposed:** Wallet status visible everywhere in Command Center:

```
Header: Wallet 0x48...1484 | 2 ANFEs | Base Chain
├── Click: Open Web3 tab
└── Shows factory/ANFE summary
```

---

## 6. The Activity Feed — Central Nervous System

This is the **most unique** feature. No other component in Mosaic has unified logging.

### Why It Matters

Currently, each system logs to console independently:
- Midnight → `console.log("[Midnight] ...")`
- Node Manager → `console.warn("[NodeManager] ...")`
- Loops → `console.log("[LoopEngine] ...")`
- Vault → silent

**Problem:** User can't see what's happening across systems. Byron can't see activity history.

### Solution: Centralized Log Store

All components call `useStargateStore.getState().addLog(...)` instead of `console.log`.

```typescript
// Example: MidnightCityCommandPanel.tsx
const eat = async () => {
  addLog('midnight', 'info', 'Sending eat command...');
  try {
    const res = await apiCall('/api/actions', { kind: 'eat', itemId: 'bread' });
    addLog('midnight', 'success', `Ate bread — hunger: ${before}% → ${after}%`);
  } catch (e) {
    addLog('midnight', 'error', `Eat failed: ${e.message}`);
  }
};
```

### Activity Feed UI

```
┌─ Activity Feed ─────────────────────────────────────┐
│ [All] [Midnight] [NodeManager] [Loops] [MCP] [Vault]│
│ ───────────────────────────────────────────────────│
│ 🟢 [14:32] Midnight — Agent ate bread              │
│ 🔵 [14:32] NodeManager — Node status: alive 98%    │
│ 🟡 [14:32] LoopEngine — Loop "byron-midnight" dry-run│
│ 🟢 [14:33] Vault — Box "midnight-config" read        │
│ 🔵 [14:33] MCP — Tool "midnight_city_wallet" called  │
│                                                    │
│ [Clear] [Export Logs] [Auto-scroll ☐]              │
└────────────────────────────────────────────────────┘
```

---

## 7. Byron Integration — The AI Control Layer

Byron should **see** the Command Center state and **control** it.

### Current State

Byron can trigger Stargate tools via ToolRegistry:
- `stargate_dispatch_prompt` → SSH to node
- `stargate_run_job` → Hermes CLI
- `stargate_tilling_provision` → Community compute

But Byron doesn't **see** the live status. He only sees what user tells him.

### Proposed Enhancement

**Option A: Context Injection (already partially done)**
When user types in AI Chat while Stargate is active:
1. System reads store state (nodeStatus, midnightAgent, activeLoops)
2. Injects formatted summary into Byron's system prompt
3. Byron responds with awareness

**Option B: Direct Store Access (future)**
Byron gets a "readStargateState" tool that queries the store:

```xml
<use_tool server="stargate" tool="read_command_center_state">
{"section": "midnight"}
</use_tool>
```

Returns: JSON of agent status, hunger, energy, crystals

**Option C: CommandDeck Actions (immediate)**
Byron triggers CommandDeck actions directly:

```xml
<use_tool server="stargate" tool="commanddeck_action">
{"tab": "midnight", "action": "eat", "params": {"itemId": "bread"}}
</use_tool>
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Day 1)

| Task | File | Est. Time |
|------|------|-----------|
| Install Zustand | `npm install zustand` | 2 min |
| Create stargateStore.ts | `src/stores/stargateStore.ts` | 30 min |
| Create StargateCommandCenter shell | `src/components/stargate/StargateCommandCenter.tsx` | 45 min |
| Create StargateHeader | `src/components/stargate/StargateHeader.tsx` | 30 min |
| Wire into AdaPortalPanel | Replace content with CommandCenter | 15 min |

**Result:** Shell exists with Header + placeholder MainStage. Store working.

### Phase 2: Sidebar + Context Actions (Day 2)

| Task | File | Est. Time |
|------|------|-----------|
| Create StargateSidebar | `src/components/stargate/StargateSidebar.tsx` | 45 min |
| Create TabSwitcher | Vertical tabs with icons | 20 min |
| Create ContextActions panel | Actions per tab | 60 min |
| Wire existing functions | Import from Midnight/Graph panels | 30 min |

**Result:** Sidebar shows tab switcher + contextual actions per tab.

### Phase 3: Activity Feed (Day 3)

| Task | File | Est. Time |
|------|------|-----------|
| Create ActivityFeed component | `src/components/stargate/ActivityFeed.tsx` | 45 min |
| Add addLog() calls to Midnight | Patch MidnightCityCommandPanel | 30 min |
| Add addLog() calls to Node Manager | Patch NodeManagerClient | 15 min |
| Add addLog() calls to LoopEngine | Patch LoopEngine.ts | 15 min |
| Add filter by source | Tabs in ActivityFeed | 20 min |

**Result:** Unified logging visible. All systems pipe to feed.

### Phase 4: Header Badges + Live Data (Day 4)

| Task | File | Est. Time |
|------|------|-----------|
| NodeManagerPoller | Poll /info every 30s | 30 min |
| MidnightSyncService | Sync agent state every 10s | 30 min |
| Web3WalletListener | Listen for wallet events | 30 min |
| MCPDiscoveryService | Watch server connections | 20 min |
| Header badges reactive | Subscribe store → render | 30 min |

**Result:** Header shows live data from all systems.

### Phase 5: Integration Polish (Day 5)

| Task | File | Est. Time |
|------|------|-----------|
| Sidebar live indicators | Patch Sidebar.tsx | 30 min |
| AI Chat context injection | Patch Chatview.tsx | 45 min |
| Vault quick access | Add Vault section to sidebar | 30 min |
| Keyboard shortcuts | Ctrl+1-9 for tabs | 20 min |
| QuickActionsFAB | Floating action buttons | 30 min |

**Result:** Fully integrated Command Center.

### Total: ~5 days (40 hours)

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Zustand conflicts with existing useState | Medium | High | Migrate incrementally; keep local state for UI-only |
| ActivityFeed becomes performance bottleneck | Medium | Medium | Virtualized list; limit to 500 entries |
| Sidebar too crowded on small screens | High | Low | Collapsible sections; icon-only mode |
| Store schema changes break things | Low | High | Version the store; migrate on load |
| Too many polling intervals | Medium | Medium | Consolidate pollers into single heartbeat |

---

## 10. Files to Create / Modify

### New Files (8)

| File | Purpose |
|------|---------|
| `src/stores/stargateStore.ts` | Zustand store |
| `src/components/stargate/StargateCommandCenter.tsx` | Main shell |
| `src/components/stargate/StargateHeader.tsx` | Status header |
| `src/components/stargate/StargateSidebar.tsx` | Left panel |
| `src/components/stargate/MainStage.tsx` | Content area |
| `src/components/stargate/ActivityFeed.tsx` | Bottom log panel |
| `src/components/stargate/QuickActionsFAB.tsx` | Floating buttons |
| `src/services/stargate/DataPoller.ts` | Unified poller |

### Modified Files (6)

| File | Change |
|------|--------|
| `AdaPortalPanel.tsx` | Replace tab bar + content with CommandCenter |
| `Sidebar.tsx` | Add Stargate live indicators |
| `Chatview.tsx` | Inject Stargate context when active |
| `MidnightCityCommandPanel.tsx` | Call addLog() for actions |
| `StargateGraphPanel.tsx` | Read/write store for node data |
| `LoopEngine.ts` | Call addLog() for loop events |

---

## Summary

The Command Center is not a new tab — it's a **new way to experience Stargate**.

- **Header** shows status from ALL systems (Node Manager, Web3, Midnight, Loops, MCP)
- **Sidebar** gives contextual actions for whatever tab you're on
- **MainStage** still renders the same Stargate tabs (Graph, Midnight, Loops, etc.) — no rewrite needed
- **ActivityFeed** shows unified logs from every system
- **Store** connects everything — Stargate tabs, Mosaic components, and Byron

**The Stargate tabs become MODULES inside the Command Center.** Each tab exports:
- Its main component (for MainStage)
- Its action definitions (for Sidebar)
- Its data requirements (for Store)
- Its log sources (for ActivityFeed)

This is how we make Stargate unique inside Mosaic Companion, master.

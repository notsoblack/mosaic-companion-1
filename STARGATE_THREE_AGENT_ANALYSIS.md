# Stargate Command Center — Three-Agent Analysis Report

**Date:** 2026-08-16
**Context:** Making Stargate a unique, first-class component inside Mosaic Companion
**Profiles Used:** debugger | vibecoder | yolo
**Codebase:** /home/mauricio/mosaic-companion/src/components/stargate/ (35 TSX files, 716KB)

---

## PART 1: DEBUGGER PASS — Structured Bug Hunt

**Methodology:** Understand → Hypothesize → Isolate → Verify → Minimal Fix

### 🔴 CRITICAL (5 bugs)

#### C1. Auto-work spaceId mismatch — agent works in wrong location
**File:** `electron/services/MidnightCityBackgroundService.ts`
**Severity:** CRITICAL
**What happens:** Background service sends `"mines-worksite"` but agent is at `"miner-central"`. Auto-work commands go to wrong location, causing failed actions.
**Hypothesis:** Hardcoded spaceId from v1 API not updated for v2.0
**Root cause:** `midnightCityService.setAutoWork(true)` is called without checking actual agent location
**Fix:** Query agent position from `/api/session` before auto-work, derive spaceId from `position.spaceId`
**Prevention:** Never hardcode spatial coordinates; always fetch from server state

#### C2. Eat action may use wrong itemId — server rejects "bread"
**File:** `src/components/stargate/MidnightCityCommandPanel.tsx:1080+`
**Severity:** CRITICAL
**What happens:** Eat sends `itemId: "bread"` but server inventory may use `"bread_loaf"`, `"food_bread"`, or IDs like `"item_123"`
**Hypothesis:** Client guesses itemId; server uses internal IDs
**Root cause:** No inventory validation before eat — UI just sends `"bread"` without checking what the agent actually owns
**Fix:** Call `/api/inventory` first, find first food item's real `itemId`, then send that
**Prevention:** Always read inventory before consuming; never hardcode item IDs

#### C3. Graph Vault API uses wrong accessor — crashes when addonAPI missing
**File:** `src/components/stargate/StargateGraphPanel.tsx:113`
**Severity:** CRITICAL
**What happens:** `getVaultApi()` tries `(window as any).addonAPI?.vault` first — but addonAPI is forbidden for third-party addons per Dr. Robert directive
**Hypothesis:** addonAPI was removed but fallback is unreliable
**Root cause:** Code still references `addonAPI` which is dead
**Fix:** Remove addonAPI branch; always use `window.electronAPI?.vault`
**Prevention:** Search for `addonAPI` across codebase and purge all references

#### C4. Buy Supplies uses hardcoded merchant locations
**File:** `src/components/stargate/MidnightCityCommandPanel.tsx`
**Severity:** CRITICAL
**What happens:** `food-market-central`, `bakery-east`, `tavern-north` are hardcoded. If merchants move or API returns different locations, trade fails
**Root cause:** Static location strings instead of dynamic merchant discovery
**Fix:** Call `/api/merchants` first, filter for food sellers, use returned coordinates
**Prevention:** Never hardcode game world coordinates; always query live merchant data

#### C5. NodeFactoryTrackerPanel uses dead `window.electronAPI?.nodeFactory`
**File:** `src/components/stargate/NodeFactoryTrackerPanel.tsx:210`
**Severity:** CRITICAL
**What happens:** `window.electronAPI?.nodeFactory?.loadJsonFile` — this IPC channel may not be registered in main.ts
**Hypothesis:** IPC handler was never wired
**Root cause:** Preload exposes the channel but main.ts may not handle `nodeFactory:loadJsonFile`
**Fix:** Verify handler exists in main.ts; if not, add or remove the feature
**Prevention:** Every `ipcRenderer.invoke` must have a matching `ipcMain.handle`

---

### 🟠 HIGH (5 bugs)

#### H1. `as any` and `as unknown` casting throughout StargateGraphPanel
**File:** `StargateGraphPanel.tsx` (lines 1488, 1509, + more)
**Severity:** HIGH
**What happens:** Type safety disabled; runtime errors hidden until production
**Example:** `(stargatePoolService as any).walletAddress = walletAddress` — `walletAddress` is private, should use setter
**Fix:** Define proper interfaces; remove `as any` casts
**Prevention:** Add `// @ts-ignore` lint rule; enforce strict typing in CI

#### H2. `@ts-ignore` suppresses 20+ TypeScript errors
**File:** `NodeFactoryTrackerPanel.tsx:345`, `StargateGraphPanel.tsx`, others
**Severity:** HIGH
**What happens:** `@ts-ignore` hides real type mismatches that will crash at runtime
**Fix:** Remove all `@ts-ignore` and `@ts-expect-error`; fix underlying types
**Prevention:** CI build should fail if new `@ts-ignore` added

#### H3. HyperCycleNodeManagerClient has stale factory endpoints
**File:** `src/services/stargate/HyperCycleNodeManagerClient.ts`
**Severity:** HIGH
**What happens:** `/api/factories?owner=...` returns 404 — actual endpoint is `/info` for node status
**Root cause:** Client still has old API shape from when Node Manager was expected to have factories endpoint
**Fix:** Remove `getFactoriesByWallet()` or map it to actual data from `/info` → `aim.aims`
**Prevention:** Always verify endpoints with `curl` before writing client code

#### H4. StargateAIMPanel references `localhost:8000` but Node Manager Web UI is `8006`
**File:** `src/components/stargate/StargateAIMPanel.tsx`
**Severity:** HIGH (already fixed in commit `f68cf25`)
**What happened:** Link pointed to API port instead of Web UI port
**Prevention:** Document port architecture clearly: 8000=API, 8005=admin, 8006=Web UI

#### H5. Loop Builder still shows fake "Run" button despite Option A decision
**File:** `src/components/stargate/LoopBuilderModal.tsx`
**Severity:** HIGH
**What happens:** UI still has Run/Pause/Resume buttons that do nothing (honest designer mode was supposed to remove them)
**Root cause:** UI not fully updated after architecture decision
**Fix:** Remove Run/Pause/Resume from LoopBuilder; keep only Export JSON, Dry Run
**Prevention:** Document architecture decisions in code comments

---

### 🟡 MEDIUM (3 bugs)

#### M1. StargatePoolService uses `as any` to set private `walletAddress`
**File:** `StargateGraphPanel.tsx:1488`
**Severity:** MEDIUM
**Fix:** Add public setter to StargatePoolService or pass wallet as method argument

#### M2. `needVal()` helper scattered across components
**File:** `MidnightCityCommandPanel.tsx:1080`, possibly others
**Severity:** MEDIUM
**Fix:** Extract to shared utility in `src/utils/midnight.ts`

#### M3. Console.warn spam from dead Base RPC endpoints
**File:** `ANFEService.ts`
**Severity:** MEDIUM
**What happens:** Public Base RPC returns 403; console.warn logs repeatedly
**Fix:** Already partially fixed; verify all dead endpoints are suppressed

---

### 🔵 LOW (2 bugs)

#### L1. Unused imports in Stargate components
**Files:** Multiple
**Fix:** Run eslint --fix

#### L2. Dead code: `renderAspGateway()` still exists but unreachable
**File:** `AdaPortalPanel.tsx:3946`
**Fix:** Remove function body or mark as deprecated

---

## PART 2: VIBECODER PASS — Architecture Design

**Methodology:** Clarify → MVP → Design → Stack → Steps → Code → Iterate

### 1. Clarify: What Does "Unique Component" Mean?

Stargate should feel like a **command center** — not a collection of tabs. Think:
- **Mission Control** (NASA): All systems visible at a glance
- **VS Code**: Sidebar + main panel + bottom panel, all context-aware
- **Notion**: Flexible blocks that reference each other

**Product Definition:** Stargate is Mosaic Companion's **decentralized AI infrastructure dashboard**. It lets users:
- Visualize their AI agent fleet (HyperCycle nodes, AIMs, factories)
- Control Midnight City agents (mine, eat, trade, auto-work)
- Design agent loops (topology designer for multi-step workflows)
- Monitor real-time status (glowing activity on graph)
- Orchestrate via Mosaic Bot (Byron sees Stargate as his workspace)

### 2. MVP: The Smallest Unique Version

**Strip to essentials:**
1. **Unified Header** — One status bar showing: node health, ANFE count, active loops, wallet balance
2. **Command Deck** (left sidebar) — Contextual actions based on selected tab
3. **Main Stage** (center) — Tab content (Graph, Midnight, etc.)
4. **Activity Feed** (bottom) — Real-time logs from all systems
5. **Quick Actions** — Floating buttons for most-used ops

**Remove:** Deploy tab (done), Factory tab (merge into Graph), Rankings (non-critical)

### 3. Architecture Design

```
┌─────────────────────────────────────────────────────────────────────┐
│  STARGATE COMMAND CENTER                                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌─────────────────────────────────────────────────┐  │
│  │ COMMAND  │ │ MAIN STAGE (tab content)                        │  │
│  │ DECK     │ │                                                 │  │
│  │ (left)   │ │  • Graph: SVG constellation + live activity     │  │
│  │          │ │  • Midnight: Economy panel + agent control      │  │
│  │ Context- │ │  • Loops: Topology designer + export            │  │
│  │ aware    │ │  • Network: Node factory status + ANFE        │  │
│  │ actions  │ │                                                 │  │
│  │          │ └─────────────────────────────────────────────────┘  │
│  └──────────┘ ┌─────────────────────────────────────────────────┐   │
│               │ ACTIVITY FEED (bottom) — logs from all systems    │   │
│               └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Component Hierarchy:**
```
StargateCommandCenter (orchestrator)
├── StargateHeader (status bar)
├── CommandDeck (left sidebar — contextual actions)
│   ├── TabSelector (Start, Graph, Midnight, etc.)
│   └── ContextActions (changes based on active tab)
├── MainStage (tab content)
│   ├── GraphTab → StargateGraphPanel
│   ├── MidnightTab → MidnightCityCommandPanel
│   ├── LoopsTab → LoopsPanel
│   └── NetworkTab → NodeFactoryTrackerPanel + ANFE
├── ActivityFeed (bottom panel — unified logs)
└── QuickActions (floating FABs)
```

**State Management:**
- **Local state:** React useState for UI (tabs, modals, selections)
- **Shared state:** Zustand store for Stargate (agents, nodes, loops, wallet)
- **IPC bridge:** Electron preload channels for Node Manager, Web3, Vault

**IPC Layer:**
```
Renderer (React)
  ↓ window.electronAPI
Preload (bridge)
  ↓ ipcRenderer.invoke
Main (Node.js)
  ↓ child_process / HTTP
Node Manager (localhost:8000)
```

### 4. Stack Recommendation

| Layer | Current | Recommended | Why |
|-------|---------|-------------|-----|
| State | useState everywhere | **Zustand** | Simple, no boilerplate, works with IPC |
| Styling | Tailwind CSS | **Keep Tailwind** | Already used, fast |
| Icons | Lucide React | **Keep Lucide** | Consistent, tree-shakeable |
| Graph | React SVG | **Keep SVG** | Native, performant, SMIL animations |
| Animation | CSS keyframes | **Framer Motion** | For sidebar transitions, FAB |

### 5. Break Into Steps

**Phase 1: Foundation (Week 1)**
1. Create `StargateCommandCenter.tsx` shell with header + deck + stage + feed
2. Move existing tab content into new layout
3. Add Zustand store for shared Stargate state

**Phase 2: Context-Aware Sidebar (Week 2)**
4. Build CommandDeck with tab-aware actions
5. Graph tab: Show "Create Loop", "Dispatch Agent" buttons
6. Midnight tab: Show "Eat", "Sleep", "Buy Supplies" quick actions

**Phase 3: Activity Feed (Week 3)**
7. Build unified ActivityFeed component
8. Pipe logs from Midnight, Node Manager, Loops into feed
9. Add filter by system (show/hide Midnight logs, etc.)

**Phase 4: Integration (Week 4)**
10. Wire Byron to see Stargate context (via ToolRegistry)
11. Graph chat routes to Mosaic Bot (already done)
12. Add keyboard shortcuts (Ctrl+1 = Graph, Ctrl+2 = Midnight)

### 6. Key Architectural Code

**Zustand Store (src/stores/stargateStore.ts):**
```typescript
import { create } from 'zustand';

interface StargateState {
  activeTab: 'graph' | 'midnight' | 'loops' | 'network';
  nodeStatus: NodeManagerStatus | null;
  activeLoops: Loop[];
  midnightAgent: MidnightAgent | null;
  logs: LogEntry[];
  setActiveTab: (tab: StargateState['activeTab']) => void;
  addLog: (source: string, level: 'info'|'warn'|'error', message: string) => void;
}

export const useStargateStore = create<StargateState>((set) => ({
  activeTab: 'graph',
  nodeStatus: null,
  activeLoops: [],
  midnightAgent: null,
  logs: [],
  setActiveTab: (tab) => set({ activeTab: tab }),
  addLog: (source, level, message) =>
    set((state) => ({
      logs: [...state.logs, { id: crypto.randomUUID(), source, level, message, time: Date.now() }].slice(-500)
    })),
}));
```

**CommandDeck Component:**
```tsx
const CommandDeck = () => {
  const { activeTab, addLog } = useStargateStore();

  const actions = {
    graph: [
      { id: 'create-loop', label: 'Create Loop', icon: GitBranch, onClick: () => openLoopBuilder() },
      { id: 'refresh-nodes', label: 'Refresh', icon: RefreshCw, onClick: () => refreshGraph() },
    ],
    midnight: [
      { id: 'eat', label: 'Eat', icon: Utensils, onClick: () => dispatchEat() },
      { id: 'auto-work', label: 'Auto Work', icon: Zap, onClick: () => toggleAutoWork() },
    ],
    // ... etc
  };

  return (
    <div className="w-64 border-r border-gray-800 bg-gray-950">
      <TabSelector />
      <div className="p-3 space-y-2">
        {actions[activeTab]?.map(action => (
          <button key={action.id} onClick={action.onClick}>
            <action.icon size={16} />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};
```

---

## PART 3: YOLO PASS — Actionable Execution Plan

**Methodology:** Default to action → Reduce friction → Bridge idea → execution → Anticipate next steps

### Immediate Actions (Today)

#### Step 1: Create the Shell Component
**File:** `src/components/stargate/StargateCommandCenter.tsx` (NEW)
```tsx
import React from 'react';
import { useStargateStore } from '../../stores/stargateStore';
import { StargateHeader } from './StargateHeader';
import { CommandDeck } from './CommandDeck';
import { MainStage } from './MainStage';
import { ActivityFeed } from './ActivityFeed';

export const StargateCommandCenter: React.FC = () => {
  return (
    <div className="h-full flex flex-col bg-gray-950">
      <StargateHeader />
      <div className="flex-1 flex overflow-hidden">
        <CommandDeck />
        <MainStage />
      </div>
      <ActivityFeed />
    </div>
  );
};
```

#### Step 2: Create Zustand Store
**File:** `src/stores/stargateStore.ts` (NEW)
**Content:** See Vibecoder code above

#### Step 3: Wire Into AdaPortalPanel
**File:** `src/components/AdaPortalPanel.tsx`
**Line:** Where `activeTab === 'graph'` is rendered (around line 4620)
**Change:** Replace individual tab renders with `<StargateCommandCenter />`
**Keep:** The tabs array stays for routing, but rendering goes through CommandCenter

### Next Actions (This Week)

#### Step 4: Fix Critical Bugs (from Debugger)
| Bug | File | Fix | Est. Time |
|-----|------|-----|-----------|
| C1 Auto-work spaceId | `MidnightCityBackgroundService.ts` | Query position before work | 30 min |
| C2 Eat itemId | `MidnightCityCommandPanel.tsx` | Read inventory first | 30 min |
| C3 addonAPI | `StargateGraphPanel.tsx:113` | Remove addonAPI branch | 10 min |
| C4 Merchant locations | `MidnightCityCommandPanel.tsx` | Dynamic merchant discovery | 1 hour |
| C5 nodeFactory IPC | `NodeFactoryTrackerPanel.tsx` | Verify handler exists | 30 min |

#### Step 5: Build CommandDeck Context Actions
**File:** `src/components/stargate/CommandDeck.tsx` (NEW)
- Import existing action functions from MidnightCityCommandPanel
- Create a dispatch layer that calls them based on active tab
- Export for use in Graph chat (Byron can trigger via ToolRegistry)

#### Step 6: Build ActivityFeed
**File:** `src/components/stargate/ActivityFeed.tsx` (NEW)
- Subscribe to store logs
- Auto-scroll, filter by source/level
- Color-code: info=gray, warn=amber, error=red, success=emerald

### Blockers & Mitigations

| Blocker | Likelihood | Mitigation |
|---------|-----------|------------|
| Zustand not installed | Medium | `npm install zustand` — already in some projects |
| CommandDeck becomes too crowded | High | Collapse into accordion sections per tab |
| ActivityFeed causes perf issues with 500+ logs | Medium | Virtualized list (react-window) |
| Existing tab state conflicts with store | Medium | Migrate incrementally; keep local state as fallback |
| Build size increase from Zustand | Low | Zustand is ~1KB gzipped |

### Reusable Assets (Save These)

1. **Stargate Store Pattern** — Can be copied for other complex features
2. **CommandDeck Pattern** — Reusable for any tabbed interface needing contextual actions
3. **ActivityFeed Component** — Generic enough for any real-time log display

### After This Plan: Next Steps

1. **Week 2:** Context-aware sidebar with quick actions per tab
2. **Week 3:** Activity feed with filtering and search
3. **Week 4:** Byron integration — Stargate context in AI Chat, agent can trigger CommandDeck actions
4. **Week 5:** Polish — animations, keyboard shortcuts, responsive layout
5. **Week 6:** Testing — end-to-end flows (Graph → Create Loop → Midnight Auto-Work)

---

## Summary: The Three Perspectives

| | Debugger | Vibecoder | Yolo |
|---|---|---|---|
| **Focus** | What's broken | What it should be | How to build it |
| **Key Finding** | 5 critical bugs blocking reliability | Need unified command center layout | Shell component + Zustand store first |
| **Top Priority** | Fix auto-work spaceId mismatch | Design component hierarchy | Create StargateCommandCenter.tsx |
| **Deliverable** | Bug report with line numbers | Architecture diagram + code | Step-by-step file list + code |

**Recommended execution order:**
1. Fix critical bugs (debugger) → Makes current code reliable
2. Create shell component (yolo) → Establishes new layout
3. Build architecture pieces (vibecoder) → Fills in the design

Master, the three agents have spoken. Shall I start implementing the Yolo plan — creating the StargateCommandCenter shell and Zustand store first?

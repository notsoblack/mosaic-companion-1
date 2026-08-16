---
name: command-center-ui-patterns
description: Build unified dashboards with live headers and sidebars.
---

# Command Center UI Patterns

## Scope

A command center is a unified dashboard that aggregates data and controls from
multiple subsystems into a single view. Unlike a simple tabbed interface where
each tab is isolated, a command center maintains **shared state** across all
subsystems and surfaces **cross-cutting concerns** (status, logs, actions) in a
consistent shell.

Use this skill when:
- Building a dashboard that shows live status from 3+ subsystems
- Designing a skills/tools marketplace with install/toggle/discovery
- Replacing a monolithic tab bar with a context-aware navigation + action surface
- Needing unified logging across multiple backend services
- Implementing optimistic UI updates for toggle/install actions

## Architecture: The Shell Pattern

```
┌─────────────────────────────────────────────────────────────┐
│  LIVE HEADER — status badges from ALL systems               │
│  [Node: Alive] [Wallet: 0x48...] [Agent: Mining] [Loops: 2] │
├─────────────────────────────────────────────────────────────┤
│  ┌────────┐ ┌─────────────────────────────────────────────┐ │
│  │Sidebar │ │  MAIN STAGE — active subsystem content      │ │
│  │        │ │                                               │ │
│  │[Graph] │ │  Renders existing panels as MODULES         │ │
│  │[Agent] │ │  No rewrite needed — wrap, don't replace    │ │
│  │[Loops] │ │                                               │ │
│  │        │ └─────────────────────────────────────────────┘ │
│  │Actions:│ ┌─────────────────────────────────────────────┐ │
│  │[Eat]   │ │  ACTIVITY FEED — unified logs from ALL      │ │
│  │[Sleep] │ │  [14:32] Agent ate bread                    │ │
│  │[Auto]  │ │  [14:32] Node status: alive 98%             │ │
│  └────────┘ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Key principle:** Existing panels become **modules** inside the shell. No
rewrites — just wrap.

### State Architecture (Zustand)

Use a single Zustand store with slices per subsystem:

```typescript
interface CommandCenterState {
  activeTab: string;
  sidebarOpen: boolean;

  // Subsystem 1: Node Manager
  nodeStatus: NodeStatus | null;
  setNodeStatus: (s: NodeStatus | null) => void;

  // Subsystem 2: Midnight Agent
  midnightAgent: Agent | null;
  updateMidnightNeeds: (hunger: number, energy: number) => void;

  // Subsystem 3: Web3
  walletAddress: string | null;
  setWallet: (addr: string | null) => void;

  // Subsystem 4: Active Loops
  activeLoops: Loop[];
  addLoop: (loop: Loop) => void;
  updateLoopStatus: (id: string, status: LoopStatus) => void;

  // Subsystem 5: MCP Servers
  mcpServers: MCPServer[];
  setMcpServers: (servers: MCPServer[]) => void;

  // Cross-cutting: Activity Feed
  logs: LogEntry[];
  addLog: (source: string, level: LogLevel, message: string) => void;
  clearLogs: () => void;
}
```

**Rules:**
- One store, many slices. Don't create separate stores per subsystem.
- Use selector patterns so components only re-render when THEIR slice changes.
- Limit log history to ~500 entries (auto-truncate): `logs.slice(-499)`.

### Data Polling (Unified Poller)

Instead of scattered `setInterval` calls inside components, use a centralized
poller that starts when the shell mounts:

```typescript
const POLL_INTERVALS = {
  nodeManager: 30000,  // 30s
  midnight: 10000,     // 10s
  web3: 15000,         // 15s
  mcp: 20000,          // 20s
  vault: 60000,        // 60s
};

export function startCommandCenterPollers(): void {
  const store = useCommandCenterStore.getState();
  // Each interval calls store.setXxx() and store.addLog()
}
```

**Rules:**
- Start pollers in shell `useEffect`; stop on unmount.
- Each poller logs to the activity feed.
- Suppress 404s silently for expected missing endpoints.

---

## Context-Aware Sidebar

The sidebar changes its **actions** based on the active tab:

| Active Tab | Sidebar Actions |
|-----------|----------------|
| **Graph** | Create Loop, Refresh Nodes, Export Image |
| **Agent** | Eat, Sleep, Buy Supplies, Toggle Auto-Work |
| **Loops** | New Loop, Import JSON, Dry Run |
| **Factories** | Load from Chain, Provision Node |

**Implementation:**

```typescript
const getActions = (tab: string): TabAction[] => {
  switch (tab) {
    case 'agent':
      return [
        { id: 'eat', label: 'Eat', icon: Utensils, onClick: eatAction, variant: 'primary' },
        { id: 'auto-work', label: 'Toggle Auto-Work', icon: Zap, onClick: toggleAutoWork },
      ];
    // ...
  }
};
```

**Rules:**
- Actions call **existing functions** — no new logic needed.
- Use `variant: 'primary'` for the most common action per tab.
- Include quick links to **other app tabs** (Vault, MCP, AI Chat) at the bottom.

---

## Activity Feed — Unified Logging

All systems pipe logs into one feed:

```typescript
const { addLog } = useCommandCenterStore();
addLog('midnight', 'success', 'Ate bread — hunger: 45% → 78%');
addLog('nodeManager', 'info', 'Node alive — 98% uptime, 22 CPUs');
addLog('loopEngine', 'info', 'Loop "byron-midnight" step 3/5 complete');
```

**UI features:**
- Source filter dropdown (All | Midnight | NodeManager | LoopEngine | MCP | Vault)
- Color-coded by source (pink = Midnight, blue = NodeManager, purple = LoopEngine)
- Auto-scroll toggle, export to `.txt`, collapsible header

---

## Skills Marketplace UI (Hermes Analysis)

### Master-Detail Layout

```
┌─ Skills Tab ───────────────────────────────────────┐
│ ┌─ List Column ──────┐ ┌─ Detail Column ────────┐│
│ │ Search + Sort       │ │ Skill Name             ││
│ │ [All] [toggle ON]   │ │ Version: 1.0.0         ││
│ │                     │ │ Author: Hermes Agent   ││
│ │ hermes-agent-contrib│ │ License: MIT           ││
│ │   +275  [●] ON      │ │ Tags: ...              ││
│ │   learned           │ │ [Edit] [Archive]       ││
│ └─────────────────────┘ └────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### Toggle with Optimistic Update + Rollback

```typescript
async function handleToggleSkill(skill: SkillInfo, enabled: boolean) {
  // Step 1: Optimistic — update UI immediately
  setSkills(current => current?.map(row =>
    row.name === skill.name ? { ...row, enabled } : row
  ));

  // Step 2: Sync backend
  try {
    await setSkillEnabled(skill.name, enabled);
  } catch (err) {
    // Step 3: Rollback on error
    setSkills(current => current?.map(row =>
      row.name === skill.name ? { ...row, enabled: !enabled } : row
    ));
    notifyError(err);
  }
}
```

**Why:** User sees immediate feedback. No loading spinner per row. Error rolls back.

### Usage Badges

```typescript
const compactNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};

// compactNumber(1523) → "1.5K"
// compactNumber(275) → "275"
```

### Trust Levels

```typescript
const TRUST_RANK = { builtin: 2, trusted: 1, community: 0 };

function trustTone(level: string): string {
  switch (level) {
    case 'builtin':  return 'bg-gray-500/15 text-gray-300';
    case 'trusted':  return 'bg-emerald-500/15 text-emerald-400';
    default:         return 'bg-amber-500/15 text-amber-400';
  }
}
```

**Visual:** Gray = builtin/safe. Green = trusted. Amber = community/verify.

### Lazy Analytics Loading

```typescript
const ANALYTICS_TTL_MS = 10 * 60 * 1000;
const analyticsCache = new Map<string, { at: number; value: Analytics }>();

// Only fetch heavy analytics when tab is shown
useEffect(() => {
  if (mode !== 'toolsets' || analytics !== null) return;
  loadAnalytics().then(value => setAnalytics(value));
}, [mode, analytics]);
```

**Why:** A 365-day message scan is expensive. Don't run it on every mount.

### Per-Item Action Tracking (Parallel Safety)

```typescript
const hubActions = new Map<string, HubAction>();
const action = hubActions.get(skill.identifier);
const running = action?.running ?? false;

// Render:
<button disabled={running} onClick={doInstall}>
  {running ? <Spinner /> : 'Install'}
</button>
```

**Critical:** Parallel installs never desync — each row drives itself.

---

## Request Deduplication (Race Guard)

Prevent stale responses from overwriting newer data:

```typescript
const requestRef = useRef(0);

const refreshData = async () => {
  const id = ++requestRef.current;
  const response = await fetchData();
  if (requestRef.current === id) {
    setData(response); // Only update if no newer request
  }
};
```

**Use when:** Multiple rapid refresh calls (user spams F5, tab switching,
polling + manual refresh overlap).

---

## Common Pitfalls

1. **Storing API credentials on disk.** The user's preference is **in-memory only**.
   Use `safeStorage` for encryption at rest, but prefer ephemeral storage for API
   keys. Always warn the user if a feature requires disk persistence.

2. **SVG sizing inside flex containers.** CSS `w-full h-full` does NOT work on SVG
   elements inside flex/grid containers. Always add explicit `width` and `height`
   attributes that are state-driven by a `ResizeObserver`. See
   `references/svg-flex-sizing.md` for the full pattern, including the
   `min-w-0` requirement on flex children.

3. **Theme mismatch when wrapping existing panels.** A panel developed with a
   light theme (`#f8fafc` bg, white overlays, `#3b82f6` blue accents) will look
   like a white card floating in a dark command center. Search for BOTH Tailwind
   classes AND inline `style={{ backgroundColor: ... }}` / `rgba(255,` patterns.
   See `references/svg-flex-sizing.md` → "Theme Migration Checklist".

4. **IPC APIs returning non-arrays.** `vaultApi.getBoxes()` and similar IPC calls
   may return objects, strings, or undefined when the backend is initializing.
   Always guard with `Array.isArray(raw) ? raw : []` before `.slice()`, `.map()`,
   or `.filter()`. See `references/svg-flex-sizing.md` → "IPC Data Safety".

5. **Putting data fetching in individual components.** Use the unified poller
   in the shell. Components should only READ from the store.

6. **Creating separate Zustand stores per subsystem.** One store with slices
   enables cross-subsystem actions (e.g., "when agent eats, log to activity feed
   AND update wallet balance").

7. **Forgetting to stop pollers on unmount.** Always return a cleanup function
   from `useEffect` that calls `clearInterval` / `stopPollers`.

8. **Exposing raw errors in activity feed.** Sanitize error messages — never
   show full stack traces or API keys in the UI log.

---

## Verification Checklist

- [ ] Shell renders with Header + Sidebar + MainStage + ActivityFeed
- [ ] Sidebar actions change based on active tab
- [ ] Data pollers start on mount and stop on unmount
- [ ] Activity feed shows entries from multiple subsystems
- [ ] Skills marketplace has master-detail layout with toggles
- [ ] Optimistic updates rollback on error
- [ ] Usage badges show `compactNumber` formatted counts
- [ ] Trust badges show gray/green/amber by level
- [ ] Build passes (`tsc --noEmit` clean)

---

## Cross-Project Pattern Extraction (Hermes → Mosaic Case Study)

When porting UI/UX patterns from a reference project (e.g., Hermes Desktop) to your own codebase:

### 1. Locate the Source Code

```bash
# Find the reference project's source
find /home/mauricio -maxdepth 3 -type d -name "hermes*"
# → /home/mauricio/hermes/apps/desktop/src/app/skills/

# Find relevant files
find /home/mauricio/hermes/apps/desktop/src -name "*.tsx" | grep -i skill
# → skills/index.tsx (824 lines), skills/hub.tsx (468 lines)
```

### 2. Read Key Files Directly

Don't rely on documentation — read the actual source:
- `skills/index.tsx` — main view (TanStack Query, optimistic updates, bulk actions)
- `skills/hub.tsx` — hub browser (trust ranks, per-item action state, install/uninstall)
- `command-center/index.tsx` — shell (URL-based tabs, conditional subscriptions, request guards)
- `store/hub-actions.ts` — Nanostores action tracking
- `lib/format.ts` — `compactNumber()` utility

### 3. Extract Reusable Components

| Hermes Component | Mosaic Equivalent | Notes |
|-----------------|-------------------|-------|
| `MasterDetail` | `MasterDetail.tsx` | Split pane with `normal`/`wide`/`equal` variants |
| `ListColumn` | `ListColumn.tsx` | Scrollable list with header strip |
| `DetailColumn` | `DetailColumn.tsx` | Detail pane with optional footer |
| `CapRow` | `CapRow.tsx` | List row with toggle switch, metadata badge, active highlight |
| `ListStrip` | `ListStrip.tsx` | Header bar with left/right actions |
| `PageSearchShell` | Not needed | Hermes-specific wrapper |

### 4. Adapt State Library (Nanostores → Zustand)

Hermes uses Nanostores; Mosaic uses Zustand. Mapping is trivial:

```typescript
// Hermes (Nanostores)
const $hubActions = map<Record<string, HubAction>>({});
const action = useStore($hubActions)[skillId];

// Mosaic (Zustand)
hubActions: Record<string, HubAction>;
setHubAction: (id, action) => void;
const action = useStargateStore().hubActions[skillId];
```

### 5. The "Module-as-Shell" Architecture

**Key insight:** Don't rewrite existing panels. Wrap them.

```
Before: AdaPortalPanel has inline tab bar + content switcher
After:  AdaPortalPanel renders <StargateCommandCenter />
        CommandCenter has its OWN sidebar + header + activity feed
        MainStage switches between existing panels (unchanged)
```

**Files created in Mosaic:**
| File | Description |
|------|-------------|
| `src/components/stargate/StargateCommandCenter.tsx` | Main shell (Header + Sidebar + MainStage + ActivityFeed) |
| `src/components/stargate/StargateHeader.tsx` | Live status bar with badges |
| `src/components/stargate/StargateSidebar.tsx` | Context-aware left panel |
| `src/components/stargate/MainStage.tsx` | Content area — existing panels as modules |
| `src/components/stargate/ActivityFeed.tsx` | Unified logging panel |
| `src/components/stargate/MasterDetail.tsx` | Reusable layout components |
| `src/components/stargate/StargateSkillsView.tsx` | Hermes-style installed skills |
| `src/components/stargate/SkillsHub.tsx` | Skill discovery browser |
| `src/stores/stargateStore.ts` | Zustand store with all subsystems |
| `src/services/stargate/DataPoller.ts` | Unified background poller |

### 6. Shared Infrastructure Discovery

**Critical finding:** Both Hermes and Mosaic use `~/.hermes/skills/` for skill storage.

```
~/.hermes/skills/
├── software-development/
│   ├── stargate-pools/SKILL.md
│   └── mcp-client/SKILL.md
├── midnight/
│   └── mining-connect/SKILL.md
```

**Implication:** Mosaic doesn't need a new skill backend — it only needs a UI layer on top of existing Hermes skill infrastructure. The `skillInjector.ts` already reads from `~/.hermes/skills/`.

### 7. What to Port vs What to Skip

| Feature | Port? | Reason |
|---------|-------|--------|
| Master-detail layout | ✅ Yes | Core improvement |
| Toggle switches | ✅ Yes | Missing functionality |
| Usage badges | ✅ Yes | Easy, high value |
| Trust badges | ✅ Yes | Visual trust indicator |
| Detail pane metadata | ✅ Yes | Author, version, tags |
| Hub browser | ✅ Yes | Major feature addition |
| TanStack Query | ❌ Skip | Zustand sufficient for now |
| URL-based tab state | 🔄 Later | Nice-to-have |
| Profile scoping | ❌ Skip | Single-profile app |
| Search hints | 🔄 Later | Polish feature |

## Related references

- `references/hermes-skills-marketplace-analysis.md` — Full Hermes Desktop screenshot analysis: installed skills panel (master-detail with toggles/usage badges/provenance labels) and Skills Hub Browser (grid cards, category sidebar, provider filters) with exact code patterns extracted from `skills/index.tsx`, `skills/hub.tsx`, and `command-center/index.tsx` (2026-08-16).
- `references/svg-flex-sizing.md` — SVG explicit sizing inside flex containers, theme migration from light→dark, and IPC data safety guards (Array.isArray before .slice). Created after Stargate Graph Panel rendered as a tiny card and crashed with `e.slice is not a function` (2026-08-16).
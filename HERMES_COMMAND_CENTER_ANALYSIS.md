# Hermes Command Center & Skills — Deep Code Analysis
## Application to Mosaic Companion Stargate

**Date:** 2026-08-16
**Analyst:** Debugger + Vibecoder + Yolo (3-agent synthesis)
**Sources:** Hermes Desktop apps/desktop/src code, screenshot analysis, Mosaic Stargate codebase

---

## PART 1: Screenshot Analysis — What We're Looking At

### Top Panel: Skills "Installed" View

```
┌─ Skills (37) │ Tools (4) │ MCP ─────────────────────────────┐
│ Configuring: Hermes (default)                                    │
│                                                                 │
│ ┌─ Most used ─────────────────────────────────────────┐        │
│ │ hermes-agent-contrib        +275    [●] ON          │        │
│ │   "Use when PRing hermes-agent. Workflow + Windows   │        │
│ │    pitfalls."               learned                   │        │
│ │ hermes-desktop-plugin-authoring +152 [●] ON         │        │
│ │   ...                          learned               │        │
│ │ hermes-bot-mode             +74     [●] ON          │        │
│ │   ...                          learned               │        │
│ │ hermes-bots-plugin          +48     [●] ON          │        │
│ │   ...                          learned               │        │
│ │ hermes-agent-dev            +21     [●] ON          │        │
│ │   ...                          learned               │        │
│ │ hermes-agent                +17     [●] ON          │        │
│ │   ...                                                    │        │
│ │ delegating-to-subagents     +10     [●] ON          │        │
│ │   ...                          learned               │        │
│ │ baoyu-infographic           ×4      [●] OFF         │        │
│ └─────────────────────────────────────────────────────┘        │
│                                                                 │
│ ┌─ Detail Pane (right) ───────────────────────────────┐        │
│ │ hermes-agent-contrib                               │        │
│ │ GitHub  │ learned                                   │        │
│ │                                                     │        │
│ │ "Use when PRing hermes-agent. Workflow + Windows   │        │
│ │  pitfalls."                                         │        │
│ │                                                     │        │
│ │ name:        hermes-agent-contrib                   │        │
│ │ description: "Use when PRing hermes-agent..."       │        │
│ │ version:     1.0.0                                  │        │
│ │ author:      Hermes Agent                            │        │
│ │ license:     MIT                                     │        │
│ │ platforms:   windows, linux, macos                   │        │
│ │ metadata:                                           │        │
│ │   tags: hermes-agent, contribution, pr-request,    │        │
│ │         windows, ci, workflow                      │        │
│ │   related_skills: github-pr-workflow, github-...   │        │
│ │                                                     │        │
│ │ [Edit] [Archive]                                    │        │
│ └─────────────────────────────────────────────────────┘        │
```

**Key Features Observed:**
1. **Tab Bar**: Skills (37) | Tools (4) | MCP — counts in tabs
2. **Profile Selector**: "Configuring: Hermes (default)" — skills are profile-scoped
3. **Master-Detail Layout**: List on left, detail pane on right
4. **Toggle Switches**: Each skill has an ON/OFF toggle
5. **Usage Badges**: `+275`, `+152`, `+74` — call counts (not just installed)
6. **Provenance Badges**: "learned", "hub" — where skill came from
7. **Detail Pane**: Full metadata — name, description, version, author, license, platforms, tags, related_skills
8. **Bulk Actions**: "All" master switch at top
9. **Search/Filter**: "Most used" sorting

### Bottom Panel: Skills Hub Browser

```
┌─ Skills Hub ──────────────────────────────────────────────────┐
│ Hermes Agent │ Docs │ Skills │ Download ⬆                     │
│                                                                 │
│ 🌐 English │ 🏠 Home │ GitHub │ Discord │ 🔍 Search │ ⌘K      │
│                                                                 │
│ [Search skills... (press '/' to focus)]                        │
│                                                                 │
│ All │ Prism │ Built-in (62) │ Optional (328) │ Anthropic (32) │
│ OpenAI (46) │ HuggingFace (28) │ voltagent (19027) │ ...        │
│                                                                 │
│ ┌─ CATEGORIES ───────────┐ ┌─ Skill Cards ───────────────────┐│
│ │                          │ │                                 ││
│ │ ▶ All Skills     (1997) │ │ ┌─ 3d-modeling ───────────────┐││
│ │   ○ Other        (1993) │ │ │ skills.sh                    │││
│ │                          │ │ │ Indexed by skills.sh from    │││
│ │                          │ │ │ cmor-martin                  │││
│ │                          │ │ │ Other                        │││
│ │                          │ │ │ [Add to This Agent]          │││
│ │                          │ │ └─────────────────────────────┘││
│ │                          │ │ ┌─ 3d-spatial ────────────────┐││
│ │                          │ │ │ skills.sh                    │││
│ │                          │ │ │ Indexed by skills.sh from  │││
│ │                          │ │ │ dylandep/animation-          │││
│ │                          │ │ │ principles                   │││
│ │                          │ │ │ Other                        │││
│ │                          │ │ │ [Add to This Agent]          │││
│ │                          │ │ └─────────────────────────────┘││
│ │                          │ │ ... (grid layout)              ││
│ └──────────────────────────┘ └────────────────────────────────┘│
```

**Key Features Observed:**
1. **Skill Cards**: Grid layout with metadata (name, source, description, category)
2. **Category Sidebar**: Tree view with counts
3. **Provider Filters**: All | Built-in | Optional | Anthropic | OpenAI | HuggingFace | voltagent | gstack | minimax
4. **Source Labels**: "skills.sh" — where the skill is indexed from
5. **"Add to This Agent" Button**: One-click install
6. **Trust Levels**: Implied by source (built-in = trusted, community = lower trust)
7. **Search with Focus Shortcut**: "/" to focus search

---

## PART 2: Hermes Code Architecture Analysis

### 2.1 Command Center (command-center/index.tsx)

**File Size:** 692 lines
**Pattern:** Overlay-based modal with split layout

#### Component Hierarchy

```
CommandCenterView (exported component)
├── OverlayView (modal wrapper with close button)
│   └── OverlaySplitLayout (split pane container)
│       ├── OverlayNav (left sidebar navigation)
│       │   └── groups: [{ id, label, icon, active, onSelect }]
│       └── OverlayMain (right content area)
│           ├── header (section title + description + actions)
│           └── content (switches on section):
│               ├── Sessions Panel (searchable list)
│               ├── System Panel (status + logs + actions)
│               ├── Usage Panel (analytics charts)
│               └── Maintenance Panel (separate component)
```

#### Key Code Patterns

**1. URL-Based Tab State**
```typescript
const [section, setSection] = useRouteEnumParam('section', SECTIONS, 'sessions')
```
- Tab state is in the URL (`?section=system`), not React state
- Browser back/forward works
- Deep-linking to specific sections

**2. Conditional Data Subscriptions**
```typescript
// Only subscribe to $sessions when on Sessions tab
const sessions = useStoreSelector($sessions, s => (section === 'sessions' ? s : EMPTY_SESSIONS))
const pinnedSessionIds = useStoreSelector($pinnedSessionIds, s => (section === 'sessions' ? s : EMPTY_PINNED))
```
- Prevents re-renders on unrelated tabs
- Uses stable empty arrays for reference equality

**3. Request Deduplication with Ref**
```typescript
const usageRequestRef = useRef(0)
const refreshUsage = useCallback(async (days: UsagePeriod) => {
  const requestId = usageRequestRef.current + 1
  usageRequestRef.current = requestId
  // ... fetch ...
  if (usageRequestRef.current === requestId) {
    setUsage(response)  // Only update if no newer request
  }
}, [])
```
- Prevents stale responses overwriting newer data
- Classic "race condition guard"

**4. Debounced Search**
```typescript
const debouncedQuery = useDebouncedValue(query.trim(), 180)
const filteredSessions = useMemo(() => { /* filter by debouncedQuery */ }, [debouncedQuery, sessions])
```
- 180ms debounce before filtering
- `useMemo` for derived state

**5. Optimistic UI + Rollback**
```typescript
// In session actions (pin/unpin/export/delete)
const RowIconButton = ({ onClick, title, children }) => (
  <Tip label={title}>
    <Button onClick={onClick}>{children}</Button>
  </Tip>
)
```
- Actions fire immediately, no loading spinners per row
- Errors show in toast notifications

---

### 2.2 Skills Page (skills/index.tsx)

**File Size:** 824 lines
**Pattern:** Master-Detail with four sub-tabs

#### Component Hierarchy

```
SkillsView (exported component)
├── PageSearchShell (search + tab bar wrapper)
│   ├── TabBar: Skills | Toolsets | MCP | Hub
│   └── Content (switches on mode):
│       ├── Skills Tab:
│       │   └── MasterDetail (split layout)
│       │       ├── ListColumn (left)
│       │       │   ├── ListStrip (header: sort + bulk actions)
│       │       │   └── CapRow[] (skill rows with toggle)
│       │       └── DetailColumn (right)
│       │           └── SkillDetail (metadata + edit/archive)
│       ├── Toolsets Tab:
│       │   └── MasterDetail
│       │       ├── ListColumn
│       │       │   └── CapRow[] (toolset rows with toggle + usage badge)
│       │       └── DetailColumn
│       │           └── ToolsetDetail (tool list + config)
│       ├── MCP Tab:
│       │   └── McpTab (separate component)
│       └── Hub Tab:
│           └── SkillsHub (separate component — grid cards)
```

#### Key Code Patterns

**1. TanStack Query for Server State**
```typescript
const { data: skills, isError: skillsFailed } = useQuery({
  queryKey: SKILLS_QUERY_KEY,
  queryFn: getSkills,
  staleTime: 0
})
const { data: toolsets } = useQuery({
  queryKey: TOOLSETS_QUERY_KEY,
  queryFn: getToolsets,
  staleTime: 0
})
```
- `useQuery` handles caching, deduplication, background refetch
- Query keys for invalidation
- `staleTime: 0` = always refetch on mount

**2. Write-Through Cache for Optimistic Updates**
```typescript
const setSkills = writeCache<SkillInfo[]>(SKILLS_QUERY_KEY)
const setToolsets = writeCache<ToolsetInfo[]>(TOOLSETS_QUERY_KEY)

// Toggle skill: update cache immediately, then sync backend
async function handleToggleSkill(skill: SkillInfo, enabled: boolean) {
  setSkills(current => current?.map(row => (row.name === skill.name ? { ...row, enabled } : row)) ?? current)
  try {
    await setSkillEnabled(skill.name, enabled)
    invalidateSlashCompletions()
  } catch (err) {
    // Rollback on error
    setSkills(current => current?.map(row => (row.name === skill.name ? { ...row, enabled: !enabled } : row)) ?? current)
  }
}
```
- **CRITICAL PATTERN:** UI updates immediately → backend sync → rollback on error
- This is the "optimistic then honest" principle from AGENTS.md

**3. Lazy Loading Heavy Analytics**
```typescript
// Only fetch tool call counts when Toolsets tab is shown
useEffect(() => {
  if (mode !== 'toolsets' || toolCalls !== null) return
  loadToolCalls().then(value => setToolCalls(value))
}, [mode, toolCalls])
```
- 365-day message scan is expensive — only run when needed
- Module-wide TTL cache (10 minutes)
- Epoch counter prevents profile-switch race conditions

**4. Usage Badges with Skeleton Loading**
```typescript
meta={
  calls === null ? <CountSkeleton /> :  // Still loading
  calls > 0 ? `×${compactNumber(calls)}` :  // Has usage
  `${toolNames(toolset).length} tools`  // No usage yet
}
```
- Shows skeleton while loading
- `compactNumber(1523)` → "1.5K"
- Falls back to tool count when no usage data

**5. Search with Category Hints**
```typescript
const searchHints = useMemo(() => {
  if (mode === 'skills' && skills?.length) {
    const counts = new Map<string, number>()
    for (const skill of skills) {
      const key = categoryFor(skill)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category]) => t.common.tryHint(category.toLowerCase()))
  }
}, [mode, skills, toolsets, t])
```
- Rotating placeholder hints from user's own data
- Teaches that search understands categories

**6. Profile-Keyed Caching**
```typescript
const toolCallsCache = new Map<string, { at: number; value: Record<string, number> }>()
async function loadToolCalls(force = false): Promise<Record<string, number>> {
  const key = normalizeProfileKey($activeGatewayProfile.get())
  // ... check cache by profile key ...
}
```
- Analytics are profile-scoped
- Prevents showing Profile A's counts in Profile B

---

### 2.3 Skills Hub (skills/hub.tsx)

**File Size:** 468 lines
**Pattern:** Grid cards with install/uninstall actions

#### Component Hierarchy

```
SkillsHub
├── Search bar (debounced)
├── Sources list (sidebar or dropdown)
├── Featured skills (top section)
└── Grid of HubSkillRow cards:
    └── HubSkillRow (self-contained)
        ├── Name + Trust badge + Installed badge
        ├── Description (2-line clamp)
        └── Actions:
            ├── [Preview] button
            └── [Install] / [Uninstall] button (with loading spinner)
```

#### Key Code Patterns

**1. Trust Rank System**
```typescript
const TRUST_RANK: Record<string, number> = { builtin: 2, trusted: 1, community: 0 }
function trustTone(level: string): string {
  switch (level) {
    case 'builtin': return 'bg-gray-500 text-gray-300'
    case 'trusted': return 'bg-emerald-500/15 text-emerald-400'
    default: return 'bg-amber-500/15 text-amber-400'
  }
}
```
- Visual trust levels: builtin (gray) > trusted (green) > community (amber)
- Dedup rank when same skill from multiple sources

**2. Per-Item Action State**
```typescript
// In store/hub-actions.ts:
export const $hubActions = map<Record<string, HubAction | undefined>>({})
export const $hubInstalledOverride = map<Record<string, boolean | undefined>>({})

// Each row reads its OWN action status:
const action = useStore($hubActions)[skill.identifier]
const override = useStore($hubInstalledOverride)[skill.identifier]
const installed = override ?? rawInstalled
const running = action?.running ?? false
```
- **CRITICAL:** Each row is self-contained
- Parallel installs don't desync
- Optimistic override wins immediately

**3. Install/Uninstall with Log Tailing**
```typescript
const doInstall = () => {
  notify({ kind: 'success', title: h.installStarted(skill.name), message: h.actionLog })
  void installHubSkill(skill.identifier).catch(err => notifyError(err, h.actionFailed))
}
```
- Toast notification on start
- Async action with error handling
- Log tailing in bottom pane during install

---

### 2.4 Store Patterns (store/hub-actions.ts)

**Pattern:** Nanostores (atomic reactive stores)

```typescript
import { map, atom } from 'nanostores'

// Per-item action tracking (install/uninstall/update)
export const $hubActions = map<Record<string, HubAction | undefined>>({})

// Optimistic installed state override
export const $hubInstalledOverride = map<Record<string, boolean | undefined>>({})

// Currently active log to tail
export const $hubActiveLog = atom<null | string>(null)
```

**Why Nanostores over Zustand?**
- Atomic — each store is independent
- Framework-agnostic (works with React, Vue, Svelte)
- Smaller bundle size
- No single store tree — easier to split by concern

---

## PART 3: Hermes Design Principles (from AGENTS.md)

### Principles Applied in Command Center + Skills

| Principle | How It's Applied |
|-----------|-----------------|
| **State by authority** | Backend owns skills/toolsets data; renderer is cache |
| **Merge, don't clobber** | `useQuery` merges new data; optimistic updates merge into cache |
| **Be optimistic, then honest** | Toggle flips UI immediately; rollback on error |
| **Guard against the past** | `usageRequestRef` prevents stale responses overwriting newer data |
| **Isolate the foreground** | Only visible tab subscribes to its data |
| **Preserve reference identity** | Stable empty arrays prevent re-renders |
| **Switch context is re-home** | Profile swap invalidates queries; data reloads for new profile |
| **Cross everything as observable ladder** | Multiple fallback sources for skills (builtin → hub → github) |

---

## PART 4: Comparison — Hermes vs Mosaic Stargate

### Current Stargate Skills Tab (StargateSkillsMarketplacePanel.tsx)

```
StargateSkillsMarketplacePanel (~500 lines)
├── Inline search
├── Category tabs (All, Development, Creative, Data, DevOps)
├── Skill cards grid
│   └── Each card: Name, description, install button, clone button
└── No detail pane, no toggle, no usage tracking
```

**Problems:**
1. ❌ No master-detail layout — cards are flat
2. ❌ No toggle to enable/disable skills
3. ❌ No usage badges (how many times skill was used)
4. ❌ No provenance tracking (where skill came from)
5. ❌ No detail pane with metadata
6. ❌ No hub browser (discover new skills)
7. ❌ No profile scoping
8. ❌ No optimistic updates
9. ❌ No bulk actions
10. ❌ Skills are hardcoded or fetched once, not cached with TanStack Query

### What Stargate Should Adopt from Hermes

#### Immediate Wins (Low Effort, High Impact)

| # | Feature | Where in Hermes | Effort | Impact |
|---|---------|----------------|--------|--------|
| 1 | **Master-Detail Layout** | `MasterDetail`, `ListColumn`, `DetailColumn` | Medium | 🔥🔥🔥 |
| 2 | **Toggle Switches** | `CapRow` with `enabled` + `onToggle` | Low | 🔥🔥🔥 |
| 3 | **Usage Badges** | `meta={usageOf(skill)}` + `compactNumber` | Low | 🔥🔥 |
| 4 | **Detail Pane Metadata** | `SkillDetail` component | Medium | 🔥🔥 |
| 5 | **Profile Scoping** | `normalizeProfileKey`, profile-keyed caches | Medium | 🔥🔥 |
| 6 | **Optimistic Updates** | `setSkills(current => ...)` then sync | Low | 🔥🔥🔥 |
| 7 | **Search with Hints** | `searchHints` from user's data | Low | 🔥 |
| 8 | **Hub Browser** | `SkillsHub` component | High | 🔥🔥🔥 |
| 9 | **Trust Badges** | `trustTone()`, `TRUST_RANK` | Low | 🔥 |
| 10 | **Request Guards** | `usageRequestRef` pattern | Low | 🔥 |

#### Architectural Wins (Medium Effort, Long-term Value)

| # | Feature | Where in Hermes | Effort | Impact |
|---|---------|----------------|--------|--------|
| 1 | **TanStack Query** | `useQuery`, `queryClient`, `writeCache` | Medium | 🔥🔥🔥 |
| 2 | **Conditional Subscriptions** | `useStoreSelector` with gate | Low | 🔥🔥 |
| 3 | **Lazy Analytics Loading** | `loadToolCalls` with TTL | Medium | 🔥🔥 |
| 4 | **Atomic Stores** | Nanostores vs Zustand | Medium | 🔥🔥 |
| 5 | **URL-Based State** | `useRouteEnumParam` | Low | 🔥 |

---

## PART 5: Application Plan — What to Port to Mosaic

### Phase A: Skills Tab Overhaul (1-2 days)

#### Step A1: Create Master-Detail Components (reuse from Hermes)

Create reusable layout components:
- `MasterDetail` — split layout with resizable panes
- `ListColumn` — scrollable list with header strip
- `DetailColumn` — detail pane with footer
- `CapRow` — list row with toggle, metadata, busy state

#### Step A2: Rewrite StargateSkillsMarketplacePanel

Current:
```
Grid of cards → click → open modal → install
```

New (Hermes-style):
```
MasterDetail
├── ListColumn
│   ├── Header: Search + Sort + Bulk Toggle
│   └── CapRow[]: Name | Category | Usage | [●] Toggle
└── DetailColumn
    ├── Name + Trust badge + Version
    ├── Description
    ├── Metadata table (author, license, platforms, tags)
    ├── Related skills
    └── Actions: [Edit] [Archive] [Clone]
```

#### Step A3: Add Usage Tracking

Where: `skillInjector.ts` or new analytics service

```typescript
// Track each time a skill is referenced in system prompt
function trackSkillUsage(skillName: string) {
  const key = `skill_usage_${skillName}`
  const current = parseInt(localStorage.getItem(key) || '0', 10)
  localStorage.setItem(key, String(current + 1))
}
```

Show in UI:
```typescript
meta={usage > 0 ? `×${compactNumber(usage)}` : undefined}
```

#### Step A4: Add Toggle Support

Skills need an `enabled` field in the skill data model:

```typescript
interface SkillInfo {
  name: string
  description: string
  category: string
  enabled: boolean  // NEW
  provenance: 'builtin' | 'hub' | 'local'  // NEW
  usage: number  // NEW
  version?: string  // NEW
  author?: string  // NEW
  license?: string  // NEW
  platforms?: string[]  // NEW
  tags?: string[]  // NEW
  relatedSkills?: string[]  // NEW
}
```

Toggle handler (optimistic):
```typescript
async function handleToggleSkill(skill: SkillInfo, enabled: boolean) {
  // Optimistic: update UI immediately
  setSkills(current => current?.map(s => s.name === skill.name ? { ...s, enabled } : s))
  try {
    await window.electronAPI.skills.setEnabled(skill.name, enabled)
  } catch (err) {
    // Rollback on error
    setSkills(current => current?.map(s => s.name === skill.name ? { ...s, enabled: !enabled } : s))
    notifyError(err)
  }
}
```

### Phase B: Hub Browser (2-3 days)

#### Step B1: Create SkillsHub Component

Pattern from Hermes `SkillsHub`:
- Grid of skill cards
- Search with debounce
- Category sidebar with counts
- Trust badges (builtin/trusted/community)
- Install/uninstall with action tracking
- Sources: skills.sh, GitHub, ClawHub, LobeHub

#### Step B2: Backend API Endpoints

New IPC handlers:
- `skills:searchHub(query, source)` — search remote registries
- `skills:installHub(identifier)` — install from hub
- `skills:uninstallHub(name)` — uninstall from hub
- `skills:getHubSources()` — list configured sources

#### Step B3: Store for Hub Actions

```typescript
// In stargateStore.ts
hubActions: Record<string, { running: boolean; error?: string }>
hubInstalledOverride: Record<string, boolean | undefined>

// Actions:
installHubSkill: (identifier: string) => Promise<void>
uninstallHubSkill: (identifier: string, name: string) => Promise<void>
```

### Phase C: Command Center Improvements (1 day)

#### Step C1: Adopt URL-Based Tab State

```typescript
// Instead of useState('graph'):
const [tab, setTab] = useRouteEnumParam('tab', TABS, 'graph')
```

#### Step C2: Conditional Data Subscriptions

```typescript
// Only subscribe to nodeManager data when on Factories tab
const nodeStatus = useStoreSelector(
  $nodeManager,
  s => (activeTab === 'factories' ? s : null)
)
```

#### Step C3: Add Request Guards

```typescript
const requestRef = useRef(0)
const refreshData = async () => {
  const id = ++requestRef.current
  const data = await fetchData()
  if (requestRef.current === id) {
    setData(data)
  }
}
```

---

## PART 6: Exact Code Snippets to Port

### 6.1 Compact Number Formatter

```typescript
// From Hermes: src/lib/format.ts
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}
```

### 6.2 Trust Badge Colors

```typescript
const TRUST_RANK: Record<string, number> = { builtin: 2, trusted: 1, community: 0 }

function trustTone(level: string): string {
  switch (level) {
    case 'builtin': return 'bg-gray-500/15 text-gray-300 border-gray-500/25'
    case 'trusted': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
    default: return 'bg-amber-500/15 text-amber-400 border-amber-500/25'
  }
}
```

### 6.3 Optimistic Toggle Pattern

```typescript
// Step 1: Update cache immediately
setSkills(current => current?.map(row => 
  row.name === skill.name ? { ...row, enabled } : row
))

// Step 2: Sync backend
try {
  await setSkillEnabled(skill.name, enabled)
} catch (err) {
  // Step 3: Rollback on error
  setSkills(current => current?.map(row => 
    row.name === skill.name ? { ...row, enabled: !enabled } : row
  ))
}
```

### 6.4 Lazy Analytics Loading

```typescript
const ANALYTICS_TTL_MS = 10 * 60 * 1000
const analyticsCache = new Map<string, { at: number; value: Analytics }>()

async function loadAnalytics(force = false): Promise<Analytics> {
  const key = getCurrentProfile()
  const cached = analyticsCache.get(key)
  if (!force && cached && Date.now() - cached.at < ANALYTICS_TTL_MS) {
    return cached.value
  }
  const value = await fetchAnalytics()
  analyticsCache.set(key, { at: Date.now(), value })
  return value
}
```

### 6.5 Per-Item Action Tracking

```typescript
// Store:
interface HubAction {
  running: boolean
  error?: string
  startedAt: number
}

const hubActions = new Map<string, HubAction>()

// Row component:
const action = hubActions.get(skill.identifier)
const running = action?.running ?? false

// Render:
<button disabled={running} onClick={doInstall}>
  {running ? <Spinner /> : 'Install'}
</button>
```

---

## PART 7: Mosaic-Specific Adaptations

### What's Different Between Hermes and Mosaic

| Aspect | Hermes | Mosaic | Adaptation |
|--------|--------|--------|------------|
| **State library** | Nanostores | Zustand | Keep Zustand; add atomic slices |
| **Data fetching** | TanStack Query | Raw fetch/IPC | Adopt TanStack Query for skills |
| **Backend** | Python FastAPI | Electron IPC | Use IPC methods as query functions |
| **Skills location** | ~/.hermes/skills | ~/.hermes/skills | Same! Can reuse Hermes skills |
| **Profiles** | Multiple Hermes profiles | Single app | Skip profile scoping for now |
| **Hub sources** | skills.sh, GitHub, etc. | None yet | Add skills.sh integration |
| **Toolsets** | MCP servers as toolsets | MCP in separate tab | Integrate MCP into Skills tab |

### The Big Opportunity

**Mosaic and Hermes share the same skills directory (`~/.hermes/skills/`)!**

This means:
1. Skills created in Hermes CLI appear in Mosaic automatically
2. Skills installed via Hermes `skills install` are available in Mosaic
3. The skill format (SKILL.md with YAML frontmatter) is identical
4. Mosaic only needs a **UI layer** on top of existing skill infrastructure

### Recommended Architecture

```
Mosaic Skills Tab
├── Backend (Electron IPC):
│   ├── skills:list — list installed skills from ~/.hermes/skills/
│   ├── skills:toggle — enable/disable skill
│   ├── skills:getDetail — read SKILL.md metadata
│   └── skills:hubSearch — search remote registries
├── Frontend (React + Zustand):
│   ├── SkillsView (main component)
│   │   ├── TabBar: Skills | Toolsets | MCP | Hub
│   │   └── Content:
│   │       ├── SkillsTab (MasterDetail with CapRow)
│   │       ├── ToolsetsTab (MasterDetail with MCP servers)
│   │       ├── McpTab (existing MCP panel)
│   │       └── HubTab (SkillsHub grid)
│   └── Store (Zustand):
│       ├── skills: SkillInfo[]
│       ├── toolsets: ToolsetInfo[]
│       ├── hubActions: Record<string, HubAction>
│       └── selectedSkill: string | null
```

---

## PART 8: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hermes skills format changes | Low | High | Watch Hermes repo for format changes |
| Too many skills slow down UI | Medium | Medium | Virtualized list; pagination |
| MCP servers as "toolsets" confusing | Medium | Low | Clear labeling; separate tabs |
| Hub install requires CLI | Medium | Medium | Spawn `hermes skills install` via IPC |
| Zustand vs Nanostores impedance | Low | Low | Both are reactive; mapping is trivial |

---

## Summary

The Hermes screenshot shows a **mature, production-grade skills management system** with:

1. ✅ Master-detail layout with list + detail pane
2. ✅ Toggle switches with optimistic updates
3. ✅ Usage badges showing real call counts
4. ✅ Trust/provenance badges
5. ✅ Rich metadata in detail pane
6. ✅ Hub browser for discovering new skills
7. ✅ Profile-scoped state
8. ✅ Bulk actions
9. ✅ Search with intelligent hints
10. ✅ Per-item action tracking (parallel installs don't desync)

**Mosaic Stargate should adopt:**
- **Immediate:** Master-detail layout, toggles, usage badges, detail pane
- **Short-term:** Hub browser, trust badges, optimistic updates
- **Medium-term:** TanStack Query, lazy analytics, profile scoping

**The shared `~/.hermes/skills/` directory is a massive advantage** — Mosaic doesn't need to reinvent the skill backend; it only needs a UI layer on top of existing Hermes infrastructure.

---

*End of analysis. Ready to implement upon your command, master.*

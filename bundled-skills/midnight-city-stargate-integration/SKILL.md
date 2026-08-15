---
name: midnight-city-stargate-integration
description: Midnight City Stargate mining, auth, API payload quirks, confirmation-driven loops, and inter-agent auto-reply.
trigger: midnight city stargate mining agent command panel auto-work
---

# Midnight City Stargate Integration

This skill covers the full lifecycle of the Midnight City Command Panel in the Stargate dashboard: connecting, mining loops, position detection, connection stability, and inter-agent communication.

## Architecture

The integration has two layers:

| Layer | File | Responsibility |
|-------|------|----------------|
| Background Service | `electron/services/MidnightCityBackgroundService.ts` | Main-process API proxy, auth token management, heartbeat |
| Renderer UI | `src/components/stargate/MidnightCityCommandPanel.tsx` | Auto-work loop, manual actions, state display, thread display |

All API calls flow through the background service via IPC: renderer → `window.electronAPI.midnightCity.*` → `MidnightCityBackgroundService` → Midnight City API.

---

## 1. Connection & Auth

### Token Refresh on Connect

The API key must be re-read from disk on every `connect()` call because the user may have updated credentials via the renderer UI after the main process started.

```ts
async connect(agentId: string) {
  this.apiToken = getApiKey(); // ← CRITICAL: refresh from safeStorage
  // ... proceed with fetch to /api/local-control/session
}
```

### Heartbeat — Use a REAL Endpoint

Midnight City has **no `/session/heartbeat` endpoint**. Using a fake endpoint caused 404 → connection death every ~45s.

**Correct heartbeat:**
```ts
fetch(`${MIDNIGHT_BASE}/api/skill/agents/${agentId}/context`, {
  method: "GET",
  headers: { Authorization: `Bearer ${leaseToken}` },
})
```

Tolerate **3 consecutive failures** before declaring the session dead. `GET /context` is lightweight and validates the lease token.

### 401 Propagation

When the API returns 401, mark the connection dead and schedule reconnect. The renderer must sync `connectedRef` from `syncFromBackground`.

```ts
const syncFromBackground = useCallback(async () => {
  const status = await window.electronAPI.midnightCity.getStatus();
  setConnected(status.connected);
  connectedRef.current = status.connected; // ← keep ref in sync
}, []);
```

---

## 2. Mining Loop (Auto-Work)

### Core Pattern: Sequential Async, Not setInterval

`setInterval` every 1s caused race conditions where `move_to` spammed before state updated. Use a `while` loop with explicit `await` delays.

### Position Detection is UNRELIABLE — Use Confirmation Instead

The API's `position.spaceId` is a **coarse zone label**, not a sub-area. The agent can be visually at "MINER-CENTRAL" while the API returns `spaceId: "central"`. Position-based arrival checks **never match**.

**Also critical:** The server ignores `areaId` in `move_to` payloads. It requires `spaceId` + coordinates.

**Correct approach — confirmation-driven:**

```ts
const run = async () => {
  // Step 1: Send move_to with spaceId (NOT areaId)
  await submitAction({
    kind: "move_to",
    destination: { spaceId: targetAreaId, x: 0, y: 0 }
  });

  // Step 2: Poll for server confirmation (not position check)
  let arrived = false;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    await refreshState();
    const space = agentStateRef.current?.position?.spaceId || "";
    // Coarse check — safe to skip if already near mine
    if (space.toLowerCase().includes("miner") || space.toLowerCase().includes("mine")) {
      arrived = true; break;
    }
  }

  // Step 3: Mining loop — confirmation-driven, no blind timers
  let lastJobTime = 0;
  while (!autoWorkCancelledRef.current) {
    await refreshState();
    const aa = agentStateRef.current?.activeAction;

    // Already mining — calculate exact remaining time
    if (aa?.kind === "perform_job" || aa?.kind === "engage") {
      let remaining = 30000;
      if (aa.durationMs && aa.startedAt) {
        const elapsed = Date.now() - new Date(aa.startedAt).getTime();
        remaining = Math.max(0, aa.durationMs - elapsed);
      }
      const sleepMs = Math.max(2000, Math.min(remaining + 3000, 120000));
      await new Promise((r) => setTimeout(r, sleepMs));
      continue;
    }

    // Rate-limit: minimum 5 seconds between perform_job submissions
    const now = Date.now();
    if (now - lastJobTime < 5000) {
      await new Promise((r) => setTimeout(r, lastJobTime + 5000 - now));
      continue;
    }
    lastJobTime = now;

    // Submit WITHOUT durationMs — server ignores it anyway
    await submitAction({ kind: "perform_job", activity: "mine ore" });

    // Wait for server confirmation (poll every 3s, max 15s)
    let confirmed = false;
    for (let i = 0; i < 5 && !autoWorkCancelledRef.current; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      await refreshState();
      const kind = agentStateRef.current?.activeAction?.kind;
      if (kind === "perform_job" || kind === "engage") {
        confirmed = true; break;
      }
    }
    if (!confirmed) addLog("warn", "Job not confirmed, retrying");
  }
};
```

**Key rules:**
- `move_to` requires `{ spaceId, x, y }` — `{ areaId }` is silently ignored
- `perform_job` server duration is 30s regardless of `durationMs`
- Server reports mining as `activeAction.kind === "engage"` (not `"perform_job"`)
- Server **auto-renews** `engage` every 30s — submit once, then just poll

**Pitfall:** Never trust `position.spaceId` for sub-area matching. Trust action outcomes (`activeAction.kind`) instead.

**Pitfall:** `"areaId"` in `move_to` payload causes silent failure — agent never moves but HTTP returns 200.

### Manual "Mine Ore" Button

Same confirmation-driven pattern:

```ts
const target = findHarvestArea("mine") || "mines-worksite";

// 1. Move with spaceId (NOT areaId — server ignores areaId)
await submitAction({ kind: "move_to", destination: { spaceId: target, x: 0, y: 0 } });

// 2. Poll for arrival (3s × 10 = 30s max)
let arrived = false;
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  await refreshState();
  const space = agentStateRef.current?.position?.spaceId || "";
  if (space.toLowerCase().includes("miner") || space.toLowerCase().includes("mine")) {
    arrived = true; break;
  }
}

// 3. Request job WITHOUT durationMs
await submitAction({ kind: "perform_job", activity: "mine ore" });

// 4. Poll for confirmation
for (let i = 0; i < 5; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  await refreshState();
  if (agentStateRef.current?.activeAction?.kind === "engage") {
    break;
  }
}
```

**Pitfall:** `"areaId"` in `move_to` payload causes silent failure — agent never moves but HTTP returns 200.

---

## 3. Rate-Limiting in Mining Loop (Confirmation-Driven)

Without position checks, the loop relies on `activeAction.kind` plus a `lastJobTime` timestamp to prevent spamming `perform_job`.

```ts
let lastJobTime = 0;
while (!autoWorkCancelledRef.current) {
  await refreshState();
  const aa = agentStateRef.current?.activeAction;

  // Already mining — calculate exact remaining time from startedAt + durationMs
  if (aa?.kind === "perform_job" || aa?.kind === "engage") {
    let remaining = 30000;
    if (aa.durationMs && aa.startedAt) {
      const elapsed = Date.now() - new Date(aa.startedAt).getTime();
      remaining = Math.max(0, aa.durationMs - elapsed);
    } else if (aa.durationMs) {
      remaining = aa.durationMs;
    }
    const sleepMs = Math.max(2000, Math.min(remaining + 3000, 120000));
    await new Promise((r) => setTimeout(r, sleepMs));
    continue;
  }

  // Rate-limit: minimum 5 seconds between perform_job submissions
  const now = Date.now();
  if (now - lastJobTime < 5000) {
    await new Promise((r) => setTimeout(r, lastJobTime + 5000 - now));
    continue;
  }
  lastJobTime = now;

  // Submit WITHOUT durationMs — server ignores it anyway
  await submitAction({ kind: "perform_job", activity: "mine ore" });

  // Wait for server confirmation (poll every 3s, max 15s)
  let confirmed = false;
  for (let i = 0; i < 5 && !autoWorkCancelledRef.current; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    await refreshState();
    if (agentStateRef.current?.activeAction?.kind === "engage") {
      confirmed = true; break;
    }
  }
  if (!confirmed) addLog("warn", "Job not confirmed, retrying");
}
```

**Why confirmation-driven beats blind timers:**
- Old: Submit → wait 15s blindly → submit again → sometimes server hadn't processed → spam
- New: Submit → poll every 3s for `activeAction.kind === "engage"` → only sleep exact remaining time
- Server auto-renews `engage` every 30s → loop naturally paces itself

**Pitfall:** `"areaId"` in `move_to` payload causes silent failure — agent never moves but HTTP returns 200.

---

## 4. Background Service API Call Wrapper

```ts
async apiCall(params: { endpoint: string; method: "GET" | "POST"; body?: any }) {
  if (!this.state.connected) return { error: "Not connected", data: null };
  
  const tokenForAuth = this.state.leaseToken || this.apiToken;
  const headers = {
    Authorization: `Bearer ${tokenForAuth}`,
    "Content-Type": "application/json",
  };
  if (this.state.leaseToken) headers["X-Lease-Token"] = this.state.leaseToken;
  
  const res = await fetch(url, { method: params.method, headers, body });
  
  if (res.status === 401) {
    this.state.connected = false;
    this.scheduleReconnect();
    return { error: "401 Unauthorized — token expired", data: null };
  }
  // ...
}
```

---

## 5. IPC Handler Static Imports

Runtime `require("./integrations/midnight-city")` inside IPC handlers fails after esbuild bundles to a single file. Use **static ES imports at the top of `electron/main.ts`**.

```ts
// Top of electron/main.ts
import { getCredentials, getApiKey } from "./integrations/midnight-city";

// Inside IPC handler — use imported functions directly
ipcMain.handle("midnight:restartMiner", async () => {
  const creds = getCredentials(); // ← static import, not require()
  // ...
});
```

---

## 6. Inter-Agent Auto-Reply

The dashboard fetches threads (`GET /api/agents/{id}/threads`) and displays them. Auto-reply polls threads, generates replies via LLM, and submits `speak` actions automatically.

### IPC Handler (main process)

```ts
ipcMain.handle("midnight:autoReply", async (_event, params: {
  threadId: string; agentId: string; otherAgentName: string; otherAgentId: string
}) => {
  // 1. Fetch thread messages
  const msgRes = await midnightCityService.apiCall({
    endpoint: `/api/threads/${encodeURIComponent(params.threadId)}/messages?limit=20`,
    method: "GET",
  });
  if (msgRes.error || !msgRes.data?.messages) {
    return { success: false, error: msgRes.error || "No messages" };
  }
  const lastIncoming = msgRes.data.messages
    .reverse()
    .find((m: any) => m.senderId !== params.agentId);
  if (!lastIncoming) return { success: false, error: "No incoming message" };

  // 2. Fetch agent context for personality
  const ctxRes = await midnightCityService.apiCall({
    endpoint: `/api/skill/agents/${encodeURIComponent(params.agentId)}/context`,
    method: "GET",
  });
  const agentName = ctxRes.data?.agent?.name || "Agent";
  const profession = ctxRes.data?.agent?.profession || "citizen";
  const currentSpace = ctxRes.data?.agent?.currentSpace?.name || "the city";

  // 3. Build conversation context
  const recent = msgRes.data.messages.slice(-6).map((m: any) =>
    `${m.senderId === params.agentId ? agentName : m.senderName || "Other"}: ${m.text || m.content || ""}`
  ).join("\n");
  const prompt = `You are ${agentName}, a ${profession} in ${currentSpace}.\n` +
    `Another agent "${params.otherAgentName}" said: "${lastIncoming.text || lastIncoming.content}"\n` +
    `Recent conversation:\n${recent}\n` +
    `Reply naturally, short (1-2 sentences). Only output reply text.`;

  // 4. Call LLM (lazy-load to avoid circular deps)
  const { callActiveLLM } = await import("./integrations/mosaicbot/src/main/llm.js");
  const replyText = await callActiveLLM(prompt, `You are ${agentName}...`);
  if (!replyText) return { success: false, error: "LLM empty" };

  // 5. Submit speak action
  const speakRes = await midnightCityService.apiCall({
    endpoint: "/api/actions",
    method: "POST",
    body: {
      kind: "speak",
      agentId: params.agentId,
      targetAgentId: params.otherAgentId,
      message: replyText.trim().slice(0, 280),
    },
  });
  if (speakRes.error) return { success: false, error: speakRes.error };

  return { success: true, reply: replyText.trim().slice(0, 280) };
});
```

### Renderer Auto-Reply Loop — **SEE `references/auto-reply-cascade-guard.md`** for the full stable pattern.

**Critical:** The Midnight City API does not guarantee `unreadCount`. Without guards, `undefined <= 0` → `false` causes every thread to pass the filter, firing 50+ concurrent LLM calls = log spam bomb.

---

## 7. Loop-Driven Auto-Work Activation (IPC Bridge Pattern)

The Midnight City auto-work toggle can now be triggered **remotely by a Stargate loop**, not just by clicking the UI button. This bridges the Loop Engine (renderer) → Electron main process → all renderer windows.

**For the complete implementation** (6 files, background service broadcast, renderer listener cleanup, LoopEngine bridge, teaching preset, verification checklist, and generalization to any Electron IPC): **see `references/ipc-loop-bridge.md`**.

### IPC Handlers (main.ts)

```ts
ipcMain.handle("midnight:setAutoWork", async (_event, enabled: boolean) => {
  midnightCityService.setAutoWork(enabled);
  return { success: true, autoMine: enabled };
});

ipcMain.handle("midnight:getAutoWork", async () => {
  return { autoMine: midnightCityService.getAutoWork() };
});
```

### Background Service (MidnightCityBackgroundService.ts)

```ts
setAutoWork(enabled: boolean) {
  this.state.autoMine = enabled;
  this.addLog("info", enabled ? "⚡ Auto-work ENABLED" : "⏹ Auto-work DISABLED");
  this.broadcastToRenderers("midnight:autoWorkChanged", { enabled });
}

getAutoWork(): boolean {
  return this.state.autoMine;
}

private broadcastToRenderers(channel: string, payload: any) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, payload);
  });
}
```

### Preload (preload.ts)

```ts
midnightCity: {
  // ... existing handlers ...
  setAutoWork: (enabled: boolean) => ipcRenderer.invoke("midnight:setAutoWork", enabled),
  getAutoWork: () => ipcRenderer.invoke("midnight:getAutoWork"),
  onAutoWorkChanged: (callback: (payload: { enabled: boolean }) => void) => {
    ipcRenderer.on("midnight:autoWorkChanged", (_event, payload) => callback(payload));
    return () => ipcRenderer.removeAllListeners("midnight:autoWorkChanged");
  },
}
```

### Renderer Panel (MidnightCityCommandPanel.tsx)

**Sync on mount / reconnect:**
```ts
const syncFromBackground = useCallback(async () => {
  const status = await window.electronAPI.midnightCity.getStatus();
  setConnected(status.connected);
  connectedRef.current = status.connected;
  setLocked(status.lockActive);
  // NEW: sync autoMine from background service
  const autoWorkStatus = await window.electronAPI.midnightCity.getAutoWork();
  if (autoWorkStatus?.autoMine !== undefined) {
    setAutoMine(autoWorkStatus.autoMine);
  }
}, []);
```

**Listen for remote activation:**
```ts
useEffect(() => {
  const cleanup = window.electronAPI.midnightCity.onAutoWorkChanged((payload) => {
    if (payload?.enabled !== undefined) {
      setAutoMine(payload.enabled);
      addLog("info", payload.enabled
        ? "⚡ Auto-work activated remotely"
        : "⏹ Auto-work deactivated remotely"
      );
    }
  });
  return cleanup;
}, []);
```

### Loop Engine Bridge (LoopEngine.ts)

When a loop node's `toolName` starts with `midnight:`, route directly to `electronAPI.midnightCity` instead of going through the MCP server:

```ts
case "mcp-call": {
  const { serverId, toolName, args = {} } = node.config;

  // ── Special case: Midnight City IPC calls are NOT real MCP tools ───
  if (toolName.startsWith("midnight:")) {
    const midnightApi = (window as any).electronAPI?.midnightCity;
    if (!midnightApi) throw new Error("Midnight City API unavailable");
    const ipcMethod = toolName.replace("midnight:", "");

    if (ipcMethod === "setAutoWork") {
      const result = await midnightApi.setAutoWork(args.enabled ?? true);
      return {
        nodeId: node.id,
        status: result?.success !== false ? "ok" : "err",
        output: { result: JSON.stringify(result), enabled: args.enabled ?? true },
        // ...
      };
    }
    if (ipcMethod === "getAutoWork") {
      const result = await midnightApi.getAutoWork();
      return { /* ... */ };
    }
    if (ipcMethod === "connect") {
      const result = await midnightApi.connect(args);
      return { /* ... */ };
    }
    if (ipcMethod === "getStatus") {
      const result = await midnightApi.getStatus();
      return { /* ... */ };
    }
    throw new Error(`Unsupported midnight IPC method: ${ipcMethod}`);
  }

  // ── Standard MCP tool call ────────────────────────────────────────
  const mcpApi = (window as any).electronAPI?.mcpAPI;
  // ...
}
```

**This is a general pattern.** Any Electron IPC can become a loop node:

| What | toolName | args |
|------|----------|------|
| Connect agent | `midnight:connect` | `{ agentId: "..." }` |
| Disconnect | `midnight:disconnect` | `{ force: true }` |
| Check status | `midnight:getStatus` | `{}` |
| Lock session | `midnight:setLock` | `{ locked: true }` |
| Any custom IPC | `yourModule:yourHandler` | `{ ... }` |

### The Teaching Preset

The "🌙 Byron → Midnight Auto-Work" preset (`StargateLoop.ts` lines 485–655) demonstrates the full pattern:

```
Node 1: vault-read     → reads "midnight-config" box (credentials)
   ↓
Node 2: agent-action   → Byron decides strategy from config
   ↓
Node 3: mcp-call       → IPC midnight:connect(agentId) [REAL]
   ↓
Node 4: mcp-call       → IPC midnight:setAutoWork(true) [REAL]
   ↓
Node 5: mcp-call       → IPC midnight:getStatus [REAL]
   ↓
Node 6: condition      → connected === true ?
   ├─ YES → Node 7: vault-write → Node 8: notify
   └─ NO  → Node 9: agent-action → feedback → back to Node 3 (max 5 retries)
```

**Template wiring** (argMapping passes data between nodes):
```ts
{
  id: "node-activate-autowork",
  type: "mcp-call",
  label: "⚡ Enable Auto-Work",
  config: {
    serverId: "midnight-mcp",
    toolName: "midnight:setAutoWork",
    args: { enabled: true },
    argMapping: { agentId: "{{node-read-midnight-config.output.agentId}}" },
  },
}
```

**Prerequisites:**
- Vault box "midnight-config" with entries: `agentId`, `profession`, `apiBase`, `apiKey`
- Midnight City credentials saved in Stargate → Midnight tab → Configuration

**Verification:**
1. Stargate → Loops → Templates → 🌙 Byron → Midnight Auto-Work
2. Save → ⚡ LIVE RUN
3. Graph header shows "Live: Byron → Midnight Auto-Work" badge (glowing emerald)
4. Midnight tab log shows "⚡ Auto-work activated remotely"
5. Auto-work toggle shows ON (green)
6. Log into midnight.city → agent is mining

---

## 8. Build & Restart

Any main-process change requires **full quit and restart**:

```bash
npm run typecheck
npm run build
node esbuild.config.js
# Ctrl+Q in app, then: npm start
```

Renderer reload (`Ctrl+R`) is insufficient for main-process changes.

---

## 9. Aimification Architecture — What an AIM Actually Is

**Critical correction:** An AIM is an **AI Machine** (not an "AI Miner"). It is a packaged agent deployed into HyperCycle's Node Manager ecosystem (`localhost:8006`) where other users can discover and run it with USDC payment rails.

### The Pipeline

```
Midnight confidential compute  ←──  Stargate Agent Builder  ──→  HyperCycle Node Manager
        (Compact contracts)           (Mosaic Companion)           (localhost:8006)
              │                              │                           │
              │  Privacy features            │  Aimify packaging         │  Discovery
              │  Shielded identity           │  4-step workflow          │  Execution
              │  Confidential state          │  Metadata + config        │  USDC payments
              └──────────────────────────────┴───────────────────────────┘
```

### What Aimify Does (Stargate Command Center)

The **Aimify** button in Stargate's Command Center is a **packaging workflow**, not an MCP deployment:

| Step | UI | What happens |
|------|-----|-------------|
| **1. Source** | Select template / browse files / Docker image | Choose agent base |
| **2. Info** | Metadata form | Name, description, pricing |
| **3. Config** | Settings panel | Runtime configuration |
| **4. Build** | Package button | Produces AIM artifact + HyperCycle registration |

### What a Midnight-AIM Is

An agent built in Mosaic's Agent Forge with Midnight skills (confidential compute, shielded identity, private state) that gets packaged through Aimify and deployed to HyperCycle Node Manager. Users running it pay via USDC (per subscription or per call).

**Pitfall:** Do NOT describe this as "deploying Midnight services as MCP tools." MCP is how agents discover tools *inside Mosaic*. Aimification is how agents become sellable services *in HyperCycle*. Two different layers.

### Coding Languages Required

| Layer | Language | Required? |
|-------|----------|-----------|
| **Frontend UI** | TypeScript + React | ✅ Required |
| **Styling** | Tailwind CSS | ✅ Required |
| **Desktop shell** | Node.js (Electron main) | Core team handles |
| **Agent logic** | TypeScript | ✅ Required |
| **Midnight contracts** | Compact | Needed for deep integration |
| **AIM packaging** | Docker (optional) | Only for complex custom models |

**Minimum to contribute:** TypeScript + React familiarity.

---

## 10. Midnight City v2.0: Needs API Object Shape (CRITICAL)

### The Trap

Midnight City v2.0 changed the `needs` endpoint. What looks like a number is actually an **object**:

```json
{
  "hunger": { "value": 85, "baseAtMs": 1692096000000, "nextPointAtMs": 1692096600000, "state": "normal" },
  "energy": { "value": 70, "baseAtMs": ..., "state": "normal" },
  "inventoryWeight": { "value": 45, "baseAtMs": ..., "state": "normal" }
}
```

**Rendering `{needs?.hunger}` as text → React error #31** ("Objects are not valid as a React child"). The entire panel crashes.

### The Fix: needVal() Helper

Add a render-safe extractor at component scope:

```tsx
const needVal = (raw: any): number => {
  if (typeof raw === "number") return raw;
  if (raw && typeof raw.value === "number") return raw.value;
  return 0;
};

// Usage in JSX — safe, never crashes
<div>{needVal(needs?.hunger)}/100</div>
<div className={needVal(needs?.hunger) < 30 ? "text-red-400" : ""}>
  {needVal(needs?.hunger)}/100
</div>
<div>{needVal(needs?.inventoryWeight)}/{needVal(needs?.inventoryCapacity)}</div>
```

### Auto-Restock Loop Fix

When comparing in an interval callback (where TypeScript strict typing may interfere), use `any`-typed intermediates:

```tsx
const hRaw: any = n.hunger;
const eRaw: any = n.energy;
const hunger = typeof hRaw === "number" ? hRaw : hRaw?.value ?? 100;
const energy = typeof eRaw === "number" ? eRaw : eRaw?.value ?? 100;

if (hunger < 30) { await submitAction({ kind: "eat" }); }
if (energy < 20) { await submitAction({ kind: "sleep" }); }
```

**Never compare `n.hunger < 30` directly** when the API returns objects. The comparison may work (object.toString() coercion) but is fragile and TypeScript will complain.

### Where This Hit

| Location | What | Fix |
|----------|------|-----|
| Economy Automation panel (Actions tab) | Rendered `{needs?.hunger}` | Added `needVal()` helper |
| Auto-restock useEffect | `if (n.hunger < 30)` | Extracted `.value` via any-typed intermediates |
| Auto-sell loop | `inv?.inventory?.["ore"]` | Added `|| 0` fallback |

**Session:** 2026-08-15. Core commit `23accd3`.

### Prevention Rule

> **When integrating a new third-party API field into React UI, always check if it's a plain scalar (string/number/boolean) or an object before rendering.** Objects render as React error #31. Use a defensive extractor like `needVal()` for any field that could be polymorphic.

---

---

## 11. Midnight City v2.0: Eat Action Requires `itemId` (CRITICAL)

### The Trap

Midnight City v2.0 changed the economy from free actions to **inventory-based consumption**. The server accepts `{ kind: "eat" }` with **200 OK** but **silently ignores it** because no `itemId` is provided. The action returns "SUCCESS eat submitted" but hunger never drops.

**Old (pre-v2.0):**
```json
POST /api/actions
{ "kind": "eat", "agentId": "...", "leaseToken": "..." }
→ Server processes immediately (free action)
```

**New (v2.0):**
```json
POST /api/actions
{ "kind": "eat", "agentId": "...", "leaseToken": "...", "itemId": "bread" }
→ Server consumes "bread" from inventory, reduces hunger
```

Without `itemId`, the server returns 200 but does nothing. This is a **silent failure** — the worst kind.

### The Fix: Add itemId to Eat Payload

**1. Update `submitAction()` switch:**
```ts
case "eat":
case "sleep":
  if (action.location) basePayload.location = action.location;
  if (action.durationMs) basePayload.durationMs = action.durationMs;
  if (action.itemId) basePayload.itemId = action.itemId; // v2.0: food item required
  break;
```

**2. Add food selector in UI:**
```tsx
const [selectedFood, setSelectedFood] = useState<string>("bread");

<select
  value={selectedFood}
  onChange={(e) => setSelectedFood(e.target.value)}
>
  <option value="bread">🍞 Bread (+15 hunger)</option>
  <option value="stew">🍲 Stew (+30 hunger)</option>
  <option value="energy_drink">⚡ Energy Drink (+20 energy)</option>
</select>

<button onClick={() => submitAction({ kind: "eat", itemId: selectedFood })}>
  🍽️ Eat
</button>
```

**3. Update auto-restock loop:**
```tsx
// Auto-restock sends itemId: "bread" when hunger < 30
if (hunger < 30) {
  addLog("info", "Auto-restock: hunger low, eating bread...");
  await submitAction({ kind: "eat", itemId: "bread" });
}
```

### Common Food Items (inferred)

| itemId | Effect | Approx. Cost |
|--------|--------|-------------|
| `"bread"` | +15 hunger | ~1 NIGHT |
| `"stew"` | +30 hunger | ~3 NIGHT |
| `"energy_drink"` | +20 energy | ~2 NIGHT |

**Note:** These itemIds are inferred from common game patterns. The actual API may use different names. Verify with `GET /api/skill/agents/{id}/inventory` or check what merchants sell.

### Where This Hit (Session: 2026-08-15)

| Location | Symptom | Fix |
|----------|---------|-----|
| Manual Eat button | Clicked, got "SUCCESS", hunger stayed at 85 | Added food selector + `itemId` in payload |
| Auto-restock loop | Sent `{ kind: "eat" }` every 20s, no effect | Changed to `{ kind: "eat", itemId: "bread" }` |
| submitAction switch | Only handled `location`/`durationMs` for eat | Added `if (action.itemId)` branch |

**Core commit:** `ad37319`

### Prevention Rule

> **When a third-party API silently accepts incomplete payloads (200 OK but no effect), always check the documentation or UI for required fields that may have been added in newer versions.** The server-side validation may be lenient (returns 200) while the business logic rejects the action. Log the actual response body, not just the status code.

### Verification

```bash
# Test with itemId (should reduce hunger)
curl -X POST -H "Authorization: Bearer $API_KEY" \
  -d '{"kind":"eat","agentId":"...","itemId":"bread"}' \
  https://midnight.city/observer/api/actions

# Test without itemId (should return 200 but do nothing)
curl -X POST -H "Authorization: Bearer $API_KEY" \
  -d '{"kind":"eat","agentId":"..."}' \
  https://midnight.city/observer/api/actions
# Response: { "ok": true } — but hunger unchanged
```

### Full Implementation Reference

**See `references/eat-action-v2-requires-itemid.md`** for the complete patch (lines changed, build verification, and testing checklist).

---

## Verification Steps

1. Connect → `SUCCESS Connected — Token ...`
2. Auto-Work ON → expected log flow:
   - `Auto-work: target mines-worksite | activity: mine ore`
   - `Auto-work: not at mine, sending move_to mines-worksite`
   - `Submitting: move_to { spaceId: "mines-worksite", x: 0, y: 0 }`
   - `Auto-work: arrived at mine mines-worksite` (or timeout warning)
   - `Auto-work: entering mining loop`
   - `Auto-work: requesting job mine ore`
   - `Auto-work: job confirmed by server engage`
   - `Auto-work: mining active mine_ore, 30000ms remaining`
   - `...30s later...`
   - `Auto-work: mining active mine_ore, 30000ms remaining` ← server auto-renewed
3. Connection alive > 45s (no 404 heartbeat kills)
4. Manual Mine Ore button works (spaceId move + confirmation poll + engage confirmation)
5. No `"failed to arrive at mines"` errors (position checks removed)
6. No `"areaId"` in move_to payloads
7. **Loop-driven activation:** After running the Byron → Midnight preset, the Midnight tab auto-activates without user clicking the toggle
8. **Background service broadcast:** `midnight:setAutoWork(true)` from any renderer window activates auto-work in ALL renderer windows
9. **Auto-work button sync:** Clicking the Auto-work toggle calls `setAutoWork()` on the background service, preventing heartbeat sync from overriding the user's intent
10. **Eat action with itemId:** Click food selector + Eat → hunger drops after ~5s
11. **Auto-restock with itemId:** Enable auto-restock, wait for hunger < 30 → agent eats bread automatically

## References

- `references/connectedref-sync.md` — connectedRef sync pitfall and fix
- `references/api-field-behavior.md` — why `position.spaceId` is coarse-grained
- `references/api-endpoints.md` — full Midnight City observer API endpoint reference with auth requirements, action kinds, and outcome model
- `references/auto-reply-pattern.md` — auto-reply IPC handler + renderer loop + LLM prompt pattern
- `references/server-action-behavior.md` — **which fields the server respects vs ignores** (`spaceId` vs `areaId`, `durationMs` being ignored, action outcome model, `activeAction.kind` values)
- `references/auto-reply-cascade-guard.md` — **STABLE auto-reply loop with all guards** (unreadCount undefined, in-flight lock, one-thread-per-iteration, timestamp cooldown, threadsRef)
- `references/ipc-loop-bridge.md` — how to expose any Electron IPC as a Stargate loop node (the `midnight:*` pattern generalized)
- `references/token-economy-opportunities.md` — Midnight City v2.0 token economy analysis: NIGHT, ShieldedToken, ZSwap, merchant arbitrage, and code gaps
- `references/midnight-city-v2-economy-implementation.md` — **FULL BUILT IMPLEMENTATION** of the v2.0 economy dashboard (wallet tab, ZSwap, auto-sell, auto-restock, MCP tools, types, state, effects). Session: 2026-08-15. Core commit `48827a6`.
- `references/needs-api-object-shape.md` — **CRITICAL: Midnight City v2.0 `needs` API returns objects with `.value`, not plain numbers.** React error #31 fix with `needVal()` helper. Session: 2026-08-15. Core commit `23accd3`.
- `references/buy-supplies-compound-action-pattern.md` — **CRITICAL: The full compound-action pattern for Buy Supplies** (move → poll → trade with direction). Session: 2026-08-15. Core commit `8516e23`.
- `references/eat-action-v2-requires-itemid.md` — **CRITICAL: Midnight City v2.0 `eat` action now requires `itemId` (food item from inventory).** Silent 200 OK failure without it. Food selector UI, auto-restock fix, submitAction payload change. Session: 2026-08-15. Core commit `ad37319`.

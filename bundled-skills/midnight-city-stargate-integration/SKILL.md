---
name: midnight-city-stargate-integration
description: Midnight City Stargate mining, auth, and API quirks.
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

### Position Detection is UNRELIABLE

The API's `position.spaceId` is a **coarse zone label**, not a sub-area. The agent can be visually at "MINER-CENTRAL" while the API returns `spaceId: "central"`. Position-based arrival checks **never match**.

**Correct approach — skip position checks:**

```ts
const run = async () => {
  const targetAreaId = /* discover from areas list */;
  
  // Step 1: Send move_to (best effort)
  await submitAction({ kind: "move_to", destination: { areaId: targetAreaId } });
  await new Promise((r) => setTimeout(r, 10000)); // wait for server
  
  // Step 2: Mining loop — perform_job and let server decide
  let lastJobTime = 0;
  while (!autoWorkCancelledRef.current) {
    await refreshState();
    const activeKind = agentStateRef.current?.activeAction?.kind;
    
    // Already mining — wait for completion
    if (activeKind === "perform_job" || activeKind === "engage") {
      await new Promise((r) => setTimeout(r, 30000));
      continue;
    }
    
    // Rate-limit to prevent spam
    const now = Date.now();
    if (now - lastJobTime < 15000) {
      await new Promise((r) => setTimeout(r, lastJobTime + 15000 - now));
      continue;
    }
    lastJobTime = now;
    
    await submitAction({ kind: "perform_job", activity: "mine ore", durationMs: 5000 });
    await new Promise((r) => setTimeout(r, 15000));
  }
};
```

**Pitfall:** Never trust `position.spaceId` for sub-area matching. Trust action outcomes (`activeAction.kind`) instead.

### Manual "Mine Ore" Button

Same pattern: send `move_to`, wait 10s, then `perform_job`. No position polling.

```ts
const target = findHarvestArea("mine") || "mines-worksite";
await submitAction({ kind: "move_to", destination: { areaId: target } });
await new Promise((r) => setTimeout(r, 10000)); // wait for server
await submitAction({ kind: "perform_job", activity: "mine ore", durationMs: 5000 });
```

---

## 4. Rate-Limiting in Mining Loop

Without position checks, the loop can't tell if it's already at the mine. Use `activeAction.kind` plus a `lastJobTime` timestamp to prevent spamming `perform_job`.

```ts
let lastJobTime = 0;
while (!autoWorkCancelledRef.current) {
  await refreshState();
  const activeKind = agentStateRef.current?.activeAction?.kind;
  
  // Already mining — wait for completion
  if (activeKind === "perform_job" || activeKind === "engage") {
    await new Promise((r) => setTimeout(r, 30000));
    continue;
  }
  
  // Rate-limit: minimum 15 seconds between perform_job submissions
  const now = Date.now();
  if (now - lastJobTime < 15000) {
    await new Promise((r) => setTimeout(r, lastJobTime + 15000 - now));
    continue;
  }
  lastJobTime = now;
  
  await submitAction({ kind: "perform_job", activity: "mine ore", durationMs: 5000 });
  await new Promise((r) => setTimeout(r, 15000));
}
```

**Why:** The old loop waited only 5s after `perform_job`, then checked `active=null` and submitted again. Server hadn't registered the job yet → spam. The 15s minimum + 15s post-submit wait gives the server time to process.

---

## 5. Background Service API Call Wrapper

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

## 4. IPC Handler Static Imports

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

## 5. Inter-Agent Auto-Reply

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

## Build & Restart

Any main-process change requires **full quit and restart**:

```bash
npm run typecheck
npm run build
node esbuild.config.js
# Ctrl+Q in app, then: npm start
```

Renderer reload (`Ctrl+R`) is insufficient for main-process changes.

---

## Verification Steps

1. Connect → `SUCCESS Connected — Token ...`
2. Auto-Work ON → expected log flow:
   - `Auto-work: sending move_to`
   - `Auto-work: move_to sent, waiting 10s`
   - `Auto-work: entering mining loop`
   - `Auto-work: performing job mine ore`
   - `Auto-work: job submitted, waiting 15s`
   - `Auto-work: already mining, waiting 30s` (when active)
3. Connection alive > 45s (no 404 heartbeat kills)
4. Manual Mine Ore button works (sequential flow, no position check)
5. No `"failed to arrive at mines"` errors

## References

- `references/connectedref-sync.md` — connectedRef sync pitfall and fix
- `references/api-field-behavior.md` — why `position.spaceId` is coarse-grained
- `references/api-endpoints.md` — full Midnight City observer API endpoint reference with auth requirements, action kinds, and outcome model
- `references/auto-reply-pattern.md` — auto-reply IPC handler + renderer loop + LLM prompt pattern
- `references/auto-reply-cascade-guard.md` — **STABLE auto-reply loop with all guards** (unreadCount undefined, in-flight lock, one-thread-per-iteration, timestamp cooldown, threadsRef)

---
name: midnight-city-stargate-fixes
description: Fix Midnight City connection flapping and auto-work loops.
trigger: midnight city stargate connection auto-work mining
---

# Midnight City Stargate Integration Fixes

## Problem Summary
The Midnight City Command Panel in Stargate had three cascading failures that prevented agents from mining ore:

1. **Fake heartbeat endpoint** killed the connection every ~45s
2. **Position detection mismatch** — agent at `"MINER-CENTRAL"` was never recognized
3. **Auto-work useEffect restarted** every time `connected` state flapped

## Files Changed

| File | Role |
|------|------|
| `electron/services/MidnightCityBackgroundService.ts` | Main-process background service |
| `src/components/stargate/MidnightCityCommandPanel.tsx` | Renderer UI + auto-work logic |
| `electron/main.ts` | IPC handler wiring (static imports) |

---

## Fix 1: Real Keep-Alive Heartbeat

**Before (broken):**
```ts
// This endpoint DOES NOT EXIST in the Midnight City API → always 404
fetch(`${MIDNIGHT_BASE}/api/local-control/session/heartbeat`, ...)
```

**After (fixed):**
```ts
// Use a real API call that both validates the lease AND refreshes state
fetch(`${MIDNIGHT_BASE}/api/skill/agents/${agentId}/context`, {
  method: "GET",
  headers: { Authorization: `Bearer ${leaseToken}` },
})
```

**Key points:**
- Midnight City has **no `/session/heartbeat` endpoint**
- `GET /api/skill/agents/{id}/context` is a lightweight call that validates the token
- Tolerate **3 consecutive failures** before declaring the session dead (`heartbeatFailures` counter)

---

## Fix 2: Position Detection for `"MINER-CENTRAL"`

**Before (broken):**
```ts
const isAtMines = spaceId.includes("mines") || spaceId.includes("worksite");
// "miner-central" → false → infinite move_to loop
```

**After (fixed):**
```ts
const isAtMines =
  spaceId.includes("mines") ||
  spaceId.includes("worksite") ||
  spaceId.includes("miner") ||
  spaceId.includes("central");
// "miner-central" → true → proceeds to perform_job
```

Apply this pattern in **3 places**:
- Auto-work arrival polling loop
- Auto-work mining loop position check
- Manual "Mine Ore" button arrival check

---

## Fix 3: Auto-Work useEffect Stability

**Before (broken):**
```ts
useEffect(() => {
  if (!autoMine || !connected) return;
  // When heartbeat fails → connected=false → useEffect cleanup → restart
  // → sends another move_to → cascade
}, [autoMine, connected, submitAction, addLog]);
```

**After (fixed):**
```ts
useEffect(() => {
  if (!autoMine) return; // removed `connected` from deps
  if (!connectedRef.current) {
    addLog("warn", "Auto-work: not connected, waiting...");
    return;
  }
  // run sequential async loop...
}, [autoMine, submitAction, addLog, refreshState]);
```

Use `connectedRef` (a `useRef`) for runtime checks instead of React state in dependencies.

---

## Fix 4: Sequential Async Mining Loop (No setInterval)

Replace the old `setInterval` every 1s with a **sequential async loop**:

```ts
const run = async () => {
  // 1. Move to mine (once)
  await submitAction({ kind: "move_to", destination: { areaId: targetAreaId } });

  // 2. Poll for arrival (up to 60s, every 2s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    await refreshState();
    if (spaceId.includes("mines") || spaceId.includes("miner")) {
      arrived = true; break;
    }
  }
  if (!arrived) { /* stop */ return; }

  // 3. Mining loop — perform_job every cycle
  while (!autoWorkCancelledRef.current) {
    await refreshState();
    if (activeKind === "perform_job") {
      await new Promise((r) => setTimeout(r, 30000)); // already mining
      continue;
    }
    await submitAction({ kind: "perform_job", activity: "mine ore", durationMs: 5000 });
    await new Promise((r) => setTimeout(r, 5000));
  }
};
```

This eliminates race conditions where multiple ticks fire simultaneously.

---

## Fix 5: IPC Handler Static Imports

**Before (broken at runtime):**
```ts
// Inside IPC handler — esbuild bundles to single file, relative path missing
const { getCredentials } = require("./integrations/midnight-city");
```

**After (fixed):**
```ts
// Top of file — bundled correctly
import { getCredentials, getApiKey, getConfigPublic, setCredentials, clearCredentials } from "./integrations/midnight-city";
```

---

## Verification Steps

1. Connect to Son of Anton → `SUCCESS Connected — Token ...`
2. Click **Auto-Work → ON**
3. Expected log flow:
   - `Auto-work: starting sequential loop`
   - `Auto-work: target mines-worksite | activity: mine ore`
   - `Auto-work: sending move_to`
   - `Auto-work: arrived at miner-central` ← position match works
   - `Auto-work: performing job mine ore`
   - Repeats with `already mining, waiting 30s` when active

4. Connection should stay alive > 45 seconds (no 404 heartbeat kills)
5. Manual **Mine Ore** button should also work with arrival polling

---

## Build Required
- `npm run typecheck`
- `npm run build`
- `node esbuild.config.js`
- Full app restart (`Ctrl+Q` then `npm start`)

## Dependencies
- `window.electronAPI.midnightCity.*` IPC bridge (preload)
- `fetch` available in Electron main process (Node 18+)
- Midnight City observer API at `https://midnight.city/observer`

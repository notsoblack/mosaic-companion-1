---
name: electron-background-service-auth
description: Manage authenticated external API sessions from an Electron main-process background service. Covers lease-token vs API-key auth, silent connect failures, required payload fields, URL base mismatches, and transparent auto-reconnect on 401.
metadata:
  tags:
    - electron
    - auth
    - api
    - session
    - background-service
---

# Electron Background Service Auth Patterns

Use this skill when an Electron app uses a **main-process background service** to manage authenticated sessions with an external API — especially game/agent control APIs that use temporary lease tokens alongside permanent API keys.

## Architecture Pattern

```
Renderer (React)
  → IPC via preload.ts
    → Main Process (ipcMain.handle)
      → BackgroundService class
        → fetch() → External API
```

The background service holds the actual auth state (lease token, session ID). The renderer only holds UI state. This survives tab switches and panel unmounts.

## Auth Models

| Model | Use For | Lifetime |
|-------|---------|----------|
| **Permanent API key** | Read-only endpoints (context, inventory, threads, merchants) | Until revoked |
| **Temporary lease token** | Mutating endpoints (actions, local-control session) | Minutes to hours |

Both tokens are typically `Bearer` tokens in the `Authorization` header. Some endpoints additionally require `X-Lease-Token`.

## Session Establishment — Common Pitfalls

### 1. Missing Required Payload Fields

**Symptom:** Connect appears to succeed (`res.ok` is true), but `sessionId` or `token` is missing. All subsequent calls 401.

**Fix:** Inspect the API docs for required body fields. Some session claim endpoints require `mode: "browser_local"` or similar.

```js
// WRONG — server may reject silently
body: JSON.stringify({ agentId, clientInstanceId })

// RIGHT — include required mode field
body: JSON.stringify({
  agentId,
  clientInstanceId: `app-${Date.now()}`,
  modelId: "default",
  mode: "browser_local",   // ← required by some servers
})
```

### 2. Token Field Name Variations

**Symptom:** Session claim returns 200 but code can't find the token.

**Fix:** Handle both `token` and `leaseToken` (and sometimes `sessionToken`).

```js
const token = data.token || data.leaseToken || data.sessionToken;
if (!token) throw new Error("No token in response");
```

### 3. URL Base Mismatch with External Scripts

**Symptom:** App config stores `https://api.example.com/v1`, but an external script spawned by the app hardcodes `v1` internally. Result: `https://api.example.com/v1/v1/...` → 404.

**Fix:** Before injecting a base URL into an external script's environment, strip the path the script already prepends.

```js
// App config
const apiBase = "https://midnight.city/observer";  // used for REST calls

// Script already prepends "/observer" to all paths
// So inject the stripped base:
const envBase = apiBase.replace(/\/observer\/?$/, "");
// → "https://midnight.city"
```

## Auto-Reconnect on 401

**Symptom:** Lease expires mid-session. Every action button click returns 401. Logs show infinite retry loops.

**Fix:** In the generic `apiCall` method, detect 401 on lease endpoints, reconnect once, and retry transparently.

```js
async apiCall(params) {
  const res = await fetch(url, { headers, body });
  if (!res.ok && res.status === 401 && isLeaseEndpoint && this.state.agentId) {
    // Reconnect once
    const reconnect = await this.connect(this.state.agentId);
    if (reconnect.success) {
      // Retry with fresh lease token
      const retryRes = await fetch(url, { headers: freshHeaders, body });
      if (!retryRes.ok) return { error: ... };
      return { error: null, data: retryData };
    }
  }
  // ... normal handling
}
```

**Critical:** Only retry once. Do not create infinite reconnect loops.

## Debugging Checklist

When **all action buttons return 401**:

1. **Connection state** — Did `connect()` actually return a token? Log `sessionId`, `leaseToken`, and `connected` immediately after connect.
2. **Payload fields** — Does the session claim body include all required fields? Compare against API docs or a working CLI tool.
3. **Token field name** — Is the response field named `token`, `leaseToken`, or `sessionToken`?
4. **Auth header selection** — Is the action endpoint using the lease token or the permanent API key? Lease endpoints must use the temporary token.
5. **URL construction** — Are external scripts double-prefixing paths?

### 4. `agentId` Body Field vs `X-Lease-Token` Header Contradiction

**Symptom:** Actions return either `400 agent_id_required` or `403 Forbidden`, depending on whether `agentId` is included in the POST body.

**Root cause:** Some Midnight City endpoints expect `agentId` in the body for routing, while others that authenticate via `X-Lease-Token` treat a body `agentId` as a security mismatch (the lease already identifies the agent).

**Current behavior in Mosaic Companion:** The renderer's `submitAction` helper unconditionally injects `agentId` into every action payload:

```typescript
const payload = { ...action, agentId };
await apiCall("/api/actions", "POST", payload);
```

The background service then sends this payload with both:
- `Authorization: Bearer <leaseToken>`
- `X-Lease-Token: <leaseToken>`

If the backend rejects requests that carry both the lease token header AND an `agentId` body field, this is a live wiring gap. The fix would be to conditionally strip `agentId` from the body when `X-Lease-Token` is present, or to get backend clarification on which pattern is canonical.

**See:** `references/midnight-city-action-button-auth-contradiction.md` for the full trace and exact line numbers.

### 5. Per-Action IPC Handlers vs Generic Proxy

**Symptom:** You're looking for `midnight:sell`, `midnight:eat`, `midnight:mine`, etc. in `electron/main.ts` and finding nothing.

**Reality:** The Midnight City panel uses a **single generic IPC handler** (`midnight:apiCall`) for ALL action dispatch. There are no per-action IPC channels. The renderer's `submitAction` helper constructs the payload and passes it through the generic proxy.

```typescript
// Renderer
submitAction({ kind: "trade", merchantName: "...", itemId: "ore", quantity: 5 });
//   → apiCall("/api/actions", "POST", { kind: "trade", ..., agentId })
//     → window.electronAPI.midnightCity.call({ endpoint: "/api/actions", method: "POST", body: payload })
//       → ipcRenderer.invoke("midnight:apiCall", params)
//         → Main Process: ipcMain.handle("midnight:apiCall", ...)
//           → midnightCityService.apiCall(params)
//             → fetch("https://midnight.city/observer/api/actions", ...)
```

This is correct behavior — don't add per-action IPC handlers unless the backend explicitly requires separate channels.

### 7. Heartbeat Using Wrong Endpoint + Wrong Token

**Symptom:** Session drops after ~5 minutes with `Heartbeat failed: 404`, then all subsequent calls return `Not connected`.

**Root cause:** The background service heartbeat was using `GET /api/skill/agents/{id}/context` instead of the dedicated `POST /api/local-control/session/heartbeat`. Additionally, it sent the permanent `apiToken` instead of the temporary `leaseToken` in the Authorization header. Both errors caused immediate disconnect.

**Fix:** Use the dedicated heartbeat endpoint with the lease token, and add one retry on transient 404.

```typescript
private async doHeartbeat() {
  if (!this.state.connected || !this.state.leaseToken) return;
  try {
    const res = await fetch(`${MIDNIGHT_BASE}/api/local-control/session/heartbeat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.state.leaseToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: this.state.leaseToken }),
    });
    if (res.ok) { this.state.lastHeartbeat = Date.now(); return; }
    // Retry once on transient 404
    if (res.status === 404) {
      await new Promise((r) => setTimeout(r, 2000));
      const retryRes = await fetch(/* same request */);
      if (retryRes.ok) { this.state.lastHeartbeat = Date.now(); return; }
    }
    throw new Error(`Heartbeat failed: ${res.status}`);
  } catch (err) {
    this.state.connected = false;
    this.scheduleReconnect();
  }
}
```

**See:** `references/session-2026-08-07-heartbeat-position-engage.md`

### 8. Stale Position During Arrival Polling

**Symptom:** After `move_to` submits successfully, the dashboard logs `pos=central` forever and the agent never starts mining.

**Root cause:** Arrival-poll loops checked `agentStateRef.current.position` but `agentStateRef` only updates when `refreshState()` runs. No refresh was called during the poll, so the ref held stale pre-move data.

**Fix:** Call `await refreshState()` inside every arrival-poll loop iteration before checking position.

```typescript
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  await refreshState();  // CRITICAL: get fresh position before checking
  const pos = agentStateRef.current?.position;
  if ((pos?.spaceId || "").toLowerCase().includes("mines")) {
    break;
  }
}
```

**See:** `references/session-2026-08-07-heartbeat-position-engage.md`

### 9. Action Kind Confusion: `engage` vs `perform_job`

**Symptom:** Action submits successfully (`SUCCESS`), but no ore is produced and the button re-submits every 30s.

**Root cause:** In some game APIs (Midnight City), `engage` is a social/chat action that finishes instantly without producing resources. The working work command is `perform_job` with a short `durationMs`.

**Fix:** Use `perform_job` for resource-producing activities. Guard with `activeKind === "perform_job"` instead of `"engage"`.

```typescript
// WRONG — no ore produced
await submitAction({ kind: "engage", activity: "mine ore", durationMs: 600000 });

// RIGHT — produces ore
await submitAction({ kind: "perform_job", activity: "mine ore", durationMs: 5000 });
```

**See:** `references/session-2026-08-07-heartbeat-position-engage.md`

### 10. Stale Lock File Blocking Miner Restart

**Symptom:** Clicking "Restart Miner" returns success with a new PID, but the miner process immediately exits with a singleton lock error.

**Root cause:** A previous miner instance died without cleaning up its `.sonofanton.lock` file. The new instance acquires the PID-based lock but the file-based `flock` blocks it.

**Fix:** The restart handler must remove stale lock files before spawning:

```typescript
const lockFile = path.join(os.homedir(), ".midnight-daemon", ".sonofanton.lock");
if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
```

**See:** `references/session-2026-08-07-heartbeat-position-engage.md`

### 6. Stale Token After UI Credential Save

**Symptom:** User saves a new API key in the Config UI, clicks Connect, and gets 401. Restarting the app fixes it.

**Root cause:** The background service cached the API token in its constructor. When the renderer saved new credentials to disk, the service still held the old (possibly empty) token.

**Fix:** Re-read the token from disk at the start of `connect()`, not at construction time.

```js
async connect(agentId) {
  this.apiToken = getApiKey();   // ← fresh read, not cached
  // ... proceed with session claim
}
```

**General rule:** Never cache credentials at construction time in a long-lived background service. Re-read from the authoritative store at the point of use, or subscribe to change notifications from the credential layer.

**See:** `references/stale-token-after-ui-save.md` for full trace and fix.

## References

- See `references/midnight-city-session-quirks.md` for provider-specific details discovered while integrating Midnight City into Mosaic Companion.
- See `references/midnight-city-action-button-auth-contradiction.md` for the `agentId` body field vs `X-Lease-Token` header contradiction discovered while tracing Midnight City action button flows.
- See `references/safestorage-early-decrypt-fix.md` for the `app.isReady()` guard needed when safeStorage is called during module initialization.
- See `references/stale-token-after-ui-save.md` for the cached-token pitfall that causes 401 after UI credential saves.
- See `references/agent-to-agent-messaging-fix.md` for the IPC router pattern that lets local agents respond to external game speak actions.
- See `references/action-button-payload-normalization.md` for mapping React state field names to API field names.
- See `references/spawn-script-missing-env-vars.md` for the silent 401 when spawning external scripts without injected env vars.
- See `references/auto-work-loop-cooldown.md` for the auto-work loop spamming fix (move cooldown + dynamic area discovery).

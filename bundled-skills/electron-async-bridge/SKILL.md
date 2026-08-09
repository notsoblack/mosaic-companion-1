---
description: 'Electron IPC: stub handlers first, real impl after async.'
name: electron-async-bridge
trigger: 'Electron IPC handler races, async init before IPC ready, renderer calls main before setup complete'
---

# Electron Async Bridge — Two-Phase IPC Pattern

## Problem

Electron's `ipcMain.handle()` registers synchronously, but the real implementation often depends on async setup (DB, network, config). If the renderer calls the handler before async init completes, you get:

```
Error: No handler registered for channel 'agent:send'
```

Or worse: the handler exists but returns `null` / generic error, hiding the real problem.

## Solution: Two-Phase Registration

### Phase 1 — Immediate Stubs

Register handlers at the **top** of `init()` — before any async work. Stubs return a friendly "still starting" message.

```typescript
let _agentSendImpl: ((text: string) => Promise<any>) | null = null;

ipcMain.handle("agent:send", async (_e, text: string) => {
  if (!_agentSendImpl) {
    return { type: "error", text: "⏳ Still initializing, please wait..." };
  }
  return _agentSendImpl(text);
});
```

### Phase 2 — Reassign After Async Init

After async setup completes, assign the real implementation. The same handler delegate now calls the enriched version.

```typescript
_agentSendImpl = async (text: string) => {
  // Real implementation: skills + memory + LLM call
  const reply = await callActiveLLM(text);
  return { type: "reply", text: reply };
};
```

### Why This Works

| Timing | Handler Exists? | Returns |
|---|---|---|
| Before init | ✅ Yes | "Still initializing" |
| During init | ✅ Yes | "Still initializing" |
| After init | ✅ Yes | Real reply |

No race condition. Renderer never sees "No handler registered".

---

## Error Propagation: Don't Swallow Errors

### Anti-Pattern (Don't Do This)

```typescript
async function callLLM(prompt: string): Promise<string | null> {
  try {
    return await provider.call(prompt);
  } catch (e) {
    console.error(e);
    return null;  // ← Hides the real error!
  }
}
```

Caller sees `"No active agent configured"` when the real error was `"model retired"`.

### Correct Pattern

```typescript
async function callLLM(prompt: string): Promise<string> {
  const result = await provider.call(prompt);
  return result;  // Let errors propagate
}

// In the handler:
try {
  const reply = await callLLM(text);
  return { type: "reply", text: reply };
} catch (e: any) {
  // Specific error detection
  if (e.message?.includes("was retired")) {
    return { type: "error", text: "Model retired. Update in Settings." };
  }
  if (e.status === 403) {
    return { type: "error", text: "API access denied (403)." };
  }
  return { type: "error", text: `LLM error: ${e.message}` };
}
```

### Rule

**The async bridge should re-throw.** The IPC handler should catch and classify. This preserves error context all the way to the user.

---

## Data Sanitization for Visualization

When visualizing user data (Vault entries, logs, etc.), always sanitize:

```typescript
// Dates: sanity-check year range
const year = new Date(ts).getFullYear();
if (year < 2000 || year > 2035) {
  // Corrupted timestamp — use fallback
  ts = Date.now() - Math.random() * 12 * 7 * 24 * 60 * 60 * 1000;
}

// Arrays: filter null/undefined
const safeEntries = (entries || [])
  .filter(e => !!e && typeof e === "object")
  .filter(e => !!e.id && !!e.label);
```

Common corruption sources:
- Skill imports with bad timestamps
- Manual JSON edits
- Migration scripts that didn't validate

---

## Live Data Integration

When a visualization shows historical data + live system state:

1. **Historical layer**: Load from Vault/files on mount
2. **Live layer**: Query live APIs in the same `useEffect`
3. **Visual distinction**: Different colors/shapes for live vs historical
4. **Merge in layout**: Pass both datasets to the layout engine

```typescript
const [entries, setEntries] = useState([]);      // Historical
const [liveMCPs, setLiveMCPs] = useState([]);    // Live

useEffect(() => {
  // Parallel load
  const [vaultData, mcpData] = await Promise.all([
    vaultApi.getBoxes(),
    (window as any).mcpAPI?.listServers?.() || [],
  ]);
  setEntries(vaultData);
  setLiveMCPs(mcpData);
}, []);

// Layout receives both
const { nodes } = computeLayout(entries, agents, liveMCPs, width, height);
```

---

## Verification Checklist

- [ ] IPC handlers registered before first `await`
- [ ] Stub returns actionable message, not generic error
- [ ] Real implementation assigned after async init
- [ ] Errors re-thrown from bridge, caught in handler
- [ ] Specific error messages guide user to fix
- [ ] Data sanity-checked before visualization
- [ ] Live data visually distinct from historical

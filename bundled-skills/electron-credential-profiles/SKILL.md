---
name: electron-credential-profiles
description: |
  Multi-profile credential management in Electron + React apps.
  Covers safeStorage encryption, version-migrated JSON config, IPC CRUD
  handlers, React stale-state clearing on entity switch, and test-before-save UX.
tags:
  - electron
  - react
  - credentials
  - safeStorage
  - multi-profile
---

# Electron Credential Profiles

## When to use this skill

Your Electron app needs to let users manage **multiple named profiles** (agents, accounts, wallets, API keys), each with its own credentials, while sharing a global API key or endpoint. You want:

- Encrypted-at-rest storage (OS keychain via `safeStorage`)
- Per-profile and global credential fields
- No stale UI data when switching active profiles
- Validation before saving (test connection / lightweight API probe)

## Architecture

### Storage schema (JSON file in `app.getPath("userData")`)

```json
{
  "version": 2,
  "apiKeyEncrypted": "enc:...",
  "apiBase": "https://api.example.com",
  "activeProfileId": "profile-abc",
  "profiles": [
    {
      "id": "profile-abc",
      "name": "Production",
      "agentId": "agent-123",
      "profession": "miner",
      "apiKeyEncrypted": "enc:..."
    }
  ]
}
```

- **Global fields** (`apiKeyEncrypted`, `apiBase`) are shared defaults.
- **Per-profile `apiKeyEncrypted`** is optional; if present it overrides the global key.
- **Version field** enables forward migrations from legacy single-record configs.

### Encryption helpers (main process only)

```typescript
import { safeStorage } from "electron";

function encryptIfPossible(plain: string): string {
  if (!plain) return "";
  if (safeStorage.isEncryptionAvailable()) {
    return "enc:" + safeStorage.encryptString(plain).toString("base64");
  }
  return "plain:" + plain;
}

function decryptIfPossible(cipher: string): string {
  if (!cipher) return "";
  if (cipher.startsWith("enc:")) {
    try {
      const blob = Buffer.from(cipher.slice(4), "base64");
      return safeStorage.decryptString(blob);
    } catch {
      return "";
    }
  }
  if (cipher.startsWith("plain:")) return cipher.slice(6);
  return cipher; // legacy un-prefixed
}
```

### Active credential resolution

Resolve credentials by preferring the per-profile key, falling back to global:

```typescript
export function getActiveCredentials(): { agentId: string; apiKey: string } | null {
  const profile = getActiveProfile();
  if (!profile) return null;
  let apiKey = profile.apiKeyEncrypted ? decryptIfPossible(profile.apiKeyEncrypted) : "";
  if (!apiKey) apiKey = decryptIfPossible(globalApiKey);
  if (!apiKey) return null;
  return { agentId: profile.agentId, apiKey };
}
```

**In-memory-only variant** (when the user forbids disk storage of API keys):

```typescript
/** In-memory API key — never persisted to disk. */
let _inMemoryApiKey: string = "";

export function getApiKey(): string {
  if (!_inMemoryApiKey) return "";
  return decryptIfPossible(_inMemoryApiKey);
}

export function setApiKey(apiKey: string): void {
  _inMemoryApiKey = apiKey ? encryptIfPossible(apiKey) : "";
  // Deliberately do NOT write to disk — user requested NO persistent API key storage.
}
```

Use this when:
- User explicitly says "my credentials should not be stored anywhere"
- Regulatory requirement forbids at-rest API key storage
- The app is on a shared/multi-user machine

**Trade-off**: The user must re-enter the API key after every app restart. The Config tab input field becomes a pass-through, not a save dialog.

## React UI patterns

### 1. Clear derived state on profile switch

When `activeProfileId` changes, **immediately clear all cached dependent state** so the UI never shows the previous entity's data.

```typescript
const activateProfile = useCallback(async (id: string) => {
  await window.electronAPI.setActiveProfile(id);
  setActiveProfileId(id);
  // CRITICAL: clear stale cached state
  setAgentState(null);
  setInventory(null);
  setNearbyAgents([]);
  setDiscoveredAreas([]);
  // ...any other derived state
}, []);
```

**Why:** React state persists across profile switches. If API calls for the new profile fail or are slow, the UI will render stale data from the previous profile unless cleared.

### 2. Test-before-save UX

Always provide a **Test Connection** button next to the identifier field (agent ID, wallet address, etc.). Validate with a lightweight `GET` before persisting.

```typescript
const testConnection = useCallback(async () => {
  setTesting(true);
  try {
    const result = await window.electronAPI.call({
      endpoint: `/api/agents/${encodeURIComponent(agentId)}`,
      method: "GET",
    });
    if (result.error) throw new Error(result.error);
    setTestResult({ success: true, message: "Agent found" });
  } catch (err: any) {
    setTestResult({ success: false, message: err.message });
  } finally {
    setTesting(false);
  }
}, [agentId]);
```

Show inline result:
- ✅ Green — safe to save
- ❌ Red — fix the ID/URL/key before saving

### 3. Warn when global key is missing

If the user tries to add a profile but no global API key is saved, show a banner:

```jsx
{!globalApiKey && (
  <div className="bg-red-900/20 border border-red-700 rounded p-2 text-xs text-red-400">
    ⚠️ No global API key saved. Add one above, or enter a per-profile key below.
  </div>
)}
```

### 4. Show active entity in detail views

Add a persistent header in any tab that displays entity-specific data:

```jsx
{activeProfileId && (
  <div className="text-xs text-cyan-400">
    Viewing: {profiles.find(p => p.id === activeProfileId)?.name}
  </div>
)}
```

## IPC handler pattern

Register granular handlers instead of one monolithic `setConfig`:

| Channel | Payload | Action |
|---------|---------|--------|
| `setApiKey` | `apiKey: string` | Encrypt and save global key |
| `setApiBase` | `apiBase: string` | Save endpoint URL |
| `addProfile` | `{ name, agentId, profession, apiKey? }` | Push new profile, auto-activate if first |
| `updateProfile` | `{ id, updates }` | Patch fields |
| `removeProfile` | `profileId: string` | Filter array, fall back active to first remaining |
| `setActiveProfile` | `profileId: string` | Set `activeProfileId` |
| `getConfig` | — | Return public config (no decrypted keys) |

## Build verification

After changing **main process** code (IPC handlers, storage module):

```bash
# Rebuilds dist/main/main.js
node esbuild.config.js

# Rebuilds renderer bundle
npm run build
```

**Both must be run.** `npm run build` alone only refreshes the React frontend.

## Pitfalls

1. **Forgetting to clear state on switch** — users see wrong entity's data, leading to dangerous misidentification.
2. **Storing plaintext keys** — always encrypt with `safeStorage`; never write raw tokens to JSON.
3. **Using `defaultValue` without `onChange`** — inputs appear filled but don't actually save. Use controlled components.
4. **Single `setConfig` handler** — forces the UI to send the entire config object on every tiny change. Use granular IPC channels.
6. **Stale encrypted key on disk after "deletion"** — If you switch from disk-persisted to in-memory-only, old encrypted keys may still exist in `~/.config/<app>/config.json`. The next session reads them via `getActiveCredentials()`, making Connect work even though the user thinks credentials are gone. **Fix**: Explicitly delete the JSON file or overwrite it with empty values during migration.

## References

- `references/midnight-city-multi-profile.md` — session-specific implementation of v1→v2 migration, IPC handler code, and React component snippets from the Mosaic Companion project.
- `references/env-var-injection-from-credentials.md` — How `restartDaemon` IPC handler reads credentials and injects them as env vars into spawned external scripts.
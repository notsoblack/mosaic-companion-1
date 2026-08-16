---
name: mosaic-vault-knowledge-injection
title: Mosaic Vault Knowledge Injection
description: |
  Programmatically create Vault boxes and inject structured knowledge into
  Mosaic Companion's Vault system so agents can access it via boxAccess.
  Covers working tree analysis, pre-commit cleanup, commit splitting,
  secret scanning, pushing to hypercycle remote, vault box creation,
  entry structuring, and agent access grants.
triggers:
  - create vault box for agents
  - inject knowledge into mosaic vault
  - add team documentation to vault
  - make knowledge accessible to mosaic agents
  - create vault entry for stargate components
  - programmatic vault box creation
  - vault knowledge sharing
---

# Mosaic Vault Knowledge Injection

## When to Use

When you need to share knowledge, documentation, or integration guides with
Mosaic Companion AI agents through the Vault system. Agents read vault box
contents when their `boxAccess` array includes the box ID.

## Architecture

```
~/.config/mosaic-companion/
├── vault.json                    # Box registry (name, id, description)
└── vault-content/
    └── box-<id>.json            # Entries array per box
```

The renderer injects vault box contents into agent system prompts under
`## Vault Knowledge`.

## Step-by-Step Workflow

### 1. Analyze Working Tree

Before committing anything, understand what changed:

```bash
cd /path/to/mosaic-companion

# Commits ahead of upstream
git log --oneline origin/stargate-module..HEAD

# Modified tracked files
git diff --name-status origin/stargate-module..HEAD | grep "^ M"

# New untracked files
git status --short | grep "^??"

# Untracked by category
git status --short | grep "^??" | awk '{print $2}' | sort | awk -F'/' '{print $1}' | sort | uniq -c | sort -rn
```

### 2. Pre-Commit Cleanup

#### A. Scan for Secrets

```bash
grep -rnE "ghp_[a-zA-Z0-9]{36}" --include="*" . | grep -v "node_modules/" | grep -v ".git/"
```

Also check for: `sk-`, `pk-`, `api_key`, `API_KEY`, `SECRET`, `private_key`,
`0x[a-fA-F0-9]{64}` in `.ts`, `.tsx`, `.js`, `.json`, `.md` files.

#### B. Exclude Runtime Data

Update `.gitignore` to exclude directories that should never be committed:

```
# Runtime data directories
.codebase-memory/
memory/
kanban-boards/
video-editor-agent/output/
```

Verify with: `git status --short | grep "^??" | wc -l` — count should drop.

#### C. Check for .env Files

```bash
find . -maxdepth 3 -name ".env*" -not -path "*/node_modules/*" -not -path "*/.git/*"
```

### 3. Commit Strategy

Split into **two logical commits** for clean history:

**Commit 1 — Modified tracked files:**
```bash
git add -u
git commit -m "fix(stargate-module): integrate X, Y, Z into existing codebase

Updates to tracked files to support:
- Feature A
- Feature B"
```

**Commit 2 — All new components:**
```bash
git add .
git commit -m "feat(stargate-module): new components — X, Y, Z

New features:
- Feature A
- Feature B"
```

### 4. Push to hypercycle Remote

```bash
# Verify remote exists
git remote -v

# Dry-run first
git push --dry-run hypercycle stargate-module

# Push
git push hypercycle stargate-module
```

The remote name is `hypercycle` (not `hypercycle-development`), pointing to
`github.com:hypercycle-development/mosaic-companion.git`.

### 5. Create Vault Box Programmatically

Write a standalone Node.js script that manipulates the vault files directly:

```javascript
const fs = require("fs");
const path = require("path");
const os = require("os");

const userDataPath = path.join(os.homedir(), ".config", "mosaic-companion");
const vaultPath = path.join(userDataPath, "vault.json");
const vaultContentDir = path.join(userDataPath, "vault-content");

function loadVault() {
  try {
    if (fs.existsSync(vaultPath)) return JSON.parse(fs.readFileSync(vaultPath, "utf8"));
  } catch { /* ignore */ }
  return { boxes: [] };
}

function saveVault(config) {
  fs.mkdirSync(path.dirname(vaultPath), { recursive: true });
  fs.writeFileSync(vaultPath, JSON.stringify(config, null, 2), "utf8");
}

function saveBoxContent(content) {
  fs.mkdirSync(vaultContentDir, { recursive: true });
  fs.writeFileSync(
    path.join(vaultContentDir, content.boxId + ".json"),
    JSON.stringify(content, null, 2),
    "utf8"
  );
}

const BOX_NAME = "Your Box Name";
const vault = loadVault();

// Prevent duplicates
if (vault.boxes.find(b => b.name === BOX_NAME)) {
  console.log("Box already exists");
  process.exit(0);
}

const now = Date.now();
const boxId = `box-your-prefix-${now}`;

vault.boxes.push({
  id: boxId,
  name: BOX_NAME,
  description: "...",
  sourceType: "manual",
  createdAt: now,
  updatedAt: now,
});
saveVault(vault);

const entries = [
  {
    id: `entry-${now}-0`,
    label: "Section Title",
    content: "# Markdown content here...",
    createdAt: now,
    updatedAt: now,
  },
];

saveBoxContent({ boxId, entries });
console.log(`Created box ${boxId} with ${entries.length} entries`);
```

Run with: `node scripts/your-script.js`

### 6. Structure Knowledge Entries

Each entry should be a self-contained markdown document with:

- **H1 title** — clear topic
- **Files section** — list relevant source files
- **Tables** — comparisons, matrices, scoring rubrics
- **Architecture Patterns** — numbered list of key design decisions
- **Quick Links** — direct file paths for navigation

Example entry labels:
- `Integration Overview & Key Files`
- `SOUL Identity Layer`
- `AIM Forge (AIM Builder)`
- `Stargate Pool Orchestrator`
- `Mosaic Bot Team`
- `MCP Integrations`
- `Ada Portal Payment Service`
- `Video Editor Agent`
- `Hermes Capability Registry`

### 7. Grant Agent Access

Agents must have the box ID in their `boxAccess` array.

**Via config file** (`~/.config/mosaic-companion/ai-agents.json`):
```json
{
  "id": "your-agent-id",
  "name": "StargateBot",
  "provider": "ollama",
  "model": "llama3.1",
  "boxAccess": [
    "box-your-prefix-1234567890123",
    "box-skills-main"
  ]
}
```

**Via UI:** Settings → AI Agents → Vault Boxes → add box name.

## Addon-Side Vault Access (Runtime Bridge)

When working inside a Mosaic Companion addon (e.g. `addons/stargate/`), the addon does NOT have direct filesystem access to `vault.json`. Instead, it uses `window.addonAPI.vault` which bridges to the host app's Electron main process.

Detection pattern:
```typescript
const vaultApi = (window as any).addonAPI?.vault ?? (window as any).electronAPI?.vault;
if (typeof vaultApi?.getBoxes === "function") {
  // Vault is available — read/write boxes and entries
}
```

For the complete service-class pattern (CRUD, graceful fallback, structured entry schema), see the companion skill `mosaic-companion-addon-development` → `references/vault-addon-runtime-pattern.md`.

## Structured Knowledge Entry Schema

When creating entries for agent consumption, use a structured JSON content field with a `type:name` label:

| Type | Example label | Content shape |
|------|--------------|---------------|
| `api-endpoint` | `api-endpoint:session-connect` | `{ method, endpoint, body, response, errorPatterns }` |
| `button-mapping` | `button-mapping:Mine Ore` | `{ kind, activity, preconditions, flow, notes }` |
| `error-pattern` | `error-pattern:pending-status` | `{ pattern, meaning, recommendedAction }` |
| `skill-rule` | `skill-rule:ALWAYS_CONTEXT_FIRST` | `{ rule, description, enforcement }` |
| `outcome-field` | `outcome-field:delivery` | `{ fieldPath, possibleValues, meaning }` |

Agents parse these entries by splitting the label on `:` and JSON-parsing `content`. This is more durable than free-text markdown because it survives UI refactors and is queryable by code.

**Example:**
```javascript
makeEntry(0, "button-mapping:Mine Ore", [
  JSON.stringify({
    kind: "perform_job",
    activity: "mine ore",
    durationMs: 5000,
    preconditions: ["connected", "at mines or worksite"],
    flow: ["move_to(areaId)", "poll arrival(30x2s)", "perform_job(activity, durationMs)"],
    outcomeField: "outcome.status",
    notes: "Always poll arrival before perform_job",
  })
]),
```

## Pitfalls

1. **tsx fails to install** — The npx tsx installer often hits ENOTEMPTY on
   esbuild. Always use plain `node script.js` instead.

2. **Duplicate box names** — The vault prevents duplicate names. Check existence
   before creating or the script will fail silently.

3. **Token in working tree** — Never commit tokens. Always grep for `ghp_`,
   `sk-`, `pk-` before `git add .`. Use `git add -u` for tracked files first.

4. **Runtime data in commits** — Directories like `.codebase-memory/`,
   `memory/`, `kanban-boards/` contain session data that should be gitignored.

5. **Agent boxAccess not updated** — Creating the box alone does nothing.
   Agents only see vault content if their `boxAccess` array includes the box ID.

6. **Hermes-in-Docker AIM** — When wrapping Hermes inside an AIM container,
   the wrapper must auto-detect `HERMES_SRC` from three possible paths:
   `/container_mount`, `/opt/hermes-agent`, `/hermes`.

## Alternative: Python Script via execute_code

When working inside Hermes, use Python directly instead of Node.js (avoids tsx/npx issues):

```python
import json, os
from datetime import datetime

VAULT_DIR = os.path.expanduser("~/.config/mosaic-companion")
VAULT_FILE = os.path.join(VAULT_DIR, "vault.json")
AGENTS_FILE = os.path.join(VAULT_DIR, "ai-agents.json")
CONTENT_DIR = os.path.join(VAULT_DIR, "vault-content")

os.makedirs(CONTENT_DIR, exist_ok=True)
now = int(datetime.now().timestamp() * 1000)
box_id = f"box-your-prefix-{now}"

# Load vault
with open(VAULT_FILE, 'r') as f:
    vault = json.load(f)

# Check for duplicates
existing = [b for b in vault.get('boxes', []) if b['name'] == "Your Box Name"]
if existing:
    box_id = existing[0]['id']
else:
    vault['boxes'].append({
        "id": box_id, "name": "Your Box Name",
        "description": "...", "sourceType": "manual",
        "createdAt": now, "updatedAt": now
    })
    with open(VAULT_FILE, 'w') as f:
        json.dump(vault, f, indent=2)

# Write entries
entries = [
    {"id": f"entry-{now}-1", "label": "Section 1",
     "content": "# Markdown content...", "createdAt": now, "updatedAt": now}
]
with open(os.path.join(CONTENT_DIR, f"{box_id}.json"), 'w') as f:
    json.dump({"boxId": box_id, "entries": entries}, f, indent=2)

# Grant agent access
with open(AGENTS_FILE, 'r') as f:
    agents = json.load(f)
agents_list = agents if isinstance(agents, list) else agents.get('agents', [])
for a in agents_list:
    if a.get('id') == 'your-agent-id':
        a.setdefault('boxAccess', []).append(box_id)
with open(AGENTS_FILE, 'w') as f:
    json.dump(agents, f, indent=2)
```

## Agent-Control Box Template (Game/Economy Agents)

When documenting a controllable agent (Midnight City, RPG bot, etc.), use this 6-entry structure:

| # | Entry Label | Content Focus |
|---|------------|---------------|
| 1 | **Agent Connection Credentials** | Agent ID, API base, token flow, lease mechanism, quick connect |
| 2 | **API Endpoints Reference** | All endpoints with methods, descriptions, response codes |
| 3 | **Action Payload Templates** | JSON templates for every action (move, mine, eat, trade, sleep) |
| 4 | **MCP Tool Definitions** | Tool schemas, parameters, return types, XML call format |
| 5 | **Operational Workflows** | Step-by-step playbooks (mining cycle, hunger management, buy/sell) |
| 6 | **Needs Monitoring Thresholds** | Critical thresholds table, auto-restock rules, status colors |

**Key insight:** The agent reading this box must know not just WHAT endpoints exist, but HOW to chain them into compound actions (e.g., "move to merchant → wait for arrival → buy food → verify inventory → eat").

## Handling Expected 404 Endpoints

When the server hasn't deployed an endpoint yet (common during v2.0 rollouts):

**Renderer side:**
```typescript
const is404 = msg.includes("404") || msg.includes("Not Found");
if (!is404) {
  addLog("error", `API ${method} ${endpoint} failed`, msg);
}
```

**Background service:**
```typescript
const isWalletEndpoint = params.endpoint.includes("/wallet");
if (!isWalletEndpoint) {
  this.addLog("info", `API call ${params.method} ${params.endpoint}`);
}
```

**Polling separation:**
- Main heartbeat: every 5s (sync state, needs, inventory)
- Wallet/merchant poll: every 30s (separate interval, endpoints may not exist)

## Verification

After running the script:

```bash
# Verify box appears in registry
cat ~/.config/mosaic-companion/vault.json | python3 -m json.tool

# Verify content file exists
ls -la ~/.config/mosaic-companion/vault-content/box-your-prefix-*.json

# Count entries
cat ~/.config/mosaic-companion/vault-content/box-your-prefix-*.json | grep '"label"'

# Verify agent access
python3 -c "import json; d=json.load(open(os.path.expanduser('~/.config/mosaic-companion/ai-agents.json'))); [print(a['name'], a.get('boxAccess',[])) for a in (d if isinstance(d,list) else d.get('agents',[]))]"
```

## Support Files

| File | Purpose |
|------|---------|
| `scripts/vault-box-creation.js` | Standalone script template. Copy, customize BOX_NAME/BOX_DESCRIPTION/entries, run with `node scripts/your-script.js` |
| `references/vault-types.ts` | TypeScript type definitions (VaultBox, VaultEntry, BoxContent, TasteSkillMetadata) extracted from electron/integrations/vault/types.ts |
| `references/agent-control-box-template.md` | Copy-paste template for creating agent-control boxes (game bots, economy agents). 6-entry structure with Python script |
| `references/404-suppression-pattern.md` | How to suppress expected 404 log spam when v2.0 endpoints aren't deployed yet. 4-layer fix with code examples |
| `references/agent-tool-auto-dispatch.md` | When models can't emit `<use_tool>` XML (kimi-k2.6), auto-dispatch detects intent and fetches data before LLM responds |

## References

- `references/vault-box-creation.js` — Standalone script template
- `references/vault-types.ts` — Type definitions from electron/integrations/vault/types.ts

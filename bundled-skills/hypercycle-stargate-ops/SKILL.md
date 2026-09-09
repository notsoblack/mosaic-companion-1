---
name: hypercycle-stargate-ops
description: Operations, debugging, and extension work inside the HyperCycle AI ecosystem (Mosaic Companion, Node Manager, AIM modules, Stargate integrations, and Mosaic Bot).
title: HyperCycle Stargate Operations
version: 1.0.0
triggers:
  - explore hypercycle ecosystem
  - understand mosaic companion
  - analyze stargate module
  - inspect node manager
  - discover fleet nodes
  - aimify an agent
  - deploy to node factory
  - work with mosaic bot
  - stargate architecture
  - hypercycle node ops
---

# HyperCycle Stargate Operations

Operations, debugging, and extension work inside the **HyperCycle AI ecosystem** as represented by the Mosaic Companion codebase and the local Node Manager runtime.

This skill covers:
1. The Node Manager REST API and local node discovery
2. AIM (Agent Interface Module) lifecycle — discovery-first, build, deploy
3. Stargate's 8 integration patterns
4. Fleet discovery without SSH
5. Mosaic Bot identity and heartbeat architecture
6. AXI tool forge pipeline
7. Key codebase landmarks

---

## 1. Node Manager Local Discovery

When Mosaic Companion runs on the same host as a HyperCycle node, **no wallet or blockchain lookup is needed** to discover the node.

### API Endpoints

| Endpoint | Port | Purpose |
|----------|------|---------|
| `/api/info` | 8006 (UI) | Node status, hardware, AIM slots |
| `/api/config` | 8006 (UI) | Node address, seeds, merklizer hosts |
| `/info` | 8005 (admin) | Admin-level info |
| `/config` | 8005 (admin) | Admin-level config |

### Normalized Data Shapes

The `LocalNodeBridge.ts` normalizes raw Node Manager JSON into:
- `BridgeComputeNode` — uptime, reliability, hardware specs
- `BridgeANFE` — license-as-NFT with computed rarity
- `BridgeAIM` — slot, port, whitelisted status

### Electron vs Browser Mode

- **Electron** (`file://` protocol): must use absolute `http://localhost:PORT` URLs
- **Browser dev** (`npm run dev`): can use `/api/*` via Vite proxy
- Always probe multiple URLs with 5s timeout and `AbortController`

---

## 2. AIM Lifecycle — Discovery-First Orchestration

The `AimifierService.ts` follows **discovery-first** logic:

```
1. DISCOVERY → Probe existing AIM on expected port (default 9000)
   - Check /health, /manifest.json, /costs, /
   - Inspect Docker container
   - Query Node Manager routing table
   - Check local registry for image digest

2. BRANCH:
   - IF found AND NOT forceRebuild → CONNECT mode (skip build)
   - IF not found OR forceRebuild → BUILD mode

3. BUILD path:
   - PREFLIGHT (Docker + aim-py-gen availability)
   - CONFIG_GENERATE (HermesAIMSpec v1 config.yml)
   - CODE_GENERATE (aim-py-gen generate.py)
   - CODE_FIX (template bug fixes, cost variable patch)
   - VALIDATE_SPEC (spec validator)
   - BUILD_DOCKER (docker build)
   - TEST_LOCAL (spin up container, probe endpoints)
   - DEPLOY_NODE (push to Node Manager, get slot)
   - POST_DEPLOY (verify on node)
```

### Embedded vs Proxy Mode

The `HermesAIMWrapper` (in `mosaic_hermes_wrapper.py`) has two runtime modes:

| Mode | Trigger | Capabilities |
|------|---------|--------------|
| **embedded** | Host has `run_agent.py` at known paths | Full AIAgent with tools, kanban, sessions |
| **proxy** | Container mode or missing Hermes repo | Ollama forwarding only (chat, no tools) |

Known mount paths for Hermes repo detection:
- `/container_mount` (Node Manager PERSIST_DIRECTORY)
- `/opt/hermes-agent`
- `/hermes`
- `/home/mauricio/hermes`

### Pragmatic Context Fix

Local models (gemma:2b, qwen2.5:32b) report <64K context, which breaks Hermes init. The wrapper temporarily lowers `MINIMUM_CONTEXT_LENGTH` to 4096, then forces Ollama `num_ctx=65536` via `extra_body` so the KV cache still allocates full size.

---

## 3. Stargate's 8 Integrations

All are production-ready (E2E tested 9/9). Each has a dedicated service under `src/services/stargate/integrations/`:

| # | Service | File | User Action |
|---|---------|------|-------------|
| 1 | AgentToolService | `AgentToolService.ts` | "Register as Tool" in AIM Panel |
| 2 | MCPAIMService | `MCPAIMService.ts` | "Expose as MCP Server" |
| 3 | UnifiedOrchestrator | `UnifiedOrchestrator.ts` | "Deploy to Fleet" → Parallel/Sequential/Pipeline/Hybrid |
| 4 | IDEAgentForge | `IDEAgentForge.ts` | "Forge Agent" (rocket icon) in IDE |
| 5 | FleetSandboxLauncher | `FleetSandboxLauncher.ts` | "Sandbox" on fleet node row |
| 6 | SecureAspGateway | `SecureAspGateway.ts` | Auto-vault-backed on company creation |
| 7 | FleetGatekeeperFilter | `FleetGatekeeperFilter.ts` | "Filter" on fleet node row |
| 8 | FleetChronicleLogger | `FleetChronicleLogger.ts` | "Log" on fleet node row |

---

## 4. Fleet Discovery (No SSH Between Nodes)

`FleetDiscoveryService.ts` discovers nodes via **registry polling**, not SSH:

1. **Explicit registry URL** — JSON endpoint the user controls (never hardcoded)
2. **Local Hypercycle Nodes** — from Settings → Hypercycle Nodes (via `electronAPI.nodes.get`)
3. **Polling** — `GET /api/info` on each node, 5s timeout
4. **Enrichment** — merge with HyperInsight telemetry if available

Security rule: **never use someone else's Merkelizer endpoint**. ANFE license IDs and node status must stay private.

---

## 5. Mosaic Bot Identity Architecture

Mosaic Bot is **not Hermes**. It runs on Hermes infrastructure but has its own identity layer.

### Identity Enforcement

- `SOUL.md` — complete personality definition at repo root
- `orchestrator.ts` — injects identity **FIRST** in system prompt
- `index.ts` — adds SOUL.md overlay to **all** agent configs (main, coder, local)
- `mosaic_hermes_wrapper.py` — MOSAIC_BOT_IDENTITY string injected into system prompts

### Heartbeat Architecture

```
Every 30 minutes:
  1. Read vault.json → count entries per box
  2. Read mcp-plugins.json → list MCP servers
  3. Read ai-agents.json → list active agents
  4. Build enriched system prompt
  5. Send to LLM
  6. If response != "HEARTBEAT_OK" → deliver alert via IPC to renderer
```

### Silent Monitoring Rule

> "Alert on crashes/errors, not routine success. Stop ack-ing every watch."

---

## 6. AXI Tool Forge Pipeline

Under `axi-tools/`:

| Tool | Purpose |
|------|---------|
| `hbox-axi` | Fleet management (status, ssh, logs, restart, deploy, aimify) |
| `spo-axi` | Pool orchestrator (boxes, deploy, aimify, scale, logs, drain) |
| `aimify` | Wrapper (tool → AIM module manifest + Docker image) |

Pipeline: **User Need → axi-forge skill → AXI Tool → AIMify → SPO Deploy → Node Factory**

Key principle: **TOON format** for token-efficient output, minimal schemas (3-4 fields), pre-computed aggregates.

---

## 7. Battery / Batterycoin Blockchain Layer

The HyperCycle ecosystem includes a **Cosmos SDK (CometBFT)** blockchain called Batterycoin, deployed via the `Battery-Movement` GitHub org.

| Repo | Purpose |
|------|---------|
| `Battery-Movement/batteryagi-validator-install` | Validator install bundle for HyperAiBox (RK3588, arm64) |
| `Battery-Movement/battery-coin-official` | Core Batterycoin node software |
| `Battery-Movement/battery-coin-smart-contracts` | Smart contracts |

### Validator Bundle Structure

The `batteryagi-validator-install` bundle is a **signed delivery artifact** (not source). It contains:

| Path | Purpose |
|------|---------|
| `compose.validator.yaml` | Docker Compose validator service |
| `compose.monitoring.yaml` | Optional Prometheus + Grafana |
| `validator.env.example` | Per-node config template |
| `genesis/genesis.json` + `genesis.sha256` | Canonical genesis (same on all 5 nodes) |
| `scripts/preflight.sh` | Fail-closed env check |
| `scripts/verify-bundle.sh` | Checksums + image signature |
| `scripts/load-image.sh` | Offline `docker load` helper |
| `image-digest.txt` | GHCR image pinned by sha256 digest |
| `docs/five-node-setup.md` | Full 5-node runbook |

### Network Ports

| Port | Bind | Purpose |
|------|------|---------|
| `26656` | `0.0.0.0` | P2P — must be reachable from other 4 validators |
| `26657` | `127.0.0.1` | RPC — private (SSH/VPN) |
| `1317` | `127.0.0.1` | REST — private |
| `9090` | `127.0.0.1` | gRPC — private |

**For Stargate dashboard polling:** change `26657` to `0.0.0.0` in `compose.validator.yaml` so the bridge can reach `/status` across the LAN. See `references/stargate-pool-validator-integration.md` for the full pattern.

---

### 7b. BatteryAGI as Mosaic LLM Provider (API Integration Pattern)

BatteryAGI's datacenter GPU clusters (repurposed BTC mining facilities) are **NOT** joining HyperPG as suppliers. Instead, BatteryAGI exposes its own **sovereign AI API** (OpenAI-compatible endpoint), which Mosaic Companion registers as a **first-class LLM provider** alongside Ollama, HyperPG, and OpenAI.

**Architecture:**
- **Mosaic Companion** provides the agent UI, tool registry, kanban, Stargate integrations (MCP, fleet dispatch, vault)
- **BatteryAGI API** provides the frontier LLM inference (Kimi, DeepSeek, GLM, Qwen, GPT-5.6, Claude Fable 5)
- **Active Inference (FEP) controller** running in BatteryAGI's datacenter orchestrates the multi-model ensemble and routes queries
- **Batterycoin validators** (your HyperAiBoxes) govern model ethics, weights, and staking — they do NOT run LLM inference

**Provider flow:**
```
Mosaic Agent Session → Configured Provider: "BatteryAGI"
    → POST https://api.batteryagi.io/v1/chat/completions
    → Headers: Authorization: Bearer <token>
    → Body: { model: "batteryagi-fusion-v1", messages, tools }
    → BatteryAGI Datacenter (Active Inference → ensemble routing)
    → Response streamed back to Mosaic Companion
```

**Mosaic implementation points:**
- Add provider config under `src/services/chat/` or agent provider registry
- Base URL, API key auth, model list mapping (fusion model + sub-models)
- Support `tools` parameter for agent tool use
- Support SSE streaming for chat UI
- Timeout handling (datacenter calls may be slower than local Ollama)

**Why this pattern:**
- BatteryAGI retains sovereignty over hardware, chain, tokens, models
- Mosaic gains a unique provider (Active Inference + ensemble) not available elsewhere
- HyperAiBox validators remain BatteryAGI's governance layer
- Both ecosystems interoperate at the API layer without subordination

---

### 7c. Pitfall: Do NOT Assume Sovereign AI Stacks Will Join Marketplaces

**Corrected assumption from live session (2026-07-25):**

A common analytical error is to assume vertically integrated AI ecosystems (like BatteryAGI) will plug into existing marketplaces (like HyperPG) as backend suppliers. **This is wrong.** Sovereign stacks own their full compute, chain, tokens, and models. They want users to come to *them*, not to become a commodity supplier for another platform.

| Wrong Mental Model | Correct Mental Model |
|-------------------|----------------------|
| "BatteryAGI GPUs should join HyperPG" | "BatteryAGI exposes its own API; Mosaic adds them as a provider" |
| "They need HyperCycle for distribution" | "They have their own chain (Batterycoin) and token economics" |
| "Supplier relationship" | "Sovereign interoperability at the API layer" |

**Always ask:** Does this ecosystem own its full stack (hardware, chain, models, tokens)? If yes, they will **not** subordinate to a marketplace. Offer **provider integration** or **cross-chain bridges**, not marketplace membership.

### Quick Per-Node Install

```bash
bash scripts/verify-bundle.sh                 # 1. integrity
cp validator.env.example .env && nano .env    # 2. moniker + peers
bash scripts/preflight.sh                      # 3. must pass
sha256sum -c genesis/genesis.sha256            # 4. verify genesis
docker compose -f compose.validator.yaml up -d # 5. start
```

Set in `.env`:
- `MONIKER` — unique per node
- `BATTERYAGI_EXTERNAL_ADDRESS` — this node's `host:26656`
- `BATTERYAGI_PERSISTENT_PEERS` — the other 4 nodes, comma-separated
- `BATTERYAGI_IMAGE` — digest from `image-digest.txt`
- `CHAIN_ID` — `batterycoin-1`
- `GENESIS_SHA256` — `d60a0b190406d4983d75a1c1059783e5e0a2a085f44b873a28c926e92bc73e90`

---

## 8. Stargate Pool Architecture (Post-Module)

The `stargate-module` branch added significant new infrastructure for the Stargate Pool ecosystem.

### Pool Orchestrator (`StargatePoolOrchestrator.ts`)
- **Heartbeat-based liveness:** 120s timeout, marks boxes offline if stale
- **Matchmaker scoring:** geo proximity (40%), capacity match (30%), GPU match (15%), reliability uptime (10%), price (5%)
- **Pricing model:** $0.50/CPU core/hr + $0.10/GB RAM/hr + $1.00/GPU/hr; 29% commission to Stargate
- **Booking lifecycle:** `pending_payment` → `payment_confirmed` → `provisioning` → `active` → `expiring` → `expired`
- **Cleanup loop:** Every 60s — mark stale boxes offline, expire old allocations (5min grace), purge 30-day-old bookings

### SPO Server (`SPOServer.ts`)
- HTTP server on port 9100 with EADDRINUSE guard
- Endpoints:
  - `POST /api/heartbeat` — HBA telemetry ingestion
  - `POST /api/v1/boxes/{boxId}/heartbeat` — Per-box heartbeat
  - `GET /api/v1/boxes` — List all registered boxes
  - `GET /api/pool` — Pool status summary
  - Tilling: provision, stop, sessions, resume, lock, create, message, update
- **Crash guard:** If external SPO (systemd) already owns port 9100, embedded server disables itself gracefully

### Pool Dashboard UI (`StargatePoolDashboard.tsx`, `StargatePoolHub.tsx`)
- Registry-driven pool cards with live telemetry badges
- Types: Battery Validator Pool, Compute Pool, Materios Pool, SafeFreight Pool
- Config modal for pool parameters
- `useValidatorTelemetry()` and `useMateriosTelemetry()` hooks for live data
- RPC resilience: `AlchemyKeyManager`, `SharedRPCLimiter`, `RPCResilience` for rate-limited blockchain queries

---

## 9. AIM Forge — Guided AIM Builder

**Files:** `src/services/stargate/AIMForgeService.ts`, `src/components/stargate/AIMForgePanel.tsx`

- **Tree-nav builder** (7 steps): Project Identity → Model Source → Endpoints → Shims → Container Config → Manifest → Generated Files
- **Two model types:**
  - **Generic:** pip package + class instantiation
  - **Hermes Agent Wrapper:** Embeds full Hermes Agent inside AIM container
- **Auto-generates:** `config.yml`, `app/main.py`, `Dockerfile`, `requirements.txt`, `manifest.json`, `test.py`
- **Key constraint:** Project name MUST end with `-aim`
- **Hermes-in-Docker:** Auto-detects Hermes repo path via `HERMES_PATHS` array and bootstraps `AIAgent` with full toolsets

---

## 10. Mosaic Bot Team Enhancements (Post-Module)

### Extended Orchestrator (`orchestrator.ts`)
- **SOUL.md identity injection** as first section of every heartbeat system prompt
- **Skill Consciousness:** Structured guide to 277+ native Mosaic skills across 54 categories
- **Learning layer:** Records observations, detects chronic failures (3+ times = chronic), extracts time-based alert patterns
- **Full replace pattern memory:** Replaces (not appends) pattern history each cycle so recoveries clear stale claims
- **AXI tool gap detection:** Detects missing tools (`hbox-axi`, `spo-axi`, `aimify`) and suggests forging via AXI Forge skill

### Fleet Telemetry (`fleet-telemetry.ts`)
- Runs `hbox-axi status` + SPO health probe every 15 minutes
- Parses TOON table rows for C-3PO, R2-D2, AtomMan status
- Records into `axi.sqlite` via `recordNodeTelemetry()`
- Exposes `buildLiveFleetSummary()` for heartbeat prompts — **live data overrides static registry**

### Skill Forge (`skill-forge.ts`)
- Filesystem-first skill creation — writes `SKILL.md` + `manifest.json` to `~/.config/mosaic-companion/mosaicbot/skills/mosaicbot-authored/`
- Anti-hallucination: never claim "created" without fs verification
- Pre-built templates: `dynamic-ip-handler`, `health-endpoint-troubleshooter`, `evolution-accelerator`

---

## 11. MCP Integrations (Post-Module)

### Atomic Mail (`electron/integrations/tools/modules/atomicmail.ts`)
- Wraps `@atomicmail/mcp-github` as native `ToolModule`
- **6 tools:** `registerInbox` (PoW signup), `sendEmail`, `readInbox`, `searchEmails`, `emailHelp`, `getStatus`
- JMAP batch builder for `Email/set` + `EmailSubmission/create`
- Auto-registered in MCP plugin manager with `autoConnect: true`
- **Credential isolation:** Each agent should use unique inbox username; credentials written to `~/.atomicmail/`

### Midnight Network (`electron/integrations/tools/modules/midnight.ts`)
- Bridges `midnight-mcp` server into ToolRegistry
- **14 tools:** contract generation, compilation, review, analysis, circuit explanation, Compact/TS/docs search, example listing, health checks
- **System prompt rules:** Always call `midnight_get_latest_syntax` before writing Compact; always compile before claiming success

### Buzz/Nostr Workspace Integration (`buzz-mcp-server.js`, `buzz-bridge.ts`, `buzz-telemetry.ts`)
- Bridges Mosaic Companion to Block's Buzz workspace platform via Nostr relays
- **MCP Server:** 6 tools — `publish_event`, `send_message`, `query_history`, `agent_dispatch`, `get_presence`, `create_channel`
- **Chat-Buzz Bridge:** Bidirectional relay mapping Mosaic rooms ↔ Buzz channels (NIP-29 `h` tags)
- **Telemetry Publisher:** Heartbeat ticks published as Nostr kind-40050 events
- **Key pitfall:** `@noble/curves` must be imported via submodules (`@noble/curves/secp256k1`), never root — fails in stdio MCP child processes
- **Key pitfall:** Buzz uses `h` tags for channel scoping, NOT `e` tags — using `e` causes silent event drops
- **Dr. Robert compliance:** Nostr `secp256k1` keypairs only, never wallet keys; no signing paths in addon code
- See `references/buzz-nostr-integration.md` for full implementation details, event kinds, and file map

---

## 12. Ada Portal Payment Service

**Files:** `src/services/AdaPortal/PaymentService.ts`

- **USDC on Base** (chainId 8453) for agent hire and bundle purchase
- **Dual wallet path:**
  - **Path A:** Browser MetaMask → `eth_sendTransaction` → `publicClient.waitForTransactionReceipt`
  - **Path B:** Electron stored wallet → `web3:transfer_token` tool → same confirmation flow
- **viem-based:** `createPublicClient`, `parseUnits`, `formatUnits`, `encodeFunctionData`
- **Chain switching:** `wallet_switchEthereumChain` to Base (`0x2105` / 8453)
- Receipt tracking with `txHash`, `status`, `chainId: 8453`, `token: 'USDC'`

---

## 13. SOUL Identity Layer

**Files:** `src/types/soul.ts`, `src/components/SoulSelector.tsx`, `src/services/SoulGraderService.ts`, `src/data/predefined-souls.ts`

- **7 archetypes:** `executor`, `researcher`, `creative`, `guardian`, `navigator`, `fast`, `custom`
- Each archetype maps to recommended capabilities, vault box access, and AIM deployment configs
- **Soul Grader Service:** 100-point rubric with automatic fail conditions (secrets in SOUL, unverified deployment claims, generic virtue language)
- **UI:** `SoulSelector.tsx` — card gallery + inline SOUL.md editor with live grading badge
- **Pattern:** Agents without explicit SOUL default to `executor` archetype (tool-first, evidence-based)

---

## 14. Stargate Graph v3 — Radial Constellation + Agent Capability Map

**Files:** `src/components/stargate/StargateGraphPanel.tsx` (~80K, 2000+ LOC)

The Stargate Graph evolved from a React Flow grid to a Hermes-inspired radial constellation. Key architectural decisions:

### 14a. Node Types and Visual Encoding

| Type | Shape | Color | Position | What It Represents |
|------|-------|-------|----------|-------------------|
| `skill` | Circle | `#3b82f6` (blue) | Temporal rings | Vault Box entries tagged as skills |
| `memory` → **Box** | Diamond | `#f97316` (orange) | Temporal rings | Vault Box entries (label prefixed with Box name: "Skills: entry-name") |
| `agent` | Hexagon | `#22c55e` (green) | Radius 65px (outside 38px center glyph) | Real AI agents from `ai-agents.json` (NOT Vault entries with "agent" in label) |
| `mcp` | Circle | `#a855f7` (purple) | Outer ring (maxR + 55) | Connected MCP servers |
| `live-mcp` | Hexagon | `#10b981` (emerald) | Outer ring | Live MCP servers with tool count |
| `factory` | Hexagon | `#f97316` (orange) | Outermost ring (maxR + 100) | HyperCycle Node Factories from Web3 wallet |
| `aim` | Star | `#fb923c` (light-orange) | Inside factory ring (radius * 0.72) | AIMs derived from factory.skills_supported |

**Terminology alignment:** Mosaic Companion uses "Box" (not "Memory"). Graph labels must reflect this — entries show as `BoxName: entryLabel` so users visually distinguish which Box each entry belongs to.

### 14b. Agent Capability Map (Constellation Mode)

When an agent node is selected, the graph enters **constellation mode**:
- Connected nodes glow at full brightness (opacity 1.0)
- Unconnected nodes dim to 5% opacity
- Color-coded edges radiate from the selected agent:
  - **Emerald (#10b981):** Live MCP servers
  - **Slate (#94a3b8):** Regular MCP servers
  - **Cyan (#06b6d4):** Skill nodes
  - **Purple (#a855f7):** Vault Boxes the agent has `boxAccess` to
- **Amber (#f59e0b):** Factory nodes (agent → factory ownership)
- **Orange (#f97316):** Factory → AIM edges

### 14c. Detail Panel Lazy-Loading Pattern

The agent detail panel does NOT load data at mount time. It lazy-loads when an agent node is clicked:

```typescript
const [agentDetail, setAgentDetail] = useState({
  config: null,
  sessions: [],
  mcps: [],
  boxAccess: [],
  loading: false,
});

useEffect(() => {
  if (selectedNode?.type !== "agent") return;
  setAgentDetail({ ...agentDetail, loading: true });
  // Fetch from MosaicBotBridge + Vault API
  // Cancelled guard prevents race conditions
}, [selectedNode]);
```

Sections rendered:
- **Skills:** Tag pills from `agentDetail.config.skills`
- **MCP Access:** Server name + tool count from `electronAPI.mcpAPI.listServers()`
- **Recent Sessions:** Last 5 session titles + dates
- **Config Snapshot:** ID, system prompt preview, temperature
- **Vault Box Access:** Purple edges to permitted Boxes

### 14d. Graph Chat Routing (Critical Fix)

**Problem:** `agent.send(text)` resolved to `ai-agents.json.find(a => a.isActive)` which returned Hermes Master Agent (localhost:8642, not running) instead of Byron (Ollama Cloud, kimi-k2.6).

**Fix:** Graph chat routes via explicit `teamDispatch` to Byron's specific agent ID:

```typescript
const byronId = "agent-1781120575138";
const agentApi = (window as any).agent;
if (agentApi?.teamDispatch) {
  result = await agentApi.teamDispatch(byronId, enrichedText);
}
```

**Context injection:** Every message prepends structured graph context (node counts, MCP server list, Box breakdown) so Byron knows what the graph contains.

### 14e. Tool Execution Loop in team:dispatch

The `team:dispatch` IPC handler includes a full tool-calling loop (not just raw LLM text):

```
callAgentLLM(prompt) → parse <use_tool> XML → mcpClient.callTool() →
re-call callAgentLLM(toolResults) → return synthesized natural-language answer
```

This mirrors `_agentSendImpl` from the Mosaic Bot tab. Without this loop, Byron returns raw `<use_tool>` XML instead of executing tools.

### 14f. MCP Discovery Fix (Loop Builder)

**Problem:** `McpDiscoveryService.getAddonApi()` used `window.addonAPI.mcp.listServers()` (legacy) which returned a subset of servers, missing `codebase-memory`.

**Fix:** Use `window.electronAPI.mcpAPI` (same live source as MCP Servers tab):

```typescript
function getAddonApi() {
  const live = (window as any).electronAPI?.mcpAPI;
  if (live?.listServers) return live;
  return (window as any).addonAPI?.mcp; // legacy fallback
}
```

### 14g. Web3 Wallet Integration Pattern

To load HyperCycle Node Factories on the graph:

1. **Detect wallet** from 3 sources (same as AdaPortalPanel):
   - `window.ethereum.selectedAddress` (MetaMask)
   - `window.mosaic.wallet.address` (Mosaic wallet)
   - `window.electronAPI.web3.getAddress()` (Electron stored wallet)

2. **Sync wallet to service** BEFORE calling factory methods:
   ```typescript
   (stargatePoolService as any).walletAddress = walletAddress;
   ```

3. **Call wallet-specific method:**
   ```typescript
   const factoryData = await stargatePoolService.getFactoriesByWallet(walletAddress);
   // Normalizes { factory, isEligible }[] → factory[]
   ```

4. **Graceful fallback:** If no wallet → empty array → no visual change.

**Why this matters:** `getFactories()` only returns locally stored factories. `getFactoriesByWallet()` queries on-chain eligibility via ANFE levels and NFT ownership.

### 14h. Electron IPC Handler Registration Pitfall

**Critical rule:** ALL handlers exposed in `preload.ts` MUST be registered **BEFORE any await** in `initMosaicBot()`. Registering AFTER an await (e.g., after skill loading) causes "No handler registered" errors.

```typescript
// WRONG — team:dispatch registered after await
await loadSkills();
ipcMain.handle("team:dispatch", ...); // Too late!

// RIGHT — register first, THEN await
ipcMain.handle("team:dispatch", ...);
await loadSkills();
```

Handler body can be async, but registration itself must be Phase 1 (before any await).

### 14i. Vault Entry Heuristic Fix

**Problem:** Vault entries labeled "Agent Best Practices", "Mosaic Bot Team" were incorrectly classified as `type: "agent"` nodes. Real agents (Byron, Son of Anton) were placed at radius 30px — hidden behind the 38px center glyph.

**Fix:**
- Removed "agent"/"bot" from Vault entry type heuristic → such entries stay `type: "memory"` (now `type: "box"`)
- Real agents sourced from `electronAPI.aiAgents.get()` via `MosaicBotBridge.ts`
- Real agents moved to radius 65px (visible), size 12px, importance 0.9

**Rule:** Vault entries with 'agent' in their label are memories, not real agents. Use `electronAPI.aiAgents.get()` for real agent data.

---

## 15. Key Codebase Landmarks (Post-Module)

| File | Role | Size |
|------|------|------|
| `src/components/AdaPortalPanel.tsx` | Main Stargate UI | ~216K |
| `src/components/stargate/StargateGraphPanel.tsx` | Radial constellation graph (v3) | ~80K |
| `src/components/stargate/StargatePoolDashboard.tsx` | Pool registry + live badges | ~35K |
| `src/components/stargate/StargatePoolHub.tsx` | Pool hub orchestrator | ~18K |
| `src/services/stargate/LocalNodeBridge.ts` | Node Manager REST client | 13K |
| `src/services/stargate/AIMForgeService.ts` | Guided AIM builder/generator | 25K |
| `src/services/stargate/StargatePoolOrchestrator.ts` | Pool orchestrator (matchmaker, provisioner, bookings) | 20K |
| `src/services/stargate/MosaicBotBridge.ts` | Agent profile loader (live + mock fallback) | ~5K |
| `src/services/stargate/McpDiscoveryService.ts` | MCP server discovery (live vs legacy API) | ~3K |
| `src/services/AdaPortal/PaymentService.ts` | USDC-on-Base payment service | 17K |
| `electron/integrations/mosaicbot/src/main/index.ts` | Mosaic Bot IPC + tool execution loop | — |
| `electron/integrations/pool/orchestrator/SPOServer.ts` | SPO HTTP server (port 9100) | 12K |
| `electron/integrations/mosaicbot/src/main/orchestrator.ts` | Extended Mosaic Bot orchestrator | 32K |
| `SOUL.md` | Identity contract | 7K |
| `STARGATE.md` | Stargate module overview | 6K |
| `stargate-vault/vault-index.json` | 283-skill index | 183K |
| `stargate-vault/component-registry.json` | Named node registry | 5K |
| `aim-images/mosaic-hermes-aim/mosaic_hermes_wrapper.py` | AIM runtime (embedded/proxy) | 17K |

### Node Manager Warning

If the Node Manager shows:
> "This license does not belong in the network configured to the node"

This means the node's `network` config (e.g. `mainnet`) doesn't match the license's registered network. Check `node_config.json` on the Node Manager host. The license `#2324779898006116` on node `80ad4ea14c33cd2a` (v0.5.1) showed this exact warning in a live inspection.

---

## 16. Omarchy Agent-Native OS Convergence

**Context:** Omarchy (DHH's Arch Linux distribution) treats AI coding agents as first-class OS citizens — lazy-loaded agent launchers (Claude, Codex, OpenCode, etc.), built-in agent skills, crash diagnosis, and usage tracking. This philosophy converges with HyperCycle's agent-centric infrastructure.

### The "Node Factory Skill" Pattern

Just as Omarchy ships an `omarchy` skill that teaches agents to edit Hyprland configs and manage themes, HyperCycle can create a **Node Factory Skill** that teaches agents to operate nodes:

```
~/.claude/skills/node-factory/SKILL.md
~/.codex/skills/node-factory/SKILL.md
~/.agents/skills/node-factory/SKILL.md
```

**What the skill teaches agents:**
- Check Node Manager status via `curl http://localhost:8000/info`
- Restart AIM slots and diagnose Tiller health
- Monitor license status via Merkelizer endpoints
- Poll Stargate Pool for compute assignments
- Handle crash diagnosis for CometBFT validator processes

### Omarchy Server for HyperAIBox Nodes

Omarchy's planned Server edition (`plans/server.md`) is ideal for HyperAIBox headless deployments:
- **BBS Dashboard** — Node status, AIM slots, Tiller health at SSH login
- **Snapper snapshots** — Roll back if an AIM update breaks the node
- **Docker built-in** — Run AIM containers natively
- **UFW pre-configured** — Secure by default
- **Tailscale integration** — Private mesh between fleet nodes
- **One-command updates** — `omarchy update` keeps nodes patched

### Quickshell Plugin Convergence

Omarchy's Quickshell plugin system (`docs/omarchy-shell.md`) uses `manifest.json` with `bar-widget`, `panel`, `service` kinds — structurally identical to MosAIc Companion's addon manifest:

| Omarchy Plugin | MosAIc Addon | Purpose |
|---------------|--------------|---------|
| `bar-widget` | `renderer/index.html` | Status in top bar |
| `panel` | `renderer/` component | Detailed dashboard |
| `service` | `main/index.ts` | Background polling |

**Opportunity:** Port Stargate Pool's Node Factory Tracker as an Omarchy Quickshell plugin — bar widget shows `🟢 2/2 nodes online`, panel opens full dashboard, service polls Node Manager API.

## 17. Scope Discipline — Stay on User's Actual Stack

**Hard rule:** When the user says "focus on Node Factories, HyperCycle, MosAIc Companion, and Stargate as an Addon," do NOT divert to tangential projects (e.g., BatteryAGI/CometBFT consensus details) unless explicitly asked.

**Correct response:**
1. Acknowledge the correction immediately
2. Re-read the user's actual codebase to understand THEIR stack
3. Map synergies to THEIR projects, not adjacent ones
4. If the user asks about a specific repo (e.g., Omarchy), analyze it through the lens of THEIR stack

**Incorrect response:**
- Continuing to analyze BatteryAGI/CometBFT after user says no
- Treating Node Manager (`localhost:8000`) as the same thing as CometBFT validators (`localhost:26657`)
- Assuming the user's fleet runs validators when it's actually AIM inference boxes

## References

- `references/genesis-ceremony-workflow.md` — BatteryAGI Genesis Ceremony: 6-step coordinated validator upgrade from scaffold to real CometBFT (package download, box init, packet posting, bundle join, GO signal)
- `references/batteryagi-pre-upgrade-readiness.md` — Pre-ceremony 4-check readiness matrix
- `references/cross-tailnet-validator-peering.md` — Cross-tailnet IP asymmetry and sharing patterns
- `references/battery-validator-bundle.md` — Validator bundle structure and quick install
- `references/stargate-graph-v3-patterns.md` — Session-specific patterns from the Stargate Graph v3 implementation: IPC handler registration Phase 1 rule, graph chat routing via teamDispatch, tool execution loop, MCP discovery live vs legacy API, Web3 wallet sync, Vault entry heuristic, terminology alignment, SVG star polygon algorithm, constellation edge colors, Box Access wiring
- `references/node-manager-port-architecture.md` — HyperCycle Node Manager port architecture: 8000=API, 8005=admin, 8006=Web UI (Vite). How to start the Web UI, common port confusion fixes, local-first testing workflow, and code verification checklist
- `references/dual-wallet-anfe-discovery.md` — **Unified asset discovery from multiple wallets/platforms.** Node Manager + Web3 dual-source ANFE discovery, store migration from scalar to array, graph source-colored nodes, header badge breakdown. Session: 2026-08-17. Core commits `a351011`, `c960820`.
- `references/node-manager-port-drift.md` — HyperCycle Node Manager port 8006→8000 configuration drift: why port 8006 is empty, how to verify actual ports, and how to correct code references
- `references/mosaic-agent-capability-upgrade.md` — Pattern for upgrading Mosaic Companion AI agents (Byron) to match Hermes Agent capabilities: soul upgrade, skills injection, auto-dispatch, ToolRegistry modules
- `scripts/check_validator_mesh.py` — Standalone mesh health checker
- `references/session-inspection-checklist.md` — Step-by-step for inspecting a Mosaic/HyperCycle environment
- `references/github-repo-map.md` — Full GitHub repo map, branches, PRs, and API commands
- `references/battery-validator-live-deploy.md` — Session-specific fleet discovery results and node readiness findings
- `references/validator-5-mesh-adgas-pattern.md` — 5-node validator mesh: multi-box-per-operator pattern, 5-node `.env` cascade, Maia diagnostic (`connected=False`), cross-tailnet asymmetry with Adgas
- `references/aimifier-code-correctness-gap.md` — **Aimifier backend gap analysis:** the current `aimifyGenericModel()` generates hand-crafted Flask apps instead of HyperCycle-compliant AIMs via `aim-py-gen`. Covers official `config.yml` format, `manifest.json` schema, `pyhypercycle_aim` infrastructure, and three fix options (AIMForgeService wiring, manual template fix, or UI-only demo). Session: 2026-08-21.
- `references/cross-tailnet-validator-peering.md` — Cross-tailnet validator mesh setup: IP asymmetry when nodes are shared across tailnets, bidirectional sharing requirements, and the full 4-node onboarding workflow (Adgas pattern)

---

## 8. Node Manager v0.5.4 Update — Cross-Platform Pattern

### Architecture Detection

The HyperCycle release site (`https://storage.hyperpg.site/hypercycle-release/`) provides separate tarballs:
- `hypercycle-0.5.4-x86.tar` — x86_64 (AtomMan, standard servers)
- `hypercycle-0.5.4-arm64.tar` — ARM64/aarch64 (RK3588 HyperAIBox)

**Critical:** Never assume x86 tarball works on ARM. Check `uname -m` first.

### Port Architecture (Three Ports)

The Node Manager has **three separate ports**, not one:

| Port | Component | Purpose |
|------|-----------|---------|
| **8000** | Backend API (`controller_serve`) | Node info, AIM status, hardware telemetry |
| **8005** | Admin API (`controller_serve --admin`) | Node config, tilling sessions |
| **8006** | **Web UI** (Vite dev server) | React app in browser — proxies `/api/*` to 8005 |

**Common mistake:** Mosaic code hardcodes port 8006 for API calls or port 8000 for Web UI links. Correct usage:
- API calls: `http://localhost:8000/info` (direct backend)
- Web UI links: `http://localhost:8006` (browser)
- Admin config: `http://localhost:8005/config`

The Web UI (port 8006) is **NOT started automatically** by `start_manager.sh`. It must be started separately with `npx vite --config vite.config.mts`. See `references/node-manager-port-architecture.md` for full details.

### glibc Compatibility — Hard Blocker Discovery

**Session finding (2026-08-12):** Even `hypercycle-manager-0.5.0-arm64` and `0.5.1-x86` binaries are compiled against glibc 2.35. They crash on systems with glibc < 2.35.

| Machine | OS | glibc | Can Run ANY HC? |
|---------|-----|-------|----------------|
| C-3PO | Ubuntu 22.04 | 2.35 | ✅ v0.5.0/0.5.1/0.5.4 |
| R2-D2 | Ubuntu 20.04 | 2.31 | ❌ None — hard blocked |
| AtomMan | Ubuntu 24.04 | 2.39 | ✅ v0.5.0/0.5.1/0.5.4 |

**Implication:** R2-D2 cannot run ANY Node Manager version (not just v0.5.4). The old v0.5.0 processes only survived because they were running from before a previous reboot and were never killed.

**Options for incompatible systems:**
| Option | Action | Risk |
|--------|--------|------|
| A. No Node Manager | CometBFT validator works fine without HC UI | None |
| B. OS upgrade | `do-release-upgrade` Ubuntu 20.04 → 22.04 | High — may break services |
| C. Wait for build | Ask HyperCycle for glibc 2.31-compatible build | Unknown timeline |

### The `su -c` Non-Interactive Authentication Failure

`start_all.sh` and `start_manager.sh` use `su -c "..." hypercycle` which requires an interactive password prompt. This fails in:
- SSH sessions
- systemd service execution
- `@reboot` cron jobs

**Error pattern:**
```
Authentication failure
su: must be run from a terminal
```

**Fix for ARM64 (RK3588):** Bypass `su` entirely — start components directly via tmux as the `hyperai` user:

```bash
# Backend (3 instances: admin, merkle, server)
tmux new-session -d -s hc-backend \
  'cd /home/hypercycle/hypercycle-manager-0.5.4-arm64/controller_backend/node_controller && \
   ./controller_serve --config=../../../config/config.yaml --admin'
tmux new-session -d -s hc-merkle \
  'cd /home/hypercycle/hypercycle-manager-0.5.4-arm64/controller_backend/node_controller && \
   ./controller_serve --config=../../../config/config.yaml --merkle'
tmux new-session -d -s hc-server \
  'cd /home/hypercycle/hypercycle-manager-0.5.4-arm64/controller_backend/node_controller && \
   ./controller_serve --config=../../../config/config.yaml'

# UI
tmux new-session -d -s hc-ui \
  'cd /home/hypercycle/hypercycle-manager-0.5.4-arm64/controller_ui && \
   npx vite --host 0.0.0.0 --port 8006'
```

**Fix for x86_64 (AtomMan):** The init.d `su` approach works because the hypercycle user is configured for passwordless operation or the script runs in an interactive TTY context.

### Service Name Collision

Some systems have BOTH `hypercycle.service` AND `Hypercycle.service` (capital H). Both can be enabled and auto-start old versions.

```bash
# Detect
systemctl list-unit-files | grep -i hypercycle

# Fix: stop, disable, AND mask both
sudo systemctl stop hypercycle.service Hypercycle.service
sudo systemctl disable hypercycle.service Hypercycle.service
sudo systemctl mask hypercycle.service Hypercycle.service
```

### Post-Update Verification Checklist

```bash
# 1. Backend port
ss -tlnp | grep 8005

# 2. UI port
ss -tlnp | grep 8006

# 3. Version in process path
pgrep -af "hypercycle-manager-0.5.4" | head -5

# 4. UI responds
curl -s --max-time 5 http://localhost:8006 | head -5

# 5. Backend responds
curl -s --max-time 5 http://localhost:8005/api/status 2>/dev/null || \
  curl -s --max-time 5 http://localhost:8005 | head -3
```

## 9. Fleet Discovery — The Tailscale Mesh

The HyperAIBox fleet spans **multiple LAN subnets** (e.g., `192.168.0.x` and `192.168.1.x`). Local subnet scanning with `nmap` or `ping` will miss nodes on different subnets. **Tailscale is the discovery fabric** — every node has a `tailscale0` interface with a `100.x` address.

### Discovery Procedure

```bash
# On ANY reachable node, list all mesh members
ssh r2d2 "tailscale status"   # shows all connected nodes

# Typical output:
# 100.94.115.120  r2d2   mauricio240887@  linux  -
# 100.92.116.49   c-3po  mauricio240887@  linux  -
```

This gives you:
- **Tailscale IP** (the overlay address for P2P)
- **Hostname** (r2d2, c-3po, etc.)
- **Platform** (linux)

### Using Tailscale IPs for Cross-Subnet Validator Peering

In `validator.env`, `BATTERYAGI_EXTERNAL_ADDRESS` and `BATTERYAGI_PERSISTENT_PEERS` **must use Tailscale IPs**, not LAN IPs. Example for a 3-node set:

```
MONIKER=batteryagi-validator-1
BATTERYAGI_EXTERNAL_ADDRESS=100.92.116.49:26656
BATTERYAGI_PERSISTENT_PEERS=100.94.115.120:26656,100.72.251.124:26656
```

### ⚠️ Cross-Tailnet Node Sharing Pitfall

When a partner shares their node to your tailnet (`mauricio240887@`), **your other nodes on that tailnet can reach it**, but your **dev machine may be on a different tailnet** and cannot.

| Machine | Tailnet | Can Reach Mike (`100.72.251.124`)? |
|---------|---------|-----------------------------------|
| C-3PO | `mauricio240887@` | ✅ Yes (same tailnet) |
| R2-D2 | `mauricio240887@` | ✅ Yes (same tailnet) |
| AtomMan (dev, before) | `computeportal.net` | ❌ No (different tailnet) |
| AtomMan (dev, after) | `mauricio240887@` | ✅ Yes (switched 2026-07-11) |

**Symptom:** Nodes peer to each other fine, but your dev machine (where Mosaic runs) shows "signal timed out" for the shared node.

**Fix Options:**

| Option | Command | Trade-off |
|--------|---------|-----------|
| A. SSH tunnel | `ssh -f -N -L 26658:100.72.251.124:26657 hyperai@192.168.0.150` | Works immediately; tunnel dies on reboot |
| B. Join dev machine to partner tailnet | `sudo tailscale --socket /var/snap/tailscale/common/socket/tailscaled.sock login` → auth as `mauricio240887@gmail.com` | Cleanest; loses access to original work tailnet |
| C. Run Mosaic on a node IN the tailnet | SSH to C-3PO, run Mosaic there | Heavy; requires GUI or X11 |

**Recommended:** Option B for permanent development. After login, `tailscale status` on AtomMan shows C-3PO, R2-D2, and Mike directly. For snap-installed tailscale, use `--socket /var/snap/tailscale/common/socket/tailscaled.sock`.

### SSH Access Pattern

```bash
# ~/.ssh/config
Host r2d2
    HostName 192.168.0.38
    User hyperai
    IdentityFile ~/.ssh/id_ed25519

Host c3p0
    HostName 192.168.0.150
    User hyperai
    IdentityFile ~/.ssh/id_ed25519
```

Note: `c3p0` has **two LAN interfaces** (`eth1` on `192.168.1.100` and `wlan0` on `192.168.0.150`). The SSH config uses the reachable IP.

---

## 9. Node Readiness Audit — Preflight Script

The bundle's `scripts/preflight.sh` performs 8 checks. **All MUST pass** before `docker compose up`:

| # | Check | Fatal? | Typical HyperAIBox Value |
|---|-------|--------|--------------------------|
| 1 | Architecture `aarch64/arm64` | **YES** | `aarch64` (RK3588) |
| 2 | Docker daemon reachable | **YES** | `Docker 28.1.1` |
| 3 | Docker Compose v2 plugin | **YES** | `v2.35.1` |
| 4 | `.env` fully populated (no `REPLACE_` placeholders) | **YES** | Must set manually |
| 5 | `genesis.json` present + SHA256 matches | **YES** | `d60a0b19...` |
| 6 | Port 26656 availability | WARN | May already be in use |
| 7 | NTP synchronized | WARN | `timedatectl` → `yes` |
| 8 | Disk ≥ 20GB free | WARN | **Critical on some nodes** |

### Critical Resource Warning

**R2D2 had 98% disk utilization (2.9GB free of 108GB)** during a live inspection. This blocks validator deployment. Before starting:

```bash
ssh r2d2 "df -h ."   # check root disk
ssh r2d2 "docker system df"   # check Docker storage
```

Cleanup path if disk is full:
1. `docker image prune -a` — remove unused images
2. Remove old inference AIM tarballs (`batterycoin-inference-aim-v0.1.4.tar.gz` is 3.3GB)
3. `docker volume prune` — remove unused volumes
4. Check `overlayroot` status — some HyperAIBoxes use overlayfs; a reboot may clear the overlay

---

## 10. GitHub Repo Map & Branch Status

### Account: `notsoblack` (Mauricio Fabian Prieto Davila)

**Personal repos:**
| Repo | Last Updated | Purpose |
|------|--------------|---------|
| `notsoblack/mosaic-companion` | 2026-03-26 | Personal fork |
| `notsoblack/create-mn-app` | 2026-06-25 | Midnight Network app scaffold |
| `notsoblack/midnight-docs` | 2026-06-25 | Midnight blockchain docs |
| `notsoblack/midnightntwrk` | 2026-03-05 | Midnight tooling |
| `notsoblack/mauricio` | 2026-03-26 | Personal |

**Upstream:**
| Repo | Last Updated | Purpose |
|------|--------------|---------|
| `hypercycle-development/mosaic-companion` | 2026-07-02 | Official Mosaic + Stargate |
| `hypercycle-development/aim-py-gen` | 2025-06-18 | AIM module generator |

### Branch Status (Local Working Tree)

The local checkout (`/home/mauricio/mosaic-companion`) on branch `stargate-module`:
- **Remotes**: `origin` → `notsoblack/mosaic-companion`, `hypercycle` → `hypercycle-development/mosaic-companion`
- **Divergence**: +3,958 insertions / -941 deletions across 37 files vs. upstream
- **Recent local commits**:
  1. `fix(chatview)`: count only trailing tool-chain, not lifetime history
  2. `fix(chat/asset-discovery)`: prevent runaway tool-chain + RPC storm
  3. `fix(stargate)`: unify Dashboard LLM path + RPC circuit breaker + Atomic Mail MCP
  4. `fix(xhr)`: emulate streaming callbacks for non-streaming XHR
  5. `debug(xhr)`: log response body to diagnose silent failures

**Recommendation**: Consider opening PR from `notsoblack/stargate-module` → `hypercycle-development/stargate-module` to upstream the work.

---

## 11. Live Deployment Pitfalls (Confirmed 2026-07-07)

### Genesis SHA256 Mismatch Trap

The `genesis.sha256` file in the bundle uses a **relative path prefix** (`batterycoin-validator/genesis/genesis.json`) when the bundle is cloned inside a parent directory. The container's `entrypoint.sh` computes the SHA256 of `/genesis/genesis.json` (the mounted path), which yields a **different hash** if the path string differs. This causes a fatal restart loop:

```
FATAL: genesis sha256 mismatch for /genesis/genesis.json
sha256sum: WARNING: 1 of 1 computed checksums did NOT match
```

**Fix:** Compute the hash directly on the file, not from `genesis.sha256`:
```bash
sha256sum ~/batterycoin-validator/genesis/genesis.json
# → d60a0b190406d4983d75a1c1059783e5e0a2a085f44b873a28c926e92bc73e90
# Set this exact value in .env as GENESIS_SHA256
```

### Preflight "Empty persistent_peers" Failure

`preflight.sh` treats an empty `BATTERYAGI_PERSISTENT_PEERS=` as a placeholder failure, even though the first validator legitimately has no peers yet.

**Fix:** Either leave the variable commented out in `.env` (the script only checks lines starting with the key), or set it to a dummy value and override later:
```bash
# Option A: comment out until validator-2 joins
# BATTERYAGI_PERSISTENT_PEERS=

# Option B: set empty explicitly (preflight v0.1.0 accepts this)
BATTERYAGI_PERSISTENT_PEERS=""
```

### SSH Pipe JSON Parsing Breaks

Piping `ssh node "curl ... | python3 -c '...'"` into a local Python interpreter fails because **double-quote escaping inside f-strings breaks across the SSH boundary**:
```
SyntaxError: f-string: unmatched '('
```

**Fix:** Always scp a `.py` file to the remote and run it there, or use JSON keys with single quotes:
```bash
# WRONG — double quotes break through ssh
ssh node "curl ... | python3 -c '...f\"Node: {n.get(\"moniker\")}\"...'"

# RIGHT — scp a script and run it on the remote
scp check_status.py node:/tmp/
ssh node "curl -s http://127.0.0.1:26657/status | python3 /tmp/check_status.py"
```

### Registry Auth Required for Docker Pull

The GHCR image `ghcr.io/battery-movement/batterycoin-node:latest` requires authentication. HyperAIBox nodes **cannot pull it without credentials**.

**Fix:** Use the offline tarball shipped in `image/`:
```bash
cd ~/batterycoin-validator
bash scripts/load-image.sh image/batteryagid-v0.1.0-linux-arm64.tar
# Then set BATTERYAGI_IMAGE=ghcr.io/battery-movement/batterycoin-node:v0.1.0 in .env
```

### R2D2 Disk Cleanup (Exact Commands)

R2D2 was at 98% disk (2.9GB free). The largest consumers identified:

```bash
# On R2D2:
docker images
# → batterycoin-inference-aim v0.2.1   5.96GB
# → batterycoin-inference-aim v0.1.4   876MB
# → various old <none> layers          ~843MB

# Cleanup:
docker rm -f batterycoin-inference-aim   # remove exited container
docker rmi batterycoin-inference-aim:v0.2.1  # remove 5.96GB image
docker image prune -a                    # remove dangling images
docker volume prune                      # remove unused volumes
rm /home/hyperai/batterycoin-build/batterycoin-inference-aim-v0.1.4.tar.gz  # 3.3GB tarball
```

After cleanup, expect ~30GB free, which satisfies the preflight ≥20GB requirement.

### Entrypoint Init Idempotency

The container's `entrypoint.sh` runs `batteryagid init` on every start. This is **idempotent for genesis** (re-copies the mounted genesis) but **creates a new validator key** if `keyring-test/` is empty. The validator address `71f1dc445d4853d7fbfb806b95e61a209da6329d` was already in the genesis `accounts` list, so the node immediately got `voting_power: 10`.

**Do NOT** run `docker exec ... batteryagid init` manually after the container is up — it rewrites `config/node_key.json` and `priv_validator_key.json`, which can change the validator identity.

### `n_peers=0` with Non-Empty Peer Array (Inbound-Only Config)

When `/net_info` shows `n_peers: 0` but the `peers` array contains entries with `connected: false`, the validator **accepts inbound connections** but **never initiates outbound** because `BATTERYAGI_PERSISTENT_PEERS` is empty or missing.

| Symptom | Meaning |
|---------|---------|
| `n_peers: 0` | No outbound dials configured |
| `peers` array non-empty | Other nodes have dialed IN |
| `connected: false` | From this node's view, those are inbound listeners, not active peers |
| Other nodes show `connected: true` | Their outbound dials TO this node succeed |

**Fix:** Add ALL OTHER nodes to `BATTERYAGI_PERSISTENT_PEERS` in `.env`:
```bash
BATTERYAGI_PERSISTENT_PEERS=100.92.116.49:26656,100.94.115.120:26656
```
Then `docker compose down && docker compose up -d`.

**Rule:** CometBFT `n_peers` counts **bidirectional active connections**. A node that only passively accepts inbound shows `n_peers=0` even though P2P is open and other nodes are connected to it. See `references/multi-validator-peer-wiring.md` for the full diagnostic pattern.

### Tailscale Login with Snap-Installed tailscale

When Tailscale is installed via snap, `sudo tailscale login` fails with "Access denied: profiles access denied". The snap socket path is `/var/snap/tailscale/common/socket/tailscaled.sock`, not the default `/var/run/tailscale/tailscaled.sock`.

**Fix:**
```bash
sudo tailscale --socket /var/snap/tailscale/common/socket/tailscaled.sock login
```

After login, verify with `tailscale status` to confirm all tailnet nodes appear.

---

## 13. Genesis Ceremony Package Blocker Pattern

### Package URL Returns 404

The BatteryAGI Genesis Ceremony package is published as a GitHub release:
```
https://github.com/Battery-Movement/batteryagi-validator-install/releases/download/genesis-ceremony-20260722/genesis-ceremony-package-20260722.tar.gz
```

**If this returns 404, STOP.** Do not proceed with partial or guessed files.

**Root causes:**
1. The repo `Battery-Movement/batteryagi-validator-install` is **private**
2. The release tag `genesis-ceremony-20260722` has **not been published yet**
3. The URL contains a typo (verify with BatteryAGI team)

**Verification:**
```bash
curl -sI https://github.com/Battery-Movement/batteryagi-validator-install/releases/download/genesis-ceremony-20260722/genesis-ceremony-package-20260722.tar.gz
# Expected: HTTP/2 200
# If 404 → package is not accessible
```

**Fix options:**
| Option | Action | Trade-off |
|--------|--------|-----------|
| A. Make public | Ask BatteryAGI to publish the release | Fastest if they control it |
| B. Grant access | Ask BatteryAGI to add your GitHub user to the repo | May take hours |
| C. Alternative distribution | Ask them to send `.tar.gz` via email/Telegram/Discord | Bypasses GitHub entirely |

**Do NOT:**
- Try to construct the URL manually (tag names are case-sensitive and unpredictable)
- Skip the SHA256 verification
- Proceed with an old bundle from a previous release

### R2-D2 Docker Data-Root Misconfiguration

R2-D2 has Docker configured with `data-root: /userdata/docker` (on the 108GB userdata partition), while C-3PO correctly uses `data-root: /storage/docker-data` (on the 1.9TB storage partition).

**Symptom:** R2-D2 fills up fast despite having a 1.9TB `/storage` mount almost empty.

**Diagnosis:**
```bash
# On the node:
docker info --format '{{json .DockerRootDir}}'
# R2-D2: "/userdata/docker"  → 108GB partition
# C-3PO: "/storage/docker-data" → 1.9TB partition
```

**Fix (permanent — requires Docker restart):**
```bash
# 1. Stop Docker
sudo systemctl stop docker

# 2. Create new data-root on /storage
sudo mkdir -p /storage/docker-data

# 3. Copy existing data (or start fresh — images will be re-pulled)
sudo cp -a /userdata/docker/* /storage/docker-data/ 2>/dev/null || true

# 4. Update daemon.json
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "data-root": "/storage/docker-data",
  "dns": ["8.8.8.8", "1.1.1.1"],
  "ipv6": false
}
EOF

# 5. Restart Docker
sudo systemctl start docker

# 6. Verify
docker info --format '{{json .DockerRootDir}}'
# -> "/storage/docker-data"
```

**Note:** If copying data fails (permissions, overlayfs issues), it's often faster to start fresh — the Battery validator image is only 15.6MB and will be re-pulled or loaded from the bundle.

### Pre-Ceremony Disk Cleanup (R2-D2 Specific)

When R2-D2 is near full (~94-98% used on `/`), run this exact sequence before the ceremony:

```bash
# 1. Vacuum systemd journals (often 2GB+)
sudo journalctl --vacuum-time=3d

# 2. Clear apt caches
sudo apt-get clean
sudo rm -rf /var/lib/apt/lists/*

# 3. Clear npm/yarn caches (if present)
npm cache clean --force 2>/dev/null || true
yarn cache clean --all 2>/dev/null || true

# 4. Prune Docker (removes unused images, stopped containers, dangling volumes)
docker system prune -a -f --volumes
# Typical reclaim: 500MB–2GB

# 5. Verify
 df -h /
```

**Expected result:** `/` goes from ~94% to ~90-91%, freeing ~3-5GB. This is enough for the Genesis Ceremony package but the Docker data-root fix should be applied post-ceremony for long-term stability.

---

## 12. Key Codebase Landmarks

| File | Role | Size |
|------|------|------|
| `src/components/AdaPortalPanel.tsx` | Main Stargate UI (~4,200 LOC) | ~216K |
| `src/services/stargate/LocalNodeBridge.ts` | Node Manager REST client | 13K |
| `src/services/stargate/EnhancedLocalNodeBridge.ts` | Telemetry + Ollama + Hermes detection | 6.5K |
| `src/services/stargate/AimifierService.ts` | AIM pipeline orchestrator | 48K |
| `src/services/stargate/AIMForgeService.ts` | Guided AIM builder/generator | 25K |
| `src/services/stargate/HermesAgentOrchestrator.ts` | Kanban dispatch to fleet | 19K |
| `src/services/stargate/FleetDiscoveryService.ts` | Registry-based node discovery | 8K |
| `src/services/stargate/TrainingRoomDeployer.ts` | Chat room training bridge | 7K |
| `electron/integrations/mosaicbot/src/main/index.ts` | Mosaic Bot heartbeat engine | — |
| `SOUL.md` | Identity contract | 7K |
| `stargate-vault/vault-index.json` | 283-skill index | 183K |
| `stargate-vault/component-registry.json` | Named node registry (C-3PO, R2-D2, AtomMan, BB-8) | 5K |
| `aim-images/mosaic-hermes-aim/mosaic_hermes_wrapper.py` | AIM runtime (embedded/proxy) | 17K |
| `aim-images/mosaic-hermes-aim/manifest.json` | AIM module manifest v1.0.4 | 1.7K |
| `docs/AXI_INTEGRATION.md` | AXI Tool Forge architecture | 10K |

### Node Manager Warning

If the Node Manager shows:
> "This license does not belong in the network configured to the node"

This means the node's `network` config (e.g. `mainnet`) doesn't match the license's registered network. Check `node_config.json` on the Node Manager host. The license `#2324779898006116` on node `80ad4ea14c33cd2a` (v0.5.1) showed this exact warning in a live inspection.

---

## References

- `references/node-manager-api-endpoints.md` — **Verified endpoint discovery for HyperCycle Node Manager (port 8000/8005/8006).** `/api/licenses` does NOT exist; use direct blockchain RPC for ANFE discovery. Session: 2026-08-17.
- `references/node-manager-update-arm64.md` — HyperCycle Node Manager update workflow for RK3588 ARM64 HyperAIBox: architecture detection (x86 vs arm64), glibc compatibility check (2.35 required), `node_modules` copying from old version, `su -c` password prompt workaround, capitalized service variant (`Hypercycle.service`), `.env` file migration, stray process killing, init script rewrite for direct execution, systemd vs tmux startup, and post-update verification
- `references/node-manager-0.5.4-update-pattern.md` — v0.5.4-specific update pattern: glibc >= 2.35 hard requirement discovery (even v0.5.0/0.5.1 binaries need it), `node_modules` copying critical step, `su -c` non-interactive failure and tmux workaround, service name collision (`hypercycle.service` + `Hypercycle.service`), init script for direct nohup execution on ARM64, systemd service approach on x86_64, and post-update verification checklist
- `references/cometbft-ssd-migration-hyperaibox.md` — CometBFT data migration from SD card home dir to SATA SSD on HyperAIBox: SSD health verification (lsblk, mount, touch test, dmesg), migration steps with symlink creation, priv_validator_state signing verification, intermittent SSD failure recovery (user reboot required), CometBFT fallback to home dir when SSD corrupts, and disk usage monitoring
- `references/reactive-anfe-rendering.md` — **Reactive ANFE rendering pattern for SVG graphs.** Three-layer reactivity: store subscription, layout useMemo, direct store reads in SVG. Solves "data in logs but not in graph" problem. Session: 2026-08-17.
- `references/anfe-direct-rpc-discovery.md` — **Direct Base Mainnet RPC discovery for ANFEs.** Bypasses broken ANFEService/Alchemy by querying ERC-721 `ownerOf(uint256)` directly via publicnode.com. Proven working: found tokens 4649559796048334 and 4649559796048335 owned by 0x481F...3484. Includes ERC-721 vs ERC-1155 selector verification, token ID discovery strategy, and wallet detection priority. Session: 2026-08-17.
- `references/stargate-loop-engine-patterns.md` — NEW (Phase B): dual-mode execution (dry-run vs live), LoopState shared state schema, checkpointer save/resume, verifier N-vote skeptics, Midnight IPC bridge pattern, ActiveLoopRegistry glowing badges, HyperCycleNodeManagerClient factory probe, Byron→Midnight Auto-Work teaching preset
- `references/electron-mcp-renderer-bridge.md` — Renderer-side MCP context injection pattern: why `window.electronAPI.mcpAPI` works from the renderer but dynamic `import("../../../mcp/index.js")` fails from the main process, plus TDZ crash prevention when arrays are pushed before declaration
- `references/stargate-pool-validator-integration.md` — How to wire Battery validator fleet telemetry into the Stargate Pool dashboard (Tailscale IPs, dual `/status` + `/net_info` polling, cross-tailnet reachability)
- `references/cross-tailnet-validator-peering.md` — Cross-tailnet validator mesh: IP asymmetry when nodes are shared across tailnets, bidirectional sharing requirements, onboarding new validators (Adgas pattern)
- `scripts/check_validator_mesh.py` — Standalone Python health check script for the validator mesh
- `references/batteryagi-pre-upgrade-readiness.md` — BatteryAGI team's 4 pre-upgrade checks (secure login, kill→restart, full reboot, report) with live execution learnings from 2026-07-20
- `references/session-inspection-checklist.md` — Step-by-step for inspecting a Mosaic/HyperCycle environment
- `references/github-repo-map.md` — Full GitHub repo map, branches, PRs, and API commands
- `references/battery-validator-bundle.md` — Session-specific fleet discovery results and node readiness findings
- `references/validator-5-mesh-adgas-pattern.md` — 5-node validator mesh: multi-box-per-operator pattern, 5-node `.env` cascade, Maia diagnostic (`connected=False`), cross-tailnet asymmetry with Adgas
- `references/aimifier-code-correctness-gap.md` — **Aimifier backend gap analysis:** the current `aimifyGenericModel()` generates hand-crafted Flask apps instead of HyperCycle-compliant AIMs via `aim-py-gen`. Covers official `config.yml` format, `manifest.json` schema, `pyhypercycle_aim` infrastructure, and three fix options (AIMForgeService wiring, manual template fix, or UI-only demo). Session: 2026-08-21.
- `references/cross-tailnet-validator-peering.md` — Cross-tailnet validator mesh setup: IP asymmetry when nodes are shared across tailnets, bidirectional sharing requirements, and the full 4-node onboarding workflow (Adgas pattern)
# Stargate Tab Consolidation Proposal

## Current Problem (13 tabs)

| # | Tab | Actual Content | Overlap |
|---|---|---|---|
| 1 | Start | Landing cards pointing to other tabs | Redundant — just navigation |
| 2 | Hire Agents | Mosaic agents (6) + fake marketplace listings | Mixes YOUR agents with PLACEHOLDERS |
| 3 | AI Models | HyperInsight AIMs list | Same concept as agents, just different source |
| 4 | Rankings | Leaderboards (agents, skills, AIMs) | Vanity metric — doesn't help DO anything |
| 5 | Train Agents | Training jobs (mostly empty) | Same as "configure agent" |
| 6 | Bundles | Pre-packaged agent teams | Just a filtered view of agents + skills |
| 7 | Skills | 28 marketplace skills | Could be installed from agent context |
| 8 | Compute & Nodes | HyperCycle/Battery Org nodes | Infrastructure, not user-facing daily |
| 9 | Dashboard | Stats + Kanban board | Duplicates Start + Rankings |
| 10 | HyperCycle Node Factories | ANFE management | Same as Compute & Nodes |
| 11 | Midnight City | Midnight blockchain tools | External integration, not core workflow |
| 12 | Buzz | Nostr bridge + channel deploy | External integration |
| 13 | Deploy System | ASP management | Niche, rarely used |

**Root issues:**
- **No unified agent view** — your agents are split across Hire Agents, AI Models, Train Agents
- **No action flow** — you can browse but can't easily "select agent → assign skill → deploy to channel"
- **Duplicate data** — Dashboard shows stats, Rankings shows stats, Start shows stats
- **External integrations isolated** — Buzz and Midnight City are separate tabs instead of being destinations you deploy TO

---

## Proposed Consolidation (5 tabs)

### 1. 🚀 Command Center (merged: Start + Dashboard + Rankings)
**Purpose:** Everything at a glance. This is your home screen.

```
┌─────────────────────────────────────────────────────────────┐
│  Active Agents          Recent Missions        Quick Actions│
│  ┌─────┐ ┌─────┐       Byron → #hpec-stargate  [+ New Mission]
│  │  H  │ │  B  │       (active, 3 messages)    [🔍 Browse Agents]
│  │Hermes│ │Byron│                                [⚡ Install Skill]
│  └─────┘ └─────┘                                [🔌 Connect Node]
│                                                             │
│  ── Compute Status ──        ── Network Pulse ──            │
│  2 nodes online              32 HyperInsight nodes          │
│  340 TFLOPS available        5 AIMs active                  │
│                                                             │
│  ── Recommended Actions ──                                │
│  [ Deploy Byron to Buzz channel ] [ Train Hermes on Solidity ]
│  [ Connect Goose to Stargate ]  [ Buy compute (0.5$/hr) ]  │
└─────────────────────────────────────────────────────────────┘
```

**What you do here:**
- See which agents are running
- See recent missions (agent deployments)
- Take quick actions without digging through tabs
- Monitor compute availability

---

### 2. 🤖 Agent Forge (merged: Hire Agents + AI Models + Train Agents + Local Agents)
**Purpose:** All agents in ONE place. Your agents, local agents, HyperInsight AIMs.

```
┌─────────────────────────────────────────────────────────────┐
│  Your Agents          Local Agents        AIMs (Network)    │
│  ┌─────┐ ┌─────┐     ┌─────┐ ┌─────┐     ┌─────┐ ┌─────┐  │
│  │  H  │ │  B  │     │  H  │ │  G  │     │Dory │ │Goose│  │
│  │Hermes│ │Byron│     │Hermes│ │Goose│     │AIM  │ │AIM  │  │
│  └─────┘ └─────┘     └─────┘ └─────┘     └─────┘ └─────┘  │
│                                                             │
│  ── Selected: Hermes ──                                    │
│  Model: kimi-k2.6    Provider: ollama-cloud    Status: 🟢   │
│                                                             │
│  [ Configure ] [ Assign Skills ] [ Deploy to Channel ] [ Train ]
│                                                             │
│  Skills installed: solidity-analysis, market-research       │
│  Compute: Auto (HyperInsight)                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Sections:**
- **Your Mosaic Agents** (from ai-agents.json) — configurable, deployable
- **Local Agents** — Hermes, Goose, Claude Code detected on your machine
- **AIMs** — HyperInsight network models you can rent

**Unified actions for ANY agent:**
- **Configure** — change model, provider, API key
- **Assign Skills** — pick from skill marketplace
- **Deploy to Channel** — send to Buzz, Mosaic Chat, or compute node
- **Train** — start a training job for this agent

**This is the KEY insight:** Instead of "hiring" vs "training" vs "browsing models", you just pick an agent and decide what to do with it.

---

### 3. ⚡ Skills & Bundles (merged: Skills + Bundles)
**Purpose:** Tool marketplace + agent team templates.

```
┌─────────────────────────────────────────────────────────────┐
│  Popular Skills              Agent Bundles                    │
│  ┌──────────┐ ┌──────────┐  ┌──────────────┐               │
│  │ Solidity │ │ Market   │  │ Dev Team (3) │               │
│  │ Analysis │ │ Research │  │ ── Hermes    │               │
│  │ ⚡ 1.2M  │ │ ⚡ 890K  │  │ ── Goose     │               │
│  └──────────┘ └──────────┘  │ ── Claude    │               │
│                               └──────────────┘               │
│                                                             │
│  [ Install Skill ] [ Create Bundle ] [ Deploy Bundle ]        │
└─────────────────────────────────────────────────────────────┘
```

**What you do here:**
- Install skills that become available to ALL your agents
- Create bundles (pre-configured agent teams)
- Deploy a bundle to a project/channel in one click

---

### 4. 🔌 Compute (merged: Compute & Nodes + HyperCycle Node Factories)
**Purpose:** Infrastructure management. Only open this when you need to add capacity.

```
┌─────────────────────────────────────────────────────────────┐
│  Your Compute                                               │
│  ┌────────────┐ ┌────────────┐                             │
│  │ ANFE #2324 │ │ ANFE #2325 │                             │
│  │ 340 TFLOPS │ │ 120 TFLOPS │                             │
│  │ 🟢 Online  │ │ 🟡 Busy    │                             │
│  └────────────┘ └────────────┘                             │
│                                                             │
│  [ Rent Node ] [ View Factories ] [ Auto-scale ]            │
└─────────────────────────────────────────────────────────────┘
```

**What you do here:**
- See your rented/owned compute nodes
- Rent more capacity
- View ANFE factory status
- Configure auto-scaling

**This is advanced/infrequent.** Most users won't open this daily.

---

### 5. 🌐 Network Hub (merged: Midnight City + Buzz + Deploy System)
**Purpose:** External integrations — where you deploy agents TO.

```
┌─────────────────────────────────────────────────────────────┐
│  Active Connections                                         │
│                                                             │
│  🐝 Buzz                    🌙 Midnight City               │
│  Relay: hpec-stargate...    Wallet: 0x481F...               │
│  Status: 🟢 Connected       ANFEs: 2 (340 TFLOPS)         │
│  Channels: #hpec-stargate   Agents deployed: 1             │
│                                                             │
│  [ Deploy Agent to Channel ] [ View Midnight Dashboard ]    │
│                                                             │
│  ── Deploy Agent ──                                        │
│  Agent: [ Byron ▼ ] → Channel: [ #hpec-stargate ▼ ]       │
│  [ Deploy ]                                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**What you do here:**
- See all external integrations at a glance
- Deploy agents to Buzz channels
- View Midnight City status
- Manage ASP deployments

---

## Connection Points to Mosaic Core

| Mosaic Feature | Stargate Integration |
|---|---|
| **AI Chat** | Agents from Agent Forge appear as chat personas. Selecting an agent in chat opens its config in Agent Forge |
| **Chat Rooms** | Buzz channels appear as chat rooms. Messages flow bidirectionally |
| **Web3 Wallet** | Compute node payments, Midnight City transactions use the same wallet |
| **MCP Servers** | Skills installed from Skills tab register as MCP tools |
| **MosaicBot** | Agent Forge "Deploy" button sends agents to MosaicBot heartbeat system |
| **Tool Sandbox** | Agent skills run in WASM sandbox |
| **Settings → AI Agents** | Same data as Agent Forge "Your Agents" — two views of one source |

---

## The New Flow

```
1. Open Mosaic → Command Center (home)
   → See active agents, recent missions

2. Want to do something? Pick a mission type:
   a) "Deploy agent to Buzz" → Agent Forge → select agent → Network Hub → deploy
   b) "Train agent on new skill" → Agent Forge → select agent → Train
   c) "Install new capability" → Skills & Bundles → install → Agent Forge assigns to agent
   d) "Add compute" → Compute → rent node → Agent Forge auto-uses it

3. Monitor everything → Command Center
```

**Before:** 13 tabs, no clear path, duplicate data
**After:** 5 tabs, each with clear purpose, connected flow

---

## Implementation Priority

1. **Phase 1:** Merge Start + Dashboard + Rankings → Command Center
2. **Phase 2:** Merge Hire Agents + AI Models + Train Agents + Local Agents → Agent Forge
3. **Phase 3:** Merge Skills + Bundles → Skills & Bundles
4. **Phase 4:** Merge Compute + Node Factories → Compute
5. **Phase 5:** Merge Midnight + Buzz + Deploy System → Network Hub

**Each phase is independent.** We can do them one at a time.

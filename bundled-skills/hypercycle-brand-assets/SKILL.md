---
name: hypercycle-brand-assets
description: Build honest HyperCycle brand assets.
version: 1.0
---

# HyperCycle Brand Assets

## Brand Hierarchy

1. **MOSAIC** — The product. Tagline: *My Own SHIELDED AI Companion*
2. **HyperCycle** — The engine powering it. Node Factory Management
3. **Addons** — The ecosystem (MCP, Stargate, etc.)

> NEVER say "MosAIc Companion" or "MOSAIC COMPANION". The product is **Mosaic**.
> NEVER say "Nous Research" on marketing materials.

---

## Approved Color Palette

| Token | Hex | Usage |
|---|---|---|
| Background | `#0a0a1a` | Deep navy-black |
| Primary | `#6C5CE7` | Purple accents, badges |
| Secondary | `#00D4FF` | Cyan CTA, links, glow |
| Accent | `#A78BFA` | Light purple highlights |
| Text | `#FFFFFF` | Headlines |
| Muted | `#94A3B8` | Body copy, descriptions |
| Shield Blue | `#60A5FA` | "SHIELDED" emphasis |

**Typography:** Inter (body), Space Grotesk (headlines)
**NEVER use:** Red `#ff2a2a`, Orbitron, Rajdhani, "Nous Research · 研究"

---

## Honest Messaging Rules

### ❌ NEVER Claim:
- "Multi-chain wallet" — The wallet is blockchain-agnostic in principle but **NOT multi-chain yet**.
- Specific chain tickers (ETH, BTC, Midnight) in feature tags — use ANFE instead.
- Features that don't exist in the current build.

### ✅ ALWAYS Say:
- **"Ethereum node factories"** — not "ETH wallet"
- **"ANFE BASE (Advanced Node Factories Enclosure)"** — the correct infrastructure name
- **"Crypto wallet · Address book"** — accurate current capability
- **"Enable new capabilities into Node Factories"** — not "Automate with node factories"

### Web3 Card Approved Copy:
```
💎 WEB3
Ethereum node factories · ANFE BASE
ANFE · ADVANCED NODE FACTORIES ENCLOSURE
```

---

## Mosaic UI 8-Feature Layout

Match the actual sidebar order in the app:

| # | Feature | Description | Tag |
|---|---|---|---|
| 1 | 💬 **AI CHAT** | Create your first AI Agents within Mosaic | NO-CODE BUILDING |
| 2 | 🧠 **MOSAIC BOT** | Your personal companion · Skills · AI Agents | CREATE AGENTS |
| 3 | 🔗 **MCP SERVERS** | Connect servers · Auto-discover tools | ZERO CONFIG |
| 4 | 👥 **CHAT ROOMS** | Multi-agent collaboration spaces | COLLABORATION |
| 5 | 💎 **WEB3** | Ethereum node factories · ANFE BASE | ANFE |
| 6 | 🔐 **VAULT** | Encrypted storage for addon secrets | AES-256 · AGENT PERMS |
| 7 | 🛡️ **TOOL SANDBOX** | WASM-first · Zero-trust execution | MANIFEST-DRIVEN |
| 8 | ⚙️ **CONFIGURATION** | IDE · Neural Bridges · HyperCycle Grid | CUSTOMIZE |

### Pitfall: Email
- **REMOVE Email Integration** from all graphics. It is not a core feature.

### Pitfall: Node Factories Card
- Do **NOT** create a separate "Node Factories" card. Node Factories live inside:
  - **WEB3** card (ANFE BASE)
  - **CONFIGURATION** card (HyperCycle Grid)

---

## Hero Section Template

```
AI WORKSPACE · NODE FACTORY MANAGEMENT

MOSAIC

My Own SHIELDED AI Companion
Build addons · Bridge your work · Enable new capabilities into Node Factories
Mosaic Companion — Workshops on Discord

[ POWERED BY HYPERCYCLE → ]
```

### Layout Requirements:
- **Hero CTA** must be visible — push cards down (`top: 235px` minimum) so CTA is not behind cards.
- CTA styling: `color: #00D4FF; font-size: 14px; font-weight: 700; letter-spacing: 3px; text-shadow: 0 0 10px rgba(0,212,255,0.5)`

---

## Video Intro/Outro Style (Green Neon)

For compilation videos, use:
- **Background:** `#0a0a0f`
- **Text:** `#00FF88` (green neon) + `#00D4FF` (cyan)
- **Font:** DejaVuSans-Bold.ttf
- **Effect:** Glowing text with `text-shadow: 0 0 20px`
- **Example text:**
  - Intro: "HYPERCYCLE — AI Workspace" / "YOUR VOICE · YOUR FACE · YOUR PRODUCT"
  - Outro: "BUILD YOUR DIGITAL ENTITY" / "NODE FACTORIES · ADDONS · AUTOMATION"

## Video Intro: Clean Dark Minimal (HyperCycle Community Style)

When replicating the HyperCycle community update video intro style:
- **Background:** `#0a0a1a` (dark navy-black)
- **Title:** Large bold text centered, simple fade in/out
- **Subtitle:** Smaller text below title
- **Style:** No flashy animations, no particle effects, no complex transitions
- **Duration:** 4–6 seconds typical
- **Font:** DejaVuSans-Bold.ttf or Space Grotesk Bold

### Pitfall: Dark Background Color
Use `color=c=0x0a0a1a` in ffmpeg. Do NOT use `0x0a0a0f` (brownish tint) or `geq` filters that produce yellow/green casts.

### Example: 5-Second Workshop Intro
```
MOSAIC                              (purple #6C5CE7, fades in 0.5–1.5s)
COMPANION                           (cyan #00D4FF, fades in 1.0–2.0s)
Community Weekly Workshops           (light purple #A78BFA, fades in 1.5–2.5s)
```
Fade out begins at 3.5s, fully gone by 4.0s.

---

## Discord Stage / Workshop Content

### Twitter/X Post Templates for Weekly Workshops

See `references/twitter-workshop-templates.md` for ready-to-copy posts.

Quick options (all under 280 chars):
- **Option 1 (Direct Invite):** "Weekly MosAIc Companion Workshops are LIVE! Calling all Node Factory Owners..."
- **Option 2 (Community-Centric):** "Every week we host MosAIc Companion Workshops for the HyperCycle community..."
- **Option 3 (Short & Punchy):** "Weekly MosAIc Workshops. For Node Factory Owners building on HyperCycle..."
- **Option 4 (Vision-Focused):** "The MosAIc Companion Workshops are our open door to Node Factory Owners..."
- **Option 5 (Ultra-Short):** "Weekly Workshops. Node Factory Owners building on HyperCycle — this is your stage..."

### Workshop Graphic Requirements
When creating workshop promotion graphics, use the actual Mosaic UI sidebar order:
1. AI Chat
2. Mosaic Bot
3. MCP Servers
4. Chat Rooms
5. Web3
6. Vault
7. Tool Sandbox
8. Configuration

> REMOVE Email Integration entirely.
> Do NOT create a separate "Node Factories" card — Node Factories live inside Web3 and Configuration.

---

## Terminology Glossary

| Term | Meaning | Notes |
|---|---|---|
| Mosaic | The product / AI Workspace | NOT "MosAIc Companion" |
| HyperCycle | The network/engine powering Mosaic | NOT the product name |
| ANFE | Advanced Node Factories Enclosure | The Web3 infrastructure |
| Node Factories | Worker nodes in the HyperCycle network | Visualized in Graph & Loops |
| Addons | Stargate plugins / MCP tools / third-party integrations | NOT "Stargate" as product |
| Graph | Visual node topology | Stargate addon feature |
| Loops | Pre-built agent workflows | Stargate addon feature |

---

## Export Pipeline

```bash
# HTML → PNG (Chrome headless)
google-chrome --headless --disable-gpu --no-sandbox \
  --screenshot=output.png --window-size=1200,675 \
  --virtual-time-budget=5000 file:///path/to/graphic.html

# PNG → JPG
ffmpeg -y -i input.png -q:v 2 -pix_fmt yuvj420p output.jpg
```

---

## References

- `references/terminology-glossary.md` — Full term definitions and banned phrases
- `references/honest-messaging-guide.md` — What to claim vs avoid per feature
- `references/twitter-workshop-templates.md` — Ready-to-copy Twitter/X posts for weekly workshops
- `references/discord-recording-guide.md` — OBS setup for Discord Stage recording
- `references/video-highlight-reel-pipeline.md` — Extract highlights from long workshop recordings
- `templates/hero-section.html` — Pre-built hero HTML snippet
- `templates/feature-cards.html` — 8-feature card grid HTML

## Version

v1.1 — Updated with Discord Stage recording and video highlight pipeline (2026-08-28)

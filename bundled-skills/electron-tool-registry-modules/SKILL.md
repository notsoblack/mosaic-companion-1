---
name: electron-tool-registry-modules
description: Add ToolRegistry modules for Electron agent tools.
trigger: Add a tool to an Electron app so an AI agent can call it; agent can't emit <use_tool> XML; need to enable agent to control a UI component from chat.
---

# Electron Tool Registry Modules

Enable AI agents inside Electron desktop apps (Mosaic Companion, etc.) to discover and invoke application capabilities through a unified ToolRegistry.

## When to Use This Skill

- You need an AI agent to control a UI component, panel, or backend service from chat
- The model (e.g. kimi-k2.6) cannot reliably emit `<use_tool>` XML tags
- You're adding IPC methods in `preload.ts` and need to expose them to the agent
- You need to upgrade an agent's capabilities (soul, skills, vault access)

## Architecture Overview

```
User Chat Input
      ↓
[Auto-Dispatch] Detects keywords → Proactively calls tools → Injects results
      ↓
[System Prompt] Tool descriptions + ABSOLUTE MANDATE to call tools
      ↓
LLM (kimi-k2.6) → May or may not emit <use_tool> XML
      ↓
[ActionParser] Regex extracts <use_tool server="x" tool="y">{args}</use_tool>
      ↓
[ToolRegistry] Routes to module.handler()
      ↓
Module calls window.electronAPI.* → IPC → Main Process
      ↓
[Result Injection] [Tool Output] added to conversation context
      ↓
LLM synthesizes final response using real data
```

## Three Tool Layers in Electron Apps

| Layer | Access | Examples | Availability |
|-------|--------|----------|--------------|
| **Layer 1: MCP Servers** | `window.electronAPI.mcpAPI.callTool()` | External servers (Midnight, Trading) | Requires MCP client |
| **Layer 2: Built-in ToolRegistry** | `window.electronAPI.tools.execute()` | Gmail, Web3, Vault, custom modules | Always available |
| **Layer 3: Hermes Native** | `terminal`, `file_read`, etc. | Only in Hermes Agent runtime | NOT in Electron renderer |

**Critical insight**: Layer 3 (terminal, file ops, browser) is NOT available in Electron renderer contexts. Agents in Mosaic Companion only get Layers 1+2.

## Step 1: Add IPC Methods to Preload

In `electron/preload.ts`, expose methods under a namespace:

```typescript
myFeature: {
  doAction: (params: { key: string }) =>
    ipcRenderer.invoke("my-feature:do-action", params),
  getStatus: () =>
    ipcRenderer.invoke("my-feature:get-status"),
}
```

In `electron/main.ts`, handle the IPC:

```typescript
ipcMain.handle("my-feature:do-action", async (_event, params) => {
  // Implementation here
  return { success: true, data: result };
});
```

## Step 2: Create ToolRegistry Module

Create `electron/integrations/tools/modules/my-feature.ts`:

```typescript
import type { ToolModule, ToolDefinition } from "../types";

const TOOLS: ToolDefinition[] = [
  {
    name: "my_feature_do_action",
    description: "Do the thing. Use when user asks for X.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "The key" },
      },
      required: ["key"],
    },
    handler: async (args: { key: string }) => {
      try {
        const result = await (window as any).electronAPI?.myFeature?.doAction(args);
        if (!result?.success) {
          return { success: false, error: result?.error || "Failed" };
        }
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  },
];

export class MyFeatureModule implements ToolModule {
  name = "my-feature";
  displayName = "My Feature";
  actionPatterns = [];
  tools = TOOLS;

  getSystemPrompt(): string {
    return `Context about my feature. When to use it. Constraints.`;
  }

  async isAvailable(): Promise<boolean> {
    return !!(window as any).electronAPI?.myFeature;
  }
}
```

## Step 3: Register in ToolRegistry

In `electron/integrations/tools/index.ts`:

```typescript
import { MyFeatureModule } from "./modules/my-feature";

registry.register(new MyFeatureModule());
```

## Step 4: Add Auto-Dispatch (CRITICAL for kimi-k2.6)

**kimi-k2.6 and similar models cannot reliably emit `<use_tool>` XML.**

In `src/components/Chatview.tsx`, add keyword detection:

```typescript
// Intent: My Feature
const isMyFeatureQuery = /\bmy feature\b|\bdo thing\b/i.test(lowerMsg);
if (isMyFeatureQuery) {
  try {
    const status = await window.electronAPI?.myFeature?.getStatus?.();
    if (status) {
      autoDispatchedResults.push({
        role: "tool",
        content: `MY FEATURE STATUS\n════════════════\n${JSON.stringify(status, null, 2)}`
      });
    }
  } catch (e) {
    console.error("[AutoDispatch] My feature failed:", e);
  }
}
```

**Auto-dispatch pattern**: Detect user intent via regex → proactively call tools → inject results as `[Auto-Retrieved Data]` system messages → LLM responds with real data even if it never emits XML.

## Step 5: Upgrade Agent Config

Edit `~/.config/mosaic-companion/ai-agents.json`:

```json
{
  "id": "agent-id",
  "name": "Byron",
  "provider": "ollama-cloud",
  "model": "kimi-k2.6",
  "soulId": "executor",
  "skills": ["my-feature-skill", "related-skill"],
  "richUI": true,
  "maxTokens": 8192,
  "boxAccess": ["box-my-feature-docs"]
}
```

**Soul archetypes**:
| Soul | Added Tools |
|------|-------------|
| `researcher` | web_search, browser, file_read, session_search |
| `executor` | +terminal, file_write, file_patch, code_execution, kanban |
| `creative` | image_gen, audio_gen, design tools |
| `guardian` | security, audit, compliance tools |

**Always use `executor` for coding/automation tasks.**

## Step 6: Create Vault Knowledge Box

Create a box with instructions for the agent:

```python
import json

box = {
  "id": "box-my-feature-xxx",
  "name": "My Feature Agent Control",
  "description": "Complete docs for controlling My Feature",
  "entries": [
    {
      "id": "entry-1",
      "label": "API Reference",
      "content": "Endpoints, payloads, auth flow...",
      "createdAt": 1234567890
    }
  ]
}
```

Grant agent access by adding box ID to `agent.boxAccess` array.

## Pitfalls

1. **Never assume the model emits XML.** Always implement auto-dispatch for critical intents. kimi-k2.6 will describe plans in prose without calling tools.

2. **handler() runs in renderer context.** No Node fs/path. Use IPC for file operations.

3. **Skills array needs SPECIFIC names.** Not categories. Use `"midnight-city-stargate-integration"` not `"midnight"`.

4. **Tool names use underscores.** `stargate_dispatch_prompt` not `stargate:dispatchPrompt`.

5. **isAvailable() must be fast.** Don't do heavy checks here — it runs for every system prompt build.

6. **System prompt has token budget.** The ToolRegistry.getSystemPrompt() auto-truncates. Keep module descriptions concise.

## Verification

After implementing, test with:
```
"Use my-feature to check status"
```

Expected behavior:
1. Auto-dispatch fires (if keyword matches)
2. OR ActionParser catches `<use_tool server="my-feature" tool="...">`
3. ToolRegistry routes to module
4. IPC calls main process
5. Result injected as `[Tool Output]`
6. Agent responds with real data

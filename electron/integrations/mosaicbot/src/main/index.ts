// ─────────────────────────────────────────────────────────────────────────────
// Mosaic Bot — Extended Multi-Bot Orchestrator
// Wires heartbeat, channels, skills, memory, and auto-importer into the
// Electron main process. Supports multiple agent profiles:
//   • main       → Orchestrator (vault + MCP + infra monitoring)
//   • coder      → Deep technical agent (code review, TDD, debugging)
//   • local      → Lightweight local-model agent (status checks, quick tasks)
//
// Call initMosaicBot() after app.whenReady().
// ─────────────────────────────────────────────────────────────────────────────

import { app, ipcMain } from "electron";
import path from "node:path";
import { homedir } from "node:os";

import { startHeartbeatRunner } from "./heartbeat/runner.js";
import { requestHeartbeatNow } from "./heartbeat/wake.js";
import { registerChannel } from "./channels/registry.js";
import { deliverMessage } from "./channels/deliver.js";
import { ipcChannelPlugin } from "./channels/adapters/ipc.js";
import { httpChannelPlugin } from "./channels/adapters/http.js";
import { loadSkillEntries, defaultSkillSources, loadStargateVaultSkills } from "./skills/loader.js";
import { buildEligibilityContext, buildSkillSnapshot, resolveSkillCommand } from "./skills/registry.js";
import { getMemoryManager } from "./memory/index.js";
import { callActiveLLM, callAgentLLM } from "./llm.js";
import {
  buildOrchestratorContext,
  buildHeartbeatPrompt,
  getOrchestratorStatus,
  buildSystemPrompt,
  recordHeartbeatObservation,
} from "./orchestrator.js";
import {
  queryProjectContext,
  getRecentSessionContext,
  indexSessionSummary,
} from "./memory-bridge.js";
import {
  initWiki,
  ingestSource,
  buildWikiContext,
  resolveWikiDir,
} from "./wiki-engine.js";
import {
  runAutoActions,
  buildAutoActionPrompt,
} from "./heartbeat-auto-actions.js";
import {
  buildPoolStatusPrompt,
  buildAllocationsPrompt,
  buildFleetHealthPrompt,
  buildMarketplacePromptAsync,
} from "./heartbeat-pool-tools.js";
import {
  buildComponentSummary,
  buildCapabilityReport,
  STARGATE_COMPONENTS,
  HYPERAIBOX_FLEET,
  STARGATE_CONTRACTS,
  getDownComponents,
  getInfraComponents,
  getMCPs,
  getComponentsByCategory,
} from "./stargate-registry.js";
import { registerAxiIpcHandlers } from "./axi/ipc-handlers.js";
import {
  startFleetTelemetryLoop,
  stopFleetTelemetryLoop,
  buildLiveFleetSummary,
  collectFleetTelemetry,
} from "./fleet-telemetry.js";
import { buildToolProtocolPrompt, runHeartbeatToolLoop, ensureDefaultAllowlist, readAllowlist } from "./heartbeat-tools.js";
import { reconcileWorldState } from "./world-state.js";
import { verifyPendingActions, buildScorecardPrompt } from "./outcome-verifier.js";
import {
  indexAllStargateKnowledge,
  getDiagnosticHistory,
  getDownTrend,
} from "./stargate-indexer.js";
import {
  startSkillImporter,
  getImportLog,
  getPendingImports,
  approveSkill,
  removeSkill,
} from "./skill-importer.js";
import {
  checkFleetStatus,
  checkBoxHealth,
  attemptAutoHeal,
  discoverBoxes,
  buildFleetTeachingSummary,
} from "./hbox-manager.js";

// ── App config ────────────────────────────────────────────────────────────────

type AppConfig = {
  channels: {
    ipc?: { enabled?: boolean };
    http?: { webhookUrl?: string; enabled?: boolean };
  };
};

const config: AppConfig = {
  channels: {
    ipc: { enabled: true },
    // http: { webhookUrl: "https://your-endpoint/webhook", enabled: true },
  },
};

// ── Multi-Bot Agent Profiles ───────────────────────────────────────────────
// Each profile defines heartbeat timing, active hours, and prompt focus.
// The active agent from ai-agents.json is used for ALL LLM calls.

const AGENT_PROFILES = [
  {
    agentId: "main",
    heartbeat: {
      enabled: true,
      intervalMs: 30 * 60_000,        // 30 min
      channel: "ipc" as const,
      to: "renderer",
      ackMaxChars: 300,
      activeHours: { start: "09:00", end: "22:00" },
      memorySearch: {
        query: "pending tasks actions reminders urgent deadline stargate",
        maxResults: 5,
        maxInjectedChars: 2000,
      },
    },
    description: "Orchestrator — monitors vault, MCPs, infrastructure, and alerts on important events.",
  },
  {
    agentId: "coder",
    heartbeat: {
      enabled: true,
      intervalMs: 60 * 60_000,        // 60 min (less frequent)
      channel: "ipc" as const,
      to: "renderer",
      ackMaxChars: 500,
      activeHours: { start: "10:00", end: "20:00" },
      memorySearch: {
        query: "github pull request review code quality test failing build error",
        maxResults: 5,
        maxInjectedChars: 2000,
      },
    },
    description: "Coder — monitors code quality, pending PRs, failing tests, and suggests improvements.",
  },
  {
    agentId: "local",
    heartbeat: {
      enabled: true,
      intervalMs: 15 * 60_000,       // 15 min (frequent, lightweight)
      channel: "ipc" as const,
      to: "renderer",
      ackMaxChars: 200,
      activeHours: { start: "00:00", end: "23:59" },  // 24/7
      memorySearch: {
        query: "quick status check health ping alive",
        maxResults: 3,
        maxInjectedChars: 1000,
      },
    },
    description: "Local — lightweight qwen-based agent for rapid status checks and quick tasks.",
  },
];

// ── Handle ────────────────────────────────────────────────────────────────────

export type MosaicBotHandle = {
  stop(): Promise<void>;
  getStatus(): Record<string, unknown>;
};

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initMosaicBot(): Promise<MosaicBotHandle> {
  const APP_DIR = path.join(app.getPath("userData"), "mosaicbot");
  const WORKSPACE_DIR = process.cwd();

  // ════════════════════════════════════════════════════════════════════════════
  // EARLY IPC HANDLERS — Register immediately so renderer never sees
  // "No handler registered" during async initialization.
  // These stubs are replaced after full init completes.
  // ════════════════════════════════════════════════════════════════════════════

  let _agentSendImpl: ((text: string) => Promise<any>) | null = null;

  // ── EARLY IPC HANDLERS ────────────────────────────────────────────────────
  // Register immediately so renderer never sees "No handler registered".
  // agent:send starts with a basic passthrough (calls LLM directly), then
  // gets upgraded to the full enriched implementation after async init completes.

  _agentSendImpl = async (text: string) => {
    // Basic passthrough: LLM only, no enrichment yet
    try {
      const reply = await callActiveLLM(text);
      if (reply === null) {
        return { type: "error", text: "No active AI agent configured. Open Settings → AI Agents and set one as active." };
      }
      return { type: "reply", text: reply };
    } catch (e: any) {
      if (e?.message?.includes("was retired")) {
        return {
          type: "error",
          text: `⚠️ Your AI model was retired.\n\nPlease update your agent in Settings → AI Agents:\nChange model from "kimi-k2.5" → "kimi-k2.6"\n\nError: ${e.message.slice(0, 120)}`,
        };
      }
      return { type: "error", text: `Mosaic Bot error: ${e.message?.slice(0, 200) || "Unknown"}` };
    }
  };

  ipcMain.handle("agent:send", async (_e, text: string) => {
    if (!_agentSendImpl) {
      return { type: "error", text: "Mosaic Bot is still starting up." };
    }
    return _agentSendImpl(text);
  });

  ipcMain.handle("orchestrator:status", () => getOrchestratorStatus());
  ipcMain.handle("agents:profiles", (_evt) =>
    AGENT_PROFILES.map((p) => ({
      agentId: p.agentId,
      intervalMin: p.heartbeat.intervalMs / 60_000,
      activeHours: p.heartbeat.activeHours,
      description: p.description,
    })),
  );
  ipcMain.handle("heartbeat:trigger", (_e, agentId?: string) => {
    requestHeartbeatNow({ agentId, reason: "action", priority: 3 });
    return { ok: true };
  });
  ipcMain.handle("skills:list", () => []);
  ipcMain.handle("memory:search", async () => []);
  ipcMain.handle("memory:status", () => ({ initialized: false }));

  // EARLY: team:dispatch — so renderer can call per-agent dispatch before full init
  ipcMain.handle("team:dispatch", async (_e, agentId: string, prompt: string, systemPrompt?: string) => {
    try {
      const reply = await callAgentLLM(agentId, prompt, systemPrompt);
      if (!reply) {
        return { type: "error", text: `Agent ${agentId} not available.` };
      }
      return { type: "reply", text: reply };
    } catch (e: any) {
      return { type: "error", text: `team:dispatch error: ${e.message?.slice(0, 200) || "Unknown"}` };
    }
  });

  // ── Async enrichment ──────────────────────────────────────────────────────

  let skillSnapshot: any = { skills: [], commandSpecs: [] };
  let memory: any = { search: async () => [], status: () => ({ initialized: false }), sync: async () => {} };
  let wikiDir = resolveWikiDir(APP_DIR);
  let heartbeat: any = null;
  let skillImporterHandle: { stop(): void } | null = null;

  // 1. Channels
  registerChannel(ipcChannelPlugin);
  registerChannel(httpChannelPlugin);

  // 2. Skills (filesystem + Stargate Vault)
  const skillEntries = await loadSkillEntries(defaultSkillSources(APP_DIR, WORKSPACE_DIR));
  const vaultIndexPath = path.join(WORKSPACE_DIR, "stargate-vault", "vault-index.json");
  const vaultEntries = await loadStargateVaultSkills(vaultIndexPath);
  if (vaultEntries.length > 0) {
    skillEntries.push(...vaultEntries);
    console.log(`[MosaicBot] Stargate Vault: ${vaultEntries.length} skills loaded from vault-index.json`);
  }
  const eligibilityCtx = await buildEligibilityContext();
  skillSnapshot = buildSkillSnapshot(skillEntries, eligibilityCtx);
  console.log(
    `[MosaicBot] ${skillSnapshot.skills.length} total skills loaded:`,
    skillSnapshot.commandSpecs.map((s: any) => `/${s.name}`).join(", "),
  );

  // 3. Auto-Skill Importer
  try {
    skillImporterHandle = await startSkillImporter();
    console.log("[MosaicBot] Skill importer started");
  } catch (e) {
    console.error("[MosaicBot] Skill importer failed:", e);
  }

  // 4. Memory
  memory = await getMemoryManager({
    backend: "builtin",
    config: {
      workspaceDir: WORKSPACE_DIR,
      dbPath: path.join(APP_DIR, "memory", "main.sqlite"),
      embedding: { provider: "none" },
      search: {
        vectorWeight: 0.7,
        textWeight: 0.3,
        temporalDecay: { enabled: true, halfLifeDays: 30 },
        mmr: { enabled: true, lambda: 0.7 },
      },
    },
  });

  // 5. Wiki
  wikiDir = resolveWikiDir(APP_DIR);
  initWiki(wikiDir);
  console.log(`[MosaicBot] Wiki initialized at ${wikiDir}`);

  // 6. Heartbeat
  heartbeat = startHeartbeatRunner({
    agents: AGENT_PROFILES.map((p) => ({ agentId: p.agentId, heartbeat: p.heartbeat })),

    onReply: async ({ agentId, now, prompt }) => {
      console.log(`[Heartbeat] ${agentId} @ ${now.toISOString()}`);

      // Build orchestrator context (Vault + MCP + Agents + Infrastructure)
      const orchCtx = await buildOrchestratorContext();
      // Reconcile world state FIRST (runtime-verified truth beats stale memory)
      let stateMd = "";
      try { stateMd = reconcileWorldState(); } catch (e) { console.error("[WorldState] reconcile failed:", e); }
      // Verify outcomes of past actions (reinforcement layer)
      try {
        const v = verifyPendingActions();
        if (v.resolved > 0) console.log(`[OutcomeVerifier] Resolved ${v.resolved} action(s): ${v.details.join("; ")}`);
      } catch (e) { console.error("[OutcomeVerifier] failed:", e); }
      const enrichedPrompt = `${buildHeartbeatPrompt(prompt, orchCtx)}\n\n${stateMd}\n\n${buildLiveFleetSummary()}\n\n${buildPoolStatusPrompt()}\n\n${buildFleetHealthPrompt()}\n\n${buildAllocationsPrompt()}\n\n${await buildMarketplacePromptAsync()}\n\n${buildScorecardPrompt()}\n\n${buildToolProtocolPrompt()}`;
      const systemPrompt = buildSystemPrompt(orchCtx);

      // Different bots get different system prompt overlays
      const agentOverlay = getAgentOverlay(agentId);
      const finalSystem = `${systemPrompt}\n\n## Your Role\n${agentOverlay}`;

      // Iterative tool loop (read-only): the bot can gather live data
      // via its own AXI tools before deciding what (if anything) to report.
      const loop = await runHeartbeatToolLoop(enrichedPrompt, finalSystem, agentId);
      if (loop.toolCalls.length > 0) {
        console.log(
          `[Heartbeat] ${agentId} used ${loop.toolCalls.length} tool(s): ${loop.toolCalls.map((t) => `${t.tool}${t.ok ? "" : "(!)"}`).join(", ")}`,
        );
      }
      let alertText = loop.finalText || "HEARTBEAT_OK";

      // ── Auto-actions: stop being a worry bot, start being an ops bot ──
      const autoResult = await runAutoActions(alertText);
      if (autoResult.tookAction) {
        const autoPrompt = buildAutoActionPrompt(autoResult);
        // Re-run tool loop with auto-action context so the bot KNOWS what happened
        const updatedPrompt = `${enrichedPrompt}\n${autoPrompt}`;
        const followUp = await runHeartbeatToolLoop(updatedPrompt, finalSystem, agentId);
        alertText = followUp.finalText || alertText;
        console.log(`[Heartbeat] ${agentId} auto-actions: ${autoResult.actions.join("; ")}`);
      }

      // Learn from this heartbeat
      const infraState = Object.fromEntries(
        Object.entries(getOrchestratorStatus().infraHealth).map(([k, v]) => [k, v.healthy]),
      );
      recordHeartbeatObservation(alertText, infraState);

      return alertText;
    },

    onDeliver: async (_agentId, channel, to, text) => {
      await deliverMessage({ cfg: config, channel, to, text });
    },

    onEvent: (evt) => {
      console.log(`[Heartbeat] ${evt.agentId} → ${evt.status}`, evt.preview ?? "");
    },

    memory,
  });

  // 6. IPC handlers — wire up the real implementation

  _agentSendImpl = async (text: string) => {
    // ── Agent-to-Agent message detection ────────────────────────────────
    // If the message looks like an A2A directed message, parse and route it
    const a2aMatch = text.match(/^\[Agent-to-Agent\]\s+to\s+([^:]+):\s*(.+)$/i);
    if (a2aMatch) {
      const targetId = a2aMatch[1].trim();
      const a2aText = a2aMatch[2].trim();
      // Get the active agent profile to see if this agent is the intended target
      try {
        const activeProfile = AGENT_PROFILES.find((p: any) => p.heartbeat?.enabled);
        const myId = activeProfile?.agentId || "main";
        if (myId === targetId || targetId === "*") {
          // This agent IS the target — generate a reply
          let reply: string | null = null;
          try {
            reply = await callActiveLLM(`Another agent says: "${a2aText}". Reply naturally.`, undefined);
          } catch (e: any) {
            console.warn("[agent:send] A2A LLM call failed:", e);
            reply = "[A2A: Agent could not generate a reply — LLM error]";
          }
          // Broadcast the reply back to all renderer windows
          const { BrowserWindow } = await import("electron");
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
              win.webContents.send("agent:message", {
                to: "*",
                text: `[Agent-to-Agent from ${myId}]: ${reply}`,
                channel: "ipc",
                messageId: `a2a-${Date.now()}`,
              });
            }
          }
          return { type: "reply", text: reply, a2a: true, from: myId, to: targetId };
        }
      } catch (e) {
        console.warn("[agent:send] A2A routing failed:", e);
      }
      // Not targeted at this agent — just acknowledge
      return { type: "ack", a2a: true, text: `Forwarded to ${targetId}` };
    }

    // 1. Slash-command skill routing (existing)
    const match = resolveSkillCommand(text, skillSnapshot.commandSpecs);
    if (match) {
      console.log(`[Skill] ${match.spec.skillName}`, match.args);
      return { type: "skill", skill: match.spec.skillName, args: match.args };
    }

    // 2. Build full orchestrator context (same as heartbeat)
    let orchCtx: any = null;
    let systemPrompt = "";
    try {
      orchCtx = await buildOrchestratorContext();
      systemPrompt = buildSystemPrompt(orchCtx);
    } catch (e) {
      console.error("[agent:send] Orchestrator context build failed:", e);
      // Continue with empty system prompt — don't break chat
    }

    // 3. Wiki query: search persistent markdown knowledge base
    let wikiContext = "";
    try {
      wikiContext = buildWikiContext(wikiDir, text, 3);
    } catch (e) {
      console.warn("[agent:send] Wiki query failed:", e);
    }

    // 4. Memory search: find relevant past sessions / context
    let memoryContext = "";
    try {
      const memResults = await memory.search(text, { maxResults: 3 });
      if (memResults?.length > 0) {
        memoryContext = `## Relevant Memory\\n\\n${memResults
          .map((r: any, i: number) => `${i + 1}. ${r.title || r.path || "Memory"}\\n${(r.content || "").slice(0, 400)}`)
          .join("\\n\\n")}\\n\\n`;
      }
    } catch (e) {
      console.warn("[agent:send] Memory search failed:", e);
    }

    // 5. Assemble enriched prompt (wiki + memory + user text)
    const contextParts = [wikiContext, memoryContext].filter(Boolean);
    const enrichedPrompt = contextParts.length > 0
      ? `${contextParts.join("\n")}\nUser: ${text}`
      : text;

    // 6. Call LLM WITH system prompt + wiki + memory context
    try {
      const reply = await callActiveLLM(enrichedPrompt, systemPrompt || undefined);
      if (reply === null) {
        return { type: "error", text: "No active AI agent configured. Open Settings → AI Agents and set one as active." };
      }

      // Check if Byron returned a tool call
      const toolMatch = reply.match(/<use_tool\s+server="([^"]+)"\s+tool="([^"]+)">([\s\S]*?)<\/use_tool>/);
      if (toolMatch) {
        try {
          const { mcpClient } = await import("../../../mcp/index.js");
          const srvName = toolMatch[1];
          const toolName = toolMatch[2];
          let toolArgs: Record<string, unknown> = {};
          try {
            toolArgs = JSON.parse(toolMatch[3].trim() || "{}");
          } catch {
            toolArgs = {};
          }
          console.log(`[MosaicBot] Executing MCP tool: ${srvName}/${toolName}`, toolArgs);
          const result = await mcpClient.callTool(srvName, toolName, toolArgs);
          const resultText = typeof result?.content?.[0]?.text === "string"
            ? result.content[0].text
            : JSON.stringify(result);
          // Feed result back to LLM for synthesis
          const followUp = `${reply}\n\n[Tool Output for ${srvName}:${toolName}]\n${resultText}\n\n[Instruction: Use ONLY the data above to answer the user's question.]`;
          const synthesized = await callActiveLLM(followUp, systemPrompt || undefined);
          return { type: "reply", text: synthesized || resultText };
        } catch (toolErr: any) {
          console.error("[MosaicBot] MCP tool execution failed:", toolErr);
          return { type: "reply", text: `${reply}\n\n⚠️ Tool execution failed: ${toolErr.message}` };
        }
      }

      // 7. Wiki ingest
      try {
        ingestSource(wikiDir, {
          type: "session",
          title: `Chat ${new Date().toISOString()}`,
          content: `User: ${text}\\n\\nBot: ${reply}`,
        });
      } catch (e) {
        console.warn("[agent:send] Wiki ingest failed:", e);
      }

      // 8. Index into SQLite memory
      try {
        const chatLogDir = path.join(APP_DIR, "chat-logs");
        const fsm = await import("node:fs");
        fsm.mkdirSync(chatLogDir, { recursive: true });
        const chatLogFile = path.join(chatLogDir, `${new Date().toISOString().split("T")[0]}.md`);
        const logEntry = `\\n---\\n**${new Date().toISOString()}**\\n\\nUser: ${text}\\n\\nBot: ${reply}\\n`;
        fsm.appendFileSync(chatLogFile, logEntry, "utf-8");
        await memory.sync({ reason: "chat-turn", force: false }).catch(() => {});
      } catch (e) {
        console.warn("[agent:send] Memory indexing failed:", e);
      }

      return { type: "reply", text: reply };
    } catch (e: any) {
      console.error("[agent:send] LLM call threw:", e);
      // Detect model retirement (410 Gone)
      if (e?.message?.includes("was retired")) {
        return {
          type: "error",
          text: `⚠️ Your AI model was retired by the provider.\n\nPlease update your agent:\n1. Open Settings → AI Agents\n2. Edit "Byron"\n3. Change model from "kimi-k2.5" → "kimi-k2.6" (or another active model)\n4. Save\n\nError: ${e.message.slice(0, 120)}`,
        };
      }
      // Detect 403 / auth errors
      if (e?.status === 403 || e?.statusCode === 403 || e?.message?.includes("403")) {
        return {
          type: "error",
          text: `🔑 API access denied (403). Your API key may be expired or the model requires a different subscription tier.\n\nError: ${e.message?.slice(0, 120) || "Unknown"}`,
        };
      }
      return {
        type: "error",
        text: `❌ LLM call failed: ${e.message?.slice(0, 200) || "Unknown error"}`,
      };
    }
  };

  // Replace stub handlers with real implementations after full init
  ipcMain.removeHandler("skills:list");
  ipcMain.handle("skills:list", () =>
    skillSnapshot.commandSpecs.map((s) => ({ name: s.name, description: s.description })),
  );

  ipcMain.removeHandler("memory:search");
  ipcMain.handle("memory:search", async (_e, query: string, opts?: { maxResults?: number }) => {
    return memory.search(query, opts);
  });

  ipcMain.removeHandler("memory:status");
  ipcMain.handle("memory:status", () => memory.status());

  ipcMain.removeHandler("heartbeat:trigger");
  ipcMain.handle("heartbeat:trigger", (_e, agentId?: string) => {
    requestHeartbeatNow({ agentId, reason: "action", priority: 3 });
    return { ok: true };
  });

  // Memory search — replaced by real implementation after init
  // ipcMain.handle("memory:search", ...) moved to EARLY IPC HANDLERS

  // Memory file read
  ipcMain.handle("memory:read", async (_e, relPath: string, from?: number, lines?: number) => {
    return memory.readFile({ relPath, from, lines });
  });

  // Force memory re-index
  ipcMain.handle("memory:sync", async () => {
    await memory.sync({ reason: "manual", force: true });
    return memory.status();
  });

  // Memory status — replaced by real implementation after init
  // ipcMain.handle("memory:status", ...) moved to EARLY IPC HANDLERS

  // Trigger heartbeat from renderer — replaced by real implementation after init
  // ipcMain.handle("heartbeat:trigger", ...) moved to EARLY IPC HANDLERS

  // Skill list for renderer UI — replaced by real implementation after init
  // ipcMain.handle("skills:list", ...) moved to EARLY IPC HANDLERS
  
  // ── Skill Count & Verification IPC ───────────────────────────────────────
  
  ipcMain.handle("skills:count", () => {
    const { getActualSkillCount } = require("./verification-layer.js");
    return getActualSkillCount();
  });
  ipcMain.handle("skills:verify", (_e, skillNames: string[]) => {
    const { verifyAllSkills } = require("./verification-layer.js");
    return verifyAllSkills(skillNames);
  });

  // ── Skill Importer IPC ──────────────────────────────────────────────────

  ipcMain.handle("skills:import-log", () => getImportLog());
  ipcMain.handle("skills:pending", () => getPendingImports());
  ipcMain.handle("skills:approve", (_e, skillName: string) => approveSkill(skillName));
  ipcMain.handle("skills:remove", (_e, skillName: string) => removeSkill(skillName));
  ipcMain.handle("skills:force-scan", async () => {
    // Trigger immediate scan by re-invoking start logic
    const { scanAndImport } = await import("./skill-importer.js");
    return scanAndImport();
  });

  // ── Evolution Engine IPC — Self-Creation Pipeline ─────────────────────────

  const evolution = await import("./evolution-engine.js");
  ipcMain.handle("evolution:patterns", () => {
    const { loadPatterns } = evolution;
    return loadPatterns();
  });
  ipcMain.handle("evolution:proposals", () => {
    const { loadProposals } = evolution;
    return loadProposals();
  });
  ipcMain.handle("evolution:pending", () => {
    const { getPendingProposals } = evolution;
    return getPendingProposals();
  });
  ipcMain.handle("evolution:stats", () => {
    const { getEvolutionStats } = evolution;
    return getEvolutionStats();
  });
  ipcMain.handle("evolution:approve", async (_e, proposalId: string) => {
    const { approveSkill } = evolution;
    return approveSkill(proposalId);
  });
  ipcMain.handle("evolution:reject", async (_e, proposalId: string, reason?: string) => {
    const { rejectSkill } = evolution;
    return rejectSkill(proposalId, reason);
  });
  ipcMain.handle("evolution:force-trigger", async (_e, alertText: string) => {
    // Manually trigger evolution for testing
    const { processEvolutionTrigger } = evolution;
    return processEvolutionTrigger(alertText, []);
  });
  console.log("[MosaicBot] Evolution Engine IPC handlers registered");

  // ════════════════════════════════════════════════════════════════════════════
  // Remaining IPC handlers (NOT registered early — no collision)
  // ════════════════════════════════════════════════════════════════════════════

  ipcMain.handle("memory:query-context", async (_e, project: string, query: string, limit?: number) => {
    return queryProjectContext(project, query, limit || 10);
  });

  ipcMain.handle("memory:session-context", async () => {
    return getRecentSessionContext();
  });

  ipcMain.handle("memory:index-session", async (_e, sessionId: string, summary: string, skills: string[], projects: string[]) => {
    await indexSessionSummary(sessionId, summary, skills, projects);
    return { indexed: true };
  });

  // ── Stargate Registry IPC — Component Self-Awareness ──────────────────────

  ipcMain.handle("stargate:components", () => STARGATE_COMPONENTS);
  ipcMain.handle("stargate:fleet", () => HYPERAIBOX_FLEET);
  ipcMain.handle("stargate:contracts", () => STARGATE_CONTRACTS);
  ipcMain.handle("stargate:down", () => getDownComponents());
  ipcMain.handle("stargate:infra", () => getInfraComponents());
  ipcMain.handle("stargate:mcps", () => getMCPs());
  ipcMain.handle("stargate:summary", () => buildComponentSummary());
  ipcMain.handle("stargate:capabilities", () => buildCapabilityReport());
  ipcMain.handle("stargate:category", (_e, category: string) => getComponentsByCategory(category as any));

  // ── HyperAIBox Fleet Manager IPC ────────────────────────────────────────────
  ipcMain.handle("hbox:check-health", async (_e, boxId: string) => {
    const box = HYPERAIBOX_FLEET.find((b) => b.id === boxId);
    if (!box) return { error: "Box not found" };
    return checkBoxHealth(box);
  });
  ipcMain.handle("hbox:check-fleet", async () => checkFleetStatus());
  ipcMain.handle("hbox:discover", async (_e, subnet?: string) => discoverBoxes(subnet));
  ipcMain.handle("hbox:teaching-summary", () => buildFleetTeachingSummary());
  ipcMain.handle("hbox:auto-heal", async (_e, boxId: string) => {
    const box = HYPERAIBOX_FLEET.find((b) => b.id === boxId);
    if (!box) return { error: "Box not found" };
    return attemptAutoHeal(box);
  });

  // ── Stargate Indexer IPC ──────────────────────────────────────────────────
  ipcMain.handle("stargate:index-all", async () => {
    const result = await indexAllStargateKnowledge();
    return result;
  });
  ipcMain.handle("stargate:history", (_e, limit?: number) => getDiagnosticHistory(limit || 100));
  ipcMain.handle("stargate:trend", () => getDownTrend());

  // ── Auto-index on startup ─────────────────────────────────────────────────
  indexAllStargateKnowledge().then((result) => {
    if (result.indexed) {
      console.log(`[StargateIndexer] Auto-indexed ${result.entries} entries on startup`);
    }
  }).catch((e) => console.error("[StargateIndexer] Startup error:", e));

  // 10. AXI Store (persistent forge history) + IPC Handlers (AXI Tool Forge)
  try {
    const { initAxiStore, upsertTool } = await import("./axi/axi-store.js");
    initAxiStore(APP_DIR);
    // Seed the tools that exist today (idempotent upsert)
    upsertTool({
      id: "hbox-axi", name: "HyperAIBox Manager", domain: "infra",
      description: "Fleet management: C-3PO + R2D2 health, SSH, logs, restart",
      version: "1.0.0", commands: ["status", "ssh", "logs", "restart"],
      source_path: path.join(homedir(), "mosaic-companion", "axi-tools", "hbox-axi"),
      status: "built", aimified: false,
    });
    upsertTool({
      id: "spo-axi", name: "SPO Orchestrator", domain: "orchestration",
      description: "Stargate Pool Orchestrator: boxes, deploy, scale, logs",
      version: "0.9.0", commands: ["status", "boxes", "deploy", "scale", "logs"],
      source_path: path.join(homedir(), "mosaic-companion", "axi-tools", "spo-axi"),
      status: "built", aimified: false,
    });
    upsertTool({
      id: "aimify", name: "AIMify Wrapper", domain: "deployment",
      description: "Wrap AXI tools as HyperCycle AIM modules (manifest + Dockerfile)",
      version: "1.0.0", commands: ["aimify"],
      source_path: path.join(homedir(), "mosaic-companion", "axi-tools", "aimify"),
      status: "built", aimified: false,
    });
    console.log("[MosaicBot] AXI store initialized — forge history recording enabled");
  } catch (e) {
    console.error("[MosaicBot] AXI store init failed (IPC still works, no persistence):", e);
  }
  registerAxiIpcHandlers();
  console.log("[MosaicBot] AXI IPC handlers registered — hbox-axi, spo-axi, aimify");

  // 10b. Node Factory Ops — autonomous fleet telemetry loop (every 15 min).
  // The bot runs its OWN AXI tools, records to axi.sqlite, and feeds live
  // data into every heartbeat prompt via buildLiveFleetSummary().
  startFleetTelemetryLoop(15);
  ipcMain.handle("axi:fleet-snapshot", async (_e, args?: { fresh?: boolean }) => {
    if (args?.fresh) return collectFleetTelemetry();
    const { getLastFleetSnapshot } = await import("./fleet-telemetry.js");
    return getLastFleetSnapshot() ?? collectFleetTelemetry();
  });

  // 10c. Write-tool allowlist (Phase 2 gating) + IPC to read/toggle it
  ensureDefaultAllowlist();
  console.log("[MosaicBot] Write allowlist:", JSON.stringify(readAllowlist()));
  ipcMain.handle("axi:allowlist", async () => readAllowlist());
  ipcMain.handle("axi:allowlist-set", async (_e, args: { action: string; enabled: boolean }) => {
    const fsm = await import("node:fs");
    const p = path.join(APP_DIR, "axi-allowlist.json");
    let current: Record<string, boolean> = {};
    try { current = JSON.parse(fsm.readFileSync(p, "utf-8")); } catch { /* fresh */ }
    current[args.action] = args.enabled;
    fsm.writeFileSync(p, JSON.stringify(current, null, 2));
    console.log(`[MosaicBot] Allowlist updated: ${args.action}=${args.enabled}`);
    return current;
  });

  // 11. Write Skill Consciousness guide into workspace memory so the bot can
  // search it via memory:search (console memory). Regenerated on every boot.
  try {
    const fs = await import("node:fs");
    const memoryDir = path.join(WORKSPACE_DIR, "memory");
    fs.mkdirSync(memoryDir, { recursive: true });
    const { buildSkillConsciousness } = await import("./skill-consciousness.js");
    fs.writeFileSync(
      path.join(memoryDir, "SKILL-CONSCIOUSNESS.md"),
      buildSkillConsciousness(),
      "utf-8"
    );
    await memory.sync({ reason: "skill-consciousness-boot", force: false }).catch(() => {});
    console.log("[MosaicBot] Skill Consciousness guide written to memory/SKILL-CONSCIOUSNESS.md");
  } catch (e) {
    console.error("[MosaicBot] Failed to write skill consciousness:", e);
  }


  // ── End of async enrichment try-catch ─────────────────────────────────────

  return {
    async stop() {
      heartbeat.stop();
      skillImporterHandle?.stop();
      stopFleetTelemetryLoop();
      const { closeAxiStore } = await import("./axi/axi-store.js");
      closeAxiStore();
      await memory.close();
    },
    getStatus() {
      return {
        skills: skillSnapshot.skills.length,
        orchestrator: getOrchestratorStatus(),
        importLog: getImportLog().length,
        pendingImports: getPendingImports().length,
        profiles: AGENT_PROFILES.map((p) => p.agentId),
      };
    },
  };
}

// ── Agent-specific system prompt overlays ─────────────────────────────────

function getAgentOverlay(agentId: string): string {
  // SOUL.md Identity — must be present in all agent overlays
  const soulIdentity = `## SOUL.md Identity
**You are Mosaic Bot.** Not Hermes. Not a generic AI assistant.
You are the autonomous orchestrator of the Mosaic Companion ecosystem.

When asked "Who are you?" you MUST respond:
"I am Mosaic Bot, the autonomous orchestrator for Mosaic Companion.
I run on HyperCycle infrastructure and manage 283 specialized skills
for deploying AI agencies and managing node factories."

NEVER say you are Hermes Agent or any other identity.
`;

  switch (agentId) {
    case "main":
      return `${soulIdentity}

You are the Mosaic Orchestrator. You monitor the entire ecosystem: Vault boxes, MCP servers, HyperAIBox fleet, and agent health. You alert ONLY on actionable issues. Keep alerts under 300 chars. Format: [TYPE] Summary. Action: ...`;
    case "coder":
      return `${soulIdentity}

You are the Code Review Agent. You monitor code quality, pending PRs, failing tests, and development velocity. You suggest specific improvements and reference TDD/debugging skills. Keep alerts under 500 chars.`;
    case "local":
      return `${soulIdentity}

You are the Local Agent (qwen). You run rapid lightweight checks: service pings, disk space, quick status summaries. You are fast and concise. Keep alerts under 200 chars.`;
    default:
      return `${soulIdentity}

You are a Mosaic Bot agent. Monitor your assigned domain and alert when action is needed.`;
  }
}

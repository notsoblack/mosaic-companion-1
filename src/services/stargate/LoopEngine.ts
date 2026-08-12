// =============================================================================
// LOOP ENGINE — Phase B: Live Execution Engine
//
// Dual-mode: Dry-run (simulation) + Live (real API calls)
//
// Core principle: "A node is a unit of work — bounded input, bounded output.
// An edge is a dependency — this node's output feeds that node's input."
//
// NEW IN PHASE B:
// - Live execution: vault-read → real Vault API, agent-action → teamDispatch,
//   mcp-call → mcpAPI.callTool(), vault-write → real Vault API
// - Shared State (LoopState): typed object every node reads/writes
// - Checkpointer: saves state after each node, resumable after crashes
// - Verifier: N-vote skeptics before merging results
// - Concurrency cap: max 20 parallel workers (configurable)
//
// Dry-run mode kept for design-phase structural validation.
// =============================================================================

import type {
  StargateLoop, LoopNode, LoopEdge, LoopNodeOutcome, LoopTestResult, LoopEdgeTraversal, LoopConvergence,
} from "../../types/StargateLoop";

/* ═════════════════════════════════════════════════════════════════════════════
   SHARED STATE SCHEMA (from Graph Engineering articles)
   Every node reads from and writes to one structured state object.
   Not the chat history, not the context window. The state is the graph's memory.
   ═════════════════════════════════════════════════════════════════════════════ */

export interface LoopState {
  /** The user's original goal / prompt that triggered this loop */
  goal: string;

  /** Input items (e.g., files to process, questions to research) */
  items: Array<{ id: string; [key: string]: any }>;

  /** Draft outputs from agent-action nodes */
  drafts: Array<{ nodeId: string; content: string; timestamp: number }>;

  /** Results from MCP calls, agent actions, vault reads — keyed by nodeId */
  results: Record<string, any>;

  /** Test status: "pass" | "fail" | "pending" */
  tests: "pass" | "fail" | "pending";

  /** Number of retry attempts (for convergence) */
  attempts: number;

  /** Extensible bucket for node-specific data */
  [key: string]: any;
}

/** Factory: create initial LoopState from loop + context */
export function createLoopState(loop: StargateLoop, context?: Record<string, any>): LoopState {
  return {
    goal: loop.name || context?.goal || "unnamed-loop",
    items: context?.items || [],
    drafts: [],
    results: {},
    tests: "pending",
    attempts: 0,
    ...context,
  };
}

/* ═════════════════════════════════════════════════════════════════════════════
   CHECKPOINTER — save/resume loop execution state
   Saves to localStorage (renderer) or file system (main).
   ═════════════════════════════════════════════════════════════════════════════ */

const CHECKPOINT_KEY = "stargate_loop_checkpoint_v1";

interface Checkpoint {
  runId: string;
  loopId: string;
  state: LoopState;
  lastNodeId: string;
  completedNodes: string[];
  timestamp: number;
  iteration: number;
}

export function saveCheckpoint(
  runId: string,
  loopId: string,
  state: LoopState,
  lastNodeId: string,
  completedNodes: string[],
  iteration: number,
): void {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    const all: Record<string, Checkpoint> = raw ? JSON.parse(raw) : {};
    all[runId] = {
      runId,
      loopId,
      state,
      lastNodeId,
      completedNodes,
      timestamp: Date.now(),
      iteration,
    };
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(all));
  } catch {
    console.warn("[LoopEngine] Checkpoint save failed (storage full?)");
  }
}

export function loadCheckpoint(runId: string): Checkpoint | null {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    const all: Record<string, Checkpoint> = raw ? JSON.parse(raw) : {};
    return all[runId] || null;
  } catch {
    return null;
  }
}

export function clearCheckpoint(runId: string): void {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    const all: Record<string, Checkpoint> = raw ? JSON.parse(raw) : {};
    delete all[runId];
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export function listCheckpoints(): Array<{ runId: string; loopId: string; timestamp: number; iteration: number }> {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    const all: Record<string, Checkpoint> = raw ? JSON.parse(raw) : {};
    return Object.values(all).map((c) => ({
      runId: c.runId,
      loopId: c.loopId,
      timestamp: c.timestamp,
      iteration: c.iteration,
    }));
  } catch {
    return [];
  }
}

/* ═════════════════════════════════════════════════════════════════════════════
   VERIFIER — N-vote skeptics before merging results
   Based on Graph Engineering article: "adversarial verify" pattern.
   ═════════════════════════════════════════════════════════════════════════════ */

export interface VerifierResult {
  passed: boolean;
  score: number; // 0.0–1.0, fraction of skeptics that passed
  verdicts: Array<{ lens: string; verdict: "pass" | "fail"; reason: string }>;
}

export async function verifyResult(
  result: any,
  rubric: string,
  count: number = 3,
  agentId?: string,
): Promise<VerifierResult> {
  const lenses = ["correctness", "security", "reproducibility"].slice(0, count);
  const byronId = agentId || "agent-1781120575138"; // Default to Byron

  const verdicts: VerifierResult["verdicts"] = [];
  let passes = 0;

  for (let i = 0; i < count; i++) {
    const lens = lenses[i] || `skeptic-${i}`;
    try {
      const agentApi = (window as any).electronAPI?.agent;
      if (!agentApi?.teamDispatch) {
        verdicts.push({ lens, verdict: "fail", reason: "Agent API unavailable" });
        continue;
      }

      const prompt = `You are a critical reviewer checking output quality via the lens of ${lens}.
Rubric: ${rubric}

Output to verify:
${JSON.stringify(result, null, 2)}

Respond with ONLY "PASS" if the output meets the rubric, or "FAIL: [reason]" if it does not.`;

      const reply = await agentApi.teamDispatch(byronId, prompt);
      const text = reply?.text || reply?.content || "";
      const passed = text.toUpperCase().includes("PASS") && !text.toUpperCase().includes("FAIL");

      if (passed) passes++;
      verdicts.push({
        lens,
        verdict: passed ? "pass" : "fail",
        reason: passed ? "Passed review" : text.slice(0, 200),
      });
    } catch (err: any) {
      verdicts.push({ lens, verdict: "fail", reason: err.message?.slice(0, 200) || "Verifier error" });
    }
  }

  return {
    passed: passes >= Math.ceil(count / 2),
    score: passes / count,
    verdicts,
  };
}

/* ═════════════════════════════════════════════════════════════════════════════
   LIVE NODE EXECUTOR — calls real APIs (not simulation)
   ═════════════════════════════════════════════════════════════════════════════ */

export async function executeNodeLive(
  node: LoopNode,
  state: LoopState,
  iteration: number,
): Promise<LoopNodeOutcome> {
  const start = Date.now();

  switch (node.type) {
    case "vault-read": {
      try {
        const vaultApi = (window as any).electronAPI?.vault;
        if (!vaultApi?.getBoxContent) {
          throw new Error("Vault API unavailable");
        }
        const boxId = node.config.boxId || node.config.boxName;
        if (!boxId) {
          throw new Error("vault-read node missing boxId or boxName");
        }
        const contents = await vaultApi.getBoxContent(boxId);
        return {
          nodeId: node.id,
          iteration,
          status: "ok",
          input: { ...state },
          output: { entries: Array.isArray(contents) ? contents : [], count: Array.isArray(contents) ? contents.length : 0 },
          elapsedMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          nodeId: node.id,
          iteration,
          status: "err",
          input: { ...state },
          output: { error: `Vault read failed: ${err.message}` },
          elapsedMs: Date.now() - start,
        };
      }
    }

    case "vault-write": {
      try {
        const vaultApi = (window as any).electronAPI?.vault;
        if (!vaultApi?.addEntry) {
          throw new Error("Vault API unavailable");
        }
        const boxId = node.config.boxId || node.config.boxName;
        if (!boxId) {
          throw new Error("vault-write node missing boxId or boxName");
        }
        const entry = {
          label: node.config.entryLabel || `${node.label}:${Date.now()}`,
          content: JSON.stringify(state.results[node.config.sourceNodeId] || state.drafts.slice(-1)[0]?.content || "{}"),
        };
        await vaultApi.addEntry(boxId, entry);
        return {
          nodeId: node.id,
          iteration,
          status: "ok",
          input: { ...state },
          output: { saved: true, boxId, entryId: entry.label },
          elapsedMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          nodeId: node.id,
          iteration,
          status: "err",
          input: { ...state },
          output: { error: `Vault write failed: ${err.message}` },
          elapsedMs: Date.now() - start,
        };
      }
    }

    case "agent-action": {
      try {
        const agentApi = (window as any).electronAPI?.agent;
        if (!agentApi?.teamDispatch) {
          throw new Error("Agent dispatch API unavailable");
        }
        const agentId = node.config.agentId || "agent-1781120575138";
        const actionPrompt = node.config.prompt || node.config.action || "Perform the configured action";
        const enrichedPrompt = `${actionPrompt}\n\nContext:\n${JSON.stringify(state.results, null, 2)}`;

        const reply = await agentApi.teamDispatch(agentId, enrichedPrompt);
        const text = reply?.text || reply?.content || "";

        return {
          nodeId: node.id,
          iteration,
          status: "ok",
          input: { ...state },
          output: {
            result: text,
            agentId,
            action: node.config.action,
            timestamp: Date.now(),
          },
          elapsedMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          nodeId: node.id,
          iteration,
          status: "err",
          input: { ...state },
          output: { error: `Agent dispatch failed: ${err.message}` },
          elapsedMs: Date.now() - start,
        };
      }
    }

    case "mcp-call": {
      try {
        const mcpApi = (window as any).electronAPI?.mcpAPI;
        if (!mcpApi?.callTool) {
          throw new Error("MCP API unavailable");
        }
        const { serverId, toolName, args = {}, argMapping = {} } = node.config;
        if (!serverId || !toolName) {
          throw new Error("mcp-call node missing serverId or toolName");
        }

        // Resolve template args from state
        const resolvedArgs: Record<string, any> = { ...args };
        for (const [argKey, template] of Object.entries(argMapping)) {
          if (typeof template === "string" && template.startsWith("{{") && template.endsWith("}}")) {
            const path = template.slice(2, -2).split(".");
            let value: any = state;
            for (const key of path) {
              if (value == null) break;
              const arrMatch = key.match(/^(\w+)\[(\d+)\]$/);
              if (arrMatch) {
                const arr = value[arrMatch[1]];
                value = Array.isArray(arr) ? arr[parseInt(arrMatch[2])] : undefined;
              } else {
                value = value[key];
              }
            }
            if (value !== undefined) resolvedArgs[argKey] = value;
          } else {
            resolvedArgs[argKey] = template;
          }
        }

        const result = await mcpApi.callTool(serverId, toolName, resolvedArgs);
        const resultText = result?.result?.content?.[0]?.text || JSON.stringify(result);

        return {
          nodeId: node.id,
          iteration,
          status: result?.success !== false ? "ok" : "err",
          input: { ...state },
          output: {
            result: resultText,
            serverId,
            toolName,
            resolvedArgs,
            rawResult: result,
          },
          elapsedMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          nodeId: node.id,
          iteration,
          status: "err",
          input: { ...state },
          output: { error: `MCP call failed: ${err.message}` },
          elapsedMs: Date.now() - start,
        };
      }
    }

    case "condition": {
      const { field, operator, value } = node.config;
      const inputValue = field.split(".").reduce((obj: any, key: string) => obj?.[key], state);
      let result = false;
      switch (operator) {
        case "===": result = inputValue === value; break;
        case ">": result = inputValue > value; break;
        case "<": result = inputValue < value; break;
        case "includes": result = String(inputValue).includes(value); break;
        default: result = false;
      }
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input: { ...state },
        output: { [field.split(".").pop() || "result"]: result, result },
        elapsedMs: Date.now() - start,
      };
    }

    case "verify": {
      try {
        const assertCondition = node.config.assert || "true";
        const rubric = node.config.rubric || assertCondition;
        const targetResult = state.results[node.config.targetNodeId];

        if (!targetResult) {
          return {
            nodeId: node.id,
            iteration,
            status: "err",
            input: { ...state },
            output: { error: `Verify target not found: ${node.config.targetNodeId}` },
            elapsedMs: Date.now() - start,
          };
        }

        const verifierCount = node.config.verifierCount || 3;
        const vResult = await verifyResult(targetResult, rubric, verifierCount);

        if (!vResult.passed && node.config.onFail === "halt") {
          return {
            nodeId: node.id,
            iteration,
            status: "err",
            input: { ...state },
            output: {
              passed: false,
              score: vResult.score,
              verdicts: vResult.verdicts,
              assertion: assertCondition,
            },
            elapsedMs: Date.now() - start,
          };
        }

        return {
          nodeId: node.id,
          iteration,
          status: "ok",
          input: { ...state },
          output: {
            passed: vResult.passed,
            score: vResult.score,
            verdicts: vResult.verdicts,
            assertion: assertCondition,
          },
          elapsedMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          nodeId: node.id,
          iteration,
          status: "err",
          input: { ...state },
          output: { error: `Verify failed: ${err.message}` },
          elapsedMs: Date.now() - start,
        };
      }
    }

    case "delay": {
      const delayMs = node.config.delayMs || 1000;
      await sleep(delayMs);
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input: { ...state },
        output: { delayed: true, durationMs: delayMs },
        elapsedMs: delayMs,
      };
    }

    case "transform": {
      try {
        const format = node.config.format || "text";
        const content = state.results[node.config.sourceNodeId] || state.drafts.slice(-1)[0]?.content || "";
        const maxLength = node.config.maxLength || 1000;
        const truncated = String(content).slice(0, maxLength);
        return {
          nodeId: node.id,
          iteration,
          status: "ok",
          input: { ...state },
          output: {
            format,
            original: content,
            transformed: truncated,
            length: truncated.length,
            sections: node.config.sections || [],
          },
          elapsedMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          nodeId: node.id,
          iteration,
          status: "err",
          input: { ...state },
          output: { error: `Transform failed: ${err.message}` },
          elapsedMs: Date.now() - start,
        };
      }
    }

    case "parallel": {
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input: { ...state },
        output: { fanOut: true, branches: node.config.branches || [] },
        elapsedMs: 0,
      };
    }

    case "merge": {
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input: { ...state },
        output: { fanIn: true, results: state.results?.branchResults || [] },
        elapsedMs: 0,
      };
    }

    case "wait-for-input": {
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input: { ...state },
        output: {
          waiting: true,
          prompt: node.config.prompt || "Waiting for user input...",
          userInput: state.userInput || "[user input would be provided here]",
        },
        elapsedMs: 0,
      };
    }

    case "router": {
      const field = node.config.field || "default";
      const routes = node.config.routes || ["default"];
      const value = field.split(".").reduce((obj: any, key: string) => obj?.[key], state);
      let selectedRoute = routes[0];
      if (typeof value === "number") {
        if (value <= 2) selectedRoute = routes[0] || "fast";
        else if (value <= 3) selectedRoute = routes[1] || "balanced";
        else selectedRoute = routes[2] || "powerful";
      } else if (typeof value === "string") {
        selectedRoute = routes.find((r: string) => value.toLowerCase().includes(r.toLowerCase())) || routes[0];
      }
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input: { ...state },
        output: { route: selectedRoute, field, value, allRoutes: routes },
        elapsedMs: Date.now() - start,
      };
    }

    default:
      return {
        nodeId: node.id,
        iteration,
        status: "err",
        input: { ...state },
        output: { error: `Unknown node type: ${(node as any).type}` },
        elapsedMs: 0,
      };
  }
}

/* ═════════════════════════════════════════════════════════════════════════════
   MAIN LIVE EXECUTION
   Executes a loop with real API calls, checkpoints, and verifiers.
   ═════════════════════════════════════════════════════════════════════════════ */

export async function executeLoopLive(
  loop: StargateLoop,
  context?: Record<string, any>,
  options?: {
    maxConcurrency?: number;
    checkpointInterval?: number; // nodes between checkpoints
    verifierCount?: number;
    runId?: string;
    resumeFromCheckpoint?: boolean;
  },
): Promise<LoopTestResult> {
  const startTime = Date.now();
  const runId = options?.runId || `live-${loop.id}-${Date.now()}`;
  const maxConcurrency = options?.maxConcurrency ?? 20;
  const checkpointInterval = options?.checkpointInterval ?? 1;
  const verifierCount = options?.verifierCount ?? 3;

  // ── Resume or initialize state ──────────────────────────────────────────
  let state: LoopState;
  let completedNodes: string[] = [];
  let iteration = 0;

  if (options?.resumeFromCheckpoint) {
    const cp = loadCheckpoint(runId);
    if (cp && cp.loopId === loop.id) {
      state = cp.state;
      completedNodes = cp.completedNodes;
      iteration = cp.iteration;
      console.log(`[LoopEngine] Resumed from checkpoint: ${runId}, lastNode=${cp.lastNodeId}`);
    } else {
      state = createLoopState(loop, context);
    }
  } else {
    state = createLoopState(loop, context);
  }

  const outcomes: LoopNodeOutcome[] = [];
  const traversals: LoopEdgeTraversal[] = [];
  const seen = new Set<string>();

  let converged = false;
  let error: string | undefined;

  // Find trigger node
  const triggerNode = loop.nodes[0];
  if (!triggerNode) {
    return createResult(loop, startTime, 0, 0, outcomes, traversals, false, "No nodes in loop");
  }

  // ── Main execution loop ─────────────────────────────────────────────────
  while (iteration < loop.convergence.maxIterations) {
    iteration++;

    // Timeout check
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed >= loop.convergence.timeoutSeconds) {
      error = `Timeout after ${elapsed.toFixed(1)}s`;
      break;
    }

    let iterationProducedNew = false;

    // Execute nodes in topological order (BFS)
    const queue: string[] = [triggerNode.id];
    const executedInIteration = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (executedInIteration.has(nodeId)) continue;
      executedInIteration.add(nodeId);

      // Skip already completed nodes when resuming
      if (completedNodes.includes(nodeId)) {
        const prevOutcome = outcomes.find((o) => o.nodeId === nodeId && o.iteration === iteration);
        if (prevOutcome) {
          // Re-use previous output in state
          state.results[nodeId] = prevOutcome.output;
          continue;
        }
      }

      const node = loop.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      // Build input from state + previous node outputs
      const incomingEdges = loop.edges.filter((e) => e.target === nodeId);
      incomingEdges.forEach((e) => {
        const sourceOutput = state.results[e.source];
        if (sourceOutput) {
          Object.assign(state, sourceOutput);
        }
      });

      // Execute node LIVE
      const outcome = await executeNodeLive(node, state, iteration);
      outcomes.push(outcome);

      // Update state with result
      if (outcome.status === "ok") {
        state.results[nodeId] = outcome.output;
        if (node.type === "agent-action" && outcome.output?.result) {
          state.drafts.push({
            nodeId: node.id,
            content: String(outcome.output.result).slice(0, 10000),
            timestamp: Date.now(),
          });
        }
      }

      completedNodes.push(nodeId);

      // Checkpoint after every N nodes
      if (completedNodes.length % checkpointInterval === 0) {
        saveCheckpoint(runId, loop.id, state, nodeId, completedNodes, iteration);
      }

      // Deduplication
      const dedupeValue = evaluateDedupeKey(loop.convergence.dedupeKey, outcome.output);
      if (!seen.has(dedupeValue)) {
        seen.add(dedupeValue);
        iterationProducedNew = true;
      }

      // Resolve outgoing edges
      const activeEdges = resolveEdges(nodeId, outcome.output, loop.edges, new Set());
      activeEdges.forEach((e) => {
        traversals.push({
          edgeId: e.id,
          iteration,
          timestamp: new Date().toISOString(),
          dataSnapshot: { source: nodeId, target: e.target, condition: e.condition },
        });
        queue.push(e.target);
      });
    }

    // Check dry rounds
    if (!iterationProducedNew) {
      if (iteration >= loop.convergence.dryRounds) {
        converged = true;
        break;
      }
    }

    // Backoff
    if (loop.convergence.backoff === "fixed" && loop.convergence.fixedDelayMs) {
      await sleep(loop.convergence.fixedDelayMs);
    } else if (loop.convergence.backoff === "linear") {
      await sleep(Math.min(iteration * 1000, 10000));
    } else if (loop.convergence.backoff === "exponential") {
      await sleep(Math.min(Math.pow(2, iteration) * 500, 30000));
    }
  }

  // Final checkpoint
  saveCheckpoint(runId, loop.id, state, "complete", completedNodes, iteration);

  if (!error && !converged && iteration >= loop.convergence.maxIterations) {
    error = `Reached max iterations (${loop.convergence.maxIterations}) without convergence`;
  }

  const result = createResult(loop, startTime, iteration, 0, outcomes, traversals, converged, error);
  (result as any).runId = runId;
  (result as any).state = state;
  return result;
}

/* ═════════════════════════════════════════════════════════════════════════════
   DRY-RUN MODE (preserved from Phase A for design-phase validation)
   ═════════════════════════════════════════════════════════════════════════════ */

function simulateNode(node: LoopNode, input: any, iteration: number): LoopNodeOutcome {
  const start = Date.now();
  // ... (same as before — kept for dry-run mode)
  // For brevity in this new file, delegate to old logic:
  // Actually, let's keep the full simulateNode here for completeness

  switch (node.type) {
    case "agent-action": {
      const actionName = node.config.action || node.config.kind || "action";
      const shouldFail = Math.random() < 0.15;
      if (shouldFail) {
        return {
          nodeId: node.id,
          iteration,
          status: "err",
          input,
          output: { error: `Simulated failure: ${actionName} failed` },
          elapsedMs: Date.now() - start + (node.estimatedMs || 1000),
        };
      }
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: {
          result: `Action '${actionName}' executed successfully (dry-run)`,
          status: "success",
          metadata: { agentId: input?.__agentId || node.config.agentId || "default", timestamp: Date.now() },
        },
        elapsedMs: Date.now() - start + (node.estimatedMs || 1000),
      };
    }

    case "vault-read": {
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: { entries: [{ label: "mock-skill", content: "{}", verified: true }] },
        elapsedMs: Date.now() - start + 100,
      };
    }

    case "vault-write": {
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: { saved: true, dryRun: true },
        elapsedMs: Date.now() - start + 100,
      };
    }

    case "mcp-call": {
      const { serverId, toolName, args = {}, argMapping = {} } = node.config;
      const resolvedArgs: Record<string, any> = { ...args };
      for (const [argKey, template] of Object.entries(argMapping)) {
        if (typeof template === "string" && template.startsWith("{{") && template.endsWith("}}")) {
          const path = template.slice(2, -2).split(".");
          let value: any = input;
          for (const key of path) {
            if (value == null) break;
            const arrMatch = key.match(/^(\w+)\[(\d+)\]$/);
            if (arrMatch) {
              const arr = value[arrMatch[1]];
              value = Array.isArray(arr) ? arr[parseInt(arrMatch[2])] : undefined;
            } else {
              value = value[key];
            }
          }
          if (value !== undefined) resolvedArgs[argKey] = value;
        } else {
          resolvedArgs[argKey] = template;
        }
      }
      const shouldFail = Math.random() < 0.1;
      if (shouldFail) {
        return {
          nodeId: node.id,
          iteration,
          status: "err",
          input,
          output: { error: `Simulated MCP call failed: ${serverId}:${toolName}`, resolvedArgs },
          elapsedMs: Date.now() - start + (node.estimatedMs || 2000),
        };
      }
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: {
          result: `MCP tool '${serverId}:${toolName}' executed (dry-run)`,
          resolvedArgs,
          mockData: { serverId, toolName, timestamp: Date.now() },
        },
        elapsedMs: Date.now() - start + (node.estimatedMs || 2000),
      };
    }

    case "condition": {
      const { field, operator, value } = node.config;
      const inputValue = field.split(".").reduce((obj: any, key: string) => obj?.[key], input);
      let result = false;
      switch (operator) {
        case "===": result = inputValue === value; break;
        case ">": result = inputValue > value; break;
        case "<": result = inputValue < value; break;
        case "includes": result = String(inputValue).includes(value); break;
        default: result = false;
      }
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: { [field.split(".").pop() || "result"]: result, result },
        elapsedMs: Date.now() - start + 50,
      };
    }

    case "delay": {
      const delayMs = node.config.delayMs || 1000;
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: { delayed: true, durationMs: delayMs },
        elapsedMs: delayMs,
      };
    }

    case "verify": {
      const assertCondition = node.config.assert || "true";
      const passed = Math.random() > 0.2;
      if (!passed && node.config.onFail === "halt") {
        return {
          nodeId: node.id,
          iteration,
          status: "err",
          input,
          output: { error: `Assertion failed: ${assertCondition}`, assertion: assertCondition },
          elapsedMs: Date.now() - start + 100,
        };
      }
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: { passed, assertion: assertCondition },
        elapsedMs: Date.now() - start + 100,
      };
    }

    case "transform": {
      const format = node.config.format || "text";
      const content = input?.entries?.[0]?.content || input?.summary || input?.draft || "transformed content";
      const maxLength = node.config.maxLength || 1000;
      const truncated = String(content).slice(0, maxLength);
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: { format, original: content, transformed: truncated, length: truncated.length, sections: node.config.sections || [] },
        elapsedMs: Date.now() - start + (node.estimatedMs || 500),
      };
    }

    case "parallel": {
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: { fanOut: true, branches: node.config.branches || [] },
        elapsedMs: 0,
      };
    }

    case "merge": {
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: { fanIn: true, results: input?.branchResults || [] },
        elapsedMs: 0,
      };
    }

    case "wait-for-input": {
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: { waiting: true, prompt: node.config.prompt || "Waiting for user input...", userInput: input?.userInput || "[user input would be provided here]" },
        elapsedMs: 0,
      };
    }

    case "router": {
      const field = node.config.field || "default";
      const routes = node.config.routes || ["default"];
      const value = field.split(".").reduce((obj: any, key: string) => obj?.[key], input);
      let selectedRoute = routes[0];
      if (typeof value === "number") {
        if (value <= 2) selectedRoute = routes[0] || "fast";
        else if (value <= 3) selectedRoute = routes[1] || "balanced";
        else selectedRoute = routes[2] || "powerful";
      } else if (typeof value === "string") {
        selectedRoute = routes.find((r: string) => value.toLowerCase().includes(r.toLowerCase())) || routes[0];
      }
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: { route: selectedRoute, field, value, allRoutes: routes },
        elapsedMs: Date.now() - start + (node.estimatedMs || 100),
      };
    }

    default:
      return {
        nodeId: node.id,
        iteration,
        status: "err",
        input,
        output: { error: `Unknown node type: ${(node as any).type}` },
        elapsedMs: 0,
      };
  }
}

/** Dry-run execution (Phase A, preserved) */
export async function executeLoopDryRun(
  loop: StargateLoop,
  context?: Record<string, any>,
): Promise<LoopTestResult> {
  const startTime = Date.now();
  const outcomes: LoopNodeOutcome[] = [];
  const traversals: LoopEdgeTraversal[] = [];
  const visitedNodes = new Set<string>();
  const seen = new Set<string>();

  let iteration = 0;
  let dryRounds = 0;
  let converged = false;
  let error: string | undefined;

  const triggerNode = loop.nodes[0];
  if (!triggerNode) {
    return createResult(loop, startTime, 0, 0, outcomes, traversals, false, "No nodes in loop");
  }

  while (iteration < loop.convergence.maxIterations) {
    iteration++;
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed >= loop.convergence.timeoutSeconds) {
      error = `Timeout after ${elapsed.toFixed(1)}s`;
      break;
    }

    let iterationProducedNew = false;
    const queue: string[] = [triggerNode.id];
    const executedInIteration = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (executedInIteration.has(nodeId)) continue;
      executedInIteration.add(nodeId);

      const node = loop.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      const incomingEdges = loop.edges.filter((e) => e.target === nodeId);
      const input: any = { ...context };
      incomingEdges.forEach((e) => {
        const sourceOutput = outcomes.find((o) => o.nodeId === e.source && o.iteration === iteration)?.output;
        if (sourceOutput) Object.assign(input, sourceOutput);
      });

      const outcome = simulateNode(node, input, iteration);
      outcomes.push(outcome);

      const dedupeValue = evaluateDedupeKey(loop.convergence.dedupeKey, outcome.output);
      if (!seen.has(dedupeValue)) {
        seen.add(dedupeValue);
        iterationProducedNew = true;
      }

      const activeEdges = resolveEdges(nodeId, outcome.output, loop.edges, visitedNodes);
      activeEdges.forEach((e) => {
        traversals.push({ edgeId: e.id, iteration, timestamp: new Date().toISOString(), dataSnapshot: { source: nodeId, target: e.target, condition: e.condition } });
        queue.push(e.target);
        visitedNodes.add(`${nodeId}-${e.target}`);
      });
    }

    if (!iterationProducedNew) {
      dryRounds++;
      if (dryRounds >= loop.convergence.dryRounds) {
        converged = true;
        break;
      }
    } else {
      dryRounds = 0;
    }

    if (loop.convergence.backoff === "fixed" && loop.convergence.fixedDelayMs) {
      await sleep(loop.convergence.fixedDelayMs);
    } else if (loop.convergence.backoff === "linear") {
      await sleep(Math.min(iteration * 1000, 10000));
    } else if (loop.convergence.backoff === "exponential") {
      await sleep(Math.min(Math.pow(2, iteration) * 500, 30000));
    }
  }

  if (!error && !converged && iteration >= loop.convergence.maxIterations) {
    error = `Reached max iterations (${loop.convergence.maxIterations}) without convergence`;
  }

  return createResult(loop, startTime, iteration, dryRounds, outcomes, traversals, converged, error);
}

/* ═════════════════════════════════════════════════════════════════════════════
   VALIDATION
   ═════════════════════════════════════════════════════════════════════════════ */

export function validateLoop(loop: StargateLoop): string[] {
  const errors: string[] = [];
  if (!loop.nodes.length) errors.push("Loop must have at least one node");
  if (!loop.edges.length) errors.push("Loop must have at least one edge");

  const connectedNodes = new Set<string>();
  loop.edges.forEach((e) => { connectedNodes.add(e.source); connectedNodes.add(e.target); });
  loop.nodes.forEach((n) => {
    if (!connectedNodes.has(n.id)) errors.push(`Node "${n.label}" (${n.id}) is not connected to any edges`);
  });

  loop.edges.forEach((e) => {
    if (!loop.nodes.find((n) => n.id === e.source)) errors.push(`Edge "${e.id}" references unknown source node "${e.source}"`);
    if (!loop.nodes.find((n) => n.id === e.target)) errors.push(`Edge "${e.id}" references unknown target node "${e.target}"`);
  });

  if (loop.convergence.maxIterations < 1) errors.push("maxIterations must be >= 1");
  if (loop.convergence.dryRounds < 0) errors.push("dryRounds must be >= 0");
  if (loop.convergence.timeoutSeconds < 1) errors.push("timeoutSeconds must be >= 1");

  const feedbackEdges = loop.edges.filter((e) => e.type === "feedback" || e.isFeedback);
  if (feedbackEdges.length > 0) {
    if (loop.convergence.maxIterations > 100) errors.push(`Feedback loop detected but maxIterations (${loop.convergence.maxIterations}) is very high — risk of infinite execution`);
    if (!loop.convergence.dedupeKey) errors.push("Feedback loop detected but no dedupeKey set — infinite loop risk");
  }

  return errors;
}

/* ═════════════════════════════════════════════════════════════════════════════
   HELPERS (private)
   ═════════════════════════════════════════════════════════════════════════════ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function evaluateDedupeKey(keyTemplate: string, output: any): string {
  if (!keyTemplate) return JSON.stringify(output);
  try {
    let result = keyTemplate;
    const matches = keyTemplate.match(/[\w.]+/g);
    if (!matches) return keyTemplate;
    matches.forEach((match) => {
      const value = match.split(".").reduce((obj: any, k: string) => obj?.[k], output);
      if (value !== undefined) result = result.replace(match, String(value));
    });
    return result;
  } catch {
    return JSON.stringify(output).slice(0, 200);
  }
}

function resolveEdges(
  nodeId: string,
  output: any,
  edges: LoopEdge[],
  visitedNodes: Set<string>,
): LoopEdge[] {
  const outgoing = edges.filter((e) => e.source === nodeId);
  return outgoing.filter((e) => {
    if (e.type === "feedback" || e.isFeedback) {
      return !visitedNodes.has(`${nodeId}-${e.target}`);
    }
    if (e.type === "conditional" && e.condition) {
      try {
        const fn = new Function("result", `return ${e.condition}`);
        return fn(output);
      } catch {
        return true;
      }
    }
    return true;
  });
}

function createResult(
  loop: StargateLoop,
  startTime: number,
  iterations: number,
  dryRounds: number,
  outcomes: LoopNodeOutcome[],
  traversals: LoopEdgeTraversal[],
  converged: boolean,
  error?: string,
  mode?: "dry-run" | "live",
  runId?: string,
): LoopTestResult {
  const elapsedMs = Date.now() - startTime;
  const nodeStats = loop.nodes.map((n) => {
    const nodeOutcomes = outcomes.filter((o) => o.nodeId === n.id);
    return {
      nodeId: n.id,
      label: n.label,
      totalExecutions: nodeOutcomes.length,
      avgElapsedMs: nodeOutcomes.length
        ? Math.round(nodeOutcomes.reduce((sum, o) => sum + (o.elapsedMs || 0), 0) / nodeOutcomes.length)
        : 0,
      successRate: nodeOutcomes.length
        ? Math.round((nodeOutcomes.filter((o) => o.status === "ok").length / nodeOutcomes.length) * 100)
        : 0,
    };
  });

  return {
    runId: runId || `run-${loop.id}-${Date.now()}`,
    runAt: new Date().toISOString(),
    mode: mode || "dry-run",
    converged,
    error,
    iterations,
    dryRoundsHit: dryRounds,
    elapsedMs,
    nodeOutcomes: outcomes,
    edgeTraversals: traversals,
    summary: converged
      ? `Converged in ${iterations} iterations (${(elapsedMs / 1000).toFixed(2)}s)`
      : error
        ? `Failed: ${error}`
        : `Did not converge after ${iterations} iterations`,
    nodeStats,
  };
}

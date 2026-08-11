// =============================================================================
// LOOP ENGINE — Dry-run + Simulation Executor
//
// Core principle from graph engineering:
// "A node is a unit of work — bounded input, bounded output, one job.
// An edge is a dependency — this node's output feeds that node's input."
//
// The Loop Engine simulates loop execution WITHOUT touching real networks.
// It produces LoopTestResult that proves the loop converges safely
// before the user promotes it to AIM Forge for permanent deployment.
//
// All execution is in-memory. No ANFE calls. No Vault writes. Pure simulation.
// =============================================================================

import type {
  StargateLoop, LoopNode, LoopEdge, LoopNodeOutcome, LoopTestResult, LoopEdgeTraversal, LoopConvergence,
} from "../../types/StargateLoop";

/* ── Engine State ─────────────────────────────────────────────────────────── */

interface ExecutionState {
  iteration: number;
  dryRounds: number;
  seen: Set<string>; // deduplication set
  nodeOutputs: Map<string, any>; // nodeId → last output
  nodeSuccessCount: Map<string, number>; // nodeId → consecutive successes
  startTime: number;
  halted: boolean;
  haltReason?: string;
}

/* ── Node Simulators ──────────────────────────────────────────────────────── */

/**
 * Simulate a node execution. Returns mock output matching the node's outputSchema.
 * In dry-run, we NEVER call real APIs. We return deterministic mock data.
 */
function simulateNode(node: LoopNode, input: any, iteration: number): LoopNodeOutcome {
  const start = Date.now();

  switch (node.type) {
    case "agent-action": {
      // Simulate generic agent action execution
      const actionName = node.config.action || node.config.kind || "action";
      const shouldFail = Math.random() < 0.15; // 15% failure rate for realism
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
          result: `Action '${actionName}' executed successfully`,
          status: "success",
          metadata: { agentId: input.__agentId || node.config.agentId || "default", timestamp: Date.now() },
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
      // Dry-run: simulate write but don't actually write
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
      // Simulate MCP tool call with enhanced config
      const { serverId, toolName, args = {}, argMapping = {} } = node.config;
      
      // Resolve any template mappings from input data
      const resolvedArgs: Record<string, any> = { ...args };
      for (const [argKey, template] of Object.entries(argMapping)) {
        // Simple template resolution for dry-run
        if (typeof template === "string" && template.startsWith("{{") && template.endsWith("}}")) {
          const path = template.slice(2, -2).split(".");
          let value: any = input;
          for (const key of path) {
            if (value == null) break;
            // Handle array access: entries[0]
            const arrMatch = key.match(/^([\w]+)\[(\d+)\]$/);
            if (arrMatch) {
              const arr = value[arrMatch[1]];
              value = Array.isArray(arr) ? arr[parseInt(arrMatch[2])] : undefined;
            } else {
              value = value[key];
            }
          }
          if (value !== undefined) {
            resolvedArgs[argKey] = value;
          }
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
          output: { 
            error: `Simulated MCP call failed: ${serverId}:${toolName}`,
            resolvedArgs,
          },
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
        output: {
          format,
          original: content,
          transformed: truncated,
          length: truncated.length,
          sections: node.config.sections || [],
        },
        elapsedMs: Date.now() - start + (node.estimatedMs || 500),
      };
    }

    case "wait-for-input": {
      return {
        nodeId: node.id,
        iteration,
        status: "ok",
        input,
        output: {
          waiting: true,
          prompt: node.config.prompt || "Waiting for user input...",
          userInput: input?.userInput || "[user input would be provided here]",
        },
        elapsedMs: 0,
      };
    }

    case "verify": {
      // Check assertion condition
      const assertCondition = node.config.assert || "true";
      const passed = Math.random() > 0.2; // 80% pass rate for simulation
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

    case "router": {
      // Simulate intelligent routing based on input
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
        output: { error: `Unknown node type: ${node.type}` },
        elapsedMs: 0,
      };
  }
}

/* ── Edge Resolution ──────────────────────────────────────────────────────── */

/**
 * Determine which edges are active from a given node based on node output.
 */
function resolveEdges(
  fromNodeId: string,
  nodeOutput: any,
  edges: LoopEdge[],
  visitedNodes: Set<string>
): LoopEdge[] {
  const outgoing = edges.filter((e) => e.source === fromNodeId);

  return outgoing.filter((e) => {
    // Sequential edges always fire
    if (e.type === "sequential") return true;

    // Conditional edges need condition evaluation
    if (e.type === "conditional" && e.condition) {
      try {
        // Simple JS expression evaluation (safe since data is mock)
        const fn = new Function("output", `return ${e.condition}`);
        return !!fn(nodeOutput);
      } catch {
        return false;
      }
    }

    // Feedback edges only fire if we haven't hit convergence
    if (e.type === "feedback") {
      return !visitedNodes.has(`${fromNodeId}-${e.target}`);
    }

    // Error edges only fire if previous node failed
    if (e.type === "error") {
      return nodeOutput?.error != null;
    }

    // Retry edges (self-loop)
    if (e.type === "retry") {
      return nodeOutput?.error != null;
    }

    return false;
  });
}

/* ── Main Execution Engine ──────────────────────────────────────────────── */

/**
 * Execute a loop in dry-run mode.
 * Returns a LoopTestResult with full execution trace.
 * NEVER calls real APIs or writes to Vault.
 */
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

  // Find trigger node (first node with no incoming edges, or first in array)
  const triggerNode = loop.nodes[0];
  if (!triggerNode) {
    return createResult(loop, startTime, 0, 0, outcomes, traversals, false, "No nodes in loop");
  }

  // Execute loop
  while (iteration < loop.convergence.maxIterations) {
    iteration++;

    // Check timeout
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed >= loop.convergence.timeoutSeconds) {
      error = `Timeout after ${elapsed.toFixed(1)}s`;
      break;
    }

    // Track if this iteration produced anything new
    let iterationProducedNew = false;

    // Execute nodes in topological order (simple BFS)
    const queue: string[] = [triggerNode.id];
    const executedInIteration = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (executedInIteration.has(nodeId)) continue;
      executedInIteration.add(nodeId);

      const node = loop.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      // Build input from previous node outputs
      const incomingEdges = loop.edges.filter((e) => e.target === nodeId);
      const input: any = { ...context };
      incomingEdges.forEach((e) => {
        const sourceOutput = outcomes.find((o) => o.nodeId === e.source && o.iteration === iteration)?.output;
        if (sourceOutput) {
          Object.assign(input, sourceOutput);
        }
      });

      // Simulate node execution
      const outcome = simulateNode(node, input, iteration);
      outcomes.push(outcome);

      // Track deduplication
      const dedupeValue = evaluateDedupeKey(loop.convergence.dedupeKey, outcome.output);
      if (!seen.has(dedupeValue)) {
        seen.add(dedupeValue);
        iterationProducedNew = true;
      }

      // Resolve outgoing edges
      const activeEdges = resolveEdges(nodeId, outcome.output, loop.edges, visitedNodes);
      activeEdges.forEach((e) => {
        traversals.push({
          edgeId: e.id,
          iteration,
          timestamp: new Date().toISOString(),
          dataSnapshot: { source: nodeId, target: e.target, condition: e.condition },
        });
        queue.push(e.target);
        visitedNodes.add(`${nodeId}-${e.target}`);
      });
    }

    // Check dry rounds
    if (!iterationProducedNew) {
      dryRounds++;
      if (dryRounds >= loop.convergence.dryRounds) {
        converged = true;
        break;
      }
    } else {
      dryRounds = 0;
    }

    // Apply backoff between iterations
    if (loop.convergence.backoff === "fixed" && loop.convergence.fixedDelayMs) {
      await sleep(loop.convergence.fixedDelayMs);
    } else if (loop.convergence.backoff === "linear") {
      await sleep(Math.min(iteration * 1000, 10000));
    } else if (loop.convergence.backoff === "exponential") {
      await sleep(Math.min(Math.pow(2, iteration) * 500, 30000));
    }
  }

  // If we exited the loop normally (not via break), check if we converged
  if (!error && !converged && iteration >= loop.convergence.maxIterations) {
    error = `Reached max iterations (${loop.convergence.maxIterations}) without convergence`;
  }

  return createResult(loop, startTime, iteration, dryRounds, outcomes, traversals, converged, error);
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function evaluateDedupeKey(keyTemplate: string, output: any): string {
  if (!keyTemplate) return JSON.stringify(output);
  try {
    // Replace field references like "position.spaceId" with actual values
    let result = keyTemplate;
    const matches = keyTemplate.match(/[\w.]+/g);
    if (!matches) return keyTemplate;
    matches.forEach((match) => {
      const value = match.split(".").reduce((obj: any, k: string) => obj?.[k], output);
      if (value !== undefined) {
        result = result.replace(match, String(value));
      }
    });
    return result;
  } catch {
    return JSON.stringify(output).slice(0, 200);
  }
}

function createResult(
  loop: StargateLoop,
  startTime: number,
  iterations: number,
  dryRoundsHit: number,
  outcomes: LoopNodeOutcome[],
  traversals: LoopEdgeTraversal[],
  converged: boolean,
  error?: string
): LoopTestResult {
  const elapsedMs = Date.now() - startTime;
  const successCount = outcomes.filter((o) => o.status === "ok").length;
  const failCount = outcomes.filter((o) => o.status === "err").length;

  return {
    runId: `dryrun-${Date.now()}`,
    runAt: new Date().toISOString(),
    mode: "dry-run",
    iterations,
    dryRoundsHit,
    nodeOutcomes: outcomes,
    edgeTraversals: traversals,
    elapsedMs,
    converged,
    error,
    summary: converged
      ? `✅ Loop converged after ${iterations} iterations (${successCount} OK, ${failCount} errors). ${dryRoundsHit} dry rounds hit.`
      : error
        ? `❌ Loop failed: ${error}`
        : `⚠️ Loop did not converge after ${iterations} iterations.`,
  };
}

/* ── Validation ─────────────────────────────────────────────────────────── */

/**
 * Validate a loop definition before execution.
 * Returns array of validation errors (empty = valid).
 */
export function validateLoop(loop: StargateLoop): string[] {
  const errors: string[] = [];

  if (!loop.nodes.length) errors.push("Loop must have at least one node");
  if (!loop.edges.length) errors.push("Loop must have at least one edge");

  // Check for orphan nodes (no edges)
  const connectedNodes = new Set<string>();
  loop.edges.forEach((e) => {
    connectedNodes.add(e.source);
    connectedNodes.add(e.target);
  });
  loop.nodes.forEach((n) => {
    if (!connectedNodes.has(n.id)) {
      errors.push(`Node "${n.label}" (${n.id}) is not connected to any edges`);
    }
  });

  // Check for dangling edges (reference non-existent nodes)
  loop.edges.forEach((e) => {
    if (!loop.nodes.find((n) => n.id === e.source)) {
      errors.push(`Edge "${e.id}" references unknown source node "${e.source}"`);
    }
    if (!loop.nodes.find((n) => n.id === e.target)) {
      errors.push(`Edge "${e.id}" references unknown target node "${e.target}"`);
    }
  });

  // Check convergence rules
  if (loop.convergence.maxIterations < 1) errors.push("maxIterations must be >= 1");
  if (loop.convergence.dryRounds < 0) errors.push("dryRounds must be >= 0");
  if (loop.convergence.timeoutSeconds < 1) errors.push("timeoutSeconds must be >= 1");

  // Check for feedback edges without convergence guards
  const feedbackEdges = loop.edges.filter((e) => e.type === "feedback" || e.isFeedback);
  if (feedbackEdges.length > 0) {
    if (loop.convergence.maxIterations > 100) {
      errors.push(`Feedback loop detected but maxIterations (${loop.convergence.maxIterations}) is very high — risk of infinite execution`);
    }
    if (!loop.convergence.dedupeKey) {
      errors.push("Feedback loop detected but no dedupeKey set — infinite loop risk");
    }
  }

  return errors;
}

// =============================================================================
// STARGATE LOOP TYPES — General-Purpose Agent Loop Framework
//
// These loops are NOT tied to Midnight City. They are generic patterns that
// any Mosaic AI Agent can execute using data from Vault boxes, user inputs,
// or external networks.
//
// Principle: "Nodes are jobs, edges are dependencies."
// A loop is a cycle with mandatory convergence rules.
//
// The user creates loops in Stargate Graph. Mosaic AI Agents execute them.
// =============================================================================

export interface StargateLoop {
  id: string;
  name: string;
  description: string;
  trigger: LoopTrigger;
  nodes: LoopNode[];
  edges: LoopEdge[];
  convergence: LoopConvergence;
  testResults?: LoopTestResult[];
  status: LoopStatus;
  createdAt: string;
  updatedAt: string;
  vaultEntryId?: string; // reference to Mosaic Vault entry (if saved)
}

export interface LoopTrigger {
  type: "manual" | "timer" | "event" | "vault-change" | "mcp-signal";
  config: {
    /** Cron expression for timer triggers */
    cron?: string;
    /** Event name for event triggers */
    eventName?: string;
    /** Vault box ID for vault-change triggers */
    vaultBoxId?: string;
    /** Delay between iterations (ms) */
    intervalMs?: number;
  };
}

export interface LoopNode {
  id: string;
  type: LoopNodeType;
  label: string;
  description: string;
  config: Record<string, any>;
  /** Input contract — what this node expects */
  inputSchema: Record<string, any>;
  /** Output contract — what this node produces */
  outputSchema: Record<string, any>;
  estimatedMs?: number;
  isCheckpoint?: boolean;
}

export type LoopNodeType =
  | "agent-action"      // Execute action on a Mosaic AI Agent
  | "vault-read"        // Read from a Mosaic Vault box
  | "vault-write"       // Write result to Mosaic Vault (existing box)
  | "condition"         // Branch based on data
  | "delay"             // Wait N milliseconds
  | "parallel"          // Fan out to multiple nodes
  | "merge"             // Fan in — barrier
  | "verify"            // Assert a condition
  | "router"            // Route based on classification
  | "transform"         // Pure data transformation (zero cost)
  | "mcp-call"          // Call an MCP server tool
  | "notify"            // Send notification (toast, log, external)
  | "wait-for-input";   // Pause until user provides input

/** Enhanced config for mcp-call nodes — specifies server, tool, args, and data mapping */
export interface McpCallConfig {
  /** MCP server ID (from addonAPI.mcp.listServers) */
  serverId: string;
  /** Tool name within the MCP server (from addonAPI.mcp.listTools) */
  toolName: string;
  /** Static arguments passed to the tool */
  args?: Record<string, any>;
  /** Dynamic argument mapping: Vault data → tool args via {{...}} templates */
  argMapping?: Record<string, string>;
  /** Optional timeout in ms */
  timeoutMs?: number;
  /** Whether to retry on error */
  retryOnError?: boolean;
  /** Max retry attempts */
  maxRetries?: number;
}

export interface LoopEdge {
  id: string;
  source: string;
  target: string;
  type: LoopEdgeType;
  condition?: string;
  dataMapping?: Record<string, string>;
  isFeedback?: boolean;
}

export type LoopEdgeType =
  | "sequential"
  | "conditional"
  | "parallel"
  | "feedback"
  | "error"
  | "retry";

export interface LoopConvergence {
  maxIterations: number;
  dryRounds: number;
  timeoutSeconds: number;
  dedupeKey: string;
  backoff: "none" | "linear" | "exponential" | "fixed";
  fixedDelayMs?: number;
}

export interface LoopTestResult {
  runId: string;
  runAt: string;
  mode: "dry-run" | "live";
  iterations: number;
  dryRoundsHit: number;
  nodeOutcomes: LoopNodeOutcome[];
  edgeTraversals: LoopEdgeTraversal[];
  elapsedMs: number;
  converged: boolean;
  error?: string;
  summary: string;
  /** Phase B: per-node execution statistics */
  nodeStats?: Array<{
    nodeId: string;
    label: string;
    totalExecutions: number;
    avgElapsedMs: number;
    successRate: number;
  }>;
  /** Phase B: final state after live execution */
  state?: Record<string, any>;
  /** Phase B: verifier results for verify nodes */
  verifierResults?: Array<{
    nodeId: string;
    passed: boolean;
    score: number;
    verdicts: Array<{ lens: string; verdict: string; reason: string }>;
  }>;
}

export interface LoopNodeOutcome {
  nodeId: string;
  iteration: number;
  status: "ok" | "err" | "skipped" | "timeout" | "dry";
  input: Record<string, any>;
  output: Record<string, any>;
  elapsedMs: number;
}

export interface LoopEdgeTraversal {
  edgeId: string;
  iteration: number;
  timestamp: string;
  dataSnapshot: Record<string, any>;
}

export type LoopStatus = "draft" | "testing" | "tested" | "deployed" | "failed" | "disabled";

/** Runtime status for a loop execution — separate from design-time status */
export type LoopRunStatus = "running" | "completed" | "failed" | "paused";

/* ═════════════════════════════════════════════════════════════════════════════
   PRESET LOOPS — Generic patterns for Mosaic AI Agents
   ═════════════════════════════════════════════════════════════════════════════ */

/** PRESET 1: Knowledge Discovery Loop
 *  Read Vault → Query Agent → If incomplete → Expand search → Write back → Repeat
 *  Converges when agent returns "sufficient" 3 times in a row.
 */
export const PRESET_KNOWLEDGE_DISCOVERY: StargateLoop = {
  id: "loop-knowledge-discovery-v1",
  name: "Knowledge Discovery Loop",
  description: "Continuously read from Vault, ask agent to analyze, expand search if gaps found, write enriched knowledge back. Stops when agent reports 'sufficient'.",
  trigger: { type: "manual", config: {} },
  nodes: [
    {
      id: "node-read-vault",
      type: "vault-read",
      label: "Read Vault Box",
      description: "Read entries from a Mosaic Vault box",
      config: { boxName: "Research Notes", limit: 10 },
      inputSchema: { boxId: "string" },
      outputSchema: { entries: "array", count: "number" },
      estimatedMs: 500,
    },
    {
      id: "node-agent-analyze",
      type: "agent-action",
      label: "Agent Analyzes",
      description: "Ask Mosaic AI Agent to analyze entries and report completeness",
      config: { action: "analyze", prompt: "Analyze these entries for gaps. Report: {complete: boolean, gaps: string[], enriched: string}" },
      inputSchema: { entries: "array" },
      outputSchema: { complete: "boolean", gaps: "array", enriched: "string" },
      estimatedMs: 3000,
    },
    {
      id: "node-query-gbrain",
      type: "mcp-call",
      label: "Query Knowledge Graph",
      description: "Query gbrain MCP for related concepts and connections",
      config: {
        serverId: "gbrain",
        toolName: "query_knowledge",
        args: { limit: 5 },
        argMapping: { query: "{{entries[0].content}}" },
        timeoutMs: 10000,
      },
      inputSchema: { entries: "array" },
      outputSchema: { results: "array", concepts: "array" },
      estimatedMs: 3000,
    },
    {
      id: "node-check-complete",
      type: "condition",
      label: "Is Knowledge Complete?",
      description: "Branch based on agent completeness report and gbrain results",
      config: { field: "complete", operator: "===", value: true },
      inputSchema: { complete: "boolean", results: "array" },
      outputSchema: { result: "boolean" },
      estimatedMs: 100,
    },
    {
      id: "node-expand-search",
      type: "mcp-call",
      label: "Expand Search via Web",
      description: "Use hermes MCP to search web for missing information",
      config: {
        serverId: "hermes-tools",
        toolName: "hermes_web_search",
        argMapping: { query: "{{gaps[0]}}" },
        timeoutMs: 15000,
      },
      inputSchema: { gaps: "array" },
      outputSchema: { findings: "array", sources: "array" },
      estimatedMs: 8000,
    },
    {
      id: "node-write-vault",
      type: "vault-write",
      label: "Write Enriched Knowledge",
      description: "Write combined original + enriched data back to Vault",
      config: { boxName: "Research Notes", entryLabel: "enriched:{{timestamp}}" },
      inputSchema: { enriched: "string", findings: "array" },
      outputSchema: { saved: "boolean", entryId: "string" },
      estimatedMs: 500,
    },
    {
      id: "node-verify",
      type: "verify",
      label: "Verify Quality",
      description: "Assert enriched data meets quality threshold",
      config: { assert: "findings.length > 0", onFail: "retry" },
      inputSchema: { findings: "array" },
      outputSchema: { passed: "boolean" },
      estimatedMs: 100,
      isCheckpoint: true,
    },
  ],
  edges: [
    { id: "e-read-analyze", source: "node-read-vault", target: "node-agent-analyze", type: "sequential" },
    { id: "e-analyze-gbrain", source: "node-agent-analyze", target: "node-query-gbrain", type: "sequential" },
    { id: "e-gbrain-check", source: "node-query-gbrain", target: "node-check-complete", type: "sequential" },
    { id: "e-check-expand", source: "node-check-complete", target: "node-expand-search", type: "conditional", condition: "result === false" },
    { id: "e-expand-write", source: "node-expand-search", target: "node-write-vault", type: "sequential" },
    { id: "e-write-verify", source: "node-write-vault", target: "node-verify", type: "sequential" },
    // FEEDBACK: if incomplete, loop back to read (with dedupe)
    { id: "e-feedback", source: "node-verify", target: "node-read-vault", type: "feedback", isFeedback: true },
  ],
  convergence: {
    maxIterations: 10,
    dryRounds: 2,
    timeoutSeconds: 120,
    dedupeKey: "entryId",
    backoff: "linear",
  },
  status: "draft",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** PRESET 2: Agent Skill Training Loop
 *  Execute skill → Evaluate → If failed → Read Vault for fix → Apply fix → Retry → Repeat
 *  Converges when skill succeeds 3 times consecutively.
 */
export const PRESET_AGENT_SKILL_TRAINING: StargateLoop = {
  id: "loop-skill-training-v1",
  name: "Agent Skill Training Loop",
  description: "Test an agent skill, evaluate outcome, read correction from Vault if failed, retry with fix. Converges on 3 consecutive successes.",
  trigger: { type: "manual", config: {} },
  nodes: [
    {
      id: "node-execute-skill",
      type: "agent-action",
      label: "Execute Skill",
      description: "Ask Mosaic AI Agent to execute a specific skill",
      config: { action: "execute_skill", skillName: "data-analysis", params: {} },
      inputSchema: { skillName: "string", params: "object" },
      outputSchema: { result: "any", status: "string", error: "string" },
      estimatedMs: 5000,
    },
    {
      id: "node-evaluate",
      type: "condition",
      label: "Did Skill Succeed?",
      description: "Check if agent reported success",
      config: { field: "status", operator: "===", value: "success" },
      inputSchema: { status: "string" },
      outputSchema: { success: "boolean", error: "string" },
      estimatedMs: 100,
    },
    {
      id: "node-read-fix",
      type: "vault-read",
      label: "Read Fix from Vault",
      description: "Look up correction pattern in Vault 'Skill Corrections' box",
      config: { boxName: "Skill Corrections", filter: "error-type:{{error}}" },
      inputSchema: { error: "string" },
      outputSchema: { corrections: "array", bestMatch: "object" },
      estimatedMs: 500,
    },
    {
      id: "node-apply-fix",
      type: "transform",
      label: "Apply Fix",
      description: "Transform skill params using correction pattern (pure JS, zero cost)",
      config: { transform: "merge(params, bestMatch.fix)" },
      inputSchema: { params: "object", bestMatch: "object" },
      outputSchema: { fixedParams: "object" },
      estimatedMs: 0,
    },
    {
      id: "node-retry",
      type: "agent-action",
      label: "Retry with Fix",
      description: "Re-execute skill with corrected parameters",
      config: { action: "execute_skill", useFixedParams: true },
      inputSchema: { fixedParams: "object" },
      outputSchema: { result: "any", status: "string" },
      estimatedMs: 5000,
    },
    {
      id: "node-verify",
      type: "verify",
      label: "Verify 3 Successes",
      description: "Only pass when skill succeeded 3 times in a row",
      config: { assert: "successCount >= 3", onFail: "retry" },
      inputSchema: { successCount: "number" },
      outputSchema: { passed: "boolean" },
      estimatedMs: 100,
      isCheckpoint: true,
    },
  ],
  edges: [
    { id: "e-exec-eval", source: "node-execute-skill", target: "node-evaluate", type: "sequential" },
    { id: "e-eval-read", source: "node-evaluate", target: "node-read-fix", type: "conditional", condition: "success === false" },
    { id: "e-read-apply", source: "node-read-fix", target: "node-apply-fix", type: "sequential" },
    { id: "e-apply-retry", source: "node-apply-fix", target: "node-retry", type: "sequential" },
    { id: "e-retry-verify", source: "node-retry", target: "node-verify", type: "sequential" },
    // FEEDBACK: keep looping until 3 successes
    { id: "e-feedback", source: "node-verify", target: "node-execute-skill", type: "feedback", isFeedback: true },
  ],
  convergence: {
    maxIterations: 20,
    dryRounds: 3,
    timeoutSeconds: 300,
    dedupeKey: "error+fixedParams",
    backoff: "exponential",
  },
  status: "draft",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** PRESET 3: Multi-Agent Orchestration Loop
 *  Read task → Route to appropriate agent → Execute → Collect → Merge → If incomplete → Re-route → Repeat
 *  Converges when all sub-tasks report done.
 */
export const PRESET_MULTI_AGENT_ORCHESTRATION: StargateLoop = {
  id: "loop-multi-agent-v1",
  name: "Multi-Agent Orchestration Loop",
  description: "Read a complex task from Vault, fan out to multiple Mosaic AI Agents based on specialization, collect results, merge, and re-route incomplete sub-tasks. Converges when all branches report done.",
  trigger: { type: "vault-change", config: { vaultBoxId: "incoming-tasks" } },
  nodes: [
    {
      id: "node-read-task",
      type: "vault-read",
      label: "Read Task",
      description: "Read next pending task from Vault",
      config: { boxName: "incoming-tasks", status: "pending" },
      inputSchema: {},
      outputSchema: { taskId: "string", description: "string", subTasks: "array" },
      estimatedMs: 500,
    },
    {
      id: "node-router",
      type: "router",
      label: "Route to Agents",
      description: "Classify sub-tasks and route to appropriate agent specializations",
      config: { routes: ["research-agent", "code-agent", "review-agent"] },
      inputSchema: { subTasks: "array" },
      outputSchema: { assignments: "array" },
      estimatedMs: 500,
    },
    {
      id: "node-parallel-exec",
      type: "parallel",
      label: "Execute in Parallel",
      description: "Fan out: all assigned agents work simultaneously",
      config: { agentType: "mcp-tool", toolName: "agent:execute" },
      inputSchema: { assignments: "array" },
      outputSchema: { branchResults: "array" },
      estimatedMs: 8000,
    },
    {
      id: "node-merge",
      type: "merge",
      label: "Merge Results",
      description: "Fan in: wait for all branches, combine outputs",
      config: { strategy: "concatenate" },
      inputSchema: { branchResults: "array" },
      outputSchema: { merged: "object", completedCount: "number", totalCount: "number" },
      estimatedMs: 100,
    },
    {
      id: "node-check-done",
      type: "condition",
      label: "All Done?",
      description: "Check if all sub-tasks completed",
      config: { field: "completedCount", operator: "===", valueRef: "totalCount" },
      inputSchema: { completedCount: "number", totalCount: "number" },
      outputSchema: { allDone: "boolean" },
      estimatedMs: 100,
    },
    {
      id: "node-write-result",
      type: "vault-write",
      label: "Write Final Result",
      description: "Store merged result in Vault 'completed-tasks' box",
      config: { boxName: "completed-tasks", entryLabel: "task:{{taskId}}" },
      inputSchema: { taskId: "string", merged: "object" },
      outputSchema: { saved: "boolean" },
      estimatedMs: 500,
    },
    {
      id: "node-notify",
      type: "notify",
      label: "Notify User",
      description: "Send notification that task is complete",
      config: { channel: "toast", message: "Task {{taskId}} completed by {{completedCount}} agents" },
      inputSchema: { taskId: "string", completedCount: "number" },
      outputSchema: { sent: "boolean" },
      estimatedMs: 100,
    },
  ],
  edges: [
    { id: "e-read-route", source: "node-read-task", target: "node-router", type: "sequential" },
    { id: "e-route-parallel", source: "node-router", target: "node-parallel-exec", type: "sequential" },
    { id: "e-parallel-merge", source: "node-parallel-exec", target: "node-merge", type: "sequential" },
    { id: "e-merge-check", source: "node-merge", target: "node-check-done", type: "sequential" },
    { id: "e-check-write", source: "node-check-done", target: "node-write-result", type: "conditional", condition: "allDone === true" },
    { id: "e-write-notify", source: "node-write-result", target: "node-notify", type: "sequential" },
    // FEEDBACK: if not all done, re-route incomplete sub-tasks
    { id: "e-feedback", source: "node-check-done", target: "node-router", type: "feedback", isFeedback: true },
  ],
  convergence: {
    maxIterations: 10,
    dryRounds: 1,
    timeoutSeconds: 600,
    dedupeKey: "taskId+completedCount",
    backoff: "fixed",
    fixedDelayMs: 5000,
  },
  status: "draft",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Export all presets for UI */
export const LOOP_PRESETS: StargateLoop[] = [
  PRESET_KNOWLEDGE_DISCOVERY,
  PRESET_AGENT_SKILL_TRAINING,
  PRESET_MULTI_AGENT_ORCHESTRATION,
];

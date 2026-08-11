// =============================================================================
// LOOP TEMPLATE SERVICE — Karpathy-Inspired Reusable Loop Patterns
//
// Templates encode expert workflows (like Karpathy's manual processes) as
// pre-built loop definitions. Users select a template → auto-populates nodes,
// edges, convergence rules, and agent recommendations.
//
// Templates stored in-memory (not Vault) — they're Stargate primitives, not
// user data. Users can customize after loading.
// =============================================================================

import type { StargateLoop, LoopNode, LoopEdge, LoopConvergence } from "../../types/StargateLoop";

export interface LoopTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  tags: string[];
  /** Recommended agents for this template (by agent ID) */
  recommendedAgents: string[];
  /** Suggested MCP servers */
  suggestedMcpServers: string[];
  /** Default convergence rules */
  convergence: LoopConvergence;
  /** Template nodes */
  nodes: LoopNode[];
  /** Template edges */
  edges: LoopEdge[];
  /** Estimated success rate from historical data */
  estimatedSuccessRate?: number;
  /** Complexity: 1 (simple) - 5 (expert) */
  complexity: 1 | 2 | 3 | 4 | 5;
}

/* ── KARPATHY-INSPIRED TEMPLATES ─────────────────────────────────────────── */

/** TEMPLATE 1: Deep Research (Karpathy's "single prompt that powers deep research")
 *
 * Principle: Start broad → narrow → verify → synthesize.
 * Like Karpathy's workflow: search → read → "is this sufficient?" → iterate.
 */
export const TEMPLATE_DEEP_RESEARCH: LoopTemplate = {
  id: "template-deep-research",
  name: "Deep Research",
  description: "Karpathy-style deep research: search broadly, synthesize narrowly, verify completeness. Uses gbrain for knowledge graph + hermes for web search.",
  author: "karpathy-inspired",
  category: "research",
  tags: ["research", "knowledge", "synthesis", "karpathy"],
  recommendedAgents: ["mosaic-main", "byron"],
  suggestedMcpServers: ["gbrain", "hermes-tools"],
  complexity: 3,
  estimatedSuccessRate: 0.87,
  convergence: {
    maxIterations: 10,
    dryRounds: 2,
    timeoutSeconds: 300,
    dedupeKey: "summary_hash",
    backoff: "exponential",
    fixedDelayMs: 5000,
  },
  nodes: [
    {
      id: "t1-vault-read",
      type: "vault-read",
      label: "Read Topic",
      description: "Read initial topic from Vault",
      config: { boxName: "Research Notes", limit: 5 },
      inputSchema: {},
      outputSchema: { entries: "array" },
      estimatedMs: 500,
    },
    {
      id: "t1-agent-draft",
      type: "agent-action",
      label: "Draft Search Plan",
      description: "Agent creates search queries based on topic",
      config: {
        action: "plan_search",
        systemPrompt: "You are a research analyst. Given a topic, generate 3-5 specific search queries that will uncover the most important information. Be precise."
      },
      inputSchema: { entries: "array" },
      outputSchema: { queries: "array", plan: "string" },
      estimatedMs: 3000,
    },
    {
      id: "t1-parallel-search",
      type: "parallel",
      label: "Parallel Search",
      description: "Execute multiple searches in parallel via MCP",
      config: { branches: 3 },
      inputSchema: { queries: "array" },
      outputSchema: { results: "array" },
      estimatedMs: 15000,
    },
    {
      id: "t1-gbrain-query",
      type: "mcp-call",
      label: "Query Knowledge Graph",
      description: "Query gbrain for related concepts",
      config: {
        serverId: "gbrain",
        toolName: "query_knowledge",
        argMapping: { query: "{{plan}}" },
        timeoutMs: 10000,
      },
      inputSchema: { plan: "string" },
      outputSchema: { concepts: "array", connections: "array" },
      estimatedMs: 5000,
    },
    {
      id: "t1-merge-results",
      type: "merge",
      label: "Merge Results",
      description: "Combine web search + knowledge graph results",
      config: {},
      inputSchema: { results: "array", concepts: "array" },
      outputSchema: { merged: "object" },
      estimatedMs: 100,
    },
    {
      id: "t1-agent-synthesize",
      type: "agent-action",
      label: "Synthesize Findings",
      description: "Agent synthesizes merged results into coherent summary",
      config: {
        action: "synthesize",
        systemPrompt: "Synthesize the following research findings into a coherent summary. Include key insights, contradictions, and open questions. Be concise but thorough."
      },
      inputSchema: { merged: "object" },
      outputSchema: { summary: "string", confidence: "number" },
      estimatedMs: 5000,
    },
    {
      id: "t1-check-complete",
      type: "condition",
      label: "Is Research Complete?",
      description: "Check if summary meets quality threshold",
      config: { field: "confidence", operator: ">", value: 0.8 },
      inputSchema: { confidence: "number" },
      outputSchema: { result: "boolean" },
      estimatedMs: 100,
    },
    {
      id: "t1-transform-output",
      type: "transform",
      label: "Format Output",
      description: "Transform summary into structured format",
      config: { format: "markdown", includeSources: true },
      inputSchema: { summary: "string" },
      outputSchema: { formatted: "string" },
      estimatedMs: 200,
    },
    {
      id: "t1-vault-write",
      type: "vault-write",
      label: "Save Research",
      description: "Write formatted research to Vault",
      config: { boxName: "Research Notes", entryLabel: "deep-research:{{timestamp}}" },
      inputSchema: { formatted: "string" },
      outputSchema: { saved: "boolean" },
      estimatedMs: 500,
    },
  ],
  edges: [
    { id: "e1", source: "t1-vault-read", target: "t1-agent-draft", type: "sequential" },
    { id: "e2", source: "t1-agent-draft", target: "t1-parallel-search", type: "sequential" },
    { id: "e3", source: "t1-parallel-search", target: "t1-gbrain-query", type: "parallel" },
    { id: "e4", source: "t1-gbrain-query", target: "t1-merge-results", type: "sequential" },
    { id: "e5", source: "t1-merge-results", target: "t1-agent-synthesize", type: "sequential" },
    { id: "e6", source: "t1-agent-synthesize", target: "t1-check-complete", type: "sequential" },
    { id: "e7", source: "t1-check-complete", target: "t1-transform-output", type: "conditional", condition: "result === true" },
    { id: "e8", source: "t1-transform-output", target: "t1-vault-write", type: "sequential" },
    { id: "e-feedback", source: "t1-check-complete", target: "t1-agent-draft", type: "feedback", isFeedback: true },
  ],
};

/** TEMPLATE 2: Code Review with Quality Gates (Karpathy's "writing code without chaos")
 *
 * Principle: Draft → Test → Fix → Verify → Commit. Never skip tests.
 */
export const TEMPLATE_CODE_REVIEW: LoopTemplate = {
  id: "template-code-review",
  name: "Code Review with Quality Gates",
  description: "Karpathy-style code workflow: draft → test → fix → verify → save. Uses agent skill training pattern with verification checkpoints.",
  author: "karpathy-inspired",
  category: "development",
  tags: ["code", "review", "testing", "quality", "karpathy"],
  recommendedAgents: ["code-reviewer", "mosaic-main"],
  suggestedMcpServers: ["hermes-tools"],
  complexity: 4,
  estimatedSuccessRate: 0.82,
  convergence: {
    maxIterations: 8,
    dryRounds: 2,
    timeoutSeconds: 600,
    dedupeKey: "test_results_hash",
    backoff: "fixed",
    fixedDelayMs: 3000,
  },
  nodes: [
    {
      id: "t2-vault-read",
      type: "vault-read",
      label: "Read Code",
      description: "Read code from Vault box",
      config: { boxName: "code-review-queue", limit: 1 },
      inputSchema: {},
      outputSchema: { entries: "array" },
      estimatedMs: 500,
    },
    {
      id: "t2-agent-review",
      type: "agent-action",
      label: "Review Code",
      description: "Agent reviews code for issues, style, security",
      config: {
        action: "review_code",
        systemPrompt: "You are a senior software engineer. Review the code for: 1) Bugs, 2) Security issues, 3) Performance problems, 4) Style violations. Output structured review with severity levels."
      },
      inputSchema: { entries: "array" },
      outputSchema: { issues: "array", suggestions: "array", severity: "string" },
      estimatedMs: 5000,
    },
    {
      id: "t2-verify-severity",
      type: "verify",
      label: "Check Critical Issues",
      description: "Fail if any critical issues found",
      config: { assert: "severity !== 'critical'", onFail: "halt" },
      inputSchema: { severity: "string" },
      outputSchema: { passed: "boolean" },
      estimatedMs: 100,
      isCheckpoint: true,
    },
    {
      id: "t2-mcp-test",
      type: "mcp-call",
      label: "Run Tests",
      description: "Execute test suite via hermes terminal",
      config: {
        serverId: "hermes-tools",
        toolName: "hermes_terminal_run",
        args: { command: "npm test", timeout: 60000 },
        timeoutMs: 65000,
      },
      inputSchema: {},
      outputSchema: { exitCode: "number", stdout: "string", stderr: "string" },
      estimatedMs: 30000,
    },
    {
      id: "t2-condition-tests",
      type: "condition",
      label: "Tests Passing?",
      description: "Branch based on test results",
      config: { field: "exitCode", operator: "===", value: 0 },
      inputSchema: { exitCode: "number" },
      outputSchema: { result: "boolean" },
      estimatedMs: 100,
    },
    {
      id: "t2-agent-fix",
      type: "agent-action",
      label: "Fix Issues",
      description: "Agent fixes failing tests",
      config: {
        action: "fix_code",
        systemPrompt: "Fix the failing tests. Do not change test expectations unless the test itself is wrong. Provide minimal, correct fixes."
      },
      inputSchema: { stderr: "string", issues: "array" },
      outputSchema: { fixes: "array", fixed: "boolean" },
      estimatedMs: 8000,
    },
    {
      id: "t2-transform-report",
      type: "transform",
      label: "Generate Report",
      description: "Format review results into markdown report",
      config: { format: "markdown", sections: ["summary", "issues", "suggestions"] },
      inputSchema: { issues: "array", suggestions: "array" },
      outputSchema: { report: "string" },
      estimatedMs: 500,
    },
    {
      id: "t2-vault-write",
      type: "vault-write",
      label: "Save Review",
      description: "Save review report to Vault",
      config: { boxName: "code-reviews", entryLabel: "review:{{timestamp}}" },
      inputSchema: { report: "string" },
      outputSchema: { saved: "boolean" },
      estimatedMs: 500,
    },
  ],
  edges: [
    { id: "e1", source: "t2-vault-read", target: "t2-agent-review", type: "sequential" },
    { id: "e2", source: "t2-agent-review", target: "t2-verify-severity", type: "sequential" },
    { id: "e3", source: "t2-verify-severity", target: "t2-mcp-test", type: "sequential" },
    { id: "e4", source: "t2-mcp-test", target: "t2-condition-tests", type: "sequential" },
    { id: "e5", source: "t2-condition-tests", target: "t2-transform-report", type: "conditional", condition: "result === true" },
    { id: "e6", source: "t2-condition-tests", target: "t2-agent-fix", type: "conditional", condition: "result === false" },
    { id: "e7", source: "t2-agent-fix", target: "t2-mcp-test", type: "sequential" },
    { id: "e8", source: "t2-transform-report", target: "t2-vault-write", type: "sequential" },
  ],
};

/** TEMPLATE 3: Multi-Modal Content Pipeline (Karpathy's NotebookLM pattern)
 *
 * Principle: Content → Transform → Distribute. One input, many outputs.
 */
export const TEMPLATE_CONTENT_PIPELINE: LoopTemplate = {
  id: "template-content-pipeline",
  name: "Multi-Modal Content Pipeline",
  description: "Transform Vault content into multiple formats: summary, thread, audio script. Like Karpathy's NotebookLM → podcast workflow.",
  author: "karpathy-inspired",
  category: "content",
  tags: ["content", "transform", "multi-modal", "karpathy"],
  recommendedAgents: ["byron", "mosaic-main"],
  suggestedMcpServers: ["gbrain", "buzz"],
  complexity: 2,
  estimatedSuccessRate: 0.91,
  convergence: {
    maxIterations: 5,
    dryRounds: 1,
    timeoutSeconds: 180,
    dedupeKey: "content_hash",
    backoff: "none",
  },
  nodes: [
    {
      id: "t3-vault-read",
      type: "vault-read",
      label: "Read Source Content",
      description: "Read content from Vault",
      config: { boxName: "creative-projects", limit: 1 },
      inputSchema: {},
      outputSchema: { entries: "array" },
      estimatedMs: 500,
    },
    {
      id: "t3-router",
      type: "router",
      label: "Route by Format",
      description: "Route content to appropriate transformation",
      config: { field: "targetFormat", routes: ["summary", "thread", "podcast"] },
      inputSchema: { entries: "array" },
      outputSchema: { route: "string" },
      estimatedMs: 200,
    },
    {
      id: "t3-transform-summary",
      type: "transform",
      label: "Generate Summary",
      description: "Transform into concise summary",
      config: { format: "markdown", maxLength: 500 },
      inputSchema: { entries: "array" },
      outputSchema: { summary: "string" },
      estimatedMs: 3000,
    },
    {
      id: "t3-transform-thread",
      type: "transform",
      label: "Generate Thread",
      description: "Transform into tweet thread",
      config: { format: "thread", maxTweets: 10 },
      inputSchema: { entries: "array" },
      outputSchema: { tweets: "array" },
      estimatedMs: 3000,
    },
    {
      id: "t3-transform-podcast",
      type: "transform",
      label: "Generate Podcast Script",
      description: "Transform into conversational podcast script",
      config: { format: "podcast", speakers: 2, style: "conversational" },
      inputSchema: { entries: "array" },
      outputSchema: { script: "string", segments: "array" },
      estimatedMs: 5000,
    },
    {
      id: "t3-merge",
      type: "merge",
      label: "Collect Outputs",
      description: "Gather all transformed outputs",
      config: {},
      inputSchema: { summary: "string", tweets: "array", script: "string" },
      outputSchema: { outputs: "array" },
      estimatedMs: 100,
    },
    {
      id: "t3-mcp-buzz",
      type: "mcp-call",
      label: "Publish to Buzz",
      description: "Publish thread to Buzz relay",
      config: {
        serverId: "buzz",
        toolName: "buzz_publish_event",
        argMapping: { content: "{{tweets[0]}}", kind: "1" },
      },
      inputSchema: { tweets: "array" },
      outputSchema: { eventId: "string" },
      estimatedMs: 2000,
    },
    {
      id: "t3-vault-write",
      type: "vault-write",
      label: "Save All Outputs",
      description: "Save all transformed content to Vault",
      config: { boxName: "creative-projects", entryLabel: "pipeline:{{timestamp}}" },
      inputSchema: { outputs: "array" },
      outputSchema: { saved: "boolean" },
      estimatedMs: 500,
    },
  ],
  edges: [
    { id: "e1", source: "t3-vault-read", target: "t3-router", type: "sequential" },
    { id: "e2a", source: "t3-router", target: "t3-transform-summary", type: "conditional", condition: "route === 'summary'" },
    { id: "e2b", source: "t3-router", target: "t3-transform-thread", type: "conditional", condition: "route === 'thread'" },
    { id: "e2c", source: "t3-router", target: "t3-transform-podcast", type: "conditional", condition: "route === 'podcast'" },
    { id: "e3a", source: "t3-transform-summary", target: "t3-merge", type: "sequential" },
    { id: "e3b", source: "t3-transform-thread", target: "t3-merge", type: "sequential" },
    { id: "e3c", source: "t3-transform-podcast", target: "t3-merge", type: "sequential" },
    { id: "e4", source: "t3-merge", target: "t3-mcp-buzz", type: "sequential" },
    { id: "e5", source: "t3-mcp-buzz", target: "t3-vault-write", type: "sequential" },
  ],
};

/** TEMPLATE 4: Model Cascade (Karpathy's "cheap → expensive" pattern)
 *
 * Principle: Use fast/cheap model to draft, expensive model to review.
 * Saves tokens and latency on simple tasks.
 */
export const TEMPLATE_MODEL_CASCADE: LoopTemplate = {
  id: "template-model-cascade",
  name: "Model Cascade",
  description: "Karpathy's efficiency pattern: fast local model drafts, expensive model reviews. Auto-selects based on task complexity.",
  author: "karpathy-inspired",
  category: "optimization",
  tags: ["cascade", "optimization", "cost", "latency", "karpathy"],
  recommendedAgents: ["mosaic-main", "byron"],
  suggestedMcpServers: [],
  complexity: 4,
  estimatedSuccessRate: 0.88,
  convergence: {
    maxIterations: 6,
    dryRounds: 1,
    timeoutSeconds: 120,
    dedupeKey: "output_hash",
    backoff: "linear",
    fixedDelayMs: 2000,
  },
  nodes: [
    {
      id: "t4-classify",
      type: "agent-action",
      label: "Classify Task",
      description: "Classify task complexity (1-5)",
      config: {
        action: "classify",
        systemPrompt: "Classify the following task as: simple (1-2: use local model), medium (3: use mid-tier), or complex (4-5: use best model). Return just the number."
      },
      inputSchema: { task: "string" },
      outputSchema: { complexity: "number", reasoning: "string" },
      estimatedMs: 2000,
    },
    {
      id: "t4-router",
      type: "router",
      label: "Route by Complexity",
      description: "Route to appropriate model tier",
      config: { field: "complexity", routes: ["fast", "balanced", "powerful"] },
      inputSchema: { complexity: "number" },
      outputSchema: { route: "string" },
      estimatedMs: 100,
    },
    {
      id: "t4-fast-agent",
      type: "agent-action",
      label: "Fast Draft (Local)",
      description: "Quick draft using local/ollama model",
      config: {
        action: "draft",
        agentId: "mosaic-main", // local ollama
        systemPrompt: "Quick draft. Don't overthink. Get the core idea down."
      },
      inputSchema: { task: "string" },
      outputSchema: { draft: "string" },
      estimatedMs: 3000,
    },
    {
      id: "t4-balanced-agent",
      type: "agent-action",
      label: "Balanced Draft",
      description: "Medium quality draft using Claude Sonnet",
      config: {
        action: "draft",
        agentId: "byron",
        systemPrompt: "Produce a well-structured draft. Balance speed and quality."
      },
      inputSchema: { task: "string" },
      outputSchema: { draft: "string" },
      estimatedMs: 5000,
    },
    {
      id: "t4-powerful-agent",
      type: "agent-action",
      label: "Full Draft (Claude/GPT-4)",
      description: "High-quality draft using best model",
      config: {
        action: "draft",
        agentId: "code-reviewer",
        systemPrompt: "Produce a comprehensive, high-quality draft. Research if needed. Include citations."
      },
      inputSchema: { task: "string" },
      outputSchema: { draft: "string" },
      estimatedMs: 10000,
    },
    {
      id: "t4-review",
      type: "agent-action",
      label: "Review Draft",
      description: "Expensive model reviews and improves",
      config: {
        action: "review",
        systemPrompt: "Review this draft for accuracy, completeness, and clarity. Suggest improvements."
      },
      inputSchema: { draft: "string" },
      outputSchema: { reviewed: "string", score: "number" },
      estimatedMs: 5000,
    },
    {
      id: "t4-condition-quality",
      type: "condition",
      label: "Quality Acceptable?",
      description: "Check if review score meets threshold",
      config: { field: "score", operator: ">=", value: 0.85 },
      inputSchema: { score: "number" },
      outputSchema: { result: "boolean" },
      estimatedMs: 100,
    },
    {
      id: "t4-vault-write",
      type: "vault-write",
      label: "Save Final",
      description: "Save reviewed output",
      config: { boxName: "completed-tasks", entryLabel: "cascade:{{timestamp}}" },
      inputSchema: { reviewed: "string" },
      outputSchema: { saved: "boolean" },
      estimatedMs: 500,
    },
  ],
  edges: [
    { id: "e1", source: "t4-classify", target: "t4-router", type: "sequential" },
    { id: "e2a", source: "t4-router", target: "t4-fast-agent", type: "conditional", condition: "route === 'fast'" },
    { id: "e2b", source: "t4-router", target: "t4-balanced-agent", type: "conditional", condition: "route === 'balanced'" },
    { id: "e2c", source: "t4-router", target: "t4-powerful-agent", type: "conditional", condition: "route === 'powerful'" },
    { id: "e3a", source: "t4-fast-agent", target: "t4-review", type: "sequential" },
    { id: "e3b", source: "t4-balanced-agent", target: "t4-review", type: "sequential" },
    { id: "e3c", source: "t4-powerful-agent", target: "t4-review", type: "sequential" },
    { id: "e4", source: "t4-review", target: "t4-condition-quality", type: "sequential" },
    { id: "e5", source: "t4-condition-quality", target: "t4-vault-write", type: "conditional", condition: "result === true" },
    { id: "e6", source: "t4-condition-quality", target: "t4-powerful-agent", type: "feedback", isFeedback: true },
  ],
};

/** TEMPLATE 5: Memory-Augmented Agent (Karpathy's context window management)
 *
 * Principle: Don't lose context. Summarize → Store → Retrieve → Continue.
 */
export const TEMPLATE_MEMORY_AUGMENTED: LoopTemplate = {
  id: "template-memory-augmented",
  name: "Memory-Augmented Agent",
  description: "Karpathy's context management: summarize conversation, store in Vault, retrieve when needed. Prevents context window overflow.",
  author: "karpathy-inspired",
  category: "memory",
  tags: ["memory", "context", "summarization", "karpathy"],
  recommendedAgents: ["mosaic-main"],
  suggestedMcpServers: ["gbrain"],
  complexity: 3,
  estimatedSuccessRate: 0.85,
  convergence: {
    maxIterations: 20,
    dryRounds: 3,
    timeoutSeconds: 600,
    dedupeKey: "conversation_hash",
    backoff: "exponential",
    fixedDelayMs: 3000,
  },
  nodes: [
    {
      id: "t5-vault-read",
      type: "vault-read",
      label: "Load Context",
      description: "Read previous conversation summary",
      config: { boxName: "conversation-memory", limit: 1 },
      inputSchema: {},
      outputSchema: { entries: "array" },
      estimatedMs: 500,
    },
    {
      id: "t5-agent-process",
      type: "agent-action",
      label: "Process Input",
      description: "Agent processes user input with loaded context",
      config: {
        action: "process",
        systemPrompt: "You have access to previous conversation context. Use it to provide coherent, context-aware responses."
      },
      inputSchema: { entries: "array", userInput: "string" },
      outputSchema: { response: "string", tokensUsed: "number" },
      estimatedMs: 5000,
    },
    {
      id: "t5-condition-overflow",
      type: "condition",
      label: "Context Overflow?",
      description: "Check if approaching context limit",
      config: { field: "tokensUsed", operator: ">", value: 3000 },
      inputSchema: { tokensUsed: "number" },
      outputSchema: { result: "boolean" },
      estimatedMs: 100,
    },
    {
      id: "t5-agent-summarize",
      type: "agent-action",
      label: "Summarize Context",
      description: "Summarize conversation to free context",
      config: {
        action: "summarize",
        systemPrompt: "Summarize the key points of this conversation. Preserve facts, decisions, and open questions. Discard pleasantries."
      },
      inputSchema: { response: "string" },
      outputSchema: { summary: "string", keyFacts: "array" },
      estimatedMs: 3000,
    },
    {
      id: "t5-vault-write-summary",
      type: "vault-write",
      label: "Save Summary",
      description: "Write summary back to Vault",
      config: { boxName: "conversation-memory", entryLabel: "summary:{{timestamp}}" },
      inputSchema: { summary: "string" },
      outputSchema: { saved: "boolean" },
      estimatedMs: 500,
    },
    {
      id: "t5-wait-input",
      type: "wait-for-input",
      label: "Wait for Next Input",
      description: "Pause for user input",
      config: { prompt: "Enter next message (or 'exit' to end):" },
      inputSchema: {},
      outputSchema: { userInput: "string" },
      estimatedMs: 0,
    },
  ],
  edges: [
    { id: "e1", source: "t5-vault-read", target: "t5-agent-process", type: "sequential" },
    { id: "e2", source: "t5-agent-process", target: "t5-condition-overflow", type: "sequential" },
    { id: "e3a", source: "t5-condition-overflow", target: "t5-agent-summarize", type: "conditional", condition: "result === true" },
    { id: "e3b", source: "t5-condition-overflow", target: "t5-wait-input", type: "conditional", condition: "result === false" },
    { id: "e4", source: "t5-agent-summarize", target: "t5-vault-write-summary", type: "sequential" },
    { id: "e5", source: "t5-vault-write-summary", target: "t5-wait-input", type: "sequential" },
    { id: "e6", source: "t5-wait-input", target: "t5-vault-read", type: "feedback", isFeedback: true },
  ],
};

/* ── TEMPLATE REGISTRY ───────────────────────────────────────────────────── */

export const LOOP_TEMPLATES: LoopTemplate[] = [
  TEMPLATE_DEEP_RESEARCH,
  TEMPLATE_CODE_REVIEW,
  TEMPLATE_CONTENT_PIPELINE,
  TEMPLATE_MODEL_CASCADE,
  TEMPLATE_MEMORY_AUGMENTED,
];

export const TemplateService = {
  getAll: () => LOOP_TEMPLATES,
  getById: (id: string) => LOOP_TEMPLATES.find((t) => t.id === id),
  getByCategory: (category: string) => LOOP_TEMPLATES.filter((t) => t.category === category),
  getByTag: (tag: string) => LOOP_TEMPLATES.filter((t) => t.tags.includes(tag)),
  getRecommendedForAgent: (agentId: string) =>
    LOOP_TEMPLATES.filter((t) => t.recommendedAgents.includes(agentId)),

  /** Convert a template to a usable StargateLoop */
  instantiate: (templateId: string, overrides?: Partial<StargateLoop>): StargateLoop | null => {
    const template = LOOP_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return null;

    // Generate new IDs for nodes and edges, but keep edge sources/targets in sync
    const nodeIdMap = new Map<string, string>();
    const nodes = template.nodes.map((n) => {
      const newId = `${n.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      nodeIdMap.set(n.id, newId);
      return { ...n, id: newId };
    });

    const edges = template.edges.map((e) => {
      const newSource = nodeIdMap.get(e.source) || e.source;
      const newTarget = nodeIdMap.get(e.target) || e.target;
      return {
        ...e,
        id: `${e.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: newSource,
        target: newTarget,
      };
    });

    return {
      id: `loop-${templateId}-${Date.now()}`,
      name: template.name,
      description: template.description,
      trigger: { type: "manual", config: {} },
      nodes,
      edges,
      convergence: { ...template.convergence },
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  },

  /** Get template categories for UI filtering */
  getCategories: () => [...new Set(LOOP_TEMPLATES.map((t) => t.category))],

  /** Get all tags for UI cloud */
  getAllTags: () => [...new Set(LOOP_TEMPLATES.flatMap((t) => t.tags))],
};

export default TemplateService;

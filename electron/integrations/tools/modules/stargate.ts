/**
 * Stargate ToolModule
 *
 * Bridges Stargate Command Center operations into Mosaic's native ToolRegistry.
 * Surfaces tools for HyperAIBox node dispatch, AIM deployment, job execution,
 * and tilling (community compute) management.
 */

import type { ToolModule, ToolDefinition } from "../types";

// =============================================================================
// Tool Definitions
// =============================================================================

const TOOLS: ToolDefinition[] = [
  {
    name: "stargate_dispatch_prompt",
    description: "Dispatch a prompt to a Stargate agent running on a remote HyperAIBox via SSH. Use for node management, configuration updates, or remote diagnostics.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Node ID or hostname (e.g. 'c-3po', 'r2-d2')" },
        prompt: { type: "string", description: "The command or prompt to execute on the remote node" },
      },
      required: ["nodeId", "prompt"],
    },
    handler: async (args: { nodeId: string; prompt: string }) => {
      try {
        const result = await (window as any).electronAPI?.stargate?.dispatchPrompt(args.nodeId, args.prompt);
        if (!result?.success) {
          return { success: false, error: result?.error || "Dispatch failed" };
        }
        return { success: true, data: result.response, stderr: result.stderr };
      } catch (err: any) {
        return { success: false, error: err.message || "Stargate dispatch error" };
      }
    },
  },
  {
    name: "stargate_run_job",
    description: "Run a Hermes CLI job on the local machine. Supports: deploy, test, lint, build, aimify.",
    inputSchema: {
      type: "object",
      properties: {
        jobType: {
          type: "string",
          enum: ["deploy", "test", "lint", "build", "aimify"],
          description: "Type of job to run",
        },
        params: {
          type: "object",
          description: "Job-specific parameters (e.g. { agentId: string, code: string })",
        },
      },
      required: ["jobType"],
    },
    handler: async (args: { jobType: string; params?: Record<string, unknown> }) => {
      try {
        const result = await (window as any).electronAPI?.stargate?.runJob(args.jobType, args.params || {});
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message || "Job execution failed" };
      }
    },
  },
  {
    name: "stargate_test_agent_code",
    description: "Test a piece of agent code against a known template before deployment. Returns lint results, execution output, and safety checks.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "The agent code to test (Python/TypeScript)" },
        templateId: { type: "string", description: "Template ID to validate against (e.g. 'midnight-miner-v2')" },
      },
      required: ["code", "templateId"],
    },
    handler: async (args: { code: string; templateId: string }) => {
      try {
        const result = await (window as any).electronAPI?.stargate?.testAgentCode(args.code, args.templateId);
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message || "Code test failed" };
      }
    },
  },
  {
    name: "stargate_deploy_agent",
    description: "Deploy an agent to the Stargate Agent Forge. The agent will be packaged, registered, and started.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Agent code to deploy" },
        config: {
          type: "object",
          description: "Deployment config: { name, version, env, resources }",
        },
      },
      required: ["code", "config"],
    },
    handler: async (args: { code: string; config: Record<string, unknown> }) => {
      try {
        const result = await (window as any).electronAPI?.stargate?.deployAgentCode(args.code, args.config);
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message || "Deployment failed" };
      }
    },
  },
  {
    name: "stargate_list_deployed_agents",
    description: "List all agents currently deployed in the Stargate Agent Forge.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      try {
        const result = await (window as any).electronAPI?.stargate?.listDeployedAgents();
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message || "List failed" };
      }
    },
  },
  {
    name: "stargate_list_running_agents",
    description: "List agents currently running in Stargate (includes health status, PID, uptime).",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      try {
        const result = await (window as any).electronAPI?.stargate?.listRunningAgents();
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message || "List failed" };
      }
    },
  },
  {
    name: "stargate_stop_agent",
    description: "Stop a running agent by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent ID to stop" },
      },
      required: ["agentId"],
    },
    handler: async (args: { agentId: string }) => {
      try {
        const result = await (window as any).electronAPI?.stargate?.stopAgent(args.agentId);
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message || "Stop failed" };
      }
    },
  },
  {
    name: "stargate_check_agent_health",
    description: "Check if a deployed agent is healthy (responsive, not crashed).",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent ID to check" },
      },
      required: ["agentId"],
    },
    handler: async (args: { agentId: string }) => {
      try {
        const result = await (window as any).electronAPI?.stargate?.isHealthy(args.agentId);
        return { success: true, data: { healthy: result } };
      } catch (err: any) {
        return { success: false, error: err.message || "Health check failed" };
      }
    },
  },
  {
    name: "stargate_aimify_exec",
    description: "Execute a shell command in the Aimify workspace (Hermes → HyperCycle AIM packaging pipeline).",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to execute" },
        args: { type: "array", items: { type: "string" }, description: "Command arguments" },
        cwd: { type: "string", description: "Working directory (optional)" },
        timeout: { type: "number", description: "Timeout in ms (optional)" },
      },
      required: ["command"],
    },
    handler: async (args: { command: string; args?: string[]; cwd?: string; timeout?: number }) => {
      try {
        const result = await (window as any).electronAPI?.stargate?.aimify?.exec(
          args.command,
          args.args || [],
          { cwd: args.cwd, timeout: args.timeout }
        );
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message || "Aimify exec failed" };
      }
    },
  },
  {
    name: "stargate_tilling_provision",
    description: "Provision a new tilling session (community node factory compute). Requires a valid CBNO license.",
    inputSchema: {
      type: "object",
      properties: {
        licenseId: { type: "string", description: "CBNO license ID / ANFE token" },
        ownerWallet: { type: "string", description: "Owner wallet address" },
        network: { type: "string", description: "Network: 'mainnet' or 'testnet'" },
        pricingModel: { type: "string", description: "Pricing model: 'flat', 'per-call', 'per-hour'" },
        durationDays: { type: "number", description: "Session duration in days" },
      },
      required: ["licenseId", "ownerWallet", "network", "durationDays"],
    },
    handler: async (args: { licenseId: string; ownerWallet: string; network: string; pricingModel?: string; durationDays: number }) => {
      try {
        const result = await (window as any).electronAPI?.stargate?.tilling?.provision({
          licenseId: args.licenseId,
          ownerWallet: args.ownerWallet,
          network: args.network,
          pricingModel: args.pricingModel || "flat",
          durationDays: args.durationDays,
        });
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message || "Tilling provision failed" };
      }
    },
  },
  {
    name: "stargate_tilling_list_sessions",
    description: "List all active tilling sessions for the current wallet.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string", description: "Wallet address filter (optional)" },
      },
    },
    handler: async (args: { wallet?: string }) => {
      try {
        const result = await (window as any).electronAPI?.stargate?.tilling?.getSessions(args.wallet);
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message || "List sessions failed" };
      }
    },
  },
  {
    name: "stargate_tilling_stop",
    description: "Stop a tilling session by tenant ID.",
    inputSchema: {
      type: "object",
      properties: {
        tenantId: { type: "string", description: "Tenant/session ID to stop" },
      },
      required: ["tenantId"],
    },
    handler: async (args: { tenantId: string }) => {
      try {
        const result = await (window as any).electronAPI?.stargate?.tilling?.stop(args.tenantId);
        return { success: true, data: result };
      } catch (err: any) {
        return { success: false, error: err.message || "Stop failed" };
      }
    },
  },
];

// =============================================================================
// Module Export
// =============================================================================

export class StargateModule implements ToolModule {
  name = "stargate";
  displayName = "Stargate Command Center";
  actionPatterns = [];

  tools: ToolDefinition[] = TOOLS;

  getSystemPrompt(): string {
    return `You are connected to the Stargate Command Center — the community portal for Midnight developers and HyperCycle node operators.

You can manage HyperAIBox nodes, deploy AI agents, run jobs, and provision community compute (tilling).

STARGATE NODES (HyperAIBox fleet):
- c-3po: Testbed (RK3588, Ubuntu 22.04, glibc 2.35) — validates updates first
- r2-d2: Validator-only (RK3588, Ubuntu 20.04, glibc 2.31) — no Node Manager
- atomman: Production (x86_64, Ubuntu, glibc 2.39) — gets updates after C-3PO

When dispatching prompts to nodes:
- Use the node ID (e.g. "c-3po") not a full hostname
- Commands run via SSH as hyperai@<node>
- Keep prompts under 500 chars for reliability
- Expect 30s timeout for complex operations

For AIM deployments:
- Code is validated via testAgentCode first (recommended)
- deployAgent packages → registers → starts
- Check health with check_agent_health after deploy

For tilling (community compute):
- Requires valid CBNO license / ANFE token
- Pricing models: flat (monthly), per-call, per-hour
- Sessions auto-expire after durationDays`;
  }

  async isAvailable(): Promise<boolean> {
    // Stargate is available if the electronAPI is present (always in Mosaic)
    return !!(window as any).electronAPI?.stargate;
  }
}

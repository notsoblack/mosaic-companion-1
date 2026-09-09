#!/usr/bin/env node
/**
 * HyperCycle Node Factory MCP Server
 *
 * Exposes HyperCycle Node Factory CLI tools via MCP stdio protocol.
 * Lets MosAIc Companion AI agents query node status, AIM slots, and pool data.
 *
 * Protocol: MCP 2024-11-05 (stdio / JSON-RPC 2.0)
 */

const { execSync } = require("child_process");
const readline = require("readline");
const os = require("os");
const path = require("path");

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const NODE_MANAGER_URL = process.env.NODE_MANAGER_URL || "http://localhost:8000";
const CLI_DIR = path.join(os.homedir(), ".local", "bin");

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Run CLI command and return output
// ─────────────────────────────────────────────────────────────────────────────

function runCli(command) {
  try {
    const fullPath = path.join(CLI_DIR, command);
    const output = execSync(fullPath, { encoding: "utf8", timeout: 10000 });
    return { success: true, output };
  } catch (err) {
    return { success: false, error: err.message, output: err.stdout || "" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definitions
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "node_factory_status",
    description:
      "Get HyperCycle Node Factory status. Returns node ID, license, hardware specs, uptime, and AIM slot count.",
    inputSchema: {
      type: "object",
      properties: {
        json: {
          type: "boolean",
          description: "Return JSON format instead of human-readable",
          default: false,
        },
      },
      required: [],
    },
  },
  {
    name: "node_factory_aim_list",
    description:
      "List all AIM (AI Module) slots running on the Node Factory. Shows image names, statuses, ports.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "node_factory_pool_status",
    description:
      "Get Stargate Pool status. Shows registered boxes, pool health, and capacity.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Which pool command: status, boxes, or licenses",
          enum: ["status", "boxes", "licenses"],
          default: "status",
        },
      },
      required: [],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool Handlers
// ─────────────────────────────────────────────────────────────────────────────

const HANDLERS = {
  node_factory_status: (args) => {
    const useJson = args?.json === true;
    const cmd = useJson ? "omarchy-node-factory-status --json" : "omarchy-node-factory-status";
    const result = runCli(cmd);
    if (!result.success) {
      return {
        content: [{ type: "text", text: `Error: ${result.error}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: result.output }],
    };
  },

  node_factory_aim_list: () => {
    const result = runCli("omarchy-node-factory-aim list");
    if (!result.success) {
      return {
        content: [{ type: "text", text: `Error: ${result.error}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: result.output }],
    };
  },

  node_factory_pool_status: (args) => {
    const subcommand = args?.command || "status";
    const result = runCli(`omarchy-node-factory-pool ${subcommand}`);
    if (!result.success) {
      return {
        content: [{ type: "text", text: `Error: ${result.error}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: result.output }],
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MCP Protocol (stdio)
// ─────────────────────────────────────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

let initialized = false;

rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // skip non-JSON lines
  }

  const { jsonrpc, id, method, params } = msg;
  if (jsonrpc !== "2.0") return;

  // ── initialize ────────────────────────────────────────────────────────────
  if (method === "initialize") {
    initialized = true;
    respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "hypercycle-node-factory",
        version: "1.0.0",
      },
    });
    return;
  }

  // ── initialized notification ────────────────────────────────────────────
  if (method === "notifications/initialized") {
    return; // no response needed
  }

  // ── tools/list ────────────────────────────────────────────────────────────
  if (method === "tools/list") {
    respond(id, { tools: TOOLS });
    return;
  }

  // ── tools/call ──────────────────────────────────────────────────────────
  if (method === "tools/call") {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};
    const handler = HANDLERS[toolName];

    if (!handler) {
      respond(id, {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      });
      return;
    }

    try {
      const result = handler(toolArgs);
      respond(id, result);
    } catch (err) {
      respond(id, {
        content: [{ type: "text", text: `Exception: ${err.message}` }],
        isError: true,
      });
    }
    return;
  }

  // ── unknown method ──────────────────────────────────────────────────────
  respondError(id, -32601, `Method not found: ${method}`);
});

function respond(id, result) {
  const response = { jsonrpc: "2.0", id, result };
  console.log(JSON.stringify(response));
}

function respondError(id, code, message) {
  const response = { jsonrpc: "2.0", id, error: { code, message } };
  console.log(JSON.stringify(response));
}

// Keep alive
setInterval(() => {}, 1000);

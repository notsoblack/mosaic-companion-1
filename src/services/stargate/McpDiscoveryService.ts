// =============================================================================
// MCP DISCOVERY SERVICE
//
// Wraps addonAPI.mcp.* to provide MCP server/tool discovery for Stargate Loop Builder.
// This service runs in the renderer (addon) and talks to Mosaic Companion's MCP
// registry via the addonAPI bridge.
//
// All calls are async and return typed results for Loop Builder consumption.
// =============================================================================

/* ── Types ───────────────────────────────────────────────────────────────── */

/** Result from calling an MCP tool via addonAPI.mcp.callTool() */
export interface McpToolResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

export interface McpServerInfo {
  id: string;
  name: string;
  connected: boolean;
  description?: string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

export interface McpDiscoveryResult {
  servers: McpServerInfo[];
  selectedServer: McpServerInfo | null;
  tools: McpToolInfo[];
  selectedTool: McpToolInfo | null;
  loading: boolean;
  error: string | null;
}

/* ── Addon API Access ────────────────────────────────────────────────────── */

function getAddonApi() {
  // PRIMARY: Use electronAPI.mcpAPI (same as MCP Servers tab) — shows live connected servers
  const electronMcp = (window as any).electronAPI?.mcpAPI;
  if (electronMcp?.listServers) {
    return electronMcp;
  }
  // FALLBACK: addonAPI.mcp (legacy addon bridge — may return stale data)
  const addonMcp = (window as any).addonAPI?.mcp;
  if (addonMcp?.listServers) {
    return addonMcp;
  }
  throw new Error("MCP API not available. Is Mosaic Companion running with MCP enabled?");
}

/* ── Service ─────────────────────────────────────────────────────────────── */

export const McpDiscoveryService = {
  /** List all registered MCP servers */
  async listServers(): Promise<McpServerInfo[]> {
    try {
      const mcp = getAddonApi();
      const result = await mcp.listServers();
      if (!Array.isArray(result)) {
        console.warn("[McpDiscovery] listServers returned non-array:", result);
        return [];
      }
      return result.map((s: any) => ({
        id: s.id || s.name || "unknown",
        name: s.name || s.id || "Unknown",
        connected: !!s.connected,
        description: s.description || "",
      }));
    } catch (err) {
      console.error("[McpDiscovery] listServers failed:", err);
      // Fallback: return mock servers for development
      return getMockServers();
    }
  },

  /** List tools for a specific MCP server */
  async listTools(serverId: string): Promise<McpToolInfo[]> {
    try {
      const mcp = getAddonApi();
      const result = await mcp.listTools(serverId);
      if (!result || typeof result !== "object") {
        console.warn("[McpDiscovery] listTools returned invalid:", result);
        return [];
      }
      // Result shape varies by MCP implementation — normalize
      const tools = (result as any).tools || (result as any).result?.tools || result;
      if (!Array.isArray(tools)) {
        console.warn("[McpDiscovery] listTools returned non-array tools:", tools);
        return [];
      }
      return tools.map((t: any) => ({
        name: t.name || "unknown",
        description: t.description || "",
        inputSchema: t.inputSchema || t.parameters || t.schema || {},
      }));
    } catch (err) {
      console.error(`[McpDiscovery] listTools("${serverId}") failed:`, err);
      // Fallback: return mock tools for development
      return getMockTools(serverId);
    }
  },

  /** Call an MCP tool with arguments */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, any>,
  ): Promise<McpToolResult> {
    try {
      const mcp = getAddonApi();
      const result = await mcp.callTool(serverId, toolName, args);
      return result;
    } catch (err) {
      console.error(`[McpDiscovery] callTool("${serverId}", "${toolName}") failed:`, err);
      throw err;
    }
  },

  /** Resolve a {{...}} template against node input data */
  resolveTemplate(template: string, inputData: Record<string, any>): any {
    // Handle simple field access: {{fieldName}}
    const simpleMatch = template.match(/^\{\{([\w.]+)\}\}$/);
    if (simpleMatch) {
      const path = simpleMatch[1].split(".");
      let value: any = inputData;
      for (const key of path) {
        if (value == null) return undefined;
        value = value[key];
      }
      return value;
    }

    // Handle array indexing: {{entries[0].content}}
    const arrayMatch = template.match(/^\{\{([\w]+)\[(\d+)\]\.([\w]+)\}\}$/);
    if (arrayMatch) {
      const [, arrayName, indexStr, fieldName] = arrayMatch;
      const arr = inputData[arrayName];
      if (!Array.isArray(arr)) return undefined;
      const item = arr[parseInt(indexStr, 10)];
      if (!item) return undefined;
      return item[fieldName];
    }

    // Handle wildcard: {{entries[*].label}} → returns array of labels
    const wildcardMatch = template.match(/^\{\{([\w]+)\[\*\]\.([\w]+)\}\}$/);
    if (wildcardMatch) {
      const [, arrayName, fieldName] = wildcardMatch;
      const arr = inputData[arrayName];
      if (!Array.isArray(arr)) return undefined;
      return arr.map((item: any) => item?.[fieldName]).filter(Boolean);
    }

    // Handle previous node output: {{prev.output.result}}
    const prevMatch = template.match(/^\{\{prev\.output\.([\w.]+)\}\}$/);
    if (prevMatch) {
      const path = prevMatch[1].split(".");
      let value: any = inputData.__prevOutput;
      for (const key of path) {
        if (value == null) return undefined;
        value = value[key];
      }
      return value;
    }

    // Fallback: return template as-is (user will handle manually)
    return template;
  },
};

/* ── Mock Data (for development when addonAPI is unavailable) ────────────── */

function getMockServers(): McpServerInfo[] {
  return [
    { id: "buzz", name: "Buzz", connected: true, description: "Nostr relay messaging" },
    { id: "gbrain", name: "gbrain", connected: true, description: "Personal knowledge graph" },
    { id: "hermes-tools", name: "hermes-tools", connected: true, description: "Hermes CLI tools" },
    { id: "oneam", name: "oneam", connected: false, description: "1AM Midnight wallet" },
    { id: "midnight", name: "midnight", connected: true, description: "Midnight City contracts" },
    { id: "stargate-marketplace", name: "stargate-marketplace", connected: true, description: "Skills marketplace" },
  ];
}

function getMockTools(serverId: string): McpToolInfo[] {
  const mockTools: Record<string, McpToolInfo[]> = {
    "buzz": [
      { name: "buzz_publish_event", description: "Publish a signed Nostr event", inputSchema: { kind: { type: "integer" }, content: { type: "string" }, tags: { type: "array" } } },
      { name: "buzz_send_message", description: "Send a chat message to a channel", inputSchema: { channelId: { type: "string" }, text: { type: "string" }, replyTo: { type: "string" } } },
      { name: "buzz_query_history", description: "Query historical events", inputSchema: { kinds: { type: "array" }, limit: { type: "integer" } } },
    ],
    "gbrain": [
      { name: "query_knowledge", description: "Query personal knowledge graph", inputSchema: { query: { type: "string" }, limit: { type: "integer" } } },
      { name: "add_note", description: "Add a note to knowledge graph", inputSchema: { title: { type: "string" }, content: { type: "string" }, tags: { type: "array" } } },
    ],
    "hermes-tools": [
      { name: "hermes_web_search", description: "Search the web", inputSchema: { query: { type: "string" }, limit: { type: "integer" } } },
      { name: "hermes_file_read", description: "Read a file", inputSchema: { path: { type: "string" } } },
      { name: "hermes_terminal_run", description: "Run a terminal command", inputSchema: { command: { type: "string" }, timeout: { type: "integer" } } },
    ],
    "midnight": [
      { name: "midnight_compile", description: "Compile a Midnight contract", inputSchema: { source: { type: "string" } } },
      { name: "midnight_deploy", description: "Deploy a compiled contract", inputSchema: { compiledPath: { type: "string" }, network: { type: "string" } } },
    ],
  };
  return mockTools[serverId] || [];
}

export default McpDiscoveryService;

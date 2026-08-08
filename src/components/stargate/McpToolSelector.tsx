// =============================================================================
// MCP TOOL SELECTOR — Embedded in Loop Builder Detail Tab
//
// Lets users browse MCP servers, select tools, and configure arguments
// with template mapping for Vault data.
// =============================================================================

import React, { useEffect, useState } from "react";
import {
  Server, Wrench, ChevronRight, ChevronDown, Loader2, AlertTriangle,
  CheckCircle, XCircle, RefreshCw,
} from "lucide-react";
import McpDiscoveryService, { McpServerInfo, McpToolInfo } from "../../services/stargate/McpDiscoveryService";
import type { McpCallConfig } from "../../types/StargateLoop";

interface McpToolSelectorProps {
  initialConfig?: Partial<McpCallConfig>;
  onChange: (config: McpCallConfig) => void;
}

export const McpToolSelector: React.FC<McpToolSelectorProps> = ({ initialConfig, onChange }) => {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [tools, setTools] = useState<McpToolInfo[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(initialConfig?.serverId || null);
  const [selectedTool, setSelectedTool] = useState<McpToolInfo | null>(null);
  const [loadingServers, setLoadingServers] = useState(false);
  const [loadingTools, setLoadingTools] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Form state
  const [args, setArgs] = useState<Record<string, any>>(initialConfig?.args || {});
  const [argMapping, setArgMapping] = useState<Record<string, string>>(initialConfig?.argMapping || {});
  const [timeoutMs, setTimeoutMs] = useState<number>(initialConfig?.timeoutMs || 30000);
  const [retryOnError, setRetryOnError] = useState<boolean>(initialConfig?.retryOnError ?? true);
  const [maxRetries, setMaxRetries] = useState<number>(initialConfig?.maxRetries || 3);

  // Load servers on mount
  useEffect(() => {
    loadServers();
  }, []);

  // Load tools when server selected
  useEffect(() => {
    if (selectedServer) {
      loadTools(selectedServer);
    }
  }, [selectedServer]);

  // Notify parent when config changes
  useEffect(() => {
    if (selectedServer && selectedTool) {
      const config: McpCallConfig = {
        serverId: selectedServer,
        toolName: selectedTool.name,
        args: Object.keys(args).length > 0 ? args : undefined,
        argMapping: Object.keys(argMapping).length > 0 ? argMapping : undefined,
        timeoutMs,
        retryOnError,
        maxRetries,
      };
      onChange(config);
    }
  }, [selectedServer, selectedTool, args, argMapping, timeoutMs, retryOnError, maxRetries]);

  async function loadServers() {
    setLoadingServers(true);
    setError(null);
    try {
      const result = await McpDiscoveryService.listServers();
      setServers(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MCP servers");
    } finally {
      setLoadingServers(false);
    }
  }

  async function loadTools(serverId: string) {
    setLoadingTools(true);
    setError(null);
    try {
      const result = await McpDiscoveryService.listTools(serverId);
      setTools(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load tools for ${serverId}`);
    } finally {
      setLoadingTools(false);
    }
  }

  async function handleTestTool() {
    if (!selectedServer || !selectedTool) return;
    setTesting(true);
    setTestResult(null);
    try {
      // Build resolved args (merge static args + resolve templates)
      const testArgs: Record<string, any> = { ...args };
      for (const [key, template] of Object.entries(argMapping)) {
        if (template.startsWith("{{") && template.endsWith("}}")) {
          // For test, use template as-is (real resolution happens at runtime)
          testArgs[key] = `[template: ${template}]`;
        } else {
          testArgs[key] = template;
        }
      }

      const result = await McpDiscoveryService.callTool(selectedServer, selectedTool.name, testArgs);
      setTestResult({
        success: !result.isError,
        message: result.isError
          ? `Tool returned error: ${JSON.stringify(result.content)}`
          : `Tool executed successfully. Result: ${JSON.stringify(result.content).slice(0, 200)}`,
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: `Test failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* MCP Server Browser */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
            <Server size={14} className="text-amber-400" />
            MCP Servers
          </div>
          <button
            onClick={loadServers}
            disabled={loadingServers}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-cyan-400 disabled:opacity-40"
          >
            <RefreshCw size={10} className={loadingServers ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-[10px] text-red-400 mb-2">
            <AlertTriangle size={12} />
            {error}
          </div>
        )}

        <div className="space-y-1 max-h-[120px] overflow-auto">
          {servers.map((server) => (
            <button
              key={server.id}
              onClick={() => {
                setSelectedServer(server.id);
                setExpandedServer(expandedServer === server.id ? null : server.id);
                setSelectedTool(null);
              }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                selectedServer === server.id
                  ? "bg-amber-900/20 border border-amber-700/50 text-amber-300"
                  : "hover:bg-gray-800 text-gray-400"
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${server.connected ? "bg-green-400" : "bg-red-400"}`} />
              <span className="font-mono">{server.name}</span>
              <span className="text-gray-600 ml-auto">{server.connected ? "connected" : "disconnected"}</span>
              {expandedServer === server.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ))}
          {servers.length === 0 && !loadingServers && (
            <div className="text-[10px] text-gray-600 px-2">No MCP servers found. Make sure Mosaic Companion is running.</div>
          )}
          {loadingServers && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 px-2">
              <Loader2 size={10} className="animate-spin" />
              Loading servers...
            </div>
          )}
        </div>
      </div>

      {/* Tool Selector */}
      {selectedServer && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 mb-2">
            <Wrench size={14} className="text-cyan-400" />
            Tools from {servers.find((s) => s.id === selectedServer)?.name}
          </div>

          {loadingTools && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <Loader2 size={10} className="animate-spin" />
              Loading tools...
            </div>
          )}

          <div className="space-y-1 max-h-[120px] overflow-auto">
            {tools.map((tool) => (
              <button
                key={tool.name}
                onClick={() => setSelectedTool(tool)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                  selectedTool?.name === tool.name
                    ? "bg-cyan-900/20 border border-cyan-700/50 text-cyan-300"
                    : "hover:bg-gray-800 text-gray-400"
                }`}
              >
                <div className="font-medium">{tool.name}</div>
                <div className="text-[10px] text-gray-600">{tool.description || "No description"}</div>
              </button>
            ))}
            {tools.length === 0 && !loadingTools && (
              <div className="text-[10px] text-gray-600 px-2">No tools available for this server.</div>
            )}
          </div>
        </div>
      )}

      {/* Argument Builder */}
      {selectedTool && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 space-y-2">
          <div className="text-xs font-bold text-gray-400">Tool Configuration</div>

          {/* Selected tool summary */}
          <div className="bg-gray-800 rounded p-2 text-[10px] space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-mono">{selectedServer}:{selectedTool.name}</span>
            </div>
            <div className="text-gray-500">{selectedTool.description || "No description"}</div>
          </div>

          {/* Schema display */}
          {selectedTool.inputSchema && Object.keys(selectedTool.inputSchema).length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-gray-500">Expected Arguments:</div>
              <div className="bg-gray-800 rounded p-2 font-mono text-[9px] text-gray-400 overflow-auto">
                {JSON.stringify(selectedTool.inputSchema, null, 2)}
              </div>
            </div>
          )}

          {/* Static args */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-gray-500">Static Arguments (JSON):</div>
            <textarea
              value={JSON.stringify(args, null, 2)}
              onChange={(e) => {
                try {
                  setArgs(JSON.parse(e.target.value));
                } catch {
                  // invalid JSON — don't update
                }
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-[10px] font-mono text-gray-300 focus:border-cyan-500 focus:outline-none"
              rows={3}
              placeholder='{"channelId": "general"}'
            />
          </div>

          {/* Template mapping */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-gray-500">Vault Data Mapping (templates):</div>
            <textarea
              value={JSON.stringify(argMapping, null, 2)}
              onChange={(e) => {
                try {
                  setArgMapping(JSON.parse(e.target.value));
                } catch {
                  // invalid JSON — don't update
                }
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-[10px] font-mono text-gray-300 focus:border-cyan-500 focus:outline-none"
              rows={3}
              placeholder='{"text": "{{entries[0].content}}", "taskId": "{{input.taskId}}"}'
            />
            <div className="text-[9px] text-gray-600">
              Use double-curly syntax to map Vault data: e.g., entries[0].content
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-gray-500">Timeout (ms)</label>
              <input
                type="number"
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(parseInt(e.target.value, 10))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Retry</label>
              <select
                value={retryOnError ? "yes" : "no"}
                onChange={(e) => setRetryOnError(e.target.value === "yes")}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 focus:border-cyan-500 focus:outline-none"
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Max Retries</label>
              <input
                type="number"
                value={maxRetries}
                onChange={(e) => setMaxRetries(parseInt(e.target.value, 10))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Test button */}
          <button
            onClick={handleTestTool}
            disabled={testing}
            className="flex items-center gap-2 px-3 py-1.5 bg-cyan-900/30 border border-cyan-700/50 rounded text-xs text-cyan-300 hover:bg-cyan-900/50 disabled:opacity-40"
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
            {testing ? "Testing..." : "Test MCP Call"}
          </button>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-start gap-2 p-2 rounded text-[10px] ${
              testResult.success ? "bg-green-900/20 border border-green-800 text-green-400" : "bg-red-900/20 border border-red-800 text-red-400"
            }`}>
              {testResult.success ? <CheckCircle size={12} /> : <XCircle size={12} />}
              <span className="break-all">{testResult.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default McpToolSelector;

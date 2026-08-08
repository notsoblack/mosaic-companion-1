// =============================================================================
// LOOP BUILDER MODAL — Phase A: Preset Viewer + Dry-Run Tester
//
// Integrates into Stargate Graph tab.
// Shows preset loops, lets user test them via dry-run, displays results.
//
// Core principle: "A node is a unit of work. An edge is a dependency."
// The modal visualizes the loop as a mini-graph using React Flow.
// =============================================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, Node, Edge, Handle, Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Play, Pause, RotateCcw, CheckCircle, XCircle, AlertTriangle,
  ChevronRight, ChevronLeft, Clock, Activity, Zap, GitBranch,
  GitCommit, GitMerge, Shield, Database, Bot, Server, Layers,
  X, ArrowRight, Loader2, Bell,
} from "lucide-react";
import type { StargateLoop, LoopNode, LoopTestResult } from "../../types/StargateLoop";
import { LOOP_PRESETS } from "../../types/StargateLoop";
import { executeLoopDryRun, validateLoop } from "../../services/stargate/LoopEngine";
import McpToolSelector from "./McpToolSelector";
import AgentSelector from "./AgentSelector";
import TemplateSelector from "./TemplateSelector";
import SystemPromptEditor from "./SystemPromptEditor";

/* ── Mini Node Types for Loop Visualization ──────────────────────────────── */

const miniNodeStyle = (color: string): React.CSSProperties => ({
  background: "#0f172a",
  border: `1.5px solid ${color}`,
  borderRadius: "6px",
  padding: "6px 10px",
  minWidth: "120px",
  color: "#fff",
  fontSize: "11px",
  fontFamily: "ui-monospace, monospace",
});

const MiniLoopNode: React.FC<{ data: any }> = ({ data }) => (
  <div style={miniNodeStyle(data.color)} className="relative">
    <Handle type="target" position={Position.Top} style={{ background: data.color, width: 6, height: 6 }} />
    <div className="flex items-center gap-1.5">
      {data.icon}
      <div>
        <div className="font-bold">{data.label}</div>
        <div className="text-gray-500 text-[9px]">{data.type}</div>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} style={{ background: data.color, width: 6, height: 6 }} />
  </div>
);

const nodeTypeMap: Record<string, { color: string; icon: React.ReactNode }> = {
  "agent-action":   { color: "#3b82f6", icon: <Bot size={12} /> },
  "vault-read":     { color: "#06b6d4", icon: <Database size={12} /> },
  "vault-write":    { color: "#06b6d4", icon: <Database size={12} /> },
  "mcp-call":       { color: "#f59e0b", icon: <Server size={12} /> },
  "condition":      { color: "#a855f7", icon: <GitBranch size={12} /> },
  "delay":          { color: "#64748b", icon: <Clock size={12} /> },
  "parallel":       { color: "#ec4899", icon: <Layers size={12} /> },
  "merge":          { color: "#ec4899", icon: <GitMerge size={12} /> },
  "verify":         { color: "#22c55e", icon: <Shield size={12} /> },
  "router":         { color: "#f59e0b", icon: <GitCommit size={12} /> },
  "transform":      { color: "#64748b", icon: <Activity size={12} /> },
  "notify":         { color: "#f97316", icon: <Bell size={12} /> },
  "wait-for-input": { color: "#8b5cf6", icon: <Pause size={12} /> },
};

const miniNodeTypes = { loopNode: MiniLoopNode };

/* ── Build mini-graph from loop ───────────────────────────────────────────── */

function buildMiniGraph(loop: StargateLoop): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = loop.nodes.map((n, i) => ({
    id: n.id,
    type: "loopNode",
    position: { x: (i % 3) * 180 + 50, y: Math.floor(i / 3) * 100 + 50 },
    data: {
      label: n.label,
      type: n.type,
      color: nodeTypeMap[n.type]?.color || "#64748b",
      icon: nodeTypeMap[n.type]?.icon || <Zap size={12} />,
    },
  }));

  const edges: Edge[] = loop.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    animated: e.type === "feedback",
    style: {
      stroke: e.type === "feedback" ? "#ef4444" : e.type === "conditional" ? "#a855f7" : "#64748b",
      strokeDasharray: e.type === "feedback" ? "5 5" : e.type === "conditional" ? "3 3" : undefined,
      strokeWidth: e.type === "feedback" ? 2 : 1,
    },
    label: e.type,
    labelStyle: { fill: e.type === "feedback" ? "#ef4444" : "#94a3b8", fontSize: 9 },
  }));

  return { nodes, edges };
}

/* ── Modal Component ────────────────────────────────────────────────────── */

export const LoopBuilderModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [selectedLoop, setSelectedLoop] = useState<StargateLoop | null>(null);
  const [testResult, setTestResult] = useState<LoopTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"presets" | "detail" | "test">("presets");
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);

  const handleSelectLoop = (loop: StargateLoop) => {
    setSelectedLoop(loop);
    setTestResult(null);
    setValidationErrors(validateLoop(loop));
    setActiveTab("detail");
  };

  const handleTest = async () => {
    if (!selectedLoop) return;
    setTesting(true);
    setTestResult(null);
    try {
      // Pass selected agent ID to dry-run context
      const context = selectedAgentId ? { __agentId: selectedAgentId } : {};
      const result = await executeLoopDryRun(selectedLoop, context);
      setTestResult(result);
      setActiveTab("test");
    } catch (err) {
      setTestResult({
        runId: "error",
        runAt: new Date().toISOString(),
        mode: "dry-run",
        iterations: 0,
        dryRoundsHit: 0,
        nodeOutcomes: [],
        edgeTraversals: [],
        elapsedMs: 0,
        converged: false,
        error: err instanceof Error ? err.message : "Unknown error",
        summary: "Test execution failed",
      } as LoopTestResult);
      setActiveTab("test");
    } finally {
      setTesting(false);
    }
  };

  const miniGraph = useMemo(() => {
    if (!selectedLoop) return { nodes: [], edges: [] };
    return buildMiniGraph(selectedLoop);
  }, [selectedLoop]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0b0f19] border border-gray-700 rounded-xl w-[900px] max-w-[95vw] h-[700px] max-h-[95vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <GitBranch size={18} className="text-cyan-400" />
            <span className="font-bold text-white">Loop Builder</span>
            <span className="text-xs text-gray-500">— Nodes are jobs, edges are dependencies</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-5 border-b border-gray-800">
          {[
            { id: "presets" as const, label: "Presets", icon: Zap },
            { id: "detail" as const, label: "Loop Detail", icon: GitCommit },
            { id: "test" as const, label: "Test Results", icon: Activity },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => activeTab === t.id || (t.id !== "presets" && !selectedLoop) ? undefined : setActiveTab(t.id)}
              disabled={t.id !== "presets" && !selectedLoop}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? "border-cyan-400 text-cyan-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              } ${t.id !== "presets" && !selectedLoop ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <t.icon size={12} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {/* ── PRESETS TAB (now with Karpathy Templates) ── */}
          {activeTab === "presets" && (
            <div className="space-y-4">
              <div className="text-sm text-gray-400">
                <span className="text-cyan-400 font-medium">Karpathy-Inspired Templates:</span>{" "}
                Pre-built loop patterns encoding expert workflows. Select a template to auto-populate nodes, edges, and convergence rules.
              </div>
              <TemplateSelector
                onSelectTemplate={(loop) => {
                  setSelectedLoop(loop);
                  setTestResult(null);
                  setValidationErrors(validateLoop(loop));
                  setActiveTab("detail");
                }}
              />

              <div className="mt-4 pt-4 border-t border-gray-800">
                <div className="text-xs font-medium text-gray-500 mb-2">Legacy Presets</div>
                <div className="grid grid-cols-1 gap-2">
                  {LOOP_PRESETS.map((loop) => (
                    <button
                      key={loop.id}
                      onClick={() => handleSelectLoop(loop)}
                      className="flex items-start gap-3 p-3 bg-gray-900/30 border border-gray-800 rounded-lg hover:border-cyan-500/50 hover:bg-gray-800/50 transition-all text-left"
                    >
                      <div className="mt-0.5">
                        <GitBranch size={14} className="text-cyan-400" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-300 text-xs">{loop.name}</div>
                        <div className="text-gray-600 text-[10px] mt-0.5">{loop.description}</div>
                      </div>
                      <ChevronRight size={12} className="text-gray-600 self-center" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── DETAIL TAB ── */}
          {activeTab === "detail" && selectedLoop && (
            <div className="space-y-4">
              {/* Info */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white">{selectedLoop.name}</h3>
                  <p className="text-sm text-gray-400">{selectedLoop.description}</p>
                </div>
                <button
                  onClick={handleTest}
                  disabled={testing || validationErrors.length > 0}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium disabled:opacity-40"
                >
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {testing ? "Running dry-run…" : "Test Dry-Run"}
                </button>
              </div>

              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg">
                  <div className="flex items-center gap-2 text-red-400 text-sm font-bold mb-1">
                    <AlertTriangle size={14} /> Validation Errors
                  </div>
                  <ul className="text-xs text-red-300 space-y-1">
                    {validationErrors.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Convergence config */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
                <div className="text-xs font-bold text-gray-400 mb-2">Convergence Rules</div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {[
                    { label: "Max Iterations", value: selectedLoop.convergence.maxIterations },
                    { label: "Dry Rounds", value: selectedLoop.convergence.dryRounds },
                    { label: "Timeout", value: `${selectedLoop.convergence.timeoutSeconds}s` },
                    { label: "Backoff", value: selectedLoop.convergence.backoff },
                  ].map((item) => (
                    <div key={item.label} className="bg-gray-800 rounded p-2">
                      <div className="text-gray-500">{item.label}</div>
                      <div className="text-white font-mono">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Graph visualization */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
                <div className="text-xs font-bold text-gray-400 mb-2">Loop Topology</div>
                <div className="h-[280px] bg-[#060a14] rounded border border-gray-800">
                  <ReactFlow
                    nodes={miniGraph.nodes}
                    edges={miniGraph.edges}
                    nodeTypes={miniNodeTypes}
                    fitView
                    attributionPosition="bottom-left"
                    minZoom={0.3}
                    maxZoom={1.5}
                  >
                    <Background color="#1e293b" gap={20} size={1} />
                    <Controls className="bg-gray-900 border-gray-700" />
                  </ReactFlow>
                </div>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-red-500" style={{ borderTop: "1px dashed #ef4444" }} /> Feedback (cycle)
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-purple-500" style={{ borderTop: "1px dashed #a855f7" }} /> Conditional
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-gray-500" /> Sequential
                  </span>
                </div>
              </div>

              {/* MCP Tool Configuration for mcp-call nodes */}
              {selectedLoop.nodes.some((n) => n.type === "mcp-call") && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
                  <div className="text-xs font-bold text-gray-400 mb-2">
                    MCP Tool Configuration
                  </div>
                  {selectedLoop.nodes
                    .filter((n) => n.type === "mcp-call")
                    .map((node) => (
                      <div key={node.id} className="mb-3">
                        <div className="text-[10px] text-cyan-400 font-mono mb-1">
                          {node.label} ({node.id})
                        </div>
                        <McpToolSelector
                          initialConfig={node.config as any}
                          onChange={(config) => {
                            // In a real app, this would update the loop node config
                            console.log("[LoopBuilder] MCP config updated for", node.id, config);
                          }}
                        />
                      </div>
                    ))}
                </div>
              )}

              {/* Agent Selection for agent-action nodes */}
              {selectedLoop.nodes.some((n) => n.type === "agent-action") && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
                  <div className="text-xs font-bold text-gray-400 mb-2">
                    Agent Assignment
                  </div>
                  <AgentSelector
                    selectedAgentId={selectedAgentId}
                    onChange={(id, name) => {
                      setSelectedAgentId(id);
                      // Store in loop config for execution context
                      console.log("[LoopBuilder] Agent selected:", id, name);
                    }}
                  />
                </div>
              )}

              {/* System Prompt Editor for agent-action nodes */}
              {selectedLoop.nodes.some((n) => n.type === "agent-action") && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
                  <div className="text-xs font-bold text-gray-400 mb-2">
                    System Prompt Configuration
                  </div>
                  {selectedLoop.nodes
                    .filter((n) => n.type === "agent-action")
                    .map((node) => (
                      <div key={node.id} className="mb-3">
                        <div className="text-[10px] text-purple-400 font-mono mb-1">
                          {node.label} ({node.id})
                        </div>
                        <SystemPromptEditor
                          initialPrompt={node.config.systemPrompt || ""}
                          agentName={selectedAgentId}
                          onChange={(prompt) => {
                            // In a real app, this would update the loop node config
                            console.log("[LoopBuilder] System prompt updated for", node.id);
                          }}
                        />
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ── TEST TAB ── */}
          {activeTab === "test" && (
            <div className="space-y-4">
              {!testResult && (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <Activity size={32} className="mb-3 opacity-30" />
                  <p className="text-sm">Run a dry-run test to see execution results.</p>
                  {selectedLoop && (
                    <button
                      onClick={handleTest}
                      disabled={testing}
                      className="mt-3 flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm disabled:opacity-40"
                    >
                      {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      {testing ? "Running…" : "Run Test"}
                    </button>
                  )}
                </div>
              )}

              {testResult && (
                <>
                  {/* Summary */}
                  <div className={`p-4 rounded-lg border ${
                    testResult.converged
                      ? "bg-green-900/20 border-green-800"
                      : testResult.error
                        ? "bg-red-900/20 border-red-800"
                        : "bg-amber-900/20 border-amber-800"
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {testResult.converged ? <CheckCircle size={16} className="text-green-400" /> :
                       testResult.error ? <XCircle size={16} className="text-red-400" /> :
                       <AlertTriangle size={16} className="text-amber-400" />}
                      <span className={`font-bold text-sm ${
                        testResult.converged ? "text-green-400" :
                        testResult.error ? "text-red-400" :
                        "text-amber-400"
                      }`}>
                        {testResult.converged ? "Converged" : testResult.error ? "Failed" : "Did Not Converge"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300">{testResult.summary}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>Iterations: {testResult.iterations}</span>
                      <span>Elapsed: {(testResult.elapsedMs / 1000).toFixed(2)}s</span>
                      <span>Dry rounds: {testResult.dryRoundsHit}</span>
                    </div>
                  </div>

                  {/* Node outcomes table */}
                  {testResult.nodeOutcomes.length > 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 border-b border-gray-800 text-xs font-bold text-gray-400">
                        Node Execution Log ({testResult.nodeOutcomes.length} executions)
                      </div>
                      <div className="max-h-[300px] overflow-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-800 text-gray-500">
                            <tr>
                              <th className="px-3 py-1.5 text-left">Iteration</th>
                              <th className="px-3 py-1.5 text-left">Node</th>
                              <th className="px-3 py-1.5 text-left">Status</th>
                              <th className="px-3 py-1.5 text-left">Elapsed</th>
                              <th className="px-3 py-1.5 text-left">Output</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800">
                            {testResult.nodeOutcomes.map((outcome, i) => (
                              <tr key={i} className="hover:bg-gray-800/50">
                                <td className="px-3 py-1.5 text-gray-400">#{outcome.iteration}</td>
                                <td className="px-3 py-1.5 text-white">{selectedLoop?.nodes.find((n) => n.id === outcome.nodeId)?.label || outcome.nodeId}</td>
                                <td className="px-3 py-1.5">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                                    outcome.status === "ok" ? "bg-green-900/30 text-green-400" :
                                    outcome.status === "err" ? "bg-red-900/30 text-red-400" :
                                    outcome.status === "dry" ? "bg-gray-800 text-gray-400" :
                                    "bg-amber-900/30 text-amber-400"
                                  }`}>
                                    {outcome.status === "ok" ? <CheckCircle size={10} /> :
                                     outcome.status === "err" ? <XCircle size={10} /> :
                                     <Clock size={10} />}
                                    {outcome.status}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 text-gray-400">{outcome.elapsedMs}ms</td>
                                <td className="px-3 py-1.5 text-gray-500 truncate max-w-[200px]">
                                  {JSON.stringify(outcome.output).slice(0, 60)}…
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Edge traversals */}
                  {testResult.edgeTraversals.length > 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
                      <div className="text-xs font-bold text-gray-400 mb-2">Edge Traversals</div>
                      <div className="flex flex-wrap gap-1">
                        {testResult.edgeTraversals.map((t, i) => (
                          <div key={i} className="flex items-center gap-1 text-[10px] bg-gray-800 rounded px-2 py-1">
                            <span className="text-gray-400">#{t.iteration}</span>
                            <ArrowRight size={10} className="text-gray-600" />
                            <span className="text-cyan-400">{t.dataSnapshot.source}</span>
                            <span className="text-gray-500">→</span>
                            <span className="text-cyan-400">{t.dataSnapshot.target}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleTest}
                      disabled={testing}
                      className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm disabled:opacity-40"
                    >
                      {testing ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      Re-run Test
                    </button>
                    <button
                      onClick={() => setActiveTab("detail")}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm"
                    >
                      <ChevronLeft size={14} />
                      Back to Detail
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoopBuilderModal;

// =============================================================================
// LOOPS PANEL — Honest Loop Designer (Not Executor)
//
// Based on Graph Engineering principles from:
// - "One Prompt, One Window, a Thousand Agent Loops" (s4yonnara)
// - "14-Step roadmap from 0 to graph architect" (0xCodez)
//
// DESIGN PHILOSOPHY:
// - Nodes = bounded units of work (one crisp job per node)
// - Edges = data dependencies (only when data actually flows)
// - This panel designs loop topologies; execution is external
//
// What this panel does:
// 1. CRUD saved loop designs in localStorage
// 2. Instantiate from templates (Karpathy/Claude patterns)
// 3. Validate topology (node-edge consistency)
// 4. Dry-run simulation (structural proof, not real execution)
// 5. Export JSON for external execution engines
//
// What this panel does NOT do:
// - Execute real MCP calls
// - Dispatch to real agents
// - Write to Vault
// - Run persistent background loops
// =============================================================================

import React, { useState, useMemo, useCallback } from "react";
import type { StargateLoop, LoopTestResult, LoopStatus } from "../../types/StargateLoop";
import { LOOP_PRESETS } from "../../types/StargateLoop";
import LoopBuilderModal from "./LoopBuilderModal";
import { executeLoopDryRun } from "../../services/stargate/LoopEngine";
import {
  GitBranch, Play, Trash2, Edit3, Download, Upload, Plus,
  FileJson, CheckCircle, AlertTriangle, Clock, Layers,
  ChevronRight, X, BookOpen, Zap, Cpu, GitCommit,
  ArrowRight, Save, Copy
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface SavedLoop extends StargateLoop {
  tag?: string;
}

/* ── Storage ──────────────────────────────────────────────────────────── */

const STORAGE_KEY = "stargate_saved_loops_v1";

function loadSavedLoops(): SavedLoop[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSavedLoops(loops: SavedLoop[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loops)); }
  catch { /* storage full */ }
}

/* ── Component ────────────────────────────────────────────────────────── */

const LoopsPanel: React.FC = () => {
  const [savedLoops, setSavedLoops] = useState<SavedLoop[]>(loadSavedLoops);
  const [activeTab, setActiveTab] = useState<"saved" | "templates">("saved");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingLoop, setEditingLoop] = useState<SavedLoop | null>(null);
  const [exportingLoop, setExportingLoop] = useState<SavedLoop | null>(null);
  const [testingLoop, setTestingLoop] = useState<SavedLoop | null>(null);
  const [testResult, setTestResult] = useState<LoopTestResult | null>(null);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const tags = useMemo(
    () => ["all", ...Array.from(new Set(savedLoops.map((l) => l.tag || "custom")))],
    [savedLoops]
  );

  const filteredLoops = useMemo(() => {
    if (filterTag === "all") return savedLoops;
    return savedLoops.filter((l) => l.tag === filterTag);
  }, [savedLoops, filterTag]);

  /* ── Actions ───────────────────────────────────────────────────────── */

  const handleSaveFromBuilder = (loop: StargateLoop) => {
    const updated: SavedLoop = {
      ...loop,
      tag: (loop as any).tag || "custom",
    };
    const next = editingLoop
      ? savedLoops.map((l) => (l.id === editingLoop.id ? updated : l))
      : [...savedLoops, updated];
    setSavedLoops(next);
    saveSavedLoops(next);
    setShowBuilder(false);
    setEditingLoop(null);
  };

  const handleDelete = (id: string) => {
    const next = savedLoops.filter((l) => l.id !== id);
    setSavedLoops(next);
    saveSavedLoops(next);
  };

  const handleTest = async (loop: SavedLoop) => {
    setTestingLoop(loop);
    setTestResult(null);
    try {
      const result = await executeLoopDryRun(loop, { goal: loop.name });
      setTestResult(result);
    } catch (e) {
      setTestResult(null);
    }
    setTestingLoop(null);
  };

  const handleExport = (loop: SavedLoop) => {
    setExportingLoop(loop);
    const blob = new Blob([JSON.stringify(loop, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${loop.name.replace(/\s+/g, "_")}.stargate.loop.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setTimeout(() => setExportingLoop(null), 1000);
  };

  const handleCopyJSON = (loop: SavedLoop) => {
    navigator.clipboard.writeText(JSON.stringify(loop, null, 2));
  };

  const handleImport = () => {
    try {
      const loop = JSON.parse(importText) as SavedLoop;
      if (!loop.id || !loop.name || !Array.isArray(loop.nodes)) {
        alert("Invalid loop JSON: missing id, name, or nodes");
        return;
      }
      const next = [...savedLoops, { ...loop, tag: "imported" }];
      setSavedLoops(next);
      saveSavedLoops(next);
      setShowImport(false);
      setImportText("");
    } catch {
      alert("Invalid JSON");
    }
  };

  /* ── Render ────────────────────────────────────────────────────────── */

  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <GitBranch size={20} className="text-cyan-400" />
          <div>
            <div className="font-bold text-white">Loop Designer</div>
            <div className="text-[10px] text-gray-500">
              Design topologies · Validate · Export for execution
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
          >
            <Upload size={12} /> Import
          </button>
          <button
            onClick={() => { setEditingLoop(null); setShowBuilder(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-cyan-900/30 hover:bg-cyan-900/50 border border-cyan-700/50 text-cyan-300 rounded-lg transition-colors"
          >
            <Plus size={12} /> New Loop
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-gray-800">
        {(["saved", "templates"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              activeTab === t
                ? "bg-gray-800 text-white font-medium"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "saved" ? "Saved Designs" : "Templates"}
          </button>
        ))}
      </div>

      {/* ── SAVED DESIGNS TAB ──────────────────────────────────────── */}
      {activeTab === "saved" && (
        <>
          {/* Stats & Filters */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800/50">
            <div className="flex items-center gap-1">
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterTag(t)}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${
                    filterTag === t
                      ? "bg-cyan-900/30 text-cyan-300 border border-cyan-700/50"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-gray-600">
              {filteredLoops.length} design{filteredLoops.length !== 1 ? "s" : ""}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            {filteredLoops.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
                <Layers size={32} className="opacity-30" />
                <div className="text-sm">No saved loop designs</div>
                <div className="text-xs max-w-xs text-center">
                  Create loops from Templates tab or use{" "}
                  <span className="text-cyan-400">New Loop</span>{" "}
                  to design custom topologies.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredLoops.map((loop) => (
                  <div
                    key={loop.id}
                    className="group p-4 bg-gray-900/50 border border-gray-800 hover:border-cyan-500/30 rounded-lg transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {loop.status === "draft" && <GitBranch size={14} className="text-gray-500" />}
                        {loop.status === "tested" && <CheckCircle size={14} className="text-green-400" />}
                        <span className="font-medium text-sm text-white">{loop.name}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleTest(loop)}
                          disabled={testingLoop?.id === loop.id}
                          className="p-1.5 text-gray-500 hover:text-cyan-400 rounded transition-colors"
                          title="Dry-run simulation"
                        >
                          {testingLoop?.id === loop.id ? (
                            <Clock size={14} className="animate-spin" />
                          ) : (
                            <Play size={14} />
                          )}
                        </button>
                        <button
                          onClick={() => { setEditingLoop(loop); setShowBuilder(true); }}
                          className="p-1.5 text-gray-500 hover:text-white rounded transition-colors"
                          title="Edit"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleExport(loop)}
                          className="p-1.5 text-gray-500 hover:text-green-400 rounded transition-colors"
                          title="Export JSON"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(loop.id)}
                          className="p-1.5 text-gray-500 hover:text-red-400 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{loop.description}</p>

                    <div className="flex items-center gap-3 text-[10px] text-gray-600">
                      <span>🧩 {loop.nodes.length} nodes</span>
                      <span>🔗 {loop.edges.length} edges</span>
                      {loop.tag && <span className="px-1.5 py-0.5 bg-gray-800 rounded">{loop.tag}</span>}
                    </div>

                    {/* Test Result Inline */}
                    {testResult && testingLoop?.id === loop.id && (
                      <div className="mt-3 p-2 bg-gray-800/50 rounded border border-gray-700">
                        <div className="flex items-center gap-2 text-xs">
                          {testResult.converged ? (
                            <><CheckCircle size={12} className="text-green-400" /><span className="text-green-400">Converged</span></>
                          ) : testResult.error ? (
                            <><AlertTriangle size={12} className="text-red-400" /><span className="text-red-400">{testResult.error}</span></>
                          ) : (
                            <><Clock size={12} className="text-yellow-400" /><span className="text-yellow-400">Did not converge</span></>
                          )}
                          <span className="text-gray-500">{testResult.iterations} iter · {(testResult.elapsedMs / 1000).toFixed(1)}s</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── TEMPLATES TAB ──────────────────────────────────────────── */}
      {activeTab === "templates" && (
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-4">
            <div className="text-xs text-gray-400 mb-1">
              <span className="text-cyan-400 font-medium">Graph Engineering Templates</span>{" "}
              — Pre-built topologies based on agent loop patterns.
              Click to instantiate and edit.
            </div>
            <div className="text-[10px] text-gray-600">
              Based on: fan-out → reduce → synthesize, conditional routing, verifier gates.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {LOOP_PRESETS.map((preset) => (
              <div
                key={preset.id}
                className="group p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-cyan-500/30 rounded-lg transition-all cursor-pointer"
                onClick={() => {
                  const newLoop: SavedLoop = {
                    ...preset,
                    id: `loop-${Date.now()}`,
                    status: "draft" as unknown as LoopStatus,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    tag: "template",
                  };
                  setEditingLoop(newLoop);
                  setShowBuilder(true);
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-cyan-400" />
                    <span className="font-medium text-sm">{preset.name}</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-600 group-hover:text-cyan-400 transition-colors" />
                </div>
                <p className="text-xs text-gray-500 mb-3">{preset.description}</p>
                <div className="flex items-center gap-3 text-[10px] text-gray-600">
                  <span>🧩 {preset.nodes.length} nodes</span>
                  <span>🔗 {preset.edges.length} edges</span>
                  <span>🔁 {preset.convergence.maxIterations} max iter</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[500px] bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-white">Import Loop JSON</div>
              <button onClick={() => setShowImport(false)} className="text-gray-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <textarea
              className="w-full h-48 p-3 bg-gray-950 border border-gray-800 rounded-lg text-xs text-gray-300 font-mono resize-none focus:outline-none focus:border-cyan-500/50"
              placeholder={`Paste loop JSON here...\n{\n  "id": "...",\n  "name": "...",\n  "nodes": [...],\n  "edges": [...]\n}`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowImport(false)}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="px-3 py-1.5 text-xs bg-cyan-900/30 hover:bg-cyan-900/50 border border-cyan-700/50 text-cyan-300 rounded-lg"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {exportingLoop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pointer-events-none"
        onClick={() => setExportingLoop(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-4 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle size={16} />
              <span className="text-sm font-medium">Exported {exportingLoop.name}.json</span>
            </div>
          </div>
        </div>
      )}

      {/* Builder Modal */}
      {showBuilder && (
        <LoopBuilderModal
          onClose={() => { setShowBuilder(false); setEditingLoop(null); }}
          initialLoop={editingLoop || undefined}
          onSave={handleSaveFromBuilder}
        />
      )}
    </div>
  );
};

export default LoopsPanel;

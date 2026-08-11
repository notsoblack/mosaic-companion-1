// =============================================================================
// LOOPS PANEL — Loop Management Dashboard for Stargate
//
// Replaces the placeholder alert() in the Loops tab.
// Shows: saved loops, active runs, history, template gallery, quick actions.
// Integrates with LoopBuilderModal for creation/editing.
// =============================================================================

import React, { useEffect, useMemo, useState } from "react";
import {
  GitBranch, Play, Pause, RotateCcw, CheckCircle, XCircle,
  Clock, Activity, Zap, Plus, Trash2, Edit3, ChevronRight,
  Layers, TrendingUp, Bot, Server, AlertTriangle, Loader2,
  Sparkles, Save, ArrowRight,
} from "lucide-react";
import type { StargateLoop, LoopTestResult, LoopStatus } from "../../types/StargateLoop";
import { LOOP_PRESETS } from "../../types/StargateLoop";
import LoopBuilderModal from "./LoopBuilderModal";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface LoopRun {
  id: string;
  loopId: string;
  loopName: string;
  status: "running" | "completed" | "failed" | "paused";
  startedAt: string;
  completedAt?: string;
  currentStep?: number;
  totalSteps?: number;
  result?: LoopTestResult;
}

interface SavedLoop extends StargateLoop {
  /** user-defined tag for organization */
  tag?: string;
  /** how many times this loop has been run */
  runCount?: number;
  /** last run timestamp */
  lastRunAt?: string;
}

/* ── Storage Key ─────────────────────────────────────────────────────────── */

const STORAGE_KEY = "stargate_saved_loops_v1";
const RUNS_KEY = "stargate_loop_runs_v1";

/* ── Helper: load / save ─────────────────────────────────────────────────── */

function loadSavedLoops(): SavedLoop[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSavedLoops(loops: SavedLoop[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loops));
  } catch { /* storage full — silently fail */ }
}

function loadRuns(): LoopRun[] {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRuns(runs: LoopRun[]) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch { /* storage full — silently fail */ }
}

/* ── Color Helpers ───────────────────────────────────────────────────────── */

const STATUS_STYLE: Record<string, { bg: string; text: string; icon: any }> = {
  active:     { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: Activity },
  idle:       { bg: "bg-gray-500/10",    text: "text-gray-400",    icon: Clock },
  running:    { bg: "bg-blue-500/10",    text: "text-blue-400",    icon: Loader2 },
  completed:  { bg: "bg-emerald-500/10",  text: "text-emerald-400", icon: CheckCircle },
  failed:     { bg: "bg-red-500/10",     text: "text-red-400",     icon: XCircle },
  paused:     { bg: "bg-amber-500/10",   text: "text-amber-400",   icon: Pause },
};

/* ── Main Component ──────────────────────────────────────────────────────── */

const LoopsPanel: React.FC = () => {
  const [savedLoops, setSavedLoops] = useState<SavedLoop[]>([]);
  const [runs, setRuns] = useState<LoopRun[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingLoop, setEditingLoop] = useState<SavedLoop | null>(null);
  const [activeTab, setActiveTab] = useState<"saved" | "templates" | "history">("saved");
  const [filterTag, setFilterTag] = useState<string>("all");

  /* ── Load on mount ─────────────────────────────────────────────────── */
  useEffect(() => {
    setSavedLoops(loadSavedLoops());
    setRuns(loadRuns());
  }, []);

  /* ── Derived ───────────────────────────────────────────────────────── */
  const activeRuns = useMemo(() => runs.filter((r) => r.status === "running" || r.status === "paused"), [runs]);
  const completedRuns = useMemo(() => runs.filter((r) => r.status === "completed"), [runs]);
  const failedRuns = useMemo(() => runs.filter((r) => r.status === "failed"), [runs]);
  const tags = useMemo(() => {
    const set = new Set<string>(["all"]);
    savedLoops.forEach((l) => { if (l.tag) set.add(l.tag); });
    return Array.from(set);
  }, [savedLoops]);
  const filteredLoops = useMemo(() => {
    if (filterTag === "all") return savedLoops;
    return savedLoops.filter((l) => l.tag === filterTag);
  }, [savedLoops, filterTag]);

  /* ── Actions ───────────────────────────────────────────────────────── */
  const handleSaveFromBuilder = (loop: StargateLoop) => {
    const updated: SavedLoop = {
      ...loop,
      status: "draft" as unknown as LoopStatus,
      tag: (loop as any).tag || "custom",
      runCount: 0,
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

  const handleRun = (loop: SavedLoop) => {
    const run: LoopRun = {
      id: `run-${Date.now()}`,
      loopId: loop.id,
      loopName: loop.name,
      status: "running",
      startedAt: new Date().toISOString(),
      totalSteps: loop.nodes.length,
      currentStep: 0,
    };
    const nextRuns = [run, ...runs];
    setRuns(nextRuns);
    saveRuns(nextRuns);
    // TODO: wire to actual execution engine
  };

  const handlePause = (runId: string) => {
    const next = runs.map((r) => (r.id === runId ? { ...r, status: "paused" as const } : r));
    setRuns(next);
    saveRuns(next);
  };

  const handleResume = (runId: string) => {
    const next = runs.map((r) => (r.id === runId ? { ...r, status: "running" as const } : r));
    setRuns(next);
    saveRuns(next);
  };

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <GitBranch size={18} className="text-cyan-400" />
            Loop Manager
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {savedLoops.length} saved · {activeRuns.length} active · {completedRuns.length} completed
          </p>
        </div>
        <button
          onClick={() => { setEditingLoop(null); setShowBuilder(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={14} />
          New Loop
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-3 px-6 py-3 border-b border-gray-800/50">
        {[
          { label: "Saved", value: savedLoops.length, icon: Layers, color: "text-cyan-400" },
          { label: "Running", value: activeRuns.length, icon: Activity, color: "text-blue-400" },
          { label: "Completed", value: completedRuns.length, icon: CheckCircle, color: "text-emerald-400" },
          { label: "Failed", value: failedRuns.length, icon: XCircle, color: "text-red-400" },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center gap-3 px-3 py-2 bg-gray-900/50 rounded-lg">
            <stat.icon size={16} className={stat.color} />
            <div>
              <div className="text-lg font-bold text-white">{stat.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-3">
        {[
          { id: "saved" as const, label: "Saved Loops", icon: Save },
          { id: "templates" as const, label: "Templates", icon: Sparkles },
          { id: "history" as const, label: "Run History", icon: Clock },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? "bg-gray-900 text-cyan-400 border-t border-l border-r border-gray-800"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 bg-gray-900 border-t border-gray-800">
        {/* ── SAVED LOOPS ─────────────────────────────────────────── */}
        {activeTab === "saved" && (
          <div className="space-y-4 pt-4">
            {/* Tag Filter */}
            {tags.length > 1 && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-500">Filter:</span>
                {tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setFilterTag(tag)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                      filterTag === tag
                        ? "bg-cyan-600/20 text-cyan-400 border border-cyan-600/30"
                        : "bg-gray-800 text-gray-400 hover:text-gray-300 border border-gray-700"
                    }`}
                  >
                    {tag === "all" ? "All" : tag}
                  </button>
                ))}
              </div>
            )}

            {filteredLoops.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <GitBranch size={40} className="mb-4 opacity-30" />
                <p className="text-sm">No saved loops yet.</p>
                <p className="text-xs mt-1">Click "New Loop" to build one, or browse Templates.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filteredLoops.map((loop) => {
                  const style = STATUS_STYLE[loop.status] || STATUS_STYLE.idle;
                  const StatusIcon = style.icon;
                  return (
                    <div
                      key={loop.id}
                      className="group flex items-start gap-4 p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded-lg transition-all"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${style.bg}`}>
                        <StatusIcon size={18} className={style.text} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-white truncate">{loop.name}</h3>
                          {loop.tag && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-300 rounded">
                              {loop.tag}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-2 mb-2">{loop.description}</p>
                        <div className="flex items-center gap-4 text-[10px] text-gray-500">
                          <span className="flex items-center gap-1">
                            <Layers size={10} />
                            {loop.nodes.length} nodes
                          </span>
                          <span className="flex items-center gap-1">
                            <TrendingUp size={10} />
                            {loop.runCount ?? 0} runs
                          </span>
                          {loop.lastRunAt && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              {new Date(loop.lastRunAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleRun(loop)}
                          className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                          title="Run"
                        >
                          <Play size={14} />
                        </button>
                        <button
                          onClick={() => { setEditingLoop(loop); setShowBuilder(true); }}
                          className="p-1.5 rounded hover:bg-cyan-500/20 text-cyan-400 transition-colors"
                          title="Edit"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(loop.id)}
                          className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TEMPLATES ───────────────────────────────────────────── */}
        {activeTab === "templates" && (
          <div className="space-y-4 pt-4">
            <p className="text-xs text-gray-500">
              Start with a preset. Click to instantiate — you can customize nodes, agents, and MCP tools afterward.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
                      runCount: 0,
                    };
                    setEditingLoop(newLoop);
                    setShowBuilder(true);
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-medium text-white group-hover:text-cyan-400 transition-colors">
                      {preset.name}
                    </h3>
                    <ChevronRight size={14} className="text-gray-600 group-hover:text-cyan-400 transition-colors" />
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2 mb-3">{preset.description}</p>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1">
                      <Layers size={10} />
                      {preset.nodes.length} nodes
                    </span>
                    <span className="flex items-center gap-1">
                      <Bot size={10} />
                      {preset.nodes.filter((n) => n.type === "agent-action").length} agents
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RUN HISTORY ─────────────────────────────────────────── */}
        {activeTab === "history" && (
          <div className="space-y-4 pt-4">
            {runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <Clock size={40} className="mb-4 opacity-30" />
                <p className="text-sm">No runs yet.</p>
                <p className="text-xs mt-1">Run a saved loop to see execution history here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => {
                  const style = STATUS_STYLE[run.status] || STATUS_STYLE.idle;
                  const StatusIcon = style.icon;
                  const duration = run.completedAt
                    ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
                    : undefined;
                  return (
                    <div
                      key={run.id}
                      className="flex items-center gap-4 p-3 bg-gray-800/30 border border-gray-700/30 rounded-lg"
                    >
                      <StatusIcon size={16} className={style.text} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{run.loopName}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                            {run.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-1">
                          <span>Started {new Date(run.startedAt).toLocaleString()}</span>
                          {duration !== undefined && <span>· {duration}s</span>}
                          {run.currentStep !== undefined && run.totalSteps && (
                            <span>· Step {run.currentStep + 1}/{run.totalSteps}</span>
                          )}
                        </div>
                      </div>
                      {run.status === "running" && (
                        <button
                          onClick={() => handlePause(run.id)}
                          className="p-1.5 rounded hover:bg-amber-500/20 text-amber-400 transition-colors"
                          title="Pause"
                        >
                          <Pause size={14} />
                        </button>
                      )}
                      {run.status === "paused" && (
                        <button
                          onClick={() => handleResume(run.id)}
                          className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                          title="Resume"
                        >
                          <Play size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loop Builder Modal */}
      {showBuilder && (
        <LoopBuilderModal
          initialLoop={editingLoop || undefined}
          onClose={() => { setShowBuilder(false); setEditingLoop(null); }}
          onSave={handleSaveFromBuilder}
        />
      )}
    </div>
  );
};

export default LoopsPanel;

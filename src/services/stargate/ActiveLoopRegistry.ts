// =============================================================================
// ACTIVE LOOP REGISTRY — Global tracker for live loops, cron jobs, and dry-runs
// =============================================================================
// When a loop runs (live or dry-run), it registers here. The Stargate Graph
// subscribes to this registry and renders glowing activity nodes.
//
// Design: "The graph breathes with active loops. You see the system alive."
// =============================================================================

export type ActivityStatus = "idle" | "starting" | "running" | "dry-running" | "paused" | "completed" | "failed" | "resumed";

export interface ActiveActivity {
  id: string;
  name: string;
  type: "loop" | "cron" | "dry-run";
  status: ActivityStatus;
  loopId?: string;
  cronJobId?: string;
  /** Which node is currently executing (for loops) */
  currentNodeId?: string;
  currentNodeLabel?: string;
  /** Progress: 0–100 */
  progress: number;
  /** Start timestamp */
  startedAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Elapsed ms */
  elapsedMs: number;
  /** If loop: which agent is executing */
  agentId?: string;
  agentName?: string;
  /** If cron: schedule */
  schedule?: string;
  /** Next run timestamp (for cron) */
  nextRunAt?: number;
  /** Error message if failed */
  error?: string;
  /** Result summary if completed */
  resultSummary?: string;
}

type Listener = (activities: ActiveActivity[]) => void;

class ActiveLoopRegistry {
  private activities: Map<string, ActiveActivity> = new Map();
  private listeners: Set<Listener> = new Set();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Tick every 500ms to update elapsed times and notify listeners
    this.timer = setInterval(() => this.tick(), 500);
  }

  private tick() {
    const now = Date.now();
    let changed = false;
    for (const act of this.activities.values()) {
      if (act.status === "running" || act.status === "dry-running" || act.status === "starting") {
        act.elapsedMs = now - act.startedAt;
        changed = true;
      }
      // Auto-complete if stalled > 5 min without update
      if ((act.status === "running" || act.status === "dry-running") && now - act.updatedAt > 300_000) {
        act.status = "failed";
        act.error = "Timed out after 5 minutes of inactivity";
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  private notify() {
    const list = Array.from(this.activities.values()).sort((a, b) => b.startedAt - a.startedAt);
    this.listeners.forEach((cb) => cb(list));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Immediate callback with current state
    listener(Array.from(this.activities.values()).sort((a, b) => b.startedAt - a.startedAt));
    return () => this.listeners.delete(listener);
  }

  getActivities(): ActiveActivity[] {
    return Array.from(this.activities.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  getRunning(): ActiveActivity[] {
    return this.getActivities().filter(
      (a) => a.status === "running" || a.status === "dry-running" || a.status === "starting",
    );
  }

  register(activity: Omit<ActiveActivity, "updatedAt" | "elapsedMs">): void {
    const now = Date.now();
    this.activities.set(activity.id, {
      ...activity,
      updatedAt: now,
      elapsedMs: 0,
    });
    this.notify();
  }

  update(id: string, patch: Partial<ActiveActivity>): void {
    const act = this.activities.get(id);
    if (!act) return;
    Object.assign(act, patch, { updatedAt: Date.now() });
    this.notify();
  }

  deregister(id: string): void {
    this.activities.delete(id);
    this.notify();
  }

  setCompleted(id: string, summary?: string): void {
    const act = this.activities.get(id);
    if (!act) return;
    act.status = "completed";
    act.resultSummary = summary;
    act.updatedAt = Date.now();
    act.elapsedMs = Date.now() - act.startedAt;
    this.notify();
    // Auto-remove after 30 seconds so graph doesn't stay cluttered
    setTimeout(() => this.deregister(id), 30_000);
  }

  setFailed(id: string, error: string): void {
    const act = this.activities.get(id);
    if (!act) return;
    act.status = "failed";
    act.error = error;
    act.updatedAt = Date.now();
    act.elapsedMs = Date.now() - act.startedAt;
    this.notify();
    setTimeout(() => this.deregister(id), 30_000);
  }

  setNodeProgress(id: string, nodeId: string, nodeLabel: string, progressPercent: number): void {
    const act = this.activities.get(id);
    if (!act) return;
    act.currentNodeId = nodeId;
    act.currentNodeLabel = nodeLabel;
    act.progress = Math.min(100, Math.max(0, progressPercent));
    act.updatedAt = Date.now();
    this.notify();
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.listeners.clear();
    this.activities.clear();
  }
}

// Singleton — shared across all components
export const activeLoopRegistry = new ActiveLoopRegistry();

export default ActiveLoopRegistry;

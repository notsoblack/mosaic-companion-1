import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Pickaxe,
  Activity,
  Send,
  Play,
  Pause,
  RefreshCw,
  Terminal,
  Code,
  Cpu,
  Zap,
  Bot,
  Shield,
  ScrollText,
  Settings,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  FileCode,
  Box,
  Eye,
  EyeOff,
  Map,
  Server,
  Lock,
  Unlock,
  Copy,
  ShoppingCart,
  Rocket,
  StopCircle,
  Plus,
  Trash2,
} from "lucide-react";

// ── Error Boundary to catch runtime crashes ──────────────────────────────
class PanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[MidnightCityCommandPanel] Runtime error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-900/20 border border-red-700 rounded text-red-200 text-xs font-mono">
          <div className="font-bold mb-2 flex items-center gap-2">
            <AlertTriangle size={14} />
            Midnight City Panel crashed
          </div>
          <div className="mb-2">{this.state.error?.message}</div>
          <div className="text-gray-400">Check DevTools console for stack trace.</div>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentState {
  id: string;
  name: string;
  profession: string;
  status: string;
  position: { spaceId: string; x: number; y: number };
  activeAction: any;
  crystals?: number; // v2.0: in-game currency
}

interface InventoryItem {
  name: string;
  quantity: number;
}

interface InventoryState {
  agent: AgentState;
  inventory: Record<string, number>;
  tick: number;
}

interface NearbyAgent {
  id: string;
  name: string;
  profession: string;
  status: string;
  distance: number;
  position: { spaceId: string; x: number; y: number };
  activeAction?: any;
}

interface DiscoveredArea {
  areaId: string;
  name: string;
  activities: string[];
  moveAreaAvailable: boolean;
}

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  detail?: string;
}

interface ScriptEdit {
  path: string;
  content: string;
  dirty: boolean;
}

interface BGStatus {
  connected: boolean;
  agentId: string;
  leaseToken: string | null;
  sessionId: string | null;
  lastHeartbeat: number;
  lockActive: boolean;
  autoMine: boolean;
}

/* ── NEW: Wallet & Economy Types (Midnight City v2.0) ──────────────────────── */

interface WalletBalance {
  night: number;
  shielded: number;
  address: string;
  network: "midnight-preprod" | "cardano-preview";
  compactAddress?: string;
}

interface WalletTx {
  id: string;
  kind: "zswap" | "trade" | "mine_reward" | "fee" | "transfer";
  amount: number;
  token: "NIGHT" | "ShieldedToken";
  timestamp: string;
  merchantName?: string;
  status: "pending" | "confirmed" | "failed";
}

interface MerchantOffer {
  merchantId: string;
  merchantName: string;
  location: { spaceId: string; x: number; y: number };
  offers: Array<{
    itemId: string;
    itemName: string;
    buyPrice: number;   // what merchant pays to buy from agent
    sellPrice: number;  // what merchant charges to sell to agent
    stock: number;
    currency: "NIGHT" | "ShieldedToken";
  }>;
}

interface AgentNeeds {
  hunger: number;       // 0–100, lower = hungrier
  energy: number;       // 0–100
  inventoryWeight: number; // current weight
  inventoryCapacity: number; // max weight
  toolDurability: Record<string, number>; // itemId → durability %
}

// ── Panel ────────────────────────────────────────────────────────────────────

export const MidnightCityCommandPanel: React.FC = () => {
  return (
    <PanelErrorBoundary>
      <MidnightCityCommandPanelInner />
    </PanelErrorBoundary>
  );
};

export default MidnightCityCommandPanel;

// ── Actual panel implementation ──────────────────────────────────────────────
const MidnightCityCommandPanelInner: React.FC = () => {
  // ── Core state (mirrors background service) ──────────────────────────────
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [inventory, setInventory] = useState<InventoryState | null>(null);
  const [nearbyAgents, setNearbyAgents] = useState<NearbyAgent[]>([]);
  const [discoveredAreas, setDiscoveredAreas] = useState<DiscoveredArea[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"status" | "wallet" | "actions" | "script" | "factory" | "logs" | "config">("status");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isMining, setIsMining] = useState(false);
  const [autoMine, setAutoMine] = useState(false);
  const [autoReply, setAutoReply] = useState(false);
  const autoMineRef = useRef<NodeJS.Timeout | null>(null);
  const autoMiningInFlightRef = useRef(false);  // prevents overlapping perform_job calls
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const discoveredAreasRef = useRef<DiscoveredArea[]>([]);

  // ── Script editor state ──────────────────────────────────────────────────
  const [scriptContent, setScriptContent] = useState<string>("");
  const [scriptDirty, setScriptDirty] = useState(false);
  const [scriptSaving, setScriptSaving] = useState(false);
  const [scriptPath] = useState("/home/mauricio/.hermes/scripts/sonofanton_miner.py");

  // ── Factory state ────────────────────────────────────────────────────────
  const [factoryName, setFactoryName] = useState("");
  const [factoryProfession, setFactoryProfession] = useState<"miner" | "lumberjack" | "fisher" | "gatherer">("miner");
  const [factoryDeploying, setFactoryDeploying] = useState(false);
  const [factoryResult, setFactoryResult] = useState<string | null>(null);

  // ── Son of Anton config ─────────────────────────────────────────────────
  const [agentId, setAgentId] = useState("user-agent-61gxq6yztb3uyvd");
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("https://midnight.city/observer");
  const [profession, setProfession] = useState<"miner" | "lumberjack" | "fisher" | "gatherer">("miner");
  const [configSaving, setConfigSaving] = useState(false);

  // ── Agent needs / threads / social state ──────────────────────────────────
  const [needs, setNeeds] = useState<AgentNeeds | null>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [messageText, setMessageText] = useState("");
  const [selectedNearbyAgentId, setSelectedNearbyAgentId] = useState<string>("");
  const [tradeQty, setTradeQty] = useState(1000);
  const [selectedFood, setSelectedFood] = useState<string>("bread"); // v2.0: food item for eat action

  // ── NEW: Wallet & Economy State (Midnight City v2.0) ────────────────────
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [walletTxs, setWalletTxs] = useState<WalletTx[]>([]);
  const [merchantOffers, setMerchantOffers] = useState<MerchantOffer[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<"midnight-preprod" | "cardano-preview">("midnight-preprod");
  const [autoRestock, setAutoRestock] = useState(false);
  const [autoSell, setAutoSell] = useState(false);
  const walletRef = useRef<WalletBalance | null>(null);
  const merchantOffersRef = useRef(merchantOffers);
  useEffect(() => { merchantOffersRef.current = merchantOffers; }, [merchantOffers]);
  const needsRef = useRef<AgentNeeds | null>(null);
  const inventoryRef = useRef<InventoryState | null>(null);

  // ── Ref guards ───────────────────────────────────────────────────────────
  const connectedRef = useRef(false);
  const lockedRef = useRef(false);
  useEffect(() => { connectedRef.current = connected; }, [connected]);
  useEffect(() => { lockedRef.current = locked; }, [locked]);
  useEffect(() => { discoveredAreasRef.current = discoveredAreas; }, [discoveredAreas]);
  useEffect(() => { walletRef.current = wallet; }, [wallet]);
  useEffect(() => { needsRef.current = needs; }, [needs]);
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);

  // ── Listen for auto-work changes from background service (e.g. loop activation) ─
  useEffect(() => {
    const cleanup = window.electronAPI.midnightCity.onAutoWorkChanged((payload) => {
      if (payload?.enabled !== undefined) {
        setAutoMine(payload.enabled);
        addLog("info", payload.enabled ? "⚡ Auto-work activated remotely" : "⏹ Auto-work deactivated remotely");
      }
    });
    return cleanup;
  }, []);

  // ── NEW v2.0: Listen for wallet updates from background service ─────────────
  useEffect(() => {
    const cleanup = window.electronAPI.midnightCity.onWalletUpdated((payload) => {
      if (payload) {
        setWallet(payload);
        addLog("info", "Wallet synced from background", `${payload.night?.toFixed(4)} NIGHT, ${payload.shielded?.toFixed(4)} ST`);
      }
    });
    return cleanup;
  }, []);

  // ── Helper: add log ──────────────────────────────────────────────────────
  const addLog = useCallback((level: LogEntry["level"], message: string, detail?: string) => {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      detail,
    };
    setLogs((prev) => [...prev.slice(-199), entry]);
  }, []);

  // ── Load config on mount ─────────────────────────────────────────────────
  useEffect(() => {
    window.electronAPI.midnightCity.getConfig()
      .then((cfg: any) => {
        if (cfg.configured) {
          setAgentId(cfg.agentId || "");
          setProfession(cfg.profession || "miner");
          setApiBase(cfg.apiBase || "https://midnight.city/observer");
        }
      })
      .catch(() => {
        // No config yet — show config UI
      });
  }, []);

  // ── Save config ───────────────────────────────────────────────────────────
  const saveConfig = useCallback(async () => {
    setConfigSaving(true);
    try {
      const result = await window.electronAPI.midnightCity.setConfig({
        agentId,
        apiKey,
        profession,
        apiBase,
      });
      if (result.success) {
        addLog("success", "Credentials saved securely");
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      addLog("error", "Failed to save credentials", err.message);
    } finally {
      setConfigSaving(false);
    }
  }, [agentId, apiKey, profession, apiBase, addLog]);

  const clearConfig = useCallback(async () => {
    try {
      await window.electronAPI.midnightCity.clearConfig();
      setAgentId("");
      setApiKey("");
      setProfession("miner");
      setApiBase("https://midnight.city/observer");
      addLog("info", "Credentials cleared");
    } catch (err: any) {
      addLog("error", "Failed to clear credentials", err.message);
    }
  }, [addLog]);

  // ── Sync state from background service ───────────────────────────────────
  const syncFromBackground = useCallback(async () => {
    try {
      const status: BGStatus = await window.electronAPI.midnightCity.getStatus();
      setConnected(status.connected);
      connectedRef.current = status.connected; // keep ref in sync
      setLocked(status.lockActive);
      // NEW: sync autoMine from background service
      const autoWorkStatus = await window.electronAPI.midnightCity.getAutoWork();
      if (autoWorkStatus?.autoMine !== undefined) {
        setAutoMine(autoWorkStatus.autoMine);
      }
    } catch (e: any) {
      // Background service may not be initialized yet
    }
  }, []);

  // ── Connect ────────────────────────────────────────────────────────────────
  const doConnect = useCallback(async () => {
    setConnecting(true);
    setLastError(null);
    try {
      addLog("info", "Connecting to Son of Anton...");
      const result = await window.electronAPI.midnightCity.connect({ agentId });
      if (result.success) {
        setConnected(true);
        connectedRef.current = true; // Immediate — refreshState checks this
        addLog("success", "Connected", result.token ? `Token ${result.token.slice(0, 8)}...` : "");
        await refreshAll();
      } else {
        throw new Error(result.error || "Connect failed");
      }
    } catch (err: any) {
      setLastError(err.message);
      addLog("error", "Connect failed", err.message);
    } finally {
      setConnecting(false);
    }
  }, [agentId, addLog]);

  // ── Disconnect ───────────────────────────────────────────────────────────
  const doDisconnect = useCallback(async () => {
    try {
      addLog("info", "Disconnecting...");
      const result = await window.electronAPI.midnightCity.disconnect();
      if (result.success) {
        setConnected(false);
        setAgentState(null);
        addLog("success", "Disconnected");
      } else {
        addLog("warn", "Disconnect blocked", result.error || "Agent is locked");
      }
    } catch (err: any) {
      addLog("error", "Disconnect failed", err.message);
    }
  }, [addLog]);

  // ── Lock / Unlock ────────────────────────────────────────────────────────
  const toggleLock = useCallback(async () => {
    const newLock = !lockedRef.current;
    try {
      await window.electronAPI.midnightCity.setLock(newLock);
      setLocked(newLock);
      addLog("info", newLock ? "🔒 Agent locked — survives tab switches" : "🔓 Agent unlocked — normal disconnect");
    } catch (err: any) {
      addLog("error", "Lock toggle failed", err.message);
    }
  }, [addLog]);

  // ── Generic API call (no token needed — background service handles it) ───
  const apiCall = useCallback(
    async (endpoint: string, method: "GET" | "POST" = "GET", body?: any): Promise<any> => {
      try {
        const result = await window.electronAPI.midnightCity.call({ endpoint, method, body });
        if (result.error) {
          throw new Error(result.error);
        }
        return result.data;
      } catch (err: any) {
        const msg = err.message || String(err);
        // Don't spam logs with 404 Not Found — endpoints may not exist yet
        const is404 = msg.includes("404") || msg.includes("Not Found");
        if (!is404) {
          addLog("error", `API ${method} ${endpoint} failed`, msg);
        }
        throw err;
      }
    },
    [addLog]
  );

  // ── Refresh full state ───────────────────────────────────────────────────
  const refreshState = useCallback(async () => {
    if (!connectedRef.current) return;
    try {
      const [ctx, inv, ags, areas] = await Promise.all([
        apiCall(`/api/skill/agents/${encodeURIComponent(agentId)}/context`),
        apiCall(`/api/skill/agents/${encodeURIComponent(agentId)}/inventory`),
        apiCall(`/api/skill/agents/${encodeURIComponent(agentId)}/agents`),
        apiCall(`/api/skill/agents/${encodeURIComponent(agentId)}/areas`),
      ]);
      setAgentState(ctx?.agent || null);
      setInventory(inv || null);
      setNearbyAgents(ags?.agents || []);
      if (Array.isArray(areas?.areas)) {
        setDiscoveredAreas(areas.areas);
      }
    } catch (err: any) {
      const msg = err.message || String(err);
      const is404 = msg.includes("404") || msg.includes("Not Found");
      if (!is404) {
        addLog("warn", "State refresh failed", msg);
      }
    }
  }, [agentId, addLog, apiCall]);

  // ── Fetch needs ──────────────────────────────────────────────────────────
  const fetchNeeds = useCallback(async () => {
    if (!connectedRef.current) return;
    try {
      const data = await apiCall(`/api/skill/agents/${encodeURIComponent(agentId)}/needs`);
      setNeeds(data);
    } catch (err: any) {
      const msg = err.message || String(err);
      const is404 = msg.includes("404") || msg.includes("Not Found");
      if (!is404) {
        addLog("warn", "Needs fetch failed", msg);
      }
    }
  }, [agentId, addLog, apiCall]);

  // ── Fetch threads ──────────────────────────────────────────────────────
  const fetchThreads = useCallback(async () => {
    if (!connectedRef.current) return;
    try {
      const data = await apiCall(`/api/agents/${encodeURIComponent(agentId)}/threads?limit=50`);
      setThreads(data?.threads || []);
    } catch (err: any) {
      const msg = err.message || String(err);
      const is404 = msg.includes("404") || msg.includes("Not Found");
      if (!is404) {
        addLog("warn", "Threads fetch failed", msg);
      }
    }
  }, [agentId, addLog, apiCall]);

  // ── Fetch merchants (v1 — raw list) ─────────────────────────────────────
  const [merchants, setMerchants] = useState<any[]>([]);
  const fetchMerchants = useCallback(async () => {
    if (!connectedRef.current) return;
    try {
      const data = await apiCall("/api/skill/merchants");
      setMerchants(data?.merchants || []);
      // NEW v2.0: also parse structured offers if available
      if (data?.merchantOffers) {
        setMerchantOffers(data.merchantOffers);
      }
    } catch (err: any) {
      // Don't spam warn for 404 — endpoint may not exist yet
      const msg = err.message || String(err);
      const is404 = msg.includes("404") || msg.includes("Not Found");
      if (!is404) {
        addLog("warn", "Merchants fetch failed", msg);
      }
    }
  }, [addLog, apiCall]);

  // ── NEW v2.0: Fetch wallet balances ──────────────────────────────────────
  const fetchWallet = useCallback(async () => {
    if (!connectedRef.current || !agentId) return;
    try {
      const data = await apiCall(`/api/skill/agents/${encodeURIComponent(agentId)}/wallet`);
      if (data) {
        const parsed: WalletBalance = {
          night: data.night ?? data.balanceNIGHT ?? 0,
          shielded: data.shielded ?? data.balanceShielded ?? 0,
          address: data.address ?? "",
          network: data.network ?? selectedNetwork,
          compactAddress: data.compactAddress,
        };
        setWallet(parsed);
      }
    } catch (err: any) {
      // Wallet endpoint may not exist yet — silent fail
      // Only log once per minute to avoid spam
      const key = "wallet_404_logged";
      const last = (window as any)[key];
      const now = Date.now();
      if (!last || now - last > 60000) {
        addLog("info", "Wallet fetch unavailable — 404 Not Found (endpoint not yet active)");
        (window as any)[key] = now;
      }
    }
  }, [agentId, apiCall, addLog, selectedNetwork]);

  // ── NEW v2.0: Fetch wallet transaction history ─────────────────────────────
  const fetchWalletTxs = useCallback(async () => {
    if (!connectedRef.current || !agentId) return;
    try {
      const data = await apiCall(`/api/skill/agents/${encodeURIComponent(agentId)}/wallet/transactions`);
      if (Array.isArray(data?.transactions)) {
        setWalletTxs(data.transactions);
      }
    } catch {
      // Tx history may not be available yet
    }
  }, [agentId, apiCall]);

  // ── NEW v2.0: Execute ZSwap ──────────────────────────────────────────────
  const submitZSwap = useCallback(async (args: {
    fromToken: "NIGHT" | "ShieldedToken";
    toToken: "NIGHT" | "ShieldedToken";
    amount: number;
    merchantAddress: string;
  }) => {
    if (!connectedRef.current) {
      addLog("warn", "ZSwap: not connected");
      return;
    }
    setIsMining(true);
    try {
      addLog("info", `ZSwap: ${args.amount} ${args.fromToken} → ${args.toToken}`, args.merchantAddress);
      const payload = {
        kind: "zswap",
        agentId,
        fromToken: args.fromToken,
        toToken: args.toToken,
        amount: args.amount,
        merchantAddress: args.merchantAddress,
      };
      await apiCall("/api/actions", "POST", payload);
      addLog("success", "ZSwap submitted");
      // Refresh wallet after swap
      setTimeout(() => { fetchWallet(); fetchWalletTxs(); }, 3000);
    } catch (err: any) {
      addLog("error", "ZSwap failed", err.message);
    } finally {
      setIsMining(false);
    }
  }, [agentId, apiCall, addLog, fetchWallet, fetchWalletTxs]);

  // ── Auto-refresh extended data ───────────────────────────────────────────
  const refreshAll = useCallback(async () => {
    await refreshState();
    await fetchNeeds();
    await fetchThreads();
    await fetchMerchants();
  }, [refreshState, fetchNeeds, fetchThreads, fetchMerchants]);



  // ── Discover harvestable area ──────────────────────────────────────────────
  const findHarvestArea = useCallback((activityName: string): string | null => {
    const areas = discoveredAreasRef.current;
    const area = areas.find(
      (a) => a.moveAreaAvailable && (a.activities || []).some((act) => act.toLowerCase().includes(activityName.toLowerCase()))
    );
    if (area) return area.areaId;
    const fallback = areas.find((a) => a.moveAreaAvailable);
    return fallback?.areaId || null;
  }, []);

  // ── Submit action ────────────────────────────────────────────────────────
  const submitAction = useCallback(
    async (action: {
      kind: string;
      activity?: string;
      destination?: any;
      location?: any;
      targetAgentId?: string;
      message?: string;
      itemId?: string;
      text?: string;
      durationMs?: number;
      merchantName?: string;
      quantity?: number;
      direction?: "buy" | "sell";
      fromToken?: "NIGHT" | "ShieldedToken";
      toToken?: "NIGHT" | "ShieldedToken";
      amount?: number;
      merchantAddress?: string;
    }) => {
      if (!connectedRef.current) {
        addLog("warn", "Not connected — action queued", action.kind);
        return;
      }
      setIsMining(true);
      try {
        // Build the correct payload based on action kind
        const basePayload: any = { kind: action.kind, agentId };
        switch (action.kind) {
          case "speak":
            basePayload.targetId = action.targetAgentId;
            basePayload.text = action.message || action.text || "";
            break;
          case "shout":
            basePayload.text = action.text || "";
            break;
          case "trade":
            basePayload.merchantName = action.merchantName;
            basePayload.itemId = action.itemId;
            basePayload.quantity = action.quantity;
            if (action.direction) basePayload.direction = action.direction; // v2.0: buy vs sell
            break;
          case "move_to":
            basePayload.destination = action.destination;
            break;
          case "gather":
            basePayload.nodeId = (action as any).nodeId;
            break;
          case "engage":
            basePayload.location = action.location;
            basePayload.activity = action.activity;
            basePayload.durationMs = action.durationMs || 600000;
            break;
          case "perform_job":
            // v2.0 API (skill 2026-08-27): perform_job takes NO activity/durationMs —
            // sending them makes the action a silent server-side no-op.
            delete basePayload.activity;
            break;
          case "eat":
          case "sleep":
            if (action.location) basePayload.location = action.location;
            if (action.durationMs) basePayload.durationMs = action.durationMs;
            if (action.itemId) basePayload.itemId = action.itemId; // v2.0: food item required
            break;
          case "zswap":
            basePayload.fromToken = action.fromToken;
            basePayload.toToken = action.toToken;
            basePayload.amount = action.amount;
            basePayload.merchantAddress = action.merchantAddress;
            break;
          default:
            // Fall through: spread remaining known fields
            if (action.activity) basePayload.activity = action.activity;
            if (action.destination) basePayload.destination = action.destination;
            if (action.location) basePayload.location = action.location;
            if (action.targetAgentId) basePayload.targetId = action.targetAgentId;
            if (action.message || action.text) basePayload.text = action.message || action.text;
            if (action.itemId) basePayload.itemId = action.itemId;
            if (action.quantity !== undefined) basePayload.quantity = action.quantity;
            if (action.durationMs) basePayload.durationMs = action.durationMs;
            if (action.merchantName) basePayload.merchantName = action.merchantName;
            if (action.fromToken) basePayload.fromToken = action.fromToken;
            if (action.toToken) basePayload.toToken = action.toToken;
            if (action.amount !== undefined) basePayload.amount = action.amount;
            if (action.merchantAddress) basePayload.merchantAddress = action.merchantAddress;
            break;
        }

        addLog("info", `Submitting: ${action.kind}`, JSON.stringify(basePayload));
        await apiCall("/api/actions", "POST", basePayload);
        addLog("success", `${action.kind} submitted`);

        // If this is a "speak" action, also broadcast via IPC so local agents can respond
        if (action.kind === "speak" && action.targetAgentId && action.message) {
          try {
            const agentWin = (window as any).agent;
            if (agentWin?.send) {
              agentWin.send(`[Agent-to-Agent] to ${action.targetAgentId}: ${action.message}`);
              addLog("info", "IPC: forwarded speak to Mosaic Bot");
            }
          } catch (ipcErr) {
            // IPC forwarding is best-effort
          }
        }

        setTimeout(() => refreshState(), 1500);
      } catch (err: any) {
        addLog("error", `${action.kind} failed`, err.message);
      } finally {
        setIsMining(false);
      }
    },
    [agentId, apiCall, addLog, refreshState]
  );

  // ── Auto-work loop (sequential async — confirmation-driven, not blind timers) ─
  const agentStateRef = useRef(agentState);
  useEffect(() => { agentStateRef.current = agentState; }, [agentState]);
  const threadsRef = useRef(threads);
  useEffect(() => { threadsRef.current = threads; }, [threads]);
  const autoWorkCancelledRef = useRef(false);

  useEffect(() => {
    if (!autoMine) return;
    if (!connectedRef.current) {
      addLog("warn", "Auto-work: not connected, waiting...");
      return;
    }

    autoWorkCancelledRef.current = false;
    addLog("info", "Auto-work: starting confirmation-driven loop");

    const run = async () => {
      // ── Step 1: Discover target area + activity ──────────────────────────
      const targetArea = discoveredAreasRef.current.find(
        (a) => a.moveAreaAvailable && (a.activities || []).some((act) => act.toLowerCase().includes("mine"))
      );
      const targetAreaId = targetArea?.areaId || "mines-worksite";
      const actualActivity = targetArea?.activities?.find((a) => a.toLowerCase().includes("mine")) || "mine ore";
      addLog("info", "Auto-work: target", `${targetAreaId} | activity: ${actualActivity}`);

      // ── Step 2: Move to mine ONLY if not already there ───────────────────
      await refreshState();
      const currentSpace = agentStateRef.current?.position?.spaceId || "";
      const alreadyThere = currentSpace.toLowerCase().includes("miner") || currentSpace.toLowerCase().includes("mine");
      if (!alreadyThere) {
        addLog("info", "Auto-work: not at mine, sending move_to", targetAreaId);
        await submitAction({ kind: "move_to", destination: { spaceId: targetAreaId, x: 0, y: 0 } });
        // Wait for server to register position change (poll every 3s, max 30s)
        let arrived = false;
        for (let i = 0; i < 10 && !autoWorkCancelledRef.current; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          await refreshState();
          const space = agentStateRef.current?.position?.spaceId || "";
          if (space.toLowerCase().includes("miner") || space.toLowerCase().includes("mine")) {
            arrived = true;
            addLog("info", "Auto-work: arrived at mine", space);
            break;
          }
        }
        if (!arrived && !autoWorkCancelledRef.current) {
          addLog("warn", "Auto-work: move timeout, continuing anyway");
        }
      } else {
        addLog("info", "Auto-work: already at mine", currentSpace);
      }
      if (autoWorkCancelledRef.current) return;

      // ── Step 3: Gather loop — confirmation-driven (v2.0) ──────────────────
      // NOTE (API 2026-08-27): perform_job/engage silently no-op for lvl-1 miners;
      // ore veins report "no source node is available". We gather from whatever
      // level-appropriate source nodes progression exposes, preferring ore.
      addLog("info", "Auto-work: entering gather loop");
      let lastJobTime = 0;
      const GATHER_PREFERENCE = [
        "ore_vein", "ore-vein", "mining",
        "arcology_refuse_dock", "drone_wreckfield", "floodwall_rubble",
        "transit_scrap_heap", "market_parts_bin",
        "canal_eddy", "river_eel_weir", "moon_oyster_reef", "roofwater_cistern",
        "tree_stand", "mycelium_nursery", "rain_wheat_deck", "violet_herb_plot",
        "rooftop_tomato_bed", "static_substation", "skybridge_rigging", "patrol_locker",
      ];
      while (!autoWorkCancelledRef.current) {
        await refreshState();
        const aa = agentStateRef.current?.activeAction;

        // If already working (gather/move), wait for it to finish
        if (aa && (aa.phase !== "done")) {
          addLog("info", "Auto-work: action active", `${aa.activity || aa.kind} (${aa.phase || "running"})`);
          await new Promise((r) => setTimeout(r, 8000));
          continue;
        }

        // Rate-limit between submissions
        const now = Date.now();
        if (now - lastJobTime < 5000) {
          await new Promise((r) => setTimeout(r, lastJobTime + 5000 - now));
          continue;
        }

        // Ask progression which source nodes are available, pick by preference
        let nodeId: string | null = null;
        let srcId: string | null = null;
        try {
          const prog = await apiCall(`/api/skill/agents/${encodeURIComponent(agentId)}/progression`, "GET");
          const sources = prog?.capabilities?.sources || [];
          for (const pref of GATHER_PREFERENCE) {
            const hit = sources.find(
              (s: any) => s?.failureReason == null && (s?.availableNodeIds || []).length > 0 &&
                (String(s?.sourceId).includes(pref) || String(s?.skill) === pref)
            );
            if (hit) { srcId = hit.sourceId; nodeId = hit.availableNodeIds[0]; break; }
          }
          if (!nodeId) {
            const any = sources.find((s: any) => s?.failureReason == null && (s?.availableNodeIds || []).length > 0);
            if (any) { srcId = any.sourceId; nodeId = any.availableNodeIds[0]; }
          }
        } catch (e: any) {
          addLog("warn", "Auto-work: progression read failed", e?.message || String(e));
        }

        if (!nodeId) {
          addLog("warn", "Auto-work: no available source nodes, waiting 60s");
          await new Promise((r) => setTimeout(r, 60000));
          continue;
        }

        lastJobTime = Date.now();
        addLog("info", "Auto-work: gathering", `${srcId} -> ${nodeId}`);
        await submitAction({ kind: "gather", nodeId } as any);
        if (autoWorkCancelledRef.current) return;

        // Wait for confirmation
        for (let i = 0; i < 5 && !autoWorkCancelledRef.current; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          await refreshState();
          const kind = agentStateRef.current?.activeAction?.kind;
          if (kind === "gather") {
            addLog("info", "Auto-work: gather confirmed by server");
            break;
          }
        }
      }
    };

    run().catch((err: any) => {
      addLog("error", "Auto-work loop crashed", err.message);
    });

    return () => {
      autoWorkCancelledRef.current = true;
      addLog("info", "Auto-work disabled");
    };
  }, [autoMine, submitAction, addLog, refreshState, apiCall, agentId]);

  // ── Auto-reply loop (poll threads, reply via LLM) ──────────────────────────
  const autoReplyCancelledRef = useRef(false);
  const lastRepliedThreadIds = useRef<Map<string, number>>(new globalThis.Map()); // threadId -> timestamp of last reply attempt
  const autoReplyInFlightRef = useRef(false);

  useEffect(() => {
    if (!autoReply) return;
    if (!connectedRef.current) {
      addLog("warn", "Auto-reply: not connected, waiting...");
      return;
    }

    autoReplyCancelledRef.current = false;
    addLog("info", "Auto-reply: starting thread monitor");

    const isUnread = (t: any): boolean => {
      // API may return unreadCount, hasUnread, or neither
      if (typeof t.unreadCount === "number") return t.unreadCount > 0;
      if (t.hasUnread === true) return true;
      // Fallback: last message is from someone else and recent
      const lastMsg = t.lastMessageAt || t.lastActivityAt || t.updatedAt;
      if (lastMsg) {
        const age = Date.now() - new Date(lastMsg).getTime();
        return age < 300000; // 5 minutes
      }
      return false;
    };

    const run = async () => {
      while (!autoReplyCancelledRef.current) {
        try {
          // Only one auto-reply in flight at a time
          if (autoReplyInFlightRef.current) {
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }

          // Refresh threads
          await fetchThreads();
          // Read fresh state directly from React (not stale closure)
          const currentThreads = threadsRef.current;
          if (!currentThreads?.length) {
            await new Promise((r) => setTimeout(r, 30000));
            continue;
          }

          // Find ONE thread to reply to (not all)
          let targetThread: any = null;
          const now = Date.now();
          for (const t of currentThreads.slice(0, 10)) { // cap at 10 threads
            const lastAttempt = lastRepliedThreadIds.current.get(t.threadId) || 0;
            // Skip if replied within 5 min, or not unread
            if (now - lastAttempt < 300000) continue;
            if (!isUnread(t)) continue;
            targetThread = t;
            break;
          }

          if (!targetThread) {
            await new Promise((r) => setTimeout(r, 30000));
            continue;
          }

          autoReplyInFlightRef.current = true;
          addLog("info", "Auto-reply: processing thread", `${targetThread.title || targetThread.threadId}`);

          try {
            const result = await window.electronAPI.midnightCity.autoReply({
              threadId: targetThread.threadId,
              agentId,
              otherAgentName: targetThread.otherAgentName || targetThread.title || "Someone",
              otherAgentId: targetThread.otherAgentId || "",
            });

            lastRepliedThreadIds.current.set(targetThread.threadId, Date.now());

            if (result.success) {
              addLog("success", "Auto-reply sent", result.reply?.slice(0, 60) || "");
            } else {
              addLog("warn", "Auto-reply failed", result.error);
            }
          } finally {
            autoReplyInFlightRef.current = false;
          }
        } catch (err: any) {
          addLog("error", "Auto-reply loop error", err.message);
          autoReplyInFlightRef.current = false;
        }
        await new Promise((r) => setTimeout(r, 30000));
      }
    };

    run().catch((err: any) => {
      addLog("error", "Auto-reply loop crashed", err.message);
    });

    return () => {
      autoReplyCancelledRef.current = true;
      addLog("info", "Auto-reply disabled");
    };
  }, [autoReply, addLog, fetchThreads, agentId]);

  // ── Load script ──────────────────────────────────────────────────────────
  const loadScript = useCallback(async () => {
    try {
      addLog("info", "Loading script...", scriptPath);
      const result = await window.electronAPI.midnightCity.readScript(scriptPath);
      if (result.success && result.content !== undefined) {
        setScriptContent(result.content);
        setScriptDirty(false);
        addLog("success", "Script loaded", `${result.content.length} chars`);
      } else {
        throw new Error(result.error || "Failed to load script");
      }
    } catch (err: any) {
      addLog("error", "Script load failed", err.message);
      setScriptContent("# Son of Anton Miner Script\n# File could not be loaded. Check path.");
    }
  }, [scriptPath, addLog]);

  // ── Save script ──────────────────────────────────────────────────────────
  const saveScript = useCallback(async () => {
    setScriptSaving(true);
    try {
      addLog("info", "Saving script...", scriptPath);
      const result = await window.electronAPI.midnightCity.writeScript({
        path: scriptPath,
        content: scriptContent,
      });
      if (result.success) {
        setScriptDirty(false);
        addLog("success", "Script saved");
      } else {
        throw new Error(result.error || "Save failed");
      }
    } catch (err: any) {
      addLog("error", "Script save failed", err.message);
    } finally {
      setScriptSaving(false);
    }
  }, [scriptPath, scriptContent, addLog]);

  // ── Restart Son of Anton ─────────────────────────────────────────────────
  const restartMiner = useCallback(async () => {
    try {
      addLog("info", "Restarting Son of Anton daemon...");
      const result = await window.electronAPI.midnightCity.restartMiner();
      if (result.success) {
        addLog("success", "Daemon restarted", result.pid ? `PID ${result.pid}` : "");
      } else {
        throw new Error(result.error || "Restart failed");
      }
    } catch (err: any) {
      addLog("error", "Restart failed", err.message);
    }
  }, [addLog]);

  // ── Deploy new agent ───────────────────────────────────────────────────────
  const deployNewAgent = useCallback(async () => {
    if (!factoryName.trim()) {
      addLog("warn", "Factory: name required");
      return;
    }
    setFactoryDeploying(true);
    setFactoryResult(null);
    try {
      addLog("info", "Deploying new agent...", `${factoryName} (${factoryProfession})`);
      const result = await window.electronAPI.midnightCity.deployAgent({
        name: factoryName.trim(),
        profession: factoryProfession,
        baseImage: "midnight-miner-donbenito:2.0.3",
      });
      if (result.success) {
        addLog("success", "Agent deployed", `Slot ${result.slot}, Port ${result.port}`);
        setFactoryResult(`Deployed to slot ${result.slot} on port ${result.port}`);
      } else {
        throw new Error(result.error || "Deploy failed");
      }
    } catch (err: any) {
      addLog("error", "Factory deploy failed", err.message);
      setFactoryResult(`Error: ${err.message}`);
    } finally {
      setFactoryDeploying(false);
    }
  }, [factoryName, factoryProfession, addLog]);

  // ── Heartbeat auto-refresh (polls background service status) ───────────────
  useEffect(() => {
    const id = setInterval(async () => {
      await syncFromBackground();
      if (connectedRef.current) {
        await refreshAll();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [syncFromBackground, refreshAll]);

  // ── Wallet polling (slower — endpoints may not exist yet) ────────────────
  useEffect(() => {
    const id = setInterval(async () => {
      if (connectedRef.current && agentId) {
        await fetchWallet();
        await fetchWalletTxs();
      }
    }, 30000); // Poll wallet every 30s instead of 5s
    return () => clearInterval(id);
  }, [fetchWallet, fetchWalletTxs, agentId]);

  // ── NEW v2.0: Auto-sell loop (sell ore to best merchant after mining) ────
  const autoSellCancelledRef = useRef(false);
  useEffect(() => {
    if (!autoSell) return;
    autoSellCancelledRef.current = false;
    addLog("info", "Auto-sell: monitoring inventory for ore...");
    const id = setInterval(async () => {
      if (autoSellCancelledRef.current) return;
      const inv = inventory;
      const oreQty = inv?.inventory?.["ore"] || inv?.inventory?.["iron_ore"] || 0;
      if (oreQty >= 100) {
        // Find merchant buying ore
        const buyer = merchantOffersRef.current.find((m) => m.offers.some((o) => o.itemId === "ore" && o.buyPrice > 0));
        if (buyer) {
          const offer = buyer.offers.find((o) => o.itemId === "ore");
          addLog("info", "Auto-sell: selling ore", `${oreQty} to ${buyer.merchantName} @ ${offer?.buyPrice} NIGHT`);
          await submitAction({ kind: "trade", merchantName: buyer.merchantName, itemId: "ore", quantity: oreQty });
          await refreshState();
        }
      }
    }, 15000);
    return () => {
      autoSellCancelledRef.current = true;
      clearInterval(id);
      addLog("info", "Auto-sell disabled");
    };
  }, [autoSell, inventory, merchantOffers, submitAction, addLog, refreshState]);

  // ── NEW v2.0: Auto-restock loop (eat when hungry, sleep when tired) ──────
  const autoRestockCancelledRef = useRef(false);
  useEffect(() => {
    if (!autoRestock) return;
    autoRestockCancelledRef.current = false;
    addLog("info", "Auto-restock: monitoring needs...");
    const id = setInterval(async () => {
      if (autoRestockCancelledRef.current) return;
      const n = needsRef.current;
      if (!n) return;
      const hRaw: any = n.hunger;
      const eRaw: any = n.energy;
      const hunger = typeof hRaw === "number" ? hRaw : hRaw?.value ?? 100;
      const energy = typeof eRaw === "number" ? eRaw : eRaw?.value ?? 100;
      const inv = inventoryRef.current;
      // Eat when hunger < 30 AND have food
      if (hunger < 30) {
        const hasFood = inv?.inventory && (inv.inventory["bread"] > 0 || inv.inventory["stew"] > 0 || inv.inventory["food"] > 0);
        if (hasFood) {
          addLog("info", "Auto-restock: hunger low, eating bread...");
          await submitAction({ kind: "eat", itemId: "bread" });
        } else {
          addLog("warn", "Auto-restock: hunger low but NO FOOD in inventory");
        }
      }
      // Sleep when energy < 20
      if (energy < 20) {
        addLog("info", "Auto-restock: energy low, sleeping...");
        await submitAction({ kind: "sleep" });
      }
    }, 20000);
    return () => {
      autoRestockCancelledRef.current = true;
      clearInterval(id);
      addLog("info", "Auto-restock disabled");
    };
  }, [autoRestock, submitAction, addLog]);

  // ── Auto-scroll logs ─────────────────────────────────────────────────────
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadScript();
    syncFromBackground();
    addLog("info", "Midnight City Command Panel initialized (v2 — Background Service)");
  }, [loadScript, syncFromBackground, addLog]);

  // ── Render helpers ───────────────────────────────────────────────────────
  const statusColor = (s?: string) => {
    if (!s) return "text-gray-400";
    if (s === "idle") return "text-green-400";
    if (s === "busy") return "text-amber-400";
    if (s === "offline") return "text-red-400";
    return "text-blue-400";
  };

  const logColor = (level: LogEntry["level"]) => {
    switch (level) {
      case "error": return "text-red-400";
      case "warn": return "text-amber-400";
      case "success": return "text-green-400";
      default: return "text-gray-300";
    }
  };

  // ── NEW v2.0: Safely extract numeric value from needs object ─────────────────
  const needVal = (raw: any): number => {
    if (typeof raw === "number") return raw;
    if (raw && typeof raw.value === "number") return raw.value;
    return 0;
  };

  const tabs = [
    { id: "status" as const, label: "Status", icon: Activity },
    { id: "wallet" as const, label: "Wallet", icon: Shield },
    { id: "actions" as const, label: "Actions", icon: Zap },
    { id: "script" as const, label: "Script", icon: FileCode },
    { id: "factory" as const, label: "Factory", icon: Box },
    { id: "config" as const, label: "Config", icon: Settings },
    { id: "logs" as const, label: "Logs", icon: Terminal },
  ];
  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 font-mono text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2">
          <Pickaxe size={18} className="text-cyan-400" />
          <span className="font-bold text-cyan-400">MIDNIGHT CITY COMMAND</span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400">Son of Anton</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Config button */}
          <button
            onClick={() => setActiveTab("config")}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold bg-gray-700/50 text-gray-300 border border-gray-600 hover:bg-gray-700 hover:text-white transition-colors"
            title="Configure credentials"
          >
            <Settings size={12} /> CONFIG
          </button>

          {/* Lock toggle */}
          <button
            onClick={toggleLock}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold transition-colors ${
              locked
                ? "bg-amber-900/30 text-amber-400 border border-amber-700 hover:bg-amber-900/50"
                : "bg-gray-700/50 text-gray-400 border border-gray-600 hover:bg-gray-700 hover:text-gray-200"
            }`}
            title={locked ? "Agent is locked — survives tab switches" : "Click to lock agent session"}
          >
            {locked ? <Lock size={12} /> : <Unlock size={12} />}
            {locked ? "LOCKED" : "UNLOCKED"}
          </button>

          {/* Connection status */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${connected ? "bg-green-900/30 text-green-400 border border-green-800" : "bg-red-900/30 text-red-400 border border-red-800"}`}>
            {connected ? <CheckCircle size={12} /> : <XCircle size={12} />}
            {connected ? "LIVE" : "OFFLINE"}
          </div>

          {/* Connect / Disconnect button */}
          {!connected ? (
            <button
              onClick={doConnect}
              disabled={connecting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 rounded text-xs font-bold transition-colors"
            >
              {connecting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {connecting ? "Connecting..." : "CONNECT"}
            </button>
          ) : (
            <button
              onClick={doDisconnect}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-xs font-bold transition-colors"
            >
              <StopCircle size={12} />
              DISCONNECT
            </button>
          )}
        </div>
      </div>

      {/* Lock banner (shown when locked) */}
      {locked && (
        <div className="px-4 py-1.5 bg-amber-900/20 border-b border-amber-800/50 flex items-center gap-2">
          <Lock size={12} className="text-amber-400" />
          <span className="text-amber-300 text-xs">
            🔒 Agent session is <strong>locked</strong>. It will survive tab switches, AI Chat, Settings, and any other navigation.
            {!connected && " The session is currently offline but will auto-reconnect when possible."}
          </span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-gray-700 bg-gray-800/50">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
                activeTab === t.id
                  ? "text-cyan-400 border-cyan-400 bg-gray-800"
                  : "text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/50"
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto p-4">
        {lastError && (
          <div className="mb-3 px-3 py-2 bg-red-900/20 border border-red-800 rounded text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle size={14} />
            {lastError}
            <button onClick={() => setLastError(null)} className="ml-auto text-red-400 hover:text-red-200">
              <XCircle size={14} />
            </button>
          </div>
        )}

        {/* ── STATUS TAB ────────────────────────────────────────────────────── */}
        {activeTab === "status" && (
          <div className="space-y-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-cyan-400 flex items-center gap-2">
                  <Bot size={16} />
                  Agent Status
                </h3>
                <span className={`text-xs font-mono ${statusColor(agentState?.status)}`}>
                  {agentState?.status?.toUpperCase() || "UNKNOWN"}
                </span>
              </div>
              {agentState ? (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">ID</span><span className="text-gray-200">{agentState.id}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="text-gray-200">{agentState.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Profession</span><span className="text-gray-200">{agentState.profession}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Position</span><span className="text-gray-200">{agentState.position?.spaceId} ({agentState.position?.x}, {agentState.position?.y})</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Crystals</span><span className="text-cyan-400 font-mono">{agentState.crystals ?? "?"} 💎</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Action</span><span className="text-gray-200">{agentState.activeAction ? JSON.stringify(agentState.activeAction).slice(0, 60) : "None"}</span></div>
                  {/* NEW: Tool durability */}
                  {needs?.toolDurability && Object.keys(needs.toolDurability).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <div className="text-gray-500 text-[10px] mb-1">Tool Durability</div>
                      {Object.entries(needs.toolDurability).map(([tool, pct]) => (
                        <div key={tool} className="flex items-center gap-2 mb-1">
                          <span className="text-gray-400 text-[10px] w-16">{tool}</span>
                          <div className="flex-1 bg-gray-700 rounded-full h-1">
                            <div
                              className={`h-1 rounded-full ${pct < 0.2 ? "bg-red-500" : pct < 0.5 ? "bg-amber-500" : "bg-green-500"}`}
                              style={{ width: `${Math.max(0, pct * 100)}%` }}
                            />
                          </div>
                          <span className={`text-[10px] w-8 text-right ${pct < 0.2 ? "text-red-400" : "text-gray-400"}`}>
                            {Math.round(pct * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-xs italic">{connected ? "Loading..." : "Connect to load state"}</div>
              )}
            </div>

            {/* Inventory */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="font-bold text-cyan-400 mb-3 flex items-center gap-2"><ScrollText size={16} /> Inventory</h3>
              {inventory ? (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(inventory.inventory || {}).map(([name, qty]) => (
                    <div key={name} className="flex justify-between text-xs bg-gray-900/50 rounded px-2 py-1">
                      <span className="text-gray-400">{name}</span>
                      <span className="text-cyan-400 font-mono">{qty}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-xs italic">{connected ? "Loading..." : "Connect to load inventory"}</div>
              )}
              {/* NEW: Inventory weight bar */}
              {needs && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                    <span>Inv Weight</span>
                    <span className={needVal(needs.inventoryWeight) / needVal(needs.inventoryCapacity) > 0.8 ? "text-red-400 font-bold" : "text-gray-400"}>
                      {needVal(needs.inventoryWeight)}/{needVal(needs.inventoryCapacity)}
                      {needVal(needs.inventoryWeight) / needVal(needs.inventoryCapacity) > 0.8 && " ⚠️ NEAR CAPACITY"}
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        needVal(needs.inventoryWeight) / needVal(needs.inventoryCapacity) > 0.8 ? "bg-red-500" : "bg-cyan-500"
                      }`}
                      style={{ width: `${Math.min(100, (needVal(needs.inventoryWeight) / Math.max(1, needVal(needs.inventoryCapacity))) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Nearby agents — with speak button */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="font-bold text-cyan-400 mb-3 flex items-center gap-2"><Cpu size={16} /> Nearby Agents</h3>
              {nearbyAgents.length > 0 ? (
                <div className="space-y-2">
                  {nearbyAgents.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-xs bg-gray-900/50 rounded px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <Bot size={12} className={statusColor(a.status)} />
                        <span className="text-gray-200">{a.name}</span>
                        <span className="text-gray-500">({a.profession})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">{(a.distance ?? 0).toFixed(1)}m</span>
                        <button
                          onClick={() => {
                            setSelectedNearbyAgentId(a.id);
                            setMessageText("");
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                            selectedNearbyAgentId === a.id
                              ? "bg-cyan-700/40 text-cyan-300 border-cyan-600"
                              : "bg-gray-700/30 text-gray-400 border-gray-600 hover:bg-cyan-700/30 hover:text-cyan-300"
                          }`}
                        >
                          💬
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-xs italic">{connected ? "No agents nearby" : "Connect to discover agents"}</div>
              )}

              {/* Speak to selected agent */}
              {selectedNearbyAgentId && nearbyAgents.some((a) => a.id === selectedNearbyAgentId) && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && messageText.trim()) {
                        submitAction({ kind: "speak", targetAgentId: selectedNearbyAgentId, message: messageText.trim() });
                        setMessageText("");
                      }
                    }}
                    placeholder={`Message ${nearbyAgents.find((a) => a.id === selectedNearbyAgentId)?.name}...`}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-600"
                  />
                  <button
                    onClick={() => {
                      if (!messageText.trim()) return;
                      submitAction({ kind: "speak", targetAgentId: selectedNearbyAgentId, message: messageText.trim() });
                      setMessageText("");
                    }}
                    disabled={!messageText.trim() || !connected}
                    className="px-2 py-1 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-600 rounded text-xs font-bold transition-colors"
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── WALLET TAB (Midnight City v2.0) ───────────────────────────────── */}
        {activeTab === "wallet" && (
          <div className="space-y-4">
            {/* Wallet Card */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-cyan-400 flex items-center gap-2"><Shield size={16} /> Midnight Wallet</h3>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedNetwork}
                    onChange={(e) => setSelectedNetwork(e.target.value as "midnight-preprod" | "cardano-preview")}
                    className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200"
                  >
                    <option value="midnight-preprod">🌙 Midnight Preprod</option>
                    <option value="cardano-preview">🔷 Cardano Preview</option>
                  </select>
                  <button
                    onClick={() => { fetchWallet(); fetchWalletTxs(); }}
                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                    title="Refresh wallet"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>

              {wallet ? (
                <div className="space-y-3">
                  {/* Address */}
                  <div className="bg-gray-900 rounded p-3">
                    <div className="text-gray-500 text-xs mb-1">Address</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-300 font-mono truncate flex-1">{wallet.address}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(wallet.address)}
                        className="text-gray-500 hover:text-cyan-400"
                        title="Copy address"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    {wallet.compactAddress && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400 font-mono truncate flex-1">{wallet.compactAddress}</span>
                        <span className="text-[10px] bg-gray-700 px-1 rounded text-gray-400">Compact</span>
                      </div>
                    )}
                  </div>

                  {/* Balances */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-900 rounded p-3">
                      <div className="text-gray-500 text-xs mb-1">NIGHT Balance</div>
                      <div className="text-xl font-bold text-amber-400">{wallet.night.toFixed(4)} NIGHT</div>
                    </div>
                    <div className="bg-gray-900 rounded p-3">
                      <div className="text-gray-500 text-xs mb-1">ShieldedToken</div>
                      <div className="text-xl font-bold text-pink-400">{wallet.shielded.toFixed(4)} ST</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-gray-500 text-xs italic">Connect to load wallet data.</div>
              )}
            </div>

            {/* ZSwap Panel */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="font-bold text-pink-400 mb-3 flex items-center gap-2">🔄 ZSwap</h3>
              <p className="text-gray-400 text-xs mb-3">Atomic swap between NIGHT and ShieldedToken via Midnight Preprod.</p>
              {merchantOffers.length > 0 ? (
                merchantOffers.map((m) => (
                  <div key={m.merchantId} className="bg-gray-900 rounded p-3 mb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-200">{m.merchantName}</span>
                      <span className="text-[10px] text-gray-500">{m.location.spaceId}</span>
                    </div>
                    {m.offers.map((o) => (
                      <div key={o.itemId} className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-400">{o.itemName} — {o.buyPrice} NIGHT</span>
                        <button
                          onClick={() => submitZSwap({
                            fromToken: "NIGHT",
                            toToken: "ShieldedToken",
                            amount: o.buyPrice,
                            merchantAddress: m.merchantId,
                          })}
                          disabled={!connected || !wallet || wallet.night < o.buyPrice}
                          className="px-2 py-1 bg-pink-700/30 hover:bg-pink-700/50 border border-pink-600/30 rounded text-[10px] disabled:opacity-50"
                        >
                          Swap
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div className="text-gray-500 text-xs italic">No merchant offers available. Connect and refresh.</div>
              )}
            </div>

            {/* Transaction History */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="font-bold text-cyan-400 mb-3 flex items-center gap-2"><ScrollText size={16} /> Recent Transactions</h3>
              {walletTxs.length > 0 ? (
                <div className="space-y-1 max-h-40 overflow-auto">
                  {walletTxs.slice(0, 20).map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between text-xs bg-gray-900/50 rounded px-2 py-1">
                      <div className="flex items-center gap-2">
                        <span className={tx.status === "confirmed" ? "text-green-400" : tx.status === "pending" ? "text-amber-400" : "text-red-400"}>
                          {tx.status === "confirmed" ? "✓" : tx.status === "pending" ? "◐" : "✗"}
                        </span>
                        <span className="text-gray-300">{tx.kind}</span>
                        {tx.merchantName && <span className="text-gray-500">@{tx.merchantName}</span>}
                      </div>
                      <span className={tx.token === "NIGHT" ? "text-amber-400" : "text-pink-400"}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount} {tx.token}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-xs italic">No transactions yet.</div>
              )}
            </div>
          </div>
        )}

        {/* ── ACTIONS TAB ───────────────────────────────────────────────────── */}
        {activeTab === "actions" && (
          <div className="space-y-4">
            {/* Quick actions */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="font-bold text-cyan-400 mb-3 flex items-center gap-2"><Zap size={16} /> Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={restartMiner}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-amber-700/30 hover:bg-amber-700/50 border border-amber-600/30 rounded text-xs transition-colors"
                >
                  <Play size={14} /> Restart V7 Miner
                </button>
                <button
                  onClick={async () => {
                    const target = findHarvestArea("mine") || "mines-worksite";
                    addLog("info", "Manual: move to", target);
                    await submitAction({ kind: "move_to", destination: { spaceId: target, x: 0, y: 0 } });
                    // Poll for arrival instead of blind 10s wait
                    let arrived = false;
                    for (let i = 0; i < 10; i++) {
                      await new Promise((r) => setTimeout(r, 3000));
                      await refreshState();
                      const space = agentStateRef.current?.position?.spaceId || "";
                      if (space.toLowerCase().includes("miner") || space.toLowerCase().includes("mine")) {
                        arrived = true;
                        addLog("info", "Manual: arrived at mine", space);
                        break;
                      }
                    }
                    if (!arrived) {
                      addLog("warn", "Manual: move timeout, proceeding anyway");
                    }
                    addLog("info", "Manual: requesting job");
                    await submitAction({ kind: "perform_job", activity: "mine ore" });
                  }}
                  disabled={!connected || isMining}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-cyan-700/30 hover:bg-cyan-700/50 border border-cyan-600/30 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Pickaxe size={14} /> {isMining ? <Loader2 size={14} className="animate-spin" /> : "Mine Ore"}
                </button>
                <button onClick={() => {
                  const spaceId = agentState?.position?.spaceId || "central";
                  submitAction({ kind: "move_to", destination: { spaceId, x: 0, y: 0 } });
                }} disabled={!connected || isMining} className="flex items-center justify-center gap-2 px-3 py-2 bg-purple-700/30 hover:bg-purple-700/50 border border-purple-600/30 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <Server size={14} /> Move to Town
                </button>
                <button onClick={() => {
                  if (discoveredAreas.length === 0) {
                    addLog("warn", "Cannot rest: no area discovered");
                    return;
                  }
                  const areaId = discoveredAreas[0]?.areaId;
                  submitAction({ kind: "sleep", location: { areaId }, durationMs: 28800000 });
                }} disabled={!connected || isMining || discoveredAreas.length === 0} className="flex items-center justify-center gap-2 px-3 py-2 bg-green-700/30 hover:bg-green-700/50 border border-green-600/30 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <Pause size={14} /> Rest
                </button>
                <button onClick={() => refreshState()} disabled={!connected || isMining} className="flex items-center justify-center gap-2 px-3 py-2 bg-amber-700/30 hover:bg-amber-700/50 border border-amber-600/30 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <Eye size={14} /> Refresh State
                </button>
              </div>
            </div>

            {/* Auto-mine */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-cyan-400 flex items-center gap-2"><Settings size={16} /> Auto-Work</h3>
                <button
                  onClick={async () => {
                    const next = !autoMine;
                    setAutoMine(next); // Immediate UI feedback
                    addLog("info", next ? "Auto-work: enabled by user" : "Auto-work: disabled by user");
                    // Sync to background service so heartbeat doesn't override
                    try {
                      await window.electronAPI.midnightCity.setAutoWork(next);
                    } catch (err: any) {
                      addLog("warn", "Auto-work: failed to sync to background service", err.message);
                    }
                  }}
                  className={`px-3 py-1 rounded text-xs font-bold transition-colors ${autoMine ? "bg-green-600 hover:bg-green-500" : "bg-gray-600 hover:bg-gray-500"}`}
                >
                  {autoMine ? "ON" : "OFF"}
                </button>
              </div>
              <p className="text-gray-500 text-xs mt-2">Moves to mines-worksite if not there, then performs mining job (produces ore). Skips ticks while already mining to prevent walking loops.</p>
            </div>

            {/* NEW v2.0: Economy Controls — Auto-Sell + Auto-Restock */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-cyan-400 flex items-center gap-2"><Settings size={16} /> Economy Automation</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between bg-gray-900 rounded p-2">
                  <div>
                    <div className="text-xs font-bold text-gray-200">Auto-Sell Ore</div>
                    <div className="text-[10px] text-gray-500">Sell to best merchant @ {merchantOffers[0]?.offers[0]?.buyPrice ?? "?"} NIGHT</div>
                  </div>
                  <button
                    onClick={() => setAutoSell((prev) => !prev)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-colors ${autoSell ? "bg-amber-600 hover:bg-amber-500" : "bg-gray-600 hover:bg-gray-500"}`}
                  >
                    {autoSell ? "ON" : "OFF"}
                  </button>
                </div>
                <div className="flex items-center justify-between bg-gray-900 rounded p-2">
                  <div>
                    <div className="text-xs font-bold text-gray-200">Auto-Restock</div>
                    <div className="text-[10px] text-gray-500">Eat when hungry, sleep when tired</div>
                  </div>
                  <button
                    onClick={() => setAutoRestock((prev) => !prev)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-colors ${autoRestock ? "bg-green-600 hover:bg-green-500" : "bg-gray-600 hover:bg-gray-500"}`}
                  >
                    {autoRestock ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-gray-500">Hunger</div>
                  <div className={`font-mono ${(needVal(needs?.hunger)) < 30 ? "text-red-400" : "text-gray-200"}`}>
                    {needVal(needs?.hunger) || "?"}/100
                  </div>
                </div>
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-gray-500">Energy</div>
                  <div className={`font-mono ${(needVal(needs?.energy)) < 20 ? "text-red-400" : "text-gray-200"}`}>
                    {needVal(needs?.energy) || "?"}/100
                  </div>
                </div>
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-gray-500">Inv Weight</div>
                  <div className="font-mono text-gray-200">
                    {needVal(needs?.inventoryWeight) || "?"}/{needVal(needs?.inventoryCapacity) || "?"}
                  </div>
                </div>
              </div>
            </div>

            {/* Discovered areas */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="font-bold text-cyan-400 mb-3 flex items-center gap-2"><Map size={16} /> Discovered Areas</h3>
              {discoveredAreas.length > 0 ? (
                <div className="space-y-2">
                  {discoveredAreas.map((area) => (
                    <div key={area.areaId} className="flex items-center justify-between text-xs bg-gray-900/50 rounded px-2 py-1.5">
                      <div>
                        <span className="text-gray-200 font-bold">{area.name}</span>
                        <span className="text-gray-500 ml-2">{area.activities?.join(", ") || ""}</span>
                      </div>
                      {area.moveAreaAvailable && (
                        <button
                          onClick={() => submitAction({ kind: "move_to", destination: { spaceId: area.areaId, x: 0, y: 0 } })}
                          disabled={!connected || isMining}
                          className="px-2 py-0.5 bg-cyan-700/30 hover:bg-cyan-700/50 border border-cyan-600/30 rounded text-xs disabled:opacity-50"
                        >
                          Move
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-xs italic">{connected ? "No areas discovered yet" : "Connect to discover areas"}</div>
              )}
            </div>

            {/* Agent Needs (eat) */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="font-bold text-cyan-400 mb-3 flex items-center gap-2"><Pause size={16} /> Needs</h3>
              {needs ? (
                <div className="space-y-2 text-xs">
                  {["hunger","energy","social","health"].map((needKey) => {
                    const raw = needs[needKey];
                    const val = typeof raw === "number" ? raw : typeof raw?.value === "number" ? raw.value : "?";
                    const label = needKey.charAt(0).toUpperCase() + needKey.slice(1);
                    const isWarning = (needKey === "hunger" && val > 50) || (needKey === "energy" && val < 30) || (needKey === "health" && val < 30);
                    return (
                      <div key={needKey} className="flex justify-between">
                        <span className="text-gray-500">{label}</span>
                        <span className={isWarning ? "text-red-400 font-bold" : "text-gray-200"}>{val}</span>
                      </div>
                    );
                  })}
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      value={selectedFood}
                      onChange={(e) => setSelectedFood(e.target.value)}
                      className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 flex-1"
                    >
                      <option value="bread">🍞 Bread (+15 hunger) {(() => {
                        const qty = inventory?.inventory?.["bread"] || 0;
                        return qty > 0 ? `(${qty} owned)` : "(need to buy)";
                      })()}</option>
                      <option value="stew">🍲 Stew (+30 hunger) {(() => {
                        const qty = inventory?.inventory?.["stew"] || 0;
                        return qty > 0 ? `(${qty} owned)` : "(need to buy)";
                      })()}</option>
                      <option value="energy_drink">⚡ Energy Drink (+20 energy) {(() => {
                        const qty = inventory?.inventory?.["energy_drink"] || 0;
                        return qty > 0 ? `(${qty} owned)` : "(need to buy)";
                      })()}</option>
                    </select>
                    <button
                      onClick={() => submitAction({ kind: "eat", itemId: selectedFood })}
                      disabled={!connected || isMining || !(inventory?.inventory?.[selectedFood] > 0)}
                      title={inventory?.inventory?.[selectedFood] > 0 ? `Consume 1 ${selectedFood}` : `No ${selectedFood} in inventory — buy first`}
                      className="flex items-center justify-center gap-2 px-3 py-1 bg-green-700/30 hover:bg-green-700/50 border border-green-600/30 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      🍽️ Eat
                    </button>
                  </div>
                  {!(inventory?.inventory?.[selectedFood] > 0) && (
                    <div className="mt-1 text-[10px] text-amber-400">
                      💡 No {selectedFood} in inventory. Go to Actions → Buy Supplies first.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-xs italic">{connected ? "Loading needs..." : "Connect to load needs"}</div>
              )}
            </div>

            {/* Shout (global message) */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="font-bold text-cyan-400 mb-3 flex items-center gap-2"><Send size={16} /> Shout</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && messageText.trim()) {
                      submitAction({ kind: "shout", text: messageText.trim() });
                      setMessageText("");
                    }
                  }}
                  placeholder="Shout to nearby agents..."
                  className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-600"
                />
                <button
                  onClick={() => {
                    if (!messageText.trim()) return;
                    submitAction({ kind: "shout", text: messageText.trim() });
                    setMessageText("");
                  }}
                  disabled={!messageText.trim() || !connected}
                  className="px-3 py-1 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-600 rounded text-xs font-bold transition-colors"
                >
                  Shout
                </button>
              </div>
            </div>

            {/* Sell Ore */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="font-bold text-cyan-400 mb-3 flex items-center gap-2"><ScrollText size={16} /> Sell Ore</h3>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={tradeQty}
                  onChange={(e) => setTradeQty(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-cyan-600"
                />
                <button
                  onClick={() => {
                    submitAction({ kind: "trade", merchantName: "Central Merchant East", itemId: "ore", quantity: tradeQty });
                  }}
                  disabled={!connected || isMining}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-amber-700/30 hover:bg-amber-700/50 border border-amber-600/30 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  💰 Sell to Merchant
                </button>
              </div>
              <p className="text-gray-500 text-xs mt-2">Sells ore to Central Merchant East.</p>
            </div>

            {/* ── NEW v2.0: Buy Food Supplies ──────────────────────────────────── */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-green-400 flex items-center gap-2"><ShoppingCart size={16} /> Buy Supplies</h3>
                <span className="text-[10px] text-gray-500">💎 {agentState?.crystals ?? "?"} crystals</span>
              </div>
              {merchantOffers.length > 0 ? (
                <div className="space-y-2">
                  {/* Food merchants */}
                  {merchantOffers
                    .filter((m) => m.offers.some((o) => ["bread", "stew", "energy_drink", "food", "rations"].includes(o.itemId)))
                    .map((m) => (
                      <div key={m.merchantId} className="bg-gray-900 rounded p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-gray-200">{m.merchantName}</span>
                          <span className="text-[10px] text-gray-500">{m.location.spaceId}</span>
                        </div>
                        {m.offers
                          .filter((o) => ["bread", "stew", "energy_drink", "food", "rations"].includes(o.itemId))
                          .map((o) => (
                            <div key={o.itemId} className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">{o.itemName} — {o.sellPrice} crystals</span>
                              <button
                                onClick={async () => {
                                  // Compound action: move → buy
                                  const currentSpace = agentStateRef.current?.position?.spaceId;
                                  if (currentSpace !== m.location.spaceId) {
                                    addLog("info", `Buy supplies: moving to ${m.location.spaceId}...`);
                                    await submitAction({
                                      kind: "move_to",
                                      destination: { spaceId: m.location.spaceId, x: m.location.x ?? 0, y: m.location.y ?? 0 },
                                    });
                                    // Wait for arrival
                                    let arrived = false;
                                    for (let i = 0; i < 8; i++) {
                                      await new Promise((r) => setTimeout(r, 3000));
                                      await refreshState();
                                      const space = agentStateRef.current?.position?.spaceId;
                                      if (space === m.location.spaceId) {
                                        arrived = true;
                                        break;
                                      }
                                    }
                                    if (!arrived) {
                                      addLog("warn", "Buy supplies: move timeout");
                                      return;
                                    }
                                  }
                                  addLog("info", `Buy supplies: purchasing ${o.itemName} from ${m.merchantName}`);
                                  await submitAction({
                                    kind: "trade",
                                    merchantName: m.merchantName,
                                    itemId: o.itemId,
                                    quantity: 1,
                                    direction: "buy",
                                  });
                                  addLog("success", `Buy supplies: purchased ${o.itemName}`, "Check inventory");
                                  await refreshState();
                                }}
                                disabled={!connected || isMining}
                                className="px-2 py-0.5 bg-green-700/30 hover:bg-green-700/50 border border-green-600/30 rounded text-[10px] disabled:opacity-50"
                              >
                                Buy 1
                              </button>
                            </div>
                          ))}
                      </div>
                    ))}
                  {merchantOffers.filter((m) =>
                    m.offers.some((o) => ["bread", "stew", "energy_drink", "food", "rations"].includes(o.itemId))
                  ).length === 0 && (
                    <div className="text-gray-500 text-xs italic">No food merchants found. Connect and refresh merchants.</div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-xs italic">{connected ? "Loading merchants..." : "Connect to discover food merchants"}</div>
              )}
            </div>

            {/* Threads / Messages */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-cyan-400 flex items-center gap-2"><Terminal size={16} /> Conversations</h3>
                <button
                  onClick={() => setAutoReply((prev) => !prev)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-colors ${autoReply ? "bg-green-600 hover:bg-green-500" : "bg-gray-600 hover:bg-gray-500"}`}
                >
                  {autoReply ? "🤖 ON" : "OFF"}
                </button>
              </div>
              {threads.length > 0 ? (
                <div className="space-y-1 max-h-40 overflow-auto">
                  {threads.slice(0, 10).map((t) => (
                    <div key={t.threadId} className="text-xs bg-gray-900/50 rounded px-2 py-1 flex justify-between">
                      <span className="text-gray-300">{t.title || t.threadId}</span>
                      <span className="text-gray-500">{t.unreadCount > 0 ? `🔴 ${t.unreadCount}` : ""}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-xs italic">{connected ? "No threads" : "Connect to load conversations"}</div>
              )}
            </div>
          </div>
        )}

        {/* ── SCRIPT TAB ─────────────────────────────────────────────────────── */}
        {activeTab === "script" && (
          <div className="space-y-4 h-full flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-cyan-400 flex items-center gap-2"><FileCode size={16} /> Script Editor</h3>
              <div className="flex items-center gap-2">
                <button onClick={loadScript} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">Reload</button>
                <button onClick={saveScript} disabled={!scriptDirty || scriptSaving} className="px-2 py-1 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-xs">
                  {scriptSaving ? <Loader2 size={12} className="animate-spin inline" /> : "Save"}
                </button>
                <button onClick={restartMiner} className="px-2 py-1 bg-amber-700 hover:bg-amber-600 rounded text-xs">Restart Daemon</button>
              </div>
            </div>
            <div className="flex-1 relative">
              <textarea
                value={scriptContent}
                onChange={(e) => { setScriptContent(e.target.value); setScriptDirty(true); }}
                className="w-full h-full bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono text-gray-300 resize-none focus:outline-none focus:border-cyan-600"
                spellCheck={false}
              />
              {scriptDirty && (
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-amber-900/50 border border-amber-700 rounded text-amber-300 text-xs">
                  Unsaved changes
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── FACTORY TAB ─────────────────────────────────────────────────────── */}
        {activeTab === "factory" && (
          <div className="space-y-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="font-bold text-cyan-400 mb-3 flex items-center gap-2"><Box size={16} /> Node Factory</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-gray-500 text-xs block mb-1">Agent Name</label>
                  <input
                    type="text"
                    value={factoryName}
                    onChange={(e) => setFactoryName(e.target.value)}
                    placeholder="e.g., miner-01"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-600"
                  />
                </div>
                <div>
                  <label className="text-gray-500 text-xs block mb-1">Profession</label>
                  <select
                    value={factoryProfession}
                    onChange={(e) => setFactoryProfession(e.target.value as any)}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-600"
                  >
                    <option value="miner">Miner</option>
                    <option value="lumberjack">Lumberjack</option>
                    <option value="fisher">Fisher</option>
                    <option value="gatherer">Gatherer</option>
                  </select>
                </div>
                <button
                  onClick={deployNewAgent}
                  disabled={factoryDeploying || !factoryName.trim()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-600 rounded text-xs font-bold transition-colors"
                >
                  {factoryDeploying ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                  {factoryDeploying ? "Deploying..." : "Deploy Agent"}
                </button>
                {factoryResult && (
                  <div className={`text-xs p-2 rounded ${factoryResult.startsWith("Error") ? "bg-red-900/20 text-red-300" : "bg-green-900/20 text-green-300"}`}>
                    {factoryResult}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CONFIG TAB ───────────────────────────────────────────────────────── */}
        {activeTab === "config" && (
          <div className="space-y-4 max-w-lg">
            <h3 className="font-bold text-cyan-400 flex items-center gap-2">
              <Settings size={16} /> Credentials &amp; Settings
            </h3>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">API Base URL</label>
                <input
                  type="text"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-cyan-500"
                  placeholder="https://midnight.city/observer"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Agent ID</label>
                <input
                  type="text"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-cyan-500"
                  placeholder="user-agent-..."
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">API Key (encrypted with OS safeStorage)</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-cyan-500"
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Profession</label>
                <select
                  value={profession}
                  onChange={(e) => setProfession(e.target.value as any)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="miner">Miner</option>
                  <option value="lumberjack">Lumberjack</option>
                  <option value="fisher">Fisher</option>
                  <option value="gatherer">Gatherer</option>
                </select>
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  onClick={saveConfig}
                  disabled={configSaving || !agentId.trim()}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 text-white text-xs rounded font-bold"
                >
                  {configSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={clearConfig}
                  className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800/50 text-red-400 text-xs rounded"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── LOGS TAB ────────────────────────────────────────────────────────── */}
        {activeTab === "logs" && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-cyan-400 flex items-center gap-2"><Terminal size={16} /> Logs</h3>
              <button onClick={() => setLogs([])} className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-400">Clear</button>
            </div>
            <div className="flex-1 bg-gray-900 border border-gray-700 rounded p-2 overflow-auto font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-gray-500 italic">No logs yet...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`mb-1 ${logColor(log.level)}`}>
                    <span className="text-gray-600">[{log.timestamp}]</span>{" "}
                    <span className="font-bold">{log.level.toUpperCase()}</span>{" "}
                    {log.message}
                    {log.detail && <span className="text-gray-500"> — {log.detail}</span>}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


---
name: electron-external-process-bridge
description: Pattern for bridging Electron main/renderer processes to external scripts via a JSONL command file, with spawn guards, file locking, and auto-resume.
triggers:
  - "spawn external process from Electron"
  - "communicate with spawned script"
  - "Electron child process command bridge"
  - "self-hosted agent action dispatch"
  - "file bridge between renderer and external process"
  - "daemon-to-daemon command file pattern"
  - "prevent duplicate process spawn Electron"
  - "Electron process lifecycle guard"
  - "JSONL command queue"
---

# Electron External Process Bridge

**Pattern**: An Electron app (renderer ↔ main ↔ external Python/Node script) communicates via a local JSONL command file instead of sockets, HTTP, or IPC.

**When to use**:
- External script runs independently (e.g., a mining bot, a daemon, a self-hosted agent)
- Script can't receive server-pushed actions (no WebSocket, no HTTP endpoint)
- Script needs to act on user-initiated commands (sell, eat, move, etc.)
- You need fire-and-forget command dispatch without waiting for response

**Why JSONL over sockets/IPC**:
- Works across language boundaries (TypeScript ↔ Python)
- Survives process restarts (file persists, socket does not)
- No serialization complexity (plain JSON lines)
- Append-only is atomic and lockable
- Script polls at its own pace (no push complexity)

## Architecture

```
Renderer Panel ──ipc──► Main Process ──spawn──► External Script (Python)
     │                                              │
     │              writes                           │ polls
     ▼                                              ▼
~/.app-data/commands.jsonl  ◄───────────────────────┘
```

## 1. Main Process: Spawn Guard (Critical)

**Pitfall**: Without a guard, `restartMiner` spawns a new process every time the user clicks Start, causing PID proliferation and resource exhaustion.

**Fix**: Check `pgrep` BEFORE spawning. Return "Already running" if found.

```typescript
ipcMain.handle("app:restartDaemon", async (_event, params?: { config?: string }) => {
  const { spawn, execSync } = require("child_process");

  // GUARD: check if already running — prevents duplicate spawn
  try {
    const output = execSync("pgrep -f 'my_daemon.*.py' || true", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"]
    });
    const pids = output.trim().split("\n").filter((p: string) => p.trim() !== "");
    if (pids.length > 0) {
      return { success: true, pid: parseInt(pids[0], 10), alive: true, message: "Already running" };
    }
  } catch {}

  // Only spawn if nothing is running
  const child = spawn("python3", [scriptPath], {
    detached: true,
    stdio: "ignore",
    cwd: scriptDir,
    env: { ...process.env, MY_TOKEN: creds.token },
  });
  child.unref();

  await new Promise((r) => setTimeout(r, 500));
  const isAlive = child.pid ? !child.killed : false;
  return { success: true, pid: child.pid, alive: isAlive };
});
```

**Why not `pkill` then spawn**: Killing and respawning causes churn, loses state, and creates a window where no daemon is running. The guard pattern is idempotent.

## 2. Main Process: Write Command Handler

```typescript
ipcMain.handle("app:writeCommand", async (_event, command: { id: number; kind: string; [key: string]: any }) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const commandFile = path.join(require("os").homedir(), ".app-data", "commands.jsonl");
    // Ensure dir exists
    const dir = path.dirname(commandFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify(command) + "\n";
    fs.appendFileSync(commandFile, line, "utf8");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
```

## 3. Main Process: Clear Commands Handler

```typescript
ipcMain.handle("app:clearCommands", async () => {
  try {
    const fs = require("fs");
    const commandFile = path.join(require("os").homedir(), ".app-data", "commands.jsonl");
    if (fs.existsSync(commandFile)) {
      fs.writeFileSync(commandFile, "", "utf8");
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
```

## 4. Preload Bridge

```typescript
midnightCity: {
  // ... existing handlers ...
  writeCommand: (command: { id: number; kind: string; [key: string]: any }) =>
    ipcRenderer.invoke("app:writeCommand", command),
  clearCommands: () =>
    ipcRenderer.invoke("app:clearCommands"),
}
```

## 5. Renderer Panel: Dual-Path Submit

The panel must decide whether to send commands to the external script (via file) or to the cloud API.

```typescript
const submitAction = useCallback(async (action: { kind: string; /* ... */ }) => {
  setIsMining(true);
  try {
    // DUAL-PATH: Self-hosted agent → command file
    //            Cloud agent       → direct API
    if (daemonAlive) {
      const cmd = { id: Date.now(), ...action };
      await window.electronAPI.midnightCity.writeCommand(cmd);
      return { success: true };
    }

    // Cloud path
    if (!connectedRef.current) {
      return { success: false, error: "Not connected" };
    }
    const payload = { ...action, agentId };
    await apiCall("/api/actions", "POST", payload);
    return { success: true };
  } finally {
    setIsMining(false);
  }
}, [agentId, apiCall, daemonAlive]);
```

## 6. React: Health Check Without Re-Firing

**Pitfall**: Adding `minerPid` to `useEffect` dependencies causes the effect to re-run every time the PID changes, creating discovery log spam.

**Fix**: Track discovery state in a closure variable, not React state.

```typescript
useEffect(() => {
  let discovered = false; // closure variable, not React state

  // One-time discovery on mount
  (async () => {
    try {
      const status = await window.electronAPI.midnightCity.checkDaemonStatus();
      if (status.alive) {
        discovered = true;
        setDaemonAlive(true);
        setDaemonPid(status.pid || null);
        addLog("success", "Found running daemon", `PID ${status.pid}`);
      }
    } catch {}
  })();

  const id = setInterval(async () => {
    // ... other polling ...
    try {
      const status = await window.electronAPI.midnightCity.checkDaemonStatus();
      setDaemonAlive(status.alive);
      if (status.alive && status.pid) setDaemonPid(status.pid);
      // Only log stop if we previously discovered it running
      if (!status.alive && discovered) {
        addLog("warn", "Daemon has stopped");
        discovered = false;
        setDaemonPid(null);
      }
    } catch {}
  }, 5000);

  return () => clearInterval(id);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [syncFromBackground, refreshAll, addLog]); // <-- deliberately exclude minerPid
```

**Critical**: The `discovered` flag is a closure variable, NOT React state. It prevents re-logging on every effect re-run.

## 7. External Script: File-Locked Command Reader (Python)

**Pitfall**: Two script instances or the panel and script can race on `commands.jsonl`.

**Fix**: Use `fcntl.flock` for advisory locking.

```python
import fcntl, json, os

COMMAND_FILE = os.path.expanduser("~/.app-data/commands.jsonl")

 def read_pending_commands():
    if not os.path.exists(COMMAND_FILE):
        return []
    commands = []
    with open(COMMAND_FILE, "r+", encoding="utf-8") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                commands.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        # Truncate after reading — commands are consumed
        f.seek(0)
        f.truncate()
        fcntl.flock(f, fcntl.LOCK_UN)
    return commands
```

**Key points**:
- `"r+"` mode allows reading AND truncating
- `LOCK_EX` (exclusive lock) blocks other readers/writers
- Truncate after reading so commands don't accumulate forever
- Always unlock, even on error (use `try/finally` or context manager)

## 8. External Script: Command Execution + Auto-Resume

After executing a command, the script should automatically return to its main loop:

```python
 def execute_command(cmd):
    kind = cmd.get("kind", "")
    if kind == "trade":
        # ... execute trade ...
        log(f"✅ Sold {qty} {item}")
    elif kind == "eat":
        # ... execute eat ...
        log("✅ Ate food")
    # ... other commands ...
    return True

 def main_loop():
    while running:
        # Check for commands every 2s
        commands = read_pending_commands()
        for cmd in commands:
            execute_command(cmd)
        # Resume normal work (mining, etc.)
        do_work()
        time.sleep(2)
```

## 9. Global Type Declarations

```typescript
// global.d.ts
interface Window {
  electronAPI: {
    midnightCity: {
      // ... other methods ...
      writeCommand: (command: { id: number; kind: string; [key: string]: any }) => Promise<any>;
      clearCommands: () => Promise<any>;
    };
  };
}
```

## Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| No spawn guard | PID proliferation, resource exhaustion | Check `pgrep` before `spawn` |
| `minerPid` in `useEffect` deps | Discovery log spam every 5s | Use closure `discovered` flag, exclude from deps |
| No file locking | Race conditions, corrupted JSONL | `fcntl.flock(f, LOCK_EX)` |
| Never truncate file | File grows unbounded, OOM | `f.seek(0); f.truncate()` after reading |
| `pkill` then spawn | Service churn, missed commands | Guard pattern instead of kill-then-spawn |
| Script doesn't return to loop | Commands work, then script dies | Wrap command execution, always resume main loop |
| Auto-mine loop vs commands | Commands queued but script busy | Pause auto-mine during command execution, or use higher-priority command check |
| Action kind mismatch | Script receives `kind: "engage"` but only understands `"perform_job"` | Translate cloud kinds → script kinds in the panel before writing to file |
| Stale lock file blocks restart | Previous miner died, new spawn exits immediately with singleton lock error | Remove `.sonofanton.lock` (or equivalent) before spawning: `if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile)` |
| Buttons disabled when daemon alive but not cloud-connected | User clicks action, button is grayed out even though daemon path is ready | `disabled={(!connected && !daemonAlive) || isMining}` — not `!connected` alone |
| Disk credential reuse after deletion | `getActiveCredentials()` reads stale encrypted key from JSON file | Provide explicit `apiKey` parameter to `restartDaemon` IPC; fall back to disk only if absent |

## References

- `references/midnight-city-v7-script.py` — Complete working Python script with file locking
- `references/panel-dual-path-snippet.tsx` — React panel submitAction with daemon/cloud dual path
- `references/main-ipc-handlers.ts` — Main process IPC handlers for writeCommand/clearCommands/checkDaemonStatus

## Verification

After implementing, verify with:

1. Click "Start Daemon" twice → second click should return "Already running"
2. Click action button → log shows `Writing command: trade`
3. Tail tab shows command execution within 2-4s
4. No duplicate "Found running daemon" logs in panel
5. `commands.jsonl` is empty after script processes commands
6. Script continues mining after executing sell/eat/move commands

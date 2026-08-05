// ============================================
// LOCAL AGENT DETECTOR (Main Process)
// Scans the system for installed AI agent CLIs
// (Hermes, Goose, Claude Code, Codex, OpenCode, etc.)
// ============================================

import { execSync } from "child_process";

export interface DetectedLocalAgent {
  id: string;
  name: string;
  type: "cli" | "desktop" | "skill";
  version: string;
  path: string;
  status: "running" | "installed" | "not_found";
  description: string;
  color: string; // HSL hue for avatar color
  iconLetter: string;
}

function isRunning(pattern: string): boolean {
  try {
    const out = execSync(`pgrep -f "${pattern}" 2>/dev/null || true`, {
      encoding: "utf8",
      timeout: 1000,
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export function detectLocalAgentsSync(): DetectedLocalAgent[] {
  const agents: DetectedLocalAgent[] = [];

  // --- Hermes (Nous Research) ---
  try {
    const ver = execSync("hermes --version 2>&1", { encoding: "utf8", timeout: 3000 });
    const running = isRunning("hermes");
    agents.push({
      id: "local-hermes",
      name: "Hermes",
      type: "desktop",
      version: ver.split("\n")[0].replace("Hermes Agent v", "").split(" ")[0] || "unknown",
      path: "~/.local/bin/hermes",
      status: running ? "running" : "installed",
      description: "Nous Research agent — multi-model gateway + desktop GUI",
      color: "260",
      iconLetter: "H",
    });
  } catch { /* no-op */ }

  // --- Goose (Block/Square) ---
  try {
    const ver = execSync("goose --version 2>&1", { encoding: "utf8", timeout: 3000 });
    const running = isRunning("goose");
    agents.push({
      id: "local-goose",
      name: "Goose",
      type: "cli",
      version: ver.trim().split("\n")[0] || "unknown",
      path: "~/.local/bin/goose",
      status: running ? "running" : "installed",
      description: "Block Coder agent — developer harness for AI workflows",
      color: "30",
      iconLetter: "G",
    });
  } catch { /* no-op */ }

  // --- Claude Code (Anthropic) ---
  try {
    const ver = execSync("claude --version 2>&1", { encoding: "utf8", timeout: 3000 });
    agents.push({
      id: "local-claude",
      name: "Claude Code",
      type: "cli",
      version: ver.trim().split("(")[0].trim() || "unknown",
      path: "/usr/local/bin/claude",
      status: "installed",
      description: "Anthropic agent — terminal-native Claude coding assistant",
      color: "200",
      iconLetter: "C",
    });
  } catch { /* no-op */ }

  // --- Buzz CLI ---
  try {
    const hasBuzz = execSync(
      'test -d ~/.buzz/.agents/skills/buzz-cli && echo yes 2>&1 || true',
      { encoding: "utf8", timeout: 1000 }
    );
    if (hasBuzz.trim() === "yes") {
      agents.push({
        id: "local-buzz-cli",
        name: "Buzz CLI",
        type: "skill",
        version: "bundled",
        path: "~/.buzz/.agents/skills/buzz-cli",
        status: "installed",
        description: "Buzz agent-first CLI — Nostr-native agent harness",
        color: "45",
        iconLetter: "B",
      });
    }
  } catch { /* no-op */ }

  // --- Codex (OpenAI) ---
  try {
    const ver = execSync("codex --version 2>&1 || true", { encoding: "utf8", timeout: 2000 });
    if (ver.trim() && !ver.includes("not found")) {
      agents.push({
        id: "local-codex",
        name: "Codex",
        type: "cli",
        version: ver.trim(),
        path: "npm global",
        status: "installed",
        description: "OpenAI Codex CLI — agentic coding assistant",
        color: "160",
        iconLetter: "X",
      });
    }
  } catch { /* no-op */ }

  // --- OpenCode ---
  try {
    const ver = execSync("opencode --version 2>&1 || true", { encoding: "utf8", timeout: 2000 });
    if (ver.trim() && !ver.includes("not found")) {
      agents.push({
        id: "local-opencode",
        name: "OpenCode",
        type: "cli",
        version: ver.trim(),
        path: "npm global",
        status: "installed",
        description: "OpenCode AI — open-source agentic IDE",
        color: "280",
        iconLetter: "O",
      });
    }
  } catch { /* no-op */ }

  return agents;
}

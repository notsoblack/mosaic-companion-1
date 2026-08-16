// =============================================================================
// SKILL DISCOVERY SERVICE — Bridges Hermes + Mosaic + Agent skills into Stargate
// Sources:
//   1. Agent config (ai-agents.json) — skills attached to active agents
//   2. ~/.hermes/skills/ — Hermes SKILL.md files on disk
//   3. Vault box-skills-main — Mosaic vault skill entries
// Persists unified metadata to Vault box for caching/survival
// =============================================================================

import { type SkillInfo, type SkillProvenance } from "../../stores/stargateStore";

interface HermesSkillMeta {
  name: string;
  description: string;
  version: string;
  platforms?: string[];
  tags?: string[];
}

/** Parse YAML frontmatter from SKILL.md content */
function parseSkillMd(content: string): Partial<HermesSkillMeta> {
  const lines = content.split("\n");
  const meta: Partial<HermesSkillMeta> = {};
  let inFrontmatter = false;
  for (const line of lines) {
    if (line.trim() === "---") {
      inFrontmatter = !inFrontmatter;
      if (!inFrontmatter) break;
      continue;
    }
    if (!inFrontmatter) continue;
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) continue;
    const val = rest.join(":").trim();
    switch (key.trim()) {
      case "name":
        meta.name = val;
        break;
      case "description":
        meta.description = val.replace(/^"|"$/g, "");
        break;
      case "version":
        meta.version = val;
        break;
      case "platforms":
        try {
          meta.platforms = JSON.parse(val);
        } catch {
          meta.platforms = val.split(",").map((s) => s.trim());
        }
        break;
    }
  }
  return meta;
}

/** Scan ~/.hermes/skills/ for SKILL.md files via IPC */
async function scanHermesSkills(): Promise<SkillInfo[]> {
  const results: SkillInfo[] = [];
  try {
    const ide = (window as any).electronAPI?.ide?.fs;
    if (!ide) return results;

    const skillsDir = await ide.readDir("/home/mauricio/.hermes/skills");
    if (!Array.isArray(skillsDir)) return results;

    for (const category of skillsDir) {
      if (category.type !== "directory" || category.name.startsWith(".")) continue;
      const catPath = `/home/mauricio/.hermes/skills/${category.name}`;
      const catItems = await ide.readDir(catPath);
      if (!Array.isArray(catItems)) continue;

      for (const item of catItems) {
        if (item.type !== "directory") continue;
        const skillMdPath = `${catPath}/${item.name}/SKILL.md`;
        try {
          const md = await ide.readFile(skillMdPath);
          if (!md || typeof md !== "string") continue;
          const meta = parseSkillMd(md);
          if (!meta.name) continue;

          results.push({
            id: `hermes-${category.name}-${item.name}`,
            name: meta.name,
            description: meta.description || "Hermes skill",
            category: category.name,
            enabled: true,
            provenance: "local" as SkillProvenance,
            usage: 0,
            version: meta.version || "1.0.0",
            platforms: meta.platforms || ["linux"],
            tags: meta.tags || [category.name],
          });
        } catch {
          // SKILL.md may not exist in this subdir
        }
      }
    }
  } catch (e) {
    console.warn("[SkillDiscovery] Hermes scan failed:", e);
  }
  return results;
}

/** Read skills attached to active agents from ai-agents.json */
async function scanAgentSkills(): Promise<SkillInfo[]> {
  const results: SkillInfo[] = [];
  try {
    const agents = await ((window as any).electronAPI?.aiAgents?.get() ?? Promise.resolve([]));
    if (!Array.isArray(agents)) return results;

    for (const agent of agents) {
      const skills = agent.skills || [];
      if (!Array.isArray(skills)) continue;
      for (const skill of skills) {
        const name = typeof skill === "string" ? skill : skill?.name || String(skill);
        const id = typeof skill === "string" ? skill : skill?.id || name;
        if (!id || results.find((r) => r.id === id)) continue; // dedupe

        results.push({
          id,
          name: name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          description: `Agent skill for ${agent.name || "agent"}`,
          category: "agent-attached",
          enabled: true,
          provenance: "learned" as SkillProvenance,
          usage: 0,
          platforms: ["linux"],
          tags: [agent.name || "agent"],
        });
      }
    }
  } catch (e) {
    console.warn("[SkillDiscovery] Agent scan failed:", e);
  }
  return results;
}

/** Scan Vault for skill entries (box-skills-main or similar) */
async function scanVaultSkills(): Promise<SkillInfo[]> {
  const results: SkillInfo[] = [];
  try {
    const vault = (window as any).electronAPI?.vault;
    if (!vault) return results;
    const boxes = await vault.getBoxes();
    if (!Array.isArray(boxes)) return results;

    for (const box of boxes) {
      if (!box.name?.toLowerCase().includes("skill")) continue;
      const entries = box.entries || [];
      for (const entry of entries) {
        const id = entry.id || `vault-${box.id}-${Math.random().toString(36).slice(2, 8)}`;
        if (results.find((r) => r.id === id)) continue;
        results.push({
          id,
          name: entry.label || entry.title || "Vault Skill",
          description: String(entry.content || "").slice(0, 200),
          category: box.name || "vault",
          enabled: true,
          provenance: "hub" as SkillProvenance,
          usage: 0,
          tags: [box.name],
        });
      }
    }
  } catch (e) {
    console.warn("[SkillDiscovery] Vault scan failed:", e);
  }
  return results;
}

// =============================================================================
// PUBLIC API
// =============================================================================

export interface UnifiedSkillResult {
  skills: SkillInfo[];
  sources: { hermes: number; agents: number; vault: number };
}

/** Discover ALL skills from all sources, deduplicated by ID */
export async function discoverAllSkills(): Promise<UnifiedSkillResult> {
  const [hermesSkills, agentSkills, vaultSkills] = await Promise.all([
    scanHermesSkills(),
    scanAgentSkills(),
    scanVaultSkills(),
  ]);

  const map = new Map<string, SkillInfo>();
  for (const s of hermesSkills) map.set(s.id, s);
  for (const s of agentSkills) if (!map.has(s.id)) map.set(s.id, s);
  for (const s of vaultSkills) if (!map.has(s.id)) map.set(s.id, s);

  return {
    skills: Array.from(map.values()),
    sources: {
      hermes: hermesSkills.length,
      agents: agentSkills.length,
      vault: vaultSkills.length,
    },
  };
}

/** Persist discovered skills to Vault box for caching */
export async function persistSkillsToVault(skills: SkillInfo[]): Promise<void> {
  try {
    const vault = (window as any).electronAPI?.vault;
    if (!vault) return;
    const boxes = await vault.getBoxes();
    let box = boxes.find((b: any) => b.name === "Stargate Skills Cache");
    if (!box) {
      box = await vault.addBox({ name: "Stargate Skills Cache", color: "#22d3ee" });
    }
    // Overwrite with latest
    await vault.addEntry(box.id, {
      title: `Skills snapshot ${new Date().toISOString().slice(0, 10)}`,
      content: JSON.stringify(skills, null, 2),
      tags: ["skills", "cache", "stargate"],
    });
  } catch (e) {
    console.warn("[SkillDiscovery] Vault persist failed:", e);
  }
}

// =============================================================================
// STARGATE SKILLS VIEW — Hermes-style master-detail skills management
// Reads from ~/.hermes/skills/ (shared with Hermes CLI)
// Features: toggle, usage badges, detail pane, search, sort, trust badges
// =============================================================================

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useStargateStore, type SkillInfo, type SkillProvenance } from "../../stores/stargateStore";
import {
  MasterDetail,
  ListColumn,
  DetailColumn,
  CapRow,
  ListStrip,
  PanelEmpty,
  compactNumber,
  trustTone,
} from "./MasterDetail";
import { Search, ArrowUpDown, GitBranch, Tag, Shield, Globe, Code, BookOpen } from "lucide-react";

// ── Provenance Badge Component ──

const ProvenanceBadge: React.FC<{ provenance: SkillProvenance }> = ({
  provenance,
}) => {
  const labels: Record<SkillProvenance, string> = {
    builtin: "builtin",
    hub: "hub",
    local: "local",
    learned: "learned",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${trustTone(
        provenance
      )}`}
    >
      {labels[provenance]}
    </span>
  );
};

// ── Skill Detail Pane ──

const SkillDetail: React.FC<{ skill: SkillInfo }> = ({ skill }) => {
  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">{skill.name}</h3>
          <ProvenanceBadge provenance={skill.provenance} />
          {skill.version && (
            <span className="text-xs text-gray-500">v{skill.version}</span>
          )}
        </div>
        <p className="text-sm text-gray-400 leading-relaxed">{skill.description}</p>
      </div>

      {/* Metadata Table */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Metadata
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          {skill.author && (
            <>
              <span className="text-gray-500">Author</span>
              <span className="text-gray-300">{skill.author}</span>
            </>
          )}
          {skill.license && (
            <>
              <span className="text-gray-500">License</span>
              <span className="text-gray-300">{skill.license}</span>
            </>
          )}
          <span className="text-gray-500">Category</span>
          <span className="text-gray-300">{skill.category}</span>
          <span className="text-gray-500">Usage</span>
          <span className="text-gray-300">{compactNumber(skill.usage)} calls</span>
          <span className="text-gray-500">Status</span>
          <span className={skill.enabled ? "text-emerald-400" : "text-gray-500"}>
            {skill.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
      </div>

      {/* Tags */}
      {skill.tags && skill.tags.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {skill.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs"
              >
                <Tag size={10} />
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Platforms */}
      {skill.platforms && skill.platforms.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Platforms
          </div>
          <div className="flex flex-wrap gap-1.5">
            {skill.platforms.map((platform) => (
              <span
                key={platform}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs"
              >
                <Globe size={10} />
                {platform}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Related Skills */}
      {skill.relatedSkills && skill.relatedSkills.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Related Skills
          </div>
          <div className="flex flex-wrap gap-1.5">
            {skill.relatedSkills.map((related) => (
              <span
                key={related}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 text-cyan-400 text-xs hover:bg-gray-700 cursor-pointer transition-colors"
              >
                <GitBranch size={10} />
                {related}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* GitHub Link */}
      {skill.githubUrl && (
        <a
          href={skill.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          <Code size={14} />
          View Source
        </a>
      )}
    </div>
  );
};

// ── Bulk Toggle Switch ──

const BulkToggle: React.FC<{
  allEnabled: boolean;
  onToggle: () => void;
}> = ({ allEnabled, onToggle }) => (
  <button
    onClick={onToggle}
    className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
  >
    <div
      className={`relative w-8 h-4 rounded-full transition-colors ${
        allEnabled ? "bg-cyan-500" : "bg-gray-600"
      }`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
          allEnabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </div>
    All
  </button>
);

// ── Main Skills View ──

export const StargateSkillsView: React.FC = () => {
  const {
    skills,
    setSkills,
    selectedSkillId,
    setSelectedSkillId,
    toggleSkill,
    trackSkillUsage,
    skillSearchQuery,
    setSkillSearchQuery,
    skillsSortDesc,
    setSkillsSortDesc,
    addLog,
  } = useStargateStore();

  const [loading, setLoading] = useState(true);

  // Load skills from disk on mount
  useEffect(() => {
    loadSkillsFromDisk();
  }, []);

  const loadSkillsFromDisk = useCallback(async () => {
    setLoading(true);
    try {
      // Try to load via IPC first
      const electronAPI = (window as any).electronAPI;
      let skillList: SkillInfo[] = [];

      if (electronAPI?.skills?.list) {
        const result = await electronAPI.skills.list();
        skillList = result || [];
      } else {
        // Fallback: scan ~/.hermes/skills/ via vault-like approach
        // In production this should be an IPC call
        skillList = await scanLocalSkills();
      }

      // Load usage counts from localStorage
      const skillsWithUsage = skillList.map((skill) => ({
        ...skill,
        usage: getSkillUsage(skill.id),
      }));

      setSkills(skillsWithUsage);
      addLog("skills", "info", `Loaded ${skillsWithUsage.length} skills from disk`);
    } catch (err: any) {
      addLog("skills", "error", `Failed to load skills: ${err.message || err}`);
      // Load demo skills as fallback
      setSkills(getDemoSkills());
    } finally {
      setLoading(false);
    }
  }, [setSkills, addLog]);

  // Filtered + sorted skills
  const visibleSkills = useMemo(() => {
    let filtered = skills;

    // Search filter
    const q = skillSearchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (skill) =>
          skill.name.toLowerCase().includes(q) ||
          skill.description.toLowerCase().includes(q) ||
          skill.category.toLowerCase().includes(q) ||
          skill.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Sort by usage (descending or ascending)
    const sign = skillsSortDesc ? 1 : -1;
    return [...filtered].sort(
      (a, b) => sign * (b.usage - a.usage) || a.name.localeCompare(b.name)
    );
  }, [skills, skillSearchQuery, skillsSortDesc]);

  // Active selection (auto-select first if none)
  const activeSkill = useMemo(() => {
    return (
      skills.find((s) => s.id === selectedSkillId) ?? visibleSkills[0] ?? null
    );
  }, [skills, selectedSkillId, visibleSkills]);

  // Bulk toggle
  const allEnabled =
    skills.length > 0 && skills.every((s) => s.enabled);
  const bulkSwitch = async () => {
    const target = !allEnabled;
    // Optimistic: update all at once
    setSkills(skills.map((s) => ({ ...s, enabled: target })));
    addLog("skills", "info", `${target ? "Enabled" : "Disabled"} all skills`);
  };

  const handleToggle = async (skill: SkillInfo) => {
    try {
      await toggleSkill(skill.id);
      trackSkillUsage(skill.id);
    } catch {
      /* error logged in store */
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <MasterDetail split="wide">
      <ListColumn
        header={
          <div className="p-3 space-y-2">
            {/* Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="text"
                value={skillSearchQuery}
                onChange={(e) => setSkillSearchQuery(e.target.value)}
                placeholder="Search skills..."
                className="w-full pl-8 pr-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            {/* List strip: sort + bulk toggle */}
            <ListStrip
              left={
                <button
                  onClick={() => setSkillsSortDesc(!skillsSortDesc)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <ArrowUpDown size={12} />
                  {skillsSortDesc ? "Most used" : "Least used"}
                </button>
              }
              right={<BulkToggle allEnabled={allEnabled} onToggle={bulkSwitch} />}
            />
          </div>
        }
      >
        {visibleSkills.length === 0 ? (
          <PanelEmpty
            title="No skills found"
            description={
              skillSearchQuery
                ? `No results for "${skillSearchQuery}"`
                : "Install skills from the Hub to get started"
            }
          />
        ) : (
          visibleSkills.map((skill) => (
            <CapRow
              key={skill.id}
              active={activeSkill?.id === skill.id}
              busy={skill.toggling}
              enabled={skill.enabled}
              title={skill.name}
              subtitle={
                <>
                  <span className="truncate">{skill.category}</span>
                  <ProvenanceBadge provenance={skill.provenance} />
                </>
              }
              meta={
                skill.usage > 0 ? `×${compactNumber(skill.usage)}` : undefined
              }
              onSelect={() => setSelectedSkillId(skill.id)}
              onToggle={() => handleToggle(skill)}
              toggleLabel={skill.name}
            />
          ))
        )}
      </ListColumn>

      <DetailColumn footer="Changes apply to new agent sessions">
        {activeSkill ? (
          <SkillDetail skill={activeSkill} />
        ) : (
          <PanelEmpty description="Select a skill to view details" />
        )}
      </DetailColumn>
    </MasterDetail>
  );
};

// ── Helpers ──

function getSkillUsage(skillId: string): number {
  try {
    const key = `stargate_skill_usage_${skillId}`;
    return parseInt(localStorage.getItem(key) || "0", 10);
  } catch {
    return 0;
  }
}

/** Scan ~/.hermes/skills/ directory for SKILL.md files */
async function scanLocalSkills(): Promise<SkillInfo[]> {
  // This would normally be an IPC call to main process
  // For now, return empty — the demo skills will show
  return [];
}

/** Demo skills for development/testing */
function getDemoSkills(): SkillInfo[] {
  return [
    {
      id: "stargate-pools",
      name: "Stargate Pool Integration",
      description:
        "End-to-end pattern for adding a new pool to the Stargate ecosystem. Covers discovery, validation, wiring, and deployment.",
      category: "software-development",
      enabled: true,
      provenance: "local",
      usage: 275,
      version: "1.2.0",
      author: "Mosaic Team",
      license: "MIT",
      platforms: ["linux", "macos"],
      tags: ["stargate", "pools", "integration"],
      relatedSkills: ["mcp-client", "typescript-core"],
    },
    {
      id: "midnight-mining-connect",
      name: "Midnight Mining Connect",
      description:
        "Automate Midnight City agent connection and mining operations. Includes auth, session management, and auto-work.",
      category: "midnight",
      enabled: true,
      provenance: "local",
      usage: 152,
      version: "2.0.0",
      author: "Mosaic Team",
      license: "MIT",
      platforms: ["linux", "macos", "windows"],
      tags: ["midnight", "mining", "automation"],
      relatedSkills: ["midnight-auth-fix", "wallet-bridge"],
    },
    {
      id: "mcp-client",
      name: "MCP Client Integration",
      description:
        "Connect and manage MCP servers for extended AI capabilities. Tool discovery, server lifecycle, and error handling.",
      category: "software-development",
      enabled: false,
      provenance: "hub",
      usage: 74,
      version: "1.0.0",
      author: "Hermes Agent",
      license: "MIT",
      platforms: ["linux", "macos"],
      tags: ["mcp", "tools", "integration"],
      relatedSkills: ["stargate-pools", "electron-bridge"],
    },
    {
      id: "vault-injection",
      name: "Vault Knowledge Injection",
      description:
        "Programmatically create Vault boxes and inject structured knowledge into agent system prompts.",
      category: "mosaic",
      enabled: true,
      provenance: "learned",
      usage: 48,
      version: "1.1.0",
      author: "Byron",
      license: "MIT",
      platforms: ["linux"],
      tags: ["vault", "knowledge", "agents"],
      relatedSkills: ["agent-chat-communication"],
    },
    {
      id: "hermes-agent-contrib",
      name: "Hermes Agent Contrib",
      description:
        "Use when PRing hermes-agent. Workflow + Windows pitfalls. Covers contribution guidelines and CI setup.",
      category: "software-development",
      enabled: true,
      provenance: "learned",
      usage: 21,
      version: "1.0.0",
      author: "Hermes Agent",
      license: "MIT",
      platforms: ["windows", "linux", "macos"],
      tags: ["hermes", "contribution", "pr-request", "ci"],
      relatedSkills: ["github-pr-workflow", "github-code-review"],
    },
    {
      id: "wallet-bridge",
      name: "Wallet Bridge",
      description:
        "Integrate browser-extension wallets (CIP-30, EIP-1193) into Electron applications with secure IPC.",
      category: "infrastructure",
      enabled: false,
      provenance: "builtin",
      usage: 17,
      version: "1.0.0",
      author: "Mosaic Team",
      license: "MIT",
      platforms: ["linux", "macos", "windows"],
      tags: ["wallet", "web3", "electron"],
      relatedSkills: ["midnight-mining-connect"],
    },
    {
      id: "loop-designer",
      name: "Loop Designer",
      description:
        "Design and validate agent workflow topologies. Export JSON, dry-run, and visualize execution paths.",
      category: "software-development",
      enabled: true,
      provenance: "local",
      usage: 10,
      version: "1.0.0",
      author: "Mosaic Team",
      license: "MIT",
      platforms: ["linux", "macos"],
      tags: ["loops", "workflows", "design"],
      relatedSkills: ["stargate-pools", "subagent-orchestration"],
    },
    {
      id: "subagent-orchestration",
      name: "Subagent Orchestration",
      description:
        "Execute plans via delegate_task subagents with 2-stage review. Multi-agent coordination patterns.",
      category: "software-development",
      enabled: true,
      provenance: "hub",
      usage: 5,
      version: "1.0.0",
      author: "Hermes Agent",
      license: "MIT",
      platforms: ["linux"],
      tags: ["agents", "orchestration", "multi-agent"],
      relatedSkills: ["loop-designer"],
    },
  ];
}

export default StargateSkillsView;

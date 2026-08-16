// =============================================================================
// SKILLS HUB — Browser for discovering and installing new skills
// Grid cards with trust badges, install/uninstall with action tracking
// Mirrors Hermes Desktop: skills/hub.tsx
// =============================================================================

import React, { useState, useMemo } from "react";
import { useStargateStore, type SkillInfo, type SkillProvenance } from "../../stores/stargateStore";
import { compactNumber, trustTone } from "./MasterDetail";
import { Search, Download, Check, Loader2, ExternalLink, Filter } from "lucide-react";

// ── Demo Hub Skills (would come from skills.sh / GitHub API) ──

interface HubSkill {
  identifier: string;
  name: string;
  description: string;
  category: string;
  trustLevel: "builtin" | "trusted" | "community";
  source: string;
  author: string;
  version: string;
  tags: string[];
  installs: number;
  installed: boolean;
}

const DEMO_HUB_SKILLS: HubSkill[] = [
  {
    identifier: "skills-sh/3d-modeling",
    name: "3D Modeling",
    description: "Create and manipulate 3D models using Blender API. Includes mesh generation, material assignment, and rendering pipeline.",
    category: "creative",
    trustLevel: "trusted",
    source: "skills.sh",
    author: "cmor-martin",
    version: "1.0.0",
    tags: ["3d", "blender", "modeling"],
    installs: 1247,
    installed: false,
  },
  {
    identifier: "skills-sh/3d-spatial",
    name: "3D Spatial",
    description: "Spatial computing and AR/VR development. Unity integration, scene graph manipulation, and physics simulation.",
    category: "creative",
    trustLevel: "trusted",
    source: "skills.sh",
    author: "dylandep",
    version: "2.1.0",
    tags: ["3d", "spatial", "vr", "ar"],
    installs: 892,
    installed: false,
  },
  {
    identifier: "github/nousresearch/hermes-agent",
    name: "Hermes Agent Contrib",
    description: "Use when PRing hermes-agent. Workflow + Windows pitfalls. Covers CI, testing, and contribution guidelines.",
    category: "software-development",
    trustLevel: "builtin",
    source: "github",
    author: "NousResearch",
    version: "1.0.0",
    tags: ["hermes", "contribution", "ci", "workflow"],
    installs: 4521,
    installed: true,
  },
  {
    identifier: "skills-sh/web-scraping",
    name: "Web Scraping Advanced",
    description: "Advanced web scraping with rate limiting, proxy rotation, and structured data extraction. Supports JavaScript-rendered sites.",
    category: "data-science",
    trustLevel: "community",
    source: "skills.sh",
    author: "scraping-guru",
    version: "3.0.1",
    tags: ["scraping", "data", "automation"],
    installs: 567,
    installed: false,
  },
  {
    identifier: "github/openai/gpt-researcher",
    name: "GPT Researcher",
    description: "Autonomous research agent that searches the web, synthesizes findings, and produces cited reports on any topic.",
    category: "research",
    trustLevel: "trusted",
    source: "github",
    author: "OpenAI",
    version: "2.5.0",
    tags: ["research", "agents", "web-search"],
    installs: 8934,
    installed: false,
  },
  {
    identifier: "skills-sh/database-optimization",
    name: "Database Optimization",
    description: "Query optimization, indexing strategies, and performance tuning for PostgreSQL and MySQL. Includes EXPLAIN analysis.",
    category: "infrastructure",
    trustLevel: "trusted",
    source: "skills.sh",
    author: "dba-pro",
    version: "1.2.0",
    tags: ["database", "performance", "sql"],
    installs: 2341,
    installed: false,
  },
  {
    identifier: "github/anthropic/claude-code",
    name: "Claude Code Patterns",
    description: "Best practices for coding with Claude. Prompt engineering, context management, and iterative refinement strategies.",
    category: "software-development",
    trustLevel: "trusted",
    source: "github",
    author: "Anthropic",
    version: "1.0.0",
    tags: ["claude", "coding", "prompts"],
    installs: 12567,
    installed: true,
  },
  {
    identifier: "skills-sh/kubernetes-debugging",
    name: "Kubernetes Debugging",
    description: "Troubleshoot K8s clusters, pods, and services. Log analysis, pod eviction handling, and resource debugging.",
    category: "devops",
    trustLevel: "community",
    source: "skills.sh",
    author: "k8s-ops",
    version: "0.9.0",
    tags: ["kubernetes", "debugging", "devops"],
    installs: 445,
    installed: false,
  },
  {
    identifier: "github/huggingface/transformers-guide",
    name: "Transformers Guide",
    description: "Complete guide to HuggingFace Transformers. Fine-tuning, deployment, quantization, and model selection.",
    category: "mlops",
    trustLevel: "trusted",
    source: "github",
    author: "HuggingFace",
    version: "4.2.0",
    tags: ["ml", "transformers", "fine-tuning"],
    installs: 7823,
    installed: false,
  },
];

// ── Trust Badge ──

const TrustBadge: React.FC<{ level: HubSkill["trustLevel"] }> = ({ level }) => {
  const labels = { builtin: "Built-in", trusted: "Trusted", community: "Community" };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${trustTone(
        level
      )}`}
    >
      {labels[level]}
    </span>
  );
};

// ── Hub Skill Card ──

const HubSkillCard: React.FC<{
  skill: HubSkill;
  installing: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onPreview: () => void;
}> = ({ skill, installing, onInstall, onUninstall, onPreview }) => {
  return (
    <div className="group flex flex-col gap-2 rounded-xl bg-gray-900/50 border border-gray-800 hover:border-cyan-500/30 hover:bg-gray-900 transition-all p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-gray-200 truncate">
              {skill.name}
            </span>
            <TrustBadge level={skill.trustLevel} />
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {skill.source} · {skill.author}
          </div>
        </div>
        {skill.installed && (
          <span className="shrink-0 text-emerald-400 text-xs"><Check size={14} /></span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
        {skill.description}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {skill.tags.map((tag) => (
          <span
            key={tag}
            className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 text-[10px]"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Footer: installs + actions */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-800/50">
        <span className="text-[10px] text-gray-500">
          {compactNumber(skill.installs)} installs
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onPreview}
            className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
          >
            Preview
          </button>
          {skill.installed ? (
            <button
              onClick={onUninstall}
              disabled={installing}
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {installing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                "Uninstall"
              )}
            </button>
          ) : (
            <button
              onClick={onInstall}
              disabled={installing}
              className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded hover:bg-cyan-500/10 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {installing ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <Download size={12} />
                  Install
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Skills Hub Main Component ──

export const SkillsHub: React.FC = () => {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [trustFilter, setTrustFilter] = useState<HubSkill["trustLevel"] | null>(null);
  const { hubActions, setHubAction, addLog } = useStargateStore();

  // Categories with counts
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    DEMO_HUB_SKILLS.forEach((s) => {
      map.set(s.category, (map.get(s.category) || 0) + 1);
    });
    return Array.from(map.entries()).sort(([, a], [, b]) => b - a);
  }, []);

  // Filtered skills
  const filtered = useMemo(() => {
    let result = DEMO_HUB_SKILLS;

    // Category filter
    if (categoryFilter) {
      result = result.filter((s) => s.category === categoryFilter);
    }

    // Trust filter
    if (trustFilter) {
      result = result.filter((s) => s.trustLevel === trustFilter);
    }

    // Search
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return result;
  }, [query, categoryFilter, trustFilter]);

  const handleInstall = (skill: HubSkill) => {
    setHubAction(skill.identifier, {
      running: true,
      startedAt: Date.now(),
    });
    addLog("skills", "info", `Installing ${skill.name}...`);

    // Simulate install (replace with real IPC call)
    setTimeout(() => {
      setHubAction(skill.identifier, undefined);
      addLog("skills", "success", `Installed ${skill.name}`);
      skill.installed = true;
    }, 2000);
  };

  const handleUninstall = (skill: HubSkill) => {
    setHubAction(skill.identifier, {
      running: true,
      startedAt: Date.now(),
    });
    addLog("skills", "info", `Uninstalling ${skill.name}...`);

    setTimeout(() => {
      setHubAction(skill.identifier, undefined);
      addLog("skills", "info", `Uninstalled ${skill.name}`);
      skill.installed = false;
    }, 1500);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Skills Hub</h2>
            <p className="text-sm text-gray-500">Discover and install skills from registries</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{filtered.length} results</span>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills... (press '/' to focus)"
              className="w-full pl-8 pr-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Trust filter */}
          <select
            value={trustFilter || ""}
            onChange={(e) => setTrustFilter((e.target.value as HubSkill["trustLevel"]) || null)}
            className="text-xs bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-gray-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All trust levels</option>
            <option value="builtin">Built-in</option>
            <option value="trusted">Trusted</option>
            <option value="community">Community</option>
          </select>
        </div>
      </div>

      {/* Content: Sidebar + Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Category sidebar */}
        <div className="w-48 flex-none border-r border-gray-800 overflow-y-auto py-3">
          <div className="px-3 mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Categories
          </div>
          <button
            onClick={() => setCategoryFilter(null)}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
              !categoryFilter
                ? "text-cyan-400 bg-cyan-500/10"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-900"
            }`}
          >
            All Skills ({DEMO_HUB_SKILLS.length})
          </button>
          {categories.map(([cat, count]) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors capitalize ${
                categoryFilter === cat
                  ? "text-cyan-400 bg-cyan-500/10"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-900"
              }`}
            >
              {cat} ({count})
            </button>
          ))}
        </div>

        {/* Skill grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Search size={32} className="text-gray-600 mb-3" />
              <div className="text-sm text-gray-400">No skills match your filters</div>
              <button
                onClick={() => {
                  setQuery("");
                  setCategoryFilter(null);
                  setTrustFilter(null);
                }}
                className="mt-2 text-xs text-cyan-400 hover:text-cyan-300"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((skill) => (
                <HubSkillCard
                  key={skill.identifier}
                  skill={skill}
                  installing={hubActions[skill.identifier]?.running ?? false}
                  onInstall={() => handleInstall(skill)}
                  onUninstall={() => handleUninstall(skill)}
                  onPreview={() =>
                    addLog("skills", "info", `Previewing ${skill.name}`)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillsHub;

// =============================================================================
// TEMPLATE SELECTOR — Karpathy-Inspired Loop Templates
//
// Lets users browse, filter, and instantiate pre-built loop templates.
// Templates encode expert workflows (like Karpathy's manual processes).
// =============================================================================

import React, { useMemo, useState } from "react";
import {
  BookOpen, Zap, Code, Layers, Cpu, Brain,
  ChevronRight, Star, Tag, Filter, Info,
} from "lucide-react";
import { LoopTemplate, TemplateService } from "../../services/stargate/LoopTemplateService";
import type { StargateLoop } from "../../types/StargateLoop";

interface TemplateSelectorProps {
  onSelectTemplate: (loop: StargateLoop) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  research: <Brain size={16} className="text-purple-400" />,
  development: <Code size={16} className="text-blue-400" />,
  content: <Layers size={16} className="text-pink-400" />,
  optimization: <Cpu size={16} className="text-amber-400" />,
  memory: <BookOpen size={16} className="text-cyan-400" />,
};

const complexityLabels: Record<number, string> = {
  1: "Simple",
  2: "Easy",
  3: "Medium",
  4: "Advanced",
  5: "Expert",
};

const complexityColors: Record<number, string> = {
  1: "text-green-400",
  2: "text-emerald-400",
  3: "text-yellow-400",
  4: "text-orange-400",
  5: "text-red-400",
};

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({ onSelectTemplate }) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [hoveredTemplate, setHoveredTemplate] = useState<LoopTemplate | null>(null);

  const templates = TemplateService.getAll();
  const categories = TemplateService.getCategories();
  const allTags = TemplateService.getAllTags();

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (selectedCategory && t.category !== selectedCategory) return false;
      if (selectedTag && !t.tags.includes(selectedTag)) return false;
      return true;
    });
  }, [templates, selectedCategory, selectedTag]);

  const handleInstantiate = (templateId: string) => {
    const loop = TemplateService.instantiate(templateId);
    if (loop) {
      onSelectTemplate(loop);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-cyan-400" />
          <span className="text-xs font-bold text-gray-300">Karpathy-Inspired Templates</span>
        </div>
        <span className="text-[10px] text-gray-600">{filteredTemplates.length} templates</span>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => { setSelectedCategory(null); setSelectedTag(null); }}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
            !selectedCategory && !selectedTag
              ? "bg-cyan-900/30 border border-cyan-700/50 text-cyan-300"
              : "bg-gray-800 text-gray-500 hover:text-gray-300"
          }`}
        >
          <Filter size={10} /> All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => { setSelectedCategory(cat); setSelectedTag(null); }}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
              selectedCategory === cat
                ? "bg-cyan-900/30 border border-cyan-700/50 text-cyan-300"
                : "bg-gray-800 text-gray-500 hover:text-gray-300"
            }`}
          >
            {categoryIcons[cat] || <Zap size={10} />}
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Tag Cloud */}
      <div className="flex items-center gap-1 flex-wrap">
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => { setSelectedTag(tag === selectedTag ? null : tag); setSelectedCategory(null); }}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] transition-colors ${
              selectedTag === tag
                ? "bg-cyan-900/30 border border-cyan-700/50 text-cyan-300"
                : "bg-gray-800/50 text-gray-600 hover:text-gray-400"
            }`}
          >
            <Tag size={8} /> {tag}
          </button>
        ))}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-auto">
        {filteredTemplates.map((template) => (
          <button
            key={template.id}
            onClick={() => handleInstantiate(template.id)}
            onMouseEnter={() => setHoveredTemplate(template)}
            onMouseLeave={() => setHoveredTemplate(null)}
            className="text-left p-3 bg-gray-900/50 border border-gray-800 rounded-lg hover:border-cyan-700/50 hover:bg-gray-900/80 transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {categoryIcons[template.category] || <Zap size={16} className="text-gray-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-200 group-hover:text-cyan-300 transition-colors">
                    {template.name}
                  </span>
                  <span className={`text-[9px] ${complexityColors[template.complexity]}`}>
                    {complexityLabels[template.complexity]}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">
                  {template.description}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex items-center gap-1">
                    <Star size={9} className="text-amber-400" />
                    <span className="text-[9px] text-gray-600">
                      {Math.round((template.estimatedSuccessRate || 0.8) * 100)}% success
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Info size={9} className="text-gray-600" />
                    <span className="text-[9px] text-gray-600">
                      {template.nodes.length} nodes
                    </span>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-[9px] text-gray-600">
                      {template.recommendedAgents.length} agent{template.recommendedAgents.length > 1 ? "s" : ""}
                    </span>
                    <ChevronRight size={10} className="text-gray-600 group-hover:text-cyan-400 transition-colors" />
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {template.tags.map((tag) => (
                    <span key={tag} className="px-1 py-0.5 bg-gray-800 rounded text-[8px] text-gray-500">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Suggested MCP servers */}
                {template.suggestedMcpServers.length > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[8px] text-gray-600">MCP:</span>
                    {template.suggestedMcpServers.map((srv) => (
                      <span key={srv} className="px-1 py-0.5 bg-gray-800/50 rounded text-[8px] text-cyan-600">
                        {srv}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Hover Detail Panel */}
      {hoveredTemplate && (
        <div className="mt-2 p-2 bg-gray-900/30 border border-gray-800 rounded text-[10px] text-gray-500">
          <div className="font-medium text-gray-400 mb-1">Convergence Rules</div>
          <div className="grid grid-cols-4 gap-1">
            {[
              { label: "Max Iter", value: hoveredTemplate.convergence.maxIterations },
              { label: "Dry Rounds", value: hoveredTemplate.convergence.dryRounds },
              { label: "Timeout", value: `${hoveredTemplate.convergence.timeoutSeconds}s` },
              { label: "Backoff", value: hoveredTemplate.convergence.backoff },
            ].map((item) => (
              <div key={item.label} className="bg-gray-800/50 rounded px-1.5 py-0.5">
                <div className="text-gray-600">{item.label}</div>
                <div className="text-gray-300 font-mono">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateSelector;

// =============================================================================
// SYSTEM PROMPT EDITOR — For agent-action nodes
//
// Lets users view and edit the system prompt for each agent-action node.
// System prompts define agent personality, constraints, and capabilities.
// Karpathy emphasizes: "The system prompt IS the agent's identity."
// =============================================================================

import React, { useState, useEffect } from "react";
import {
  MessageSquare, Save, RotateCcw, CheckCircle, AlertTriangle,
  Sparkles, BookOpen,
} from "lucide-react";

interface SystemPromptEditorProps {
  initialPrompt?: string;
  agentName?: string;
  agentProvider?: string;
  onChange: (prompt: string) => void;
}

/** Built-in system prompt templates — Karpathy-inspired */
const PROMPT_TEMPLATES = [
  {
    id: "research-analyst",
    label: "Research Analyst",
    prompt: "You are a meticulous research analyst. Given a topic, you search broadly, verify sources, and synthesize findings into clear, cited summaries. You always question assumptions and note uncertainties.",
  },
  {
    id: "code-reviewer",
    label: "Code Reviewer",
    prompt: "You are a senior software engineer. Review code for: 1) Bugs, 2) Security issues, 3) Performance problems, 4) Style violations. Output structured review with severity levels. Be specific. No vague advice.",
  },
  {
    id: "creative-writer",
    label: "Creative Writer",
    prompt: "You are a creative writer with a vivid imagination. Produce engaging, original content. Vary sentence structure. Use metaphors sparingly but effectively. Match the tone requested.",
  },
  {
    id: "synthesizer",
    label: "Knowledge Synthesizer",
    prompt: "Synthesize the following findings into a coherent summary. Include key insights, contradictions, and open questions. Be concise but thorough. Preserve nuance — don't oversimplify.",
  },
  {
    id: "classifier",
    label: "Task Classifier",
    prompt: "Classify the following task on a scale of 1-5 by complexity. 1-2: simple, well-defined. 3: moderate, some ambiguity. 4-5: complex, requires research or multi-step reasoning. Return just the number with brief justification.",
  },
  {
    id: "summarizer",
    label: "Context Summarizer",
    prompt: "Summarize the key points of this conversation. Preserve facts, decisions, and open questions. Discard pleasantries. Focus on actionable information.",
  },
  {
    id: "minimal",
    label: "Minimal (Karpathy-style)",
    prompt: "Be helpful, accurate, and concise. Don't apologize. Don't explain what you're doing. Just do it.",
  },
];

export const SystemPromptEditor: React.FC<SystemPromptEditorProps> = ({
  initialPrompt,
  agentName,
  agentProvider,
  onChange,
}) => {
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrompt(initialPrompt || "");
  }, [initialPrompt]);

  const handleSave = () => {
    onChange(prompt);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = PROMPT_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      setPrompt(template.prompt);
      setSelectedTemplate(templateId);
      onChange(template.prompt);
    }
  };

  const promptLength = prompt.length;
  const estimatedTokens = Math.ceil(promptLength / 4); // rough estimate

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
          <MessageSquare size={14} className="text-purple-400" />
          System Prompt
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600">
            {promptLength} chars · ~{estimatedTokens} tokens
          </span>
          {saved && (
            <span className="flex items-center gap-1 text-[10px] text-green-400">
              <CheckCircle size={10} /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Agent info */}
      {(agentName || agentProvider) && (
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <Sparkles size={10} className="text-amber-400" />
          {agentName && <span className="text-gray-400">{agentName}</span>}
          {agentProvider && <span>· {agentProvider}</span>}
          <span className="text-gray-600 ml-1">— This prompt defines the agent's identity</span>
        </div>
      )}

      {/* Template shortcuts */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-gray-600">Templates:</span>
        {PROMPT_TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => handleTemplateSelect(template.id)}
            className={`px-2 py-0.5 rounded text-[9px] transition-colors ${
              selectedTemplate === template.id
                ? "bg-purple-900/30 border border-purple-700/50 text-purple-300"
                : "bg-gray-800 text-gray-500 hover:text-gray-300"
            }`}
          >
            {template.label}
          </button>
        ))}
      </div>

      {/* Prompt textarea */}
      <textarea
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value);
          setSelectedTemplate(null);
        }}
        placeholder="Enter system prompt... This defines how the agent behaves. Be specific about role, constraints, and output format."
        className="w-full h-[120px] bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 focus:border-purple-500 focus:outline-none resize-none font-mono leading-relaxed"
      />

      {/* Tips */}
      <div className="bg-gray-900/30 border border-gray-800 rounded p-2 space-y-1">
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <BookOpen size={10} className="text-gray-600" />
          <span className="font-medium">Karpathy's Prompt Tips:</span>
        </div>
        <ul className="text-[9px] text-gray-600 space-y-0.5 ml-3">
          <li>Be specific about the agent's role ("You are a...")</li>
          <li>Define output format explicitly (JSON, markdown, bullet points)</li>
          <li>Include constraints ("Do not", "Always", "Never")</li>
          <li>Add examples for complex tasks</li>
          <li>Keep under 500 tokens for fast responses</li>
        </ul>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-900/30 border border-purple-700/50 rounded text-xs text-purple-300 hover:bg-purple-900/50"
      >
        <Save size={12} />
        Apply System Prompt
      </button>
    </div>
  );
};

export default SystemPromptEditor;

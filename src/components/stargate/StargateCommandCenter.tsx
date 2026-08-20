// =============================================================================
// STARGATE COMMAND CENTER — Main shell component
// Orchestrates: Header + Sidebar + MainStage + ActivityFeed
// Each child wrapped in mini error boundary for crash isolation
// =============================================================================

import React, { useEffect, useState, Component, ErrorInfo, ReactNode } from "react";
import { StargateHeader } from "./StargateHeader";
import StargateSidebar from "./StargateSidebar";
import { MainStage } from "./MainStage";
import ActivityFeed from "./ActivityFeed";
import { GenericAimPanel } from "../GenericAimPanel";
import { useStargateStore } from "../../stores/stargateStore";
import { startStargatePollers, stopStargatePollers } from "../../services/stargate/DataPoller";

// ── Mini Error Boundary for crash isolation ──────────────────────────────────

interface MiniProps {
  children: ReactNode;
  name: string;
  onError: (name: string, error: Error, info: ErrorInfo) => void;
}

interface MiniState {
  hasError: boolean;
}

class MiniBoundary extends Component<MiniProps, MiniState> {
  constructor(props: MiniProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): MiniState {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError(this.props.name, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center p-4 bg-red-900/20 border border-red-500/30 rounded text-red-400 text-xs">
          💥 {this.props.name} crashed
        </div>
      );
    }
    return this.props.children;
  }
}

export const StargateCommandCenter: React.FC = () => {
  const [crashed, setCrashed] = useState<string | null>(null);
  const showAimify = useStargateStore((state) => state.showAimify);
  const setShowAimify = useStargateStore((state) => state.setShowAimify);

  useEffect(() => {
    startStargatePollers();
    return () => {
      stopStargatePollers();
    };
  }, []);

  const handleError = (name: string, error: Error, info: ErrorInfo) => {
    console.error(`[StargateCommandCenter] 💥 ${name} crashed:`, error);
    console.error(`[StargateCommandCenter] Component stack:`, info.componentStack);
    setCrashed(name);
  };

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {crashed && (
        <div className="bg-red-900/30 border-b border-red-500/30 px-4 py-2 text-red-400 text-xs font-mono flex items-center justify-between">
          <span>💥 Crash detected in: <strong>{crashed}</strong> — check console for component stack</span>
          <button
            onClick={() => setCrashed(null)}
            className="text-red-300 hover:text-white underline text-[10px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Aimify Modal */}
      {showAimify && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-lg w-[800px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
                <span className="text-purple-400">✨</span> Aimify Your Model
              </h2>
              <button
                onClick={() => setShowAimify(false)}
                className="text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <GenericAimPanel
                onClose={() => setShowAimify(false)}
                onAimified={(modelName, imageTag) => {
                  setShowAimify(false);
                  // TODO: dispatch to activity feed
                  console.log(`Aimified: ${modelName} → ${imageTag}`);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Top: Status header */}
      <MiniBoundary name="StargateHeader" onError={handleError}>
        <StargateHeader />
      </MiniBoundary>

      {/* Middle: Sidebar + Main content */}
      <div className="flex-1 flex overflow-hidden">
        <MiniBoundary name="StargateSidebar" onError={handleError}>
          <StargateSidebar />
        </MiniBoundary>

        <MiniBoundary name="MainStage" onError={handleError}>
          <MainStage />
        </MiniBoundary>
      </div>

      {/* Bottom: Activity feed */}
      <MiniBoundary name="ActivityFeed" onError={handleError}>
        <ActivityFeed />
      </MiniBoundary>
    </div>
  );
};

export default StargateCommandCenter;

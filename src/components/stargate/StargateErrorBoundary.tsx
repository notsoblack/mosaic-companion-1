// =============================================================================
// ERROR BOUNDARY — Capture React crashes with component stack
// Wraps StargateCommandCenter to identify which component crashes
// =============================================================================

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class StargateErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[StargateErrorBoundary] Component crashed:", error);
    console.error("[StargateErrorBoundary] Component stack:", info.componentStack);
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 bg-gray-900 text-gray-200">
          <div className="text-red-400 text-lg font-semibold mb-2">⚠️ Stargate Component Crashed</div>
          <pre className="text-xs text-gray-400 bg-gray-950 p-4 rounded border border-gray-800 max-w-lg overflow-auto">
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default StargateErrorBoundary;

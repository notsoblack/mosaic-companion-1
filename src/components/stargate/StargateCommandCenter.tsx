// =============================================================================
// STARGATE COMMAND CENTER — Main shell component
// Orchestrates: Header + Sidebar + MainStage + ActivityFeed
// Replaces AdaPortalPanel's tab bar + content area
// =============================================================================

import React, { useEffect } from "react";
import { StargateHeader } from "./StargateHeader";
import StargateSidebar from "./StargateSidebar";
import { MainStage } from "./MainStage";
import ActivityFeed from "./ActivityFeed";
import { startStargatePollers, stopStargatePollers } from "../../services/stargate/DataPoller";

export const StargateCommandCenter: React.FC = () => {
  // Start/stop data pollers when component mounts/unmounts
  useEffect(() => {
    startStargatePollers();
    return () => {
      stopStargatePollers();
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Top: Status header */}
      <StargateHeader />

      {/* Middle: Sidebar + Main content */}
      <div className="flex-1 flex overflow-hidden">
        <StargateSidebar />
        <MainStage />
      </div>

      {/* Bottom: Activity feed */}
      <ActivityFeed />
    </div>
  );
};

export default StargateCommandCenter;

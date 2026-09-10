// =============================================================================
// ADDON TEST WRAPPER — Graph
// Temporary mount point to test graph-addon inside Mosaic Companion.
// Loads the addon panel inline so window.addonAPI is available.
// =============================================================================

import React from 'react';
import GraphPanel from './graph/GraphPanel';

const GraphAddonTest: React.FC = () => {
  return (
    <div className="h-full w-full">
      <GraphPanel />
    </div>
  );
};

export default GraphAddonTest;

export function createViewport(liveNodeId = "user-task", moduleId = "input") {
  return {
    viewing: { level: "node", moduleId, nodeId: liveNodeId },
    liveNodeId,
    followRun: true,
    locked: false,
    isViewingLive: true,
  };
}

export function reduceViewport(state, action) {
  if (action.type === "SHOW_INTRO_OVERVIEW") {
    return {
      ...state,
      viewing: { level: "overview", moduleId: null, nodeId: null },
      isViewingLive: false,
    };
  }

  if (action.type === "SHOW_OVERVIEW") {
    return {
      ...state,
      viewing: { level: "overview", moduleId: null, nodeId: null },
      followRun: false,
      isViewingLive: false,
    };
  }

  if (action.type === "FOCUS_MODULE") {
    return {
      ...state,
      viewing: { level: "module", moduleId: action.moduleId, nodeId: null },
      followRun: false,
      isViewingLive: false,
    };
  }

  if (action.type === "FOCUS_NODE") {
    return {
      ...state,
      viewing: { level: "node", moduleId: action.moduleId, nodeId: action.nodeId },
      followRun: false,
      isViewingLive: action.nodeId === state.liveNodeId,
    };
  }

  if (action.type === "TOGGLE_FOLLOW") {
    return { ...state, followRun: !state.followRun, locked: state.followRun };
  }

  if (action.type === "LOCK_VIEW") {
    return { ...state, followRun: false, locked: true };
  }

  if (action.type === "SET_LIVE_NODE") {
    const next = { ...state, liveNodeId: action.nodeId };
    if (state.followRun && !state.locked) {
      return {
        ...next,
        viewing: { level: "node", moduleId: action.moduleId, nodeId: action.nodeId },
        isViewingLive: true,
      };
    }
    return { ...next, isViewingLive: state.viewing.nodeId === action.nodeId };
  }

  if (action.type === "RETURN_TO_LIVE") {
    return {
      ...state,
      viewing: { level: "node", moduleId: action.moduleId, nodeId: state.liveNodeId },
      followRun: true,
      locked: false,
      isViewingLive: true,
    };
  }

  throw new Error(`Unknown viewport action: ${action.type}`);
}

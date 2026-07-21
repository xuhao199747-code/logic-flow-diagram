const DIRECT_NONLINEAR_RELATIONS = new Set(["callback", "replan", "retry"]);

const TOPOLOGY_EDGE_META = new Map(Object.entries({
  "user-task->orchestrator": { edgeId: "e1", projectionId: "e1" },
  "orchestrator->llm": { edgeId: "e2", projectionId: "e2", feedsFanout: true },
  "llm->final-response": { edgeId: "e17", projectionId: "e17" },
  "llm->planning": { edgeId: "e3", projectionId: "e3", parallelKind: "cognition", parallelItem: "planning" },
  "planning->llm": { edgeId: "e4", projectionId: "e4", parallelKind: "cognition", parallelItem: "planning", feedback: true },
  "llm->memory": { edgeId: "e5-request", projectionId: "e5-request", parallelKind: "cognition", parallelItem: "memory" },
  "memory->llm": { edgeId: "e5", projectionId: "e5", parallelKind: "cognition", parallelItem: "memory", feedback: true },
  "llm->rag-query": { projectionId: "e6", presentationRelation: "parallel", lane: "rag", label: "并行检索 · Parallel Retrieval" },
  "rag-query->rag-routing": { edgeId: "e6", projectionId: "e6" },
  "rag-routing->embedding-vectorization": { edgeId: "e7", projectionId: "e7", branch: "vector" },
  "embedding-vectorization->vector-store-retrieval": { projectionId: "e7", branch: "vector" },
  "vector-store-retrieval->vector-top-k": { projectionId: "e7", branch: "vector" },
  "vector-top-k->result-merge-deduplicate": { edgeId: "e9", projectionId: "e9", branch: "vector" },
  "rag-routing->keyword-search": { projectionId: "e7", branch: "vector" },
  "keyword-search->database-retrieval": { projectionId: "e7", branch: "vector" },
  "database-retrieval->database-top-k": { projectionId: "e7", branch: "vector" },
  "database-top-k->result-merge-deduplicate": { projectionId: "e9", branch: "vector" },
  "rag-routing->rag-web-search": { edgeId: "e8", projectionId: "e8", branch: "web" },
  "rag-web-search->web-top-k": { projectionId: "e8", branch: "web" },
  "web-top-k->result-merge-deduplicate": { edgeId: "e10", projectionId: "e10", branch: "web" },
  "result-merge-deduplicate->rerank": { edgeId: "e11", projectionId: "e11" },
  "rerank->top-n": { projectionId: "e11" },
  "top-n->rag-context-assembly": { projectionId: "e11" },
  "rag-context-assembly->llm": { edgeId: "e12", projectionId: "e12", presentationRelation: "callback", label: "上下文回传 · Context Callback", feedback: true },
  "llm->tools-group": { edgeId: "e13", projectionId: "e13", presentationRelation: "parallel", lane: "tools", label: "并行工具准备 · Parallel Tool Prep" },
  "code-execution-sandbox->action": { edgeId: "e14-sandbox", projectionId: "e14-sandbox", parallelKind: "tools", parallelItem: "sandbox" },
  "external-environment-business-system->action": { edgeId: "e14-external", projectionId: "e14-external", parallelKind: "tools", parallelItem: "external" },
  "action->observation": { edgeId: "e15", projectionId: "e15" },
  "observation->llm": { edgeId: "e19", projectionId: "e19", presentationRelation: "callback", label: "观察回传 · Observation Callback", feedback: true },
  "observation->planning": { edgeId: "e16", projectionId: "e16", feedback: true },
  "memory->action": { feedback: true },
}));

const DETAIL_EXECUTABLES = new Map(Object.entries({
  "rag-routing": "rag-route",
  "vector-store-retrieval": "vector-search",
  "rag-web-search": "web-search",
  "result-merge-deduplicate": "rag-merge",
  "rag-context-assembly": "rag-context",
  "external-environment-business-system": "tool-select",
  "code-execution-sandbox": "action",
}));

const GROUP_EXECUTABLES = new Map(Object.entries({
  "planning-group": ["planning"],
  "memory-group": ["memory"],
  "rag-group": ["rag-route", "vector-search", "web-search", "rag-merge", "rag-context"],
  "vector-data-branch": ["vector-search"],
  "web-branch": ["web-search"],
  "tools-group": ["tool-select", "action", "observation"],
}));

export const topologyEdgeKey = (edge) => `${edge.from}->${edge.to}`;

export function topologyEdgeMeta(edge) {
  return TOPOLOGY_EDGE_META.get(topologyEdgeKey(edge)) ?? {};
}

export function isCurrentLiveEdge(currentEvent, edge, selectedBranches = [], completedBranches = []) {
  if (!currentEvent?.edgeIds?.includes(edge.id) || currentEvent.relation === "decision") return false;
  if (edge.branch && !selectedBranches.includes(edge.branch)) return false;
  return currentEvent.relation !== "parallel" || !edge.branch || !completedBranches.includes(edge.branch);
}

export function activeTransitionEdgeIds(graph, trace) {
  const entry = trace.at(-1);
  if (!entry || !DIRECT_NONLINEAR_RELATIONS.has(entry.relation)) return new Set();
  const source = graph.events.find((event) => event.id === entry.from);
  const targetNodeId = graph.events.find((event) => event.id === entry.to)?.nodeId;
  return new Set((source?.edgeIds ?? []).filter((edgeId) => {
    const edge = graph.edges.find((item) => item.id === edgeId);
    return edge?.type === entry.relation && edge.to === targetNodeId;
  }));
}

export function completedEdgeIdsForTrace(graph, trace) {
  const events = new Map(graph.events.map((event) => [event.id, event]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  return new Set(trace.flatMap((entry) => {
    const event = events.get(entry.from);
    const edgeIds = event?.edgeIds ?? [];
    const choice = event?.choices?.[entry.choice];
    if (!choice) {
      if (entry.relation === "join" && event?.relation === "parallel") {
        return edgeIds.filter((edgeId) => entry.branches?.includes(edges.get(edgeId)?.branch));
      }
      if (!DIRECT_NONLINEAR_RELATIONS.has(entry.relation)) return edgeIds;
      return edgeIds.filter((edgeId) => edges.get(edgeId)?.type === entry.relation);
    }
    if (choice.branches) return [];
    const targetNodeId = events.get(entry.to)?.nodeId;
    return edgeIds.filter((edgeId) => {
      const edge = edges.get(edgeId);
      return edge?.type === entry.relation && edge.to === targetNodeId;
    });
  }));
}

function executableState(graph, run, nodeId) {
  const currentEvent = graph.events.find((event) => event.id === run.currentEventId);
  const completedNodeIds = new Set(run.trace
    .map((entry) => graph.events.find((event) => event.id === entry.from)?.nodeId)
    .filter(Boolean));
  const selectedBranches = run.selectedBranches ?? run.activeBranches ?? [];
  const branch = nodeId === "vector-search" ? "vector" : nodeId === "web-search" ? "web" : null;
  const cognitionItem = ["planning", "memory"].includes(nodeId) ? nodeId : null;

  if (cognitionItem && run.parallelWork?.kind === "cognition" && run.parallelWork.selected.includes(cognitionItem)) {
    return run.parallelWork.completed.includes(cognitionItem)
      ? { complete: true, status: "completed" }
      : { live: true, status: "running" };
  }

  if (branch && selectedBranches.length && !selectedBranches.includes(branch)) return { skipped: true, status: "skipped" };
  if (branch && run.completedBranches.includes(branch)) return { complete: true, status: "completed" };
  if (branch && selectedBranches.includes(branch) && currentEvent?.id === "rag-retrieval") return { live: true, status: "running" };
  if (nodeId === run.currentNodeId && run.status === "completed") return { complete: true, status: "completed" };
  if (nodeId === run.currentNodeId) return { live: true, status: run.status };
  if (completedNodeIds.has(nodeId)) return { complete: true, status: "completed" };
  return {};
}

export function referenceVisualState(graph, run, id) {
  const lane = id === "rag-group" ? "rag" : id === "tools-group" ? "tools" : null;
  if (lane && run.activeLanes?.includes(lane)) {
    if (run.completedLanes?.includes(lane)) return { complete: true, status: "completed" };
    return { live: true, status: "running" };
  }
  const selectedBranches = run.selectedBranches ?? run.activeBranches ?? [];
  const branch = (graph.retrievalBranches ?? []).find((item) => item.detailNodeIds?.includes(id));
  if (branch) {
    if (selectedBranches.length && !selectedBranches.includes(branch.id)) return { skipped: true, status: "skipped" };
    if (run.completedBranches.includes(branch.id)) return { complete: true, status: "completed" };
    if (selectedBranches.includes(branch.id) && run.currentEventId === "rag-retrieval") return { live: true, status: "running" };
    return {};
  }

  const toolItem = id === "code-execution-sandbox"
    ? "sandbox"
    : id === "external-environment-business-system"
      ? "external"
      : null;
  if (toolItem && run.parallelWork?.kind === "tools") {
    if (!run.parallelWork.selected.includes(toolItem)) return { skipped: true, status: "skipped" };
    return run.parallelWork.completed.includes(toolItem)
      ? { complete: true, status: "completed" }
      : { live: true, status: "running" };
  }

  if (["planning-subgoals", "planning-cot", "planning-reflection", "planning-self-critique"].includes(id)) return executableState(graph, run, "planning");
  if (["memory-short-term", "memory-long-term", "memory-context", "memory-cross-conversation"].includes(id)) return executableState(graph, run, "memory");
  if (id === "rag-query") return executableState(graph, run, "rag-route");
  if (["rerank", "top-n"].includes(id)) return executableState(graph, run, "rag-context");

  const executableId = DETAIL_EXECUTABLES.get(id);
  if (executableId) return executableState(graph, run, executableId);

  const groupExecutables = GROUP_EXECUTABLES.get(id);
  if (groupExecutables) {
    const current = groupExecutables.find((nodeId) => nodeId === run.currentNodeId)
      ?? groupExecutables.find((nodeId) => run.parallelWork?.kind === "cognition" && run.parallelWork.selected.includes(nodeId));
    if (current) return executableState(graph, run, current);
    if (id === "vector-data-branch" && selectedBranches.length && !selectedBranches.includes("vector")) return { skipped: true, status: "skipped" };
    if (id === "web-branch" && selectedBranches.length && !selectedBranches.includes("web")) return { skipped: true, status: "skipped" };
    if (id === "vector-data-branch" && run.completedBranches.includes("vector")) return { complete: true, status: "completed" };
    if (id === "web-branch" && run.completedBranches.includes("web")) return { complete: true, status: "completed" };
  }

  return executableState(graph, run, id);
}

export function referenceEdgeState(graph, run, topologyEdge) {
  const meta = topologyEdgeMeta(topologyEdge);
  const selectedBranches = run.selectedBranches ?? run.activeBranches ?? [];
  if (meta.parallelKind && run.parallelWork?.kind === meta.parallelKind) {
    const selected = run.parallelWork.selected.includes(meta.parallelItem);
    const complete = run.parallelWork.completed.includes(meta.parallelItem);
    return { ...meta, live: selected && !complete, complete, skipped: !selected, relation: meta.presentationRelation };
  }
  if (meta.branch && selectedBranches.length && !selectedBranches.includes(meta.branch)) return { ...meta, skipped: true };
  if (meta.lane && run.activeLanes?.includes(meta.lane)) {
    const complete = run.completedLanes?.includes(meta.lane);
    return { ...meta, live: !complete, complete, relation: meta.presentationRelation ?? "parallel" };
  }

  const legacyEdge = (graph.edges ?? []).find((edge) => edge.id === meta.projectionId);
  if (!legacyEdge) return meta;

  const currentEvent = graph.events.find((event) => event.id === run.currentEventId);
  const completedEdgeIds = completedEdgeIdsForTrace(graph, run.trace);
  const transitionEdgeIds = activeTransitionEdgeIds(graph, run.trace);
  const selected = !meta.branch || selectedBranches.includes(meta.branch);
  const live = isCurrentLiveEdge(currentEvent, legacyEdge, selectedBranches, run.completedBranches)
    || transitionEdgeIds.has(legacyEdge.id);
  const branchComplete = meta.branch && run.completedBranches.includes(meta.branch);

  return {
    ...meta,
    live,
    complete: selected && (completedEdgeIds.has(legacyEdge.id) || (branchComplete && !live)),
    skipped: Boolean(meta.branch && selectedBranches.length && !selected),
    relation: meta.presentationRelation ?? legacyEdge.type,
  };
}

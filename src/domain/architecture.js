const EDGE_TYPES = new Set([
  "sequence", "decision", "parallel", "join",
  "callback", "retry", "replan", "module",
]);

export function validateArchitecture(graph) {
  const moduleIds = new Set(graph.modules.map((module) => module.id));
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (moduleIds.size !== graph.modules.length) throw new Error("Duplicate module id");
  if (nodeIds.size !== graph.nodes.length) throw new Error("Duplicate node id");
  for (const node of graph.nodes) {
    if (!moduleIds.has(node.moduleId)) throw new Error(`Unknown node module: ${node.moduleId}`);
  }
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) throw new Error(`Unknown edge source: ${edge.from}`);
    if (!nodeIds.has(edge.to)) throw new Error(`Unknown edge target: ${edge.to}`);
    if (!EDGE_TYPES.has(edge.type)) throw new Error(`Unknown edge type: ${edge.type}`);
  }
  if (graph.guardrails.scope !== "global") throw new Error("Guardrails must be global");
  return { valid: true };
}

export function getModule(graph, moduleId) {
  const module = graph.modules.find((item) => item.id === moduleId);
  if (!module) throw new Error(`Unknown module: ${moduleId}`);
  return module;
}

export function getNode(graph, nodeId) {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`Unknown node: ${nodeId}`);
  return node;
}

export function getEdgesForNode(graph, nodeId) {
  getNode(graph, nodeId);
  return graph.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
}

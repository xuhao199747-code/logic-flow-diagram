import { agentExecutionDiagram } from "./agent-execution/index.js";

function requireBilingual(value, field) {
  if (!value?.zh || !value?.en) throw new Error(`Missing bilingual ${field}`);
}

export function validateDiagram(diagram) {
  if (!diagram?.id) throw new Error("Missing diagram id");
  requireBilingual(diagram.label, "diagram label");
  const { graph, guides } = diagram;
  if (!graph?.nodes || !graph?.events || !graph?.topologyEdges) throw new Error("Missing diagram graph collections");

  const nodeIds = graph.nodes.map((node) => node.id);
  if (new Set(nodeIds).size !== nodeIds.length) throw new Error("Duplicate node id");
  const allItems = [...graph.nodes, ...graph.detailNodes, ...graph.groups];
  const endpointIds = new Set(allItems.map((item) => item.id));
  for (const edge of graph.topologyEdges) {
    if (!endpointIds.has(edge.from) || !endpointIds.has(edge.to)) {
      throw new Error(`Missing topology endpoint: ${edge.from} -> ${edge.to}`);
    }
  }

  const eventIds = new Set(graph.events.map((event) => event.id));
  for (const event of graph.events) {
    if (!nodeIds.includes(event.nodeId)) throw new Error(`Missing event node: ${event.nodeId}`);
    for (const target of [event.next, event.join, ...Object.values(event.choices ?? {}).map((choice) => choice.next)].filter(Boolean)) {
      if (!eventIds.has(target)) throw new Error(`Missing event target: ${target}`);
    }
    const eventGuide = guides?.eventGuideFor?.(event.id);
    requireBilingual(eventGuide?.now, `event guide now: ${event.id}`);
    requireBilingual(eventGuide?.reason, `event guide reason: ${event.id}`);
    requireBilingual(eventGuide?.result, `event guide result: ${event.id}`);
  }
  for (const item of [...graph.nodes, ...graph.detailNodes]) {
    requireBilingual(guides?.nodeGuideFor?.(item.id)?.purpose, `node guide: ${item.id}`);
  }
  return true;
}

const registered = [agentExecutionDiagram];
for (const diagram of registered) validateDiagram(diagram);

export const diagramRegistry = Object.freeze(registered);

export function getDiagram(id) {
  return diagramRegistry.find((diagram) => diagram.id === id) ?? null;
}

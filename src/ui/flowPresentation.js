const groupModules = {
  "core-group": "orchestration",
  "planning-group": "planning",
  "memory-group": "memory",
  "rag-group": "rag",
  "vector-data-branch": "rag",
  "web-branch": "rag",
  "tools-group": "tools",
};

const nodeModules = {
  "user-task": "orchestration",
  orchestrator: "orchestration",
  llm: "orchestration",
  planning: "planning",
  memory: "memory",
  "rag-route": "rag",
  "vector-search": "rag",
  "web-search": "rag",
  "rag-merge": "rag",
  "rag-context": "rag",
  "tool-select": "tools",
  action: "tools",
  observation: "feedback",
  "final-response": "output",
};

const macroConnections = new Map(Object.entries({
  "user-task->orchestrator": "orchestration",
  "orchestrator->llm": "orchestration",
  "llm->planning": "planning",
  "planning->llm": "planning",
  "llm->memory": "memory",
  "memory->llm": "memory",
  "llm->rag-query": "rag",
  "rag-context-assembly->llm": "rag",
  "llm->tools-group": "tools",
  "action->observation": "feedback",
  "observation->llm": "feedback",
  "observation->planning": "feedback",
  "observation->action": "feedback",
  "memory->action": "memory",
  "llm->final-response": "output",
  "rag-context-assembly->context-dependency-gate": "rag",
}));

const toolMicroConnections = new Set([
  "code-execution-sandbox->action",
  "external-environment-business-system->action",
  "context-dependency-gate->code-execution-sandbox",
  "context-dependency-gate->external-environment-business-system",
]);

export function flowModuleForGroup(groupId) {
  return groupModules[groupId] ?? "orchestration";
}

export function flowModuleForDetail(detail) {
  if (detail.id === "context-dependency-gate") return "tools";
  return groupModules[detail.groupId] ?? "orchestration";
}

export function flowModuleForNode(nodeId) {
  return nodeModules[nodeId] ?? "orchestration";
}

export function flowPresentationForConnection(from, to) {
  const key = `${from}->${to}`;
  const macroModule = macroConnections.get(key);
  if (macroModule) return { module: macroModule, level: "macro" };
  if (toolMicroConnections.has(key)) return { module: "tools", level: "micro" };
  return { module: "rag", level: "micro" };
}

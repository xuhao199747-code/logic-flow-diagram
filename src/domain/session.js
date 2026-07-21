const DEFAULT_DIAGRAM_ID = "agent-execution";
const SESSION_PREFIX = "interactive-agent-flow:session:v2";
export const DIAGRAM_SELECTION_KEY = "interactive-agent-flow:selected-diagram:v1";
export const sessionKeyFor = (diagramId = DEFAULT_DIAGRAM_ID) => `${SESSION_PREFIX}:${encodeURIComponent(diagramId)}`;
export const SESSION_KEY = sessionKeyFor(DEFAULT_DIAGRAM_ID);
const SESSION_VERSION = 2;

const runFields = [
  "status",
  "currentEventId",
  "currentNodeId",
  "selectedBranches",
  "activeBranches",
  "completedBranches",
  "dispatchMode",
  "activeLanes",
  "completedLanes",
  "parallelWork",
  "contextRequired",
  "iteration",
  "trace",
  "history",
  "eventSnapshots",
  "simulatedIssue",
  "recovery",
];

function persistedRun(run) {
  return Object.fromEntries(runFields.filter((field) => field in run).map((field) => [field, run[field]]));
}

function validCanvasViewport(viewport) {
  return viewport
    && Number.isFinite(viewport.zoom)
    && Number.isFinite(viewport.x)
    && Number.isFinite(viewport.y);
}

function isRestorable(payload, graph) {
  if (!payload || payload.version !== SESSION_VERSION) return false;
  if (!graph.scenarios.some((scenario) => scenario.id === payload.scenarioId)) return false;
  if (!payload.run || typeof payload.run !== "object") return false;
  const event = graph.events.find((item) => item.id === payload.run.currentEventId);
  if (!event || payload.run.currentNodeId !== event.nodeId) return false;
  for (const field of ["selectedBranches", "activeBranches", "completedBranches", "activeLanes", "completedLanes", "trace", "history", "eventSnapshots"]) {
    if (!Array.isArray(payload.run[field])) return false;
  }
  if (payload.run.parallelWork !== null && (
    !payload.run.parallelWork
    || !Array.isArray(payload.run.parallelWork.selected)
    || !Array.isArray(payload.run.parallelWork.completed)
  )) return false;
  return Number.isInteger(payload.run.iteration) && payload.run.iteration > 0;
}

export function restoreSession(storage, graph, diagramId = DEFAULT_DIAGRAM_ID) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(sessionKeyFor(diagramId));
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!isRestorable(payload, graph)) return null;
    return {
      scenarioId: payload.scenarioId,
      run: { ...payload.run, graph },
      canvasViewport: validCanvasViewport(payload.canvasViewport) ? payload.canvasViewport : undefined,
    };
  } catch {
    return null;
  }
}

export function saveSession(storage, { diagramId = DEFAULT_DIAGRAM_ID, scenarioId, run, canvasViewport }) {
  if (!storage) return false;
  try {
    storage.setItem(sessionKeyFor(diagramId), JSON.stringify({
      version: SESSION_VERSION,
      scenarioId,
      run: persistedRun(run),
      ...(validCanvasViewport(canvasViewport) ? { canvasViewport } : {}),
    }));
    return true;
  } catch {
    return false;
  }
}

export function restoreSelectedDiagram(storage, diagrams) {
  if (!storage) return diagrams[0]?.id ?? null;
  try {
    const selected = storage.getItem(DIAGRAM_SELECTION_KEY);
    return diagrams.some((diagram) => diagram.id === selected) ? selected : diagrams[0]?.id ?? null;
  } catch {
    return diagrams[0]?.id ?? null;
  }
}

export function saveSelectedDiagram(storage, diagramId) {
  if (!storage) return false;
  try {
    storage.setItem(DIAGRAM_SELECTION_KEY, diagramId);
    return true;
  } catch {
    return false;
  }
}

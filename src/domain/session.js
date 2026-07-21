export const SESSION_KEY = "interactive-agent-flow:session:v1";
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

export function restoreSession(storage, graph) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!isRestorable(payload, graph)) return null;
    return {
      scenarioId: payload.scenarioId,
      run: { ...payload.run, graph },
    };
  } catch {
    return null;
  }
}

export function saveSession(storage, { scenarioId, run }) {
  if (!storage) return false;
  try {
    storage.setItem(SESSION_KEY, JSON.stringify({
      version: SESSION_VERSION,
      scenarioId,
      run: persistedRun(run),
    }));
    return true;
  } catch {
    return false;
  }
}

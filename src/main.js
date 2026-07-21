import "./styles.css";
import { demoGraph } from "./data/demo-graph.js";
import { createRun, transition } from "./domain/execution.js";
import { restoreSession, saveSession } from "./domain/session.js";
import { createAppView } from "./ui/AppView.js";

const storage = (() => {
  try { return globalThis.sessionStorage; } catch { return null; }
})();
const restored = restoreSession(storage, demoGraph);
const state = restored ? { graph: demoGraph, ...restored } : {
  graph: demoGraph,
  run: createRun(demoGraph),
  scenarioId: "normal",
};

const render = () => {
  view.render(state);
  saveSession(storage, state);
};
const isTerminal = (status) => ["completed", "failed", "cancelled"].includes(status);

function advanceOne() {
  if (isTerminal(state.run.status) || state.run.simulatedIssue) return false;
  const event = state.graph.events.find((item) => item.id === state.run.currentEventId);
  if (event.relation === "decision") return false;
  if (event.relation === "parallel") {
    const branch = state.run.activeBranches.find((item) => !state.run.completedBranches.includes(item));
    if (!branch) return false;
    state.run = transition(state.run, { type: "COMPLETE_BRANCH", branch });
  } else if (event.relation === "parallel-work") {
    const item = state.run.parallelWork?.selected.find((candidate) => !state.run.parallelWork.completed.includes(candidate));
    if (!item) return false;
    state.run = transition(state.run, { type: "COMPLETE_PARALLEL_ITEM", item });
  } else {
    state.run = transition(state.run, { type: "ADVANCE" });
  }
  const scenario = state.graph.scenarios.find((item) => item.id === state.scenarioId);
  if (scenario?.trigger === state.run.currentEventId) {
    state.run = transition(state.run, { type: "REPORT_ISSUE", issue: scenario });
    return false;
  }
  return true;
}

const handlers = {
  onBranchChoice(choice) {
    state.run = transition(state.run, { type: "CHOOSE_BRANCH", choice });
    render();
  },
  onPrimaryAction() {
    const previousRun = state.run;
    advanceOne();
    if (state.run !== previousRun) render();
  },
  onPrevious() {
    const previousRun = state.run;
    state.run = transition(previousRun, { type: "PREVIOUS" });
    if (state.run !== previousRun) render();
  },
  onRestart() {
    state.run = transition(state.run, { type: "RESET" });
    render();
  },
  onScenarioChange(scenarioId) {
    state.scenarioId = scenarioId;
    state.run = transition(state.run, { type: "RESET" });
    render();
  },
  onRecovery(action) {
    const previousRun = state.run;
    state.run = transition(previousRun, { type: "RECOVER", action, reason: `Scenario recovery: ${action}` });
    if (state.run !== previousRun) render();
  },
};

const view = createAppView(document.querySelector("#app"), handlers);

const keyboardControllerKey = "__interactiveAgentFlowKeyboardController";
globalThis[keyboardControllerKey]?.abort();
const keyboardController = new AbortController();
globalThis[keyboardControllerKey] = keyboardController;

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.repeat || event.target.closest?.("input, textarea, select, button, [contenteditable='true'], [role='button']")) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    handlers.onPrevious();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    handlers.onPrimaryAction();
  }
}, { signal: keyboardController.signal });

render();

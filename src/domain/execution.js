const TERMINAL = new Set(["completed", "cancelled", "failed"]);

const cloneTrace = (trace) => trace.map((entry) => ({ ...entry, branches: entry.branches ? [...entry.branches] : undefined }));
const cloneBranches = (branches) => [...(branches ?? [])];
const cloneLanes = (lanes) => [...(lanes ?? [])];
const cloneParallelWork = (work) => work ? {
  kind: work.kind,
  selected: [...(work.selected ?? [])],
  completed: [...(work.completed ?? [])],
} : null;
const tracesMatch = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function eventFor(run, eventId = run.currentEventId) {
  return run.graph.events.find((event) => event.id === eventId);
}

function createEventSnapshot(run, detail = {}) {
  const event = eventFor(run);
  const selectedBranches = Object.freeze(cloneBranches(run.selectedBranches));
  const completedBranches = Object.freeze(cloneBranches(run.completedBranches));
  const activeLanes = Object.freeze(cloneLanes(run.activeLanes));
  const completedLanes = Object.freeze(cloneLanes(run.completedLanes));
  const parallelWork = cloneParallelWork(run.parallelWork);
  if (parallelWork) {
    Object.freeze(parallelWork.selected);
    Object.freeze(parallelWork.completed);
    Object.freeze(parallelWork);
  }
  const trace = Object.freeze(cloneTrace(run.trace).map((entry) => Object.freeze(entry)));
  const issue = run.simulatedIssue ? Object.freeze({ ...run.simulatedIssue }) : null;
  return Object.freeze({
    id: `${event.id}:${run.eventSnapshots.length + 1}`,
    eventId: event.id,
    nodeId: event.nodeId,
    status: run.status,
    input: detail.input ?? event.label.zh,
    output: detail.output ?? "—",
    summary: detail.summary ?? event.label.en,
    iteration: run.iteration,
    selectedBranches,
    completedBranches,
    dispatchMode: run.dispatchMode,
    activeLanes,
    completedLanes,
    parallelWork,
    contextRequired: run.contextRequired,
    issue,
    trace,
  });
}

function recordEvent(run, detail) {
  return { ...run, eventSnapshots: [...run.eventSnapshots, createEventSnapshot(run, detail)] };
}

function stateSnapshot(run) {
  return {
    status: run.status,
    currentEventId: run.currentEventId,
    currentNodeId: run.currentNodeId,
    selectedBranches: cloneBranches(run.selectedBranches),
    activeBranches: cloneBranches(run.activeBranches),
    completedBranches: cloneBranches(run.completedBranches),
    dispatchMode: run.dispatchMode,
    activeLanes: cloneLanes(run.activeLanes),
    completedLanes: cloneLanes(run.completedLanes),
    parallelWork: cloneParallelWork(run.parallelWork),
    contextRequired: run.contextRequired,
    iteration: run.iteration,
    trace: cloneTrace(run.trace),
    eventSnapshots: [...run.eventSnapshots],
    simulatedIssue: run.simulatedIssue ? { ...run.simulatedIssue } : null,
  };
}

function withHistory(run) {
  return { ...run, history: [...run.history, stateSnapshot(run)] };
}

function move(run, eventId, relation, detail = {}, iteration = run.iteration) {
  const target = eventFor(run, eventId);
  if (!target) throw new Error(`Unknown target event: ${eventId}`);
  const previous = stateSnapshot(run);
  const trace = [...run.trace, { from: run.currentEventId, to: target.id, relation, iteration, ...detail }];
  const executed = { ...run, status: "success", iteration, trace };
  const recorded = recordEvent(executed, {
    ...detail,
    output: detail.output ?? `完成：${eventFor(run).label.zh}`,
    summary: detail.summary ?? `Completed ${eventFor(run).label.en}`,
  });
  return {
    ...recorded,
    history: [...run.history, previous],
    status: "paused",
    currentEventId: target.id,
    currentNodeId: target.nodeId,
    iteration,
    trace,
    parallelWork: target.parallelWork
      ? { kind: target.parallelWork.kind, selected: [...target.parallelWork.items], completed: [] }
      : run.parallelWork,
  };
}

function resetIssue(run) {
  return { ...run, simulatedIssue: null, status: "paused" };
}

export function createRun(graph, startEventId = graph.events[0].id) {
  const event = graph.events.find((item) => item.id === startEventId);
  if (!event) throw new Error(`Unknown start event: ${startEventId}`);
  const run = {
    graph,
    status: "paused",
    currentEventId: event.id,
    currentNodeId: event.nodeId,
    selectedBranches: [],
    activeBranches: [],
    completedBranches: [],
    dispatchMode: null,
    activeLanes: [],
    completedLanes: [],
    parallelWork: event.parallelWork
      ? { kind: event.parallelWork.kind, selected: [...event.parallelWork.items], completed: [] }
      : null,
    contextRequired: false,
    iteration: 1,
    trace: [],
    history: [],
    eventSnapshots: [],
    simulatedIssue: null,
  };
  return recordEvent(run, { summary: "Run initialized" });
}

export function latestSnapshotForNode(run, nodeId) {
  return [...run.eventSnapshots].reverse().find((snapshot) => snapshot.nodeId === nodeId) ?? null;
}

export function transition(run, action) {
  if (action.type === "PREVIOUS") {
    const previous = run.history.at(-1);
    return previous ? { ...run, ...previous, history: run.history.slice(0, -1) } : run;
  }
  if (action.type === "RESET") return createRun(run.graph);
  if (action.type === "RERUN_SNAPSHOT") {
    const snapshot = run.eventSnapshots.find((item) => item.id === action.snapshotId);
    if (!snapshot) throw new Error(`Unknown snapshot: ${action.snapshotId}`);
    const snapshotEvent = eventFor(run, snapshot.eventId);
    const snapshotIndex = run.eventSnapshots.indexOf(snapshot);
    const outgoingIndex = snapshot.trace.map((entry) => entry.from).lastIndexOf(snapshot.eventId);
    const resumeTrace = cloneTrace(outgoingIndex === -1 ? snapshot.trace : snapshot.trace.slice(0, outgoingIndex));
    const historyIndex = run.history.map((entry) => entry.currentEventId === snapshot.eventId && tracesMatch(entry.trace, resumeTrace)).lastIndexOf(true);
    const priorState = historyIndex === -1 ? null : run.history[historyIndex];
    return {
      graph: run.graph,
      status: "paused",
      currentEventId: snapshot.eventId,
      currentNodeId: snapshot.nodeId,
      iteration: priorState?.iteration ?? snapshot.iteration,
      selectedBranches: cloneBranches(priorState?.selectedBranches ?? snapshot.selectedBranches),
      activeBranches: cloneBranches(priorState?.activeBranches ?? snapshot.selectedBranches),
      completedBranches: cloneBranches(priorState?.completedBranches ?? snapshot.completedBranches),
      dispatchMode: priorState?.dispatchMode ?? snapshot.dispatchMode ?? null,
      activeLanes: cloneLanes(priorState?.activeLanes ?? snapshot.activeLanes),
      completedLanes: cloneLanes(priorState?.completedLanes ?? snapshot.completedLanes),
      parallelWork: snapshotEvent?.relation === "parallel-work"
        ? { ...cloneParallelWork(priorState?.parallelWork ?? snapshot.parallelWork), completed: [] }
        : cloneParallelWork(priorState?.parallelWork ?? snapshot.parallelWork),
      contextRequired: priorState?.contextRequired ?? snapshot.contextRequired ?? false,
      trace: resumeTrace,
      history: historyIndex === -1 ? [] : run.history.slice(0, historyIndex + 1),
      eventSnapshots: run.eventSnapshots.slice(0, snapshotIndex),
      simulatedIssue: priorState?.simulatedIssue ? { ...priorState.simulatedIssue } : null,
      recovery: { action: "rerun", reason: action.reason ?? "Historical snapshot replay" },
    };
  }
  if (TERMINAL.has(run.status)) throw new Error("Run is terminal");

  if (action.type === "REPORT_ISSUE") {
    const issue = action.issue;
    if (!issue) throw new Error("Issue details are required");
    const blocked = { ...run, status: issue.status ?? "blocked", simulatedIssue: issue };
    return recordEvent(blocked, { output: issue.label?.zh ?? issue.id, summary: "Simulated issue recorded" });
  }

  if (action.type === "RECOVER") {
    if (action.action === "request" && run.simulatedIssue?.requested) return run;
    const recovery = { recovery: action.action, reason: action.reason ?? "Recovery requested" };
    const cleared = resetIssue(run);
    if (action.action === "retry") {
      if (run.simulatedIssue?.id === "no-results") {
        const retried = move({ ...cleared, completedBranches: [] }, "rag-retrieval", "retry", { reason: recovery.reason }, run.iteration + 1);
        return { ...retried, selectedBranches: cloneBranches(run.selectedBranches), activeBranches: cloneBranches(run.selectedBranches), completedBranches: [], recovery: { action: "retry", reason: recovery.reason }, trace: retried.trace.map((entry, index) => index === retried.trace.length - 1 ? { ...entry, recovery: "retry" } : entry) };
      }
      const retried = transition(cleared, { type: "RETRY", reason: recovery.reason });
      return { ...retried, recovery: { action: "retry", reason: recovery.reason }, trace: retried.trace.map((entry, index) => index === retried.trace.length - 1 ? { ...entry, recovery: "retry" } : entry) };
    }
    if (action.action === "replan") {
      const replanned = transition(cleared, { type: "REPLAN", reason: recovery.reason });
      return { ...replanned, recovery: { action: "replan", reason: recovery.reason }, trace: replanned.trace.map((entry, index) => index === replanned.trace.length - 1 ? { ...entry, recovery: "replan" } : entry) };
    }
    if (action.action === "finish") {
      return { ...move(cleared, "final-event", "decision", recovery), recovery: { action: "finish", reason: recovery.reason } };
    }
    if (action.action === "request") {
      const requested = { ...run, simulatedIssue: { ...run.simulatedIssue, requested: true }, status: "blocked" };
      const recorded = recordEvent(requested, { summary: "Permission requested" });
      return { ...recorded, recovery: { action: "request", reason: recovery.reason }, trace: [...run.trace, { from: run.currentEventId, to: run.currentEventId, relation: "recovery", ...recovery, iteration: run.iteration }] };
    }
    if (action.action === "confirm") {
      const retried = transition(cleared, { type: "RETRY", reason: recovery.reason });
      return { ...retried, recovery: { action: "confirm", reason: recovery.reason }, trace: retried.trace.map((entry, index) => index === retried.trace.length - 1 ? { ...entry, recovery: "confirm" } : entry) };
    }
    if (action.action === "cancel") return { ...recordEvent(cleared, { summary: "Recovery cancelled" }), status: "cancelled", recovery: { action: "cancel", reason: recovery.reason } };
    throw new Error(`Unknown recovery action: ${action.action}`);
  }

  const event = eventFor(run);
  if (action.type === "CANCEL") return { ...recordEvent(run, { summary: "Run cancelled" }), status: "cancelled" };
  if (action.type === "CHOOSE_BRANCH") {
    const choice = event.choices?.[action.choice];
    if (!choice) throw new Error(`Unknown branch choice: ${action.choice}`);
    const iteration = ["retry", "replan"].includes(choice.relation) ? run.iteration + 1 : run.iteration;
    if (choice.completeLane) {
      const completedLanes = [...new Set([...run.completedLanes, choice.completeLane])];
      const pendingLane = run.activeLanes.find((lane) => !completedLanes.includes(lane));
      const target = choice.nextByPendingLane?.[pendingLane] ?? choice.next;
      const next = move(run, target, choice.relation ?? "decision", { choice: action.choice, completedLane: choice.completeLane }, iteration);
      return { ...next, completedLanes, iteration };
    }
    const next = move(run, choice.next, choice.relation ?? "decision", { choice: action.choice }, iteration);
    if (choice.resetParallelWork && next.parallelWork) {
      return {
        ...next,
        parallelWork: { ...next.parallelWork, completed: [] },
        iteration,
      };
    }
    if (choice.lanes) {
      const activeLanes = cloneLanes(choice.lanes);
      return {
        ...next,
        dispatchMode: action.choice,
        activeLanes,
        completedLanes: [],
        contextRequired: Boolean(choice.contextRequired),
        selectedBranches: [],
        activeBranches: [],
        completedBranches: [],
        iteration,
      };
    }
    if (choice.parallelWork) {
      return {
        ...next,
        parallelWork: {
          kind: choice.parallelWork.kind,
          selected: [...choice.parallelWork.items],
          completed: [],
        },
        iteration,
      };
    }
    const selectedBranches = cloneBranches(choice.branches);
    return { ...next, selectedBranches, activeBranches: selectedBranches, completedBranches: [], iteration };
  }
  if (action.type === "COMPLETE_PARALLEL_ITEM") {
    const work = run.parallelWork;
    if (!work?.selected.includes(action.item)) throw new Error(`Inactive parallel item: ${action.item}`);
    if (work.completed.includes(action.item)) return run;
    const completed = [...work.completed, action.item];
    const parallelWork = { ...work, completed };
    if (completed.length < work.selected.length) {
      const previous = stateSnapshot(run);
      const recorded = recordEvent({ ...run, status: "success", parallelWork }, {
        output: `完成并行项：${action.item}`,
        summary: `${action.item} completed`,
      });
      return { ...recorded, history: [...run.history, previous], status: "paused", parallelWork };
    }
    const joined = move({ ...run, parallelWork }, event.join, "join", { items: [...work.selected] });
    return { ...joined, parallelWork };
  }
  if (action.type === "COMPLETE_BRANCH") {
    if (!run.selectedBranches.includes(action.branch)) throw new Error(`Inactive branch: ${action.branch}`);
    const completedBranches = [...new Set([...run.completedBranches, action.branch])];
    if (completedBranches.length < run.selectedBranches.length) {
      const previous = stateSnapshot(run);
      const recorded = recordEvent({ ...run, status: "success", completedBranches }, { output: `完成分支：${action.branch}`, summary: `${action.branch} completed` });
      return { ...recorded, history: [...run.history, previous], status: "paused", completedBranches };
    }
    return {
      ...move(run, event.join, "join", { branches: cloneBranches(run.selectedBranches) }),
      selectedBranches: cloneBranches(run.selectedBranches),
      activeBranches: cloneBranches(run.selectedBranches),
      completedBranches,
    };
  }
  if (action.type === "REPLAN") {
    const planningEvent = run.graph.events.find((item) => item.id === "planning-event");
    if (!planningEvent) throw new Error("Planning event is required for replan");
    return move(run, planningEvent.id, "replan", { reason: action.reason }, run.iteration + 1);
  }
  if (action.type === "RETRY") {
    const recorded = recordEvent(run, { summary: "Retrying current event" });
    const withSnapshot = withHistory(recorded);
    const iteration = run.iteration + 1;
    return {
      ...withSnapshot,
      iteration,
      status: "paused",
      trace: [...run.trace, { from: event.id, to: event.id, relation: "retry", reason: action.reason, iteration }],
    };
  }
  if (action.type === "ADVANCE") {
    if (event.relation === "decision") throw new Error("Branch selection required");
    if (event.relation === "parallel") throw new Error("Parallel branches must complete");
    if (event.relation === "parallel-work") throw new Error("Parallel work items must complete");
    if (event.completeLane) {
      const completedLanes = [...new Set([...run.completedLanes, event.completeLane])];
      const pendingLane = run.activeLanes.find((lane) => !completedLanes.includes(lane));
      const target = event.nextByPendingLane?.[pendingLane] ?? event.next;
      const next = move(run, target, event.relation, { completedLane: event.completeLane });
      return { ...next, completedLanes };
    }
    if (!event.next) {
      const previous = stateSnapshot(run);
      const trace = [...run.trace, { from: event.id, to: null, relation: "complete", iteration: run.iteration }];
      const recorded = recordEvent({ ...run, status: "completed", trace }, { output: `完成：${event.label.zh}`, summary: "Run completed" });
      return { ...recorded, history: [...run.history, previous], status: "completed", trace };
    }
    return move(run, event.next, event.relation);
  }
  throw new Error(`Unknown action: ${action.type}`);
}

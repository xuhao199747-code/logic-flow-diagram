import { describe, expect, it } from "vitest";
import { createRun, transition } from "../../src/domain/execution.js";
import { demoGraph } from "../../src/data/demo-graph.js";

describe("execution state machine", () => {
  it("dispatches RAG and Tools as independent top-level lanes", () => {
    let run = createRun(demoGraph, "llm-dispatch-event");
    run = transition(run, { type: "CHOOSE_BRANCH", choice: "parallel" });
    expect(run).toMatchObject({
      dispatchMode: "parallel",
      activeLanes: ["rag", "tools"],
      completedLanes: [],
      contextRequired: true,
      currentEventId: "rag-route",
    });
  });

  it("supports RAG-only and Tools-only dispatch without activating the other lane", () => {
    const rag = transition(createRun(demoGraph, "llm-dispatch-event"), { type: "CHOOSE_BRANCH", choice: "rag" });
    const tools = transition(createRun(demoGraph, "llm-dispatch-event"), { type: "CHOOSE_BRANCH", choice: "tools" });
    expect(rag).toMatchObject({ dispatchMode: "rag", activeLanes: ["rag"], currentEventId: "rag-route" });
    expect(tools).toMatchObject({ dispatchMode: "tools", activeLanes: ["tools"], currentEventId: "tool-select-event" });
  });

  it("marks the RAG lane complete at its callback and continues the pending Tools lane", () => {
    let run = transition(createRun(demoGraph, "llm-dispatch-event"), { type: "CHOOSE_BRANCH", choice: "parallel" });
    run = { ...run, currentEventId: "rag-callback", currentNodeId: "rag-context" };
    run = transition(run, { type: "ADVANCE" });
    expect(run).toMatchObject({ currentEventId: "tool-select-event", completedLanes: ["rag"], activeLanes: ["rag", "tools"] });
    expect(run.trace.at(-1)).toMatchObject({ relation: "callback", completedLane: "rag" });
  });

  it("fans both lane callbacks into the LLM before final response", () => {
    let run = transition(createRun(demoGraph, "llm-dispatch-event"), { type: "CHOOSE_BRANCH", choice: "tools" });
    run = { ...run, currentEventId: "observation-event", currentNodeId: "observation" };
    run = transition(run, { type: "CHOOSE_BRANCH", choice: "finish" });
    expect(run).toMatchObject({ currentEventId: "llm-join-event", completedLanes: ["tools"] });
    expect(run.trace.at(-1)).toMatchObject({ relation: "callback", completedLane: "tools" });
    run = transition(run, { type: "ADVANCE" });
    expect(run.currentEventId).toBe("final-event");
  });

  it("restores top-level lane state with Previous", () => {
    let run = transition(createRun(demoGraph, "llm-dispatch-event"), { type: "CHOOSE_BRANCH", choice: "parallel" });
    run = transition(run, { type: "PREVIOUS" });
    expect(run).toMatchObject({ currentEventId: "llm-dispatch-event", activeLanes: [], completedLanes: [], dispatchMode: null });
  });

  it("blocks a decision until a branch is selected", () => {
    let run = createRun(demoGraph, "rag-route");
    expect(() => transition(run, { type: "ADVANCE" })).toThrow("Branch selection required");
    run = transition(run, { type: "CHOOSE_BRANCH", choice: "parallel" });
    expect(run.activeBranches).toEqual(["vector", "web"]);
  });

  it("waits for both parallel branches before joining", () => {
    let run = createRun(demoGraph, "rag-route");
    run = transition(run, { type: "CHOOSE_BRANCH", choice: "parallel" });
    run = transition(run, { type: "COMPLETE_BRANCH", branch: "vector" });
    expect(run.currentEventId).toBe("rag-retrieval");
    run = transition(run, { type: "COMPLETE_BRANCH", branch: "web" });
    expect(run.currentEventId).toBe("rag-join");
  });

  it("preserves selected branches on the join trace", () => {
    let run = createRun(demoGraph, "rag-route");
    run = transition(run, { type: "CHOOSE_BRANCH", choice: "web" });
    run = transition(run, { type: "COMPLETE_BRANCH", branch: "web" });
    expect(run.trace.at(-1)).toMatchObject({ from: "rag-retrieval", to: "rag-join", relation: "join", branches: ["web"] });
  });

  it("blocks advance while parallel branches are incomplete", () => {
    let run = createRun(demoGraph, "rag-route");
    run = transition(run, { type: "CHOOSE_BRANCH", choice: "parallel" });
    expect(() => transition(run, { type: "ADVANCE" })).toThrow("Parallel branches must complete");
    expect(run).toMatchObject({ currentEventId: "rag-retrieval", status: "paused" });
  });

  it("records replan iterations", () => {
    let run = createRun(demoGraph, "observation-event");
    run = transition(run, { type: "REPLAN", reason: "completion score below threshold" });
    expect(run.iteration).toBe(2);
    expect(run.currentNodeId).toBe("planning");
    expect(run.currentEventId).toBe("planning-event");
    expect(run.trace.at(-1).relation).toBe("replan");
  });

  it("routes observation outcomes to finish, retry, or replan", () => {
    const base = createRun(demoGraph, "observation-event");
    expect(transition(base, { type: "CHOOSE_BRANCH", choice: "finish" }).currentEventId).toBe("llm-join-event");
    const retry = transition(base, { type: "CHOOSE_BRANCH", choice: "retry" });
    const replan = transition(base, { type: "CHOOSE_BRANCH", choice: "replan" });
    expect(retry).toMatchObject({ currentEventId: "tool-event", iteration: 2 });
    expect(retry.trace.at(-1)).toMatchObject({ relation: "retry", iteration: 2 });
    expect(replan).toMatchObject({ currentEventId: "planning-event", iteration: 2 });
    expect(replan.trace.at(-1)).toMatchObject({ relation: "replan", iteration: 2 });
  });

  it("advances sequence events", () => {
    const run = transition(createRun(demoGraph, "input-event"), { type: "ADVANCE" });
    expect(run).toMatchObject({ currentEventId: "orchestrator-event", currentNodeId: "orchestrator" });
    expect(run.trace.at(-1)).toMatchObject({ relation: "sequence", iteration: 1 });
  });

  it("joins planning and memory only after both parallel modules complete", () => {
    let run = createRun(demoGraph, "planning-event");
    expect(run.parallelWork).toEqual({ kind: "cognition", selected: ["planning", "memory"], completed: [] });

    run = transition(run, { type: "COMPLETE_PARALLEL_ITEM", item: "planning" });
    expect(run).toMatchObject({ currentEventId: "planning-event" });
    expect(run.parallelWork.completed).toEqual(["planning"]);

    run = transition(run, { type: "COMPLETE_PARALLEL_ITEM", item: "memory" });
    expect(run).toMatchObject({ currentEventId: "llm-dispatch-event", currentNodeId: "llm" });
    expect(run.parallelWork.completed).toEqual(["planning", "memory"]);
  });

  it.each([
    ["sandbox", ["sandbox"]],
    ["external", ["external"]],
    ["parallel", ["sandbox", "external"]],
  ])("selects %s tool execution work", (choice, selected) => {
    let run = transition(createRun(demoGraph, "tool-select-event"), { type: "CHOOSE_BRANCH", choice });
    expect(run).toMatchObject({ currentEventId: "tool-event" });
    expect(run.parallelWork).toEqual({ kind: "tools", selected, completed: [] });

    for (const item of selected) run = transition(run, { type: "COMPLETE_PARALLEL_ITEM", item });
    expect(run).toMatchObject({ currentEventId: "action-event", currentNodeId: "action" });
  });

  it("retries the selected tools from an incomplete state", () => {
    let run = transition(createRun(demoGraph, "tool-select-event"), { type: "CHOOSE_BRANCH", choice: "external" });
    run = transition(run, { type: "COMPLETE_PARALLEL_ITEM", item: "external" });
    run = transition(run, { type: "ADVANCE" });
    run = transition(run, { type: "CHOOSE_BRANCH", choice: "retry" });

    expect(run).toMatchObject({ currentEventId: "tool-event", iteration: 2 });
    expect(run.parallelWork).toEqual({ kind: "tools", selected: ["external"], completed: [] });
  });

  it("advances callback events and records their trace", () => {
    const run = transition(createRun(demoGraph, "rag-callback"), { type: "ADVANCE" });
    expect(run).toMatchObject({ currentEventId: "llm-join-event", currentNodeId: "llm" });
    expect(run.trace.at(-1)).toMatchObject({ from: "rag-callback", to: "llm-join-event", relation: "callback", iteration: 1 });
  });

  it("retries the current event directly", () => {
    const run = transition(createRun(demoGraph, "tool-event"), { type: "RETRY" });
    expect(run).toMatchObject({ currentEventId: "tool-event", iteration: 2 });
    expect(run.trace.at(-1)).toMatchObject({ from: "tool-event", to: "tool-event", relation: "retry", iteration: 2 });
  });

  it("restores the complete previous snapshot instead of only moving the cursor", () => {
    let run = createRun(demoGraph, "rag-route");
    run = transition(run, { type: "CHOOSE_BRANCH", choice: "parallel" });
    run = transition(run, { type: "PREVIOUS" });
    expect(run).toMatchObject({ currentEventId: "rag-route", activeBranches: [], completedBranches: [], iteration: 1 });
  });

  it("clears a simulated issue when restoring the previous snapshot", () => {
    let run = transition(createRun(demoGraph, "input-event"), { type: "ADVANCE" });
    run = { ...run, simulatedIssue: demoGraph.scenarios[1].label };
    run = transition(run, { type: "PREVIOUS" });

    expect(run.simulatedIssue).toBeNull();
  });

  it("treats repeated permission requests as one idempotent recovery action", () => {
    const issue = demoGraph.scenarios.find((scenario) => scenario.id === "permission-denied");
    let run = transition(createRun(demoGraph, "tool-event"), { type: "REPORT_ISSUE", issue });
    run = transition(run, { type: "RECOVER", action: "request", reason: "ask once" });
    const snapshotCount = run.eventSnapshots.length;
    const traceCount = run.trace.length;

    const repeated = transition(run, { type: "RECOVER", action: "request", reason: "ask twice" });
    expect(repeated).toBe(run);
    expect(repeated.eventSnapshots).toHaveLength(snapshotCount);
    expect(repeated.trace).toHaveLength(traceCount);
  });

  it("keeps terminal cancellation immutable", () => {
    let run = createRun(demoGraph);
    run = transition(run, { type: "CANCEL" });
    expect(run.status).toBe("cancelled");
    expect(() => transition(run, { type: "ADVANCE" })).toThrow("Run is terminal");
  });
});

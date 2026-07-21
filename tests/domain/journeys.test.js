import { describe, expect, it } from "vitest";
import { demoGraph } from "../../src/data/demo-graph.js";
import { createRun, transition } from "../../src/domain/execution.js";

function finishRetrieval(run, choice) {
  let next = transition(run, { type: "CHOOSE_BRANCH", choice });
  for (const branch of next.selectedBranches) next = transition(next, { type: "COMPLETE_BRANCH", branch });
  next = transition(next, { type: "ADVANCE" });
  next = transition(next, { type: "ADVANCE" });
  return transition(next, { type: "ADVANCE" });
}

function finishResponse(run) {
  let next = transition(run, { type: "ADVANCE" });
  next = transition(next, { type: "ADVANCE" });
  return next;
}

function finishTools(run, choice = "external") {
  let next = transition(run, { type: "CHOOSE_BRANCH", choice });
  for (const item of next.parallelWork.selected) next = transition(next, { type: "COMPLETE_PARALLEL_ITEM", item });
  return transition(next, { type: "ADVANCE" });
}

describe("complete product journeys", () => {
  it.each(["vector", "web", "parallel"])("completes a RAG-only run through %s retrieval", (retrievalChoice) => {
    let run = transition(createRun(demoGraph, "llm-dispatch-event"), { type: "CHOOSE_BRANCH", choice: "rag" });
    run = finishRetrieval(run, retrievalChoice);
    expect(run).toMatchObject({ currentEventId: "llm-join-event", completedLanes: ["rag"] });
    run = finishResponse(run);
    expect(run.status).toBe("completed");
    expect(run.completedBranches).toHaveLength(retrievalChoice === "parallel" ? 2 : 1);
  });

  it("completes a Tools-only run through observation feedback", () => {
    let run = transition(createRun(demoGraph, "llm-dispatch-event"), { type: "CHOOSE_BRANCH", choice: "tools" });
    run = finishTools(run);
    run = transition(run, { type: "CHOOSE_BRANCH", choice: "finish" });
    expect(run).toMatchObject({ currentEventId: "llm-join-event", completedLanes: ["tools"] });
    run = finishResponse(run);
    expect(run.status).toBe("completed");
  });

  it("joins both top-level lanes before completing a parallel run", () => {
    let run = transition(createRun(demoGraph, "llm-dispatch-event"), { type: "CHOOSE_BRANCH", choice: "parallel" });
    run = finishRetrieval(run, "parallel");
    expect(run).toMatchObject({ currentEventId: "tool-select-event", completedLanes: ["rag"] });
    run = finishTools(run, "parallel");
    run = transition(run, { type: "CHOOSE_BRANCH", choice: "finish" });
    expect(run).toMatchObject({ currentEventId: "llm-join-event", completedLanes: ["rag", "tools"] });
    run = finishResponse(run);
    expect(run.status).toBe("completed");
  });

  it.each([
    ["no-results", "rag-join", "retry", "rag-retrieval", "paused"],
    ["no-results", "rag-join", "replan", "planning-event", "paused"],
    ["tool-timeout", "tool-event", "retry", "tool-event", "paused"],
    ["permission-denied", "tool-event", "confirm", "tool-event", "paused"],
    ["permission-denied", "tool-event", "cancel", "tool-event", "cancelled"],
    ["evaluation-failed", "observation-event", "retry", "observation-event", "paused"],
    ["evaluation-failed", "observation-event", "replan", "planning-event", "paused"],
    ["evaluation-failed", "observation-event", "finish", "final-event", "paused"],
  ])("recovers %s with %s into the expected state", (scenarioId, eventId, action, expectedEvent, expectedStatus) => {
    const issue = demoGraph.scenarios.find((scenario) => scenario.id === scenarioId);
    let run = transition(createRun(demoGraph, eventId), { type: "REPORT_ISSUE", issue });
    run = transition(run, { type: "RECOVER", action, reason: `${scenarioId}:${action}` });

    expect(run.currentEventId).toBe(expectedEvent);
    expect(run.status).toBe(expectedStatus);
    expect(run.simulatedIssue).toBeNull();
    expect(run.recovery.action).toBe(action);
  });
});

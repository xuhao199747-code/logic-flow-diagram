import { beforeEach, describe, expect, it } from "vitest";
import { demoGraph } from "../../src/data/demo-graph.js";
import { createRun, transition } from "../../src/domain/execution.js";
import { SESSION_KEY, restoreSession, saveSession, sessionKeyFor } from "../../src/domain/session.js";

describe("run session persistence", () => {
  beforeEach(() => sessionStorage.clear());

  it("restores scenario and execution progress without duplicating the graph", () => {
    let run = createRun(demoGraph);
    run = transition(run, { type: "ADVANCE" });

    expect(saveSession(sessionStorage, { scenarioId: "tool-timeout", run })).toBe(true);
    expect(sessionStorage.getItem(SESSION_KEY)).not.toContain('"graph"');

    const restored = restoreSession(sessionStorage, demoGraph);
    expect(restored.scenarioId).toBe("tool-timeout");
    expect(restored.run.graph).toBe(demoGraph);
    expect(restored.run.currentEventId).toBe("orchestrator-event");
    expect(restored.run.trace).toEqual(run.trace);
    expect(restored.run.history).toEqual(run.history);
  });

  it("restores partially completed parallel work", () => {
    let run = createRun(demoGraph, "planning-event");
    run = transition(run, { type: "COMPLETE_PARALLEL_ITEM", item: "planning" });

    expect(saveSession(sessionStorage, { scenarioId: "normal", run })).toBe(true);
    const restored = restoreSession(sessionStorage, demoGraph);

    expect(restored.run.parallelWork).toEqual({ kind: "cognition", selected: ["planning", "memory"], completed: ["planning"] });
  });

  it("stores each diagram run under an independent session key", () => {
    const first = transition(createRun(demoGraph), { type: "ADVANCE" });
    const second = createRun(demoGraph, "rag-route");

    saveSession(sessionStorage, { diagramId: "agent-execution", scenarioId: "normal", run: first });
    saveSession(sessionStorage, { diagramId: "another-flow", scenarioId: "normal", run: second });

    expect(sessionKeyFor("agent-execution")).not.toBe(sessionKeyFor("another-flow"));
    expect(restoreSession(sessionStorage, demoGraph, "agent-execution").run.currentEventId).toBe("orchestrator-event");
    expect(restoreSession(sessionStorage, demoGraph, "another-flow").run.currentEventId).toBe("rag-route");
  });

  it("restores each diagram canvas viewport with its run", () => {
    const canvasViewport = { zoom: 1.5, x: 120, y: 80 };
    saveSession(sessionStorage, {
      diagramId: "agent-execution",
      scenarioId: "normal",
      run: createRun(demoGraph),
      canvasViewport,
    });

    expect(restoreSession(sessionStorage, demoGraph, "agent-execution").canvasViewport).toEqual(canvasViewport);
  });

  it.each([
    ["invalid json", "{"],
    ["unknown version", JSON.stringify({ version: 99, scenarioId: "normal", run: {} })],
    ["unknown scenario", JSON.stringify({ version: 1, scenarioId: "missing", run: { currentEventId: "input-event" } })],
    ["unknown event", JSON.stringify({ version: 1, scenarioId: "normal", run: { currentEventId: "missing" } })],
  ])("rejects %s instead of booting into corrupt state", (_label, value) => {
    sessionStorage.setItem(SESSION_KEY, value);
    expect(restoreSession(sessionStorage, demoGraph)).toBeNull();
  });

  it("degrades safely when storage access is unavailable", () => {
    const unavailable = {
      getItem() { throw new DOMException("denied"); },
      setItem() { throw new DOMException("denied"); },
    };
    expect(restoreSession(unavailable, demoGraph)).toBeNull();
    expect(saveSession(unavailable, { scenarioId: "normal", run: createRun(demoGraph) })).toBe(false);
  });
});

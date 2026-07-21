import { afterEach, describe, expect, it, vi } from "vitest";
import { createRun, latestSnapshotForNode, transition } from "../src/domain/execution.js";
import { demoGraph } from "../src/data/demo-graph.js";
import { createViewport } from "../src/domain/viewport.js";
import { renderGraph } from "../src/ui/GraphView.js";
import { createAppView } from "../src/ui/AppView.js";
import { readFileSync } from "node:fs";

const advanceToRag = () => {
  let run = createRun(demoGraph);
  run = transition(run, { type: "ADVANCE" });
  run = transition(run, { type: "ADVANCE" });
  run = transition(run, { type: "COMPLETE_PARALLEL_ITEM", item: "planning" });
  run = transition(run, { type: "COMPLETE_PARALLEL_ITEM", item: "memory" });
  run = transition(run, { type: "CHOOSE_BRANCH", choice: "rag" });
  return run;
};

const completeExternalTool = () => {
  let run = transition(createRun(demoGraph, "tool-select-event"), { type: "CHOOSE_BRANCH", choice: "external" });
  return transition(run, { type: "COMPLETE_PARALLEL_ITEM", item: "external" });
};

describe("final review regressions", () => {
  afterEach(() => { vi.useRealTimers(); vi.resetModules(); document.body.innerHTML = ""; });

  it("persists selected branches and their projection through join and Previous", () => {
    let run = transition(advanceToRag(), { type: "CHOOSE_BRANCH", choice: "parallel" });
    expect(run.selectedBranches).toEqual(["vector", "web"]);
    expect(run.completedBranches).toEqual([]);

    run = transition(run, { type: "COMPLETE_BRANCH", branch: "vector" });
    expect(run.selectedBranches).toEqual(["vector", "web"]);
    expect(run.completedBranches).toEqual(["vector"]);

    run = transition(run, { type: "COMPLETE_BRANCH", branch: "web" });
    expect(run.currentEventId).toBe("rag-join");
    expect(run.selectedBranches).toEqual(["vector", "web"]);
    expect(run.completedBranches).toEqual(["vector", "web"]);

    run = transition(run, { type: "PREVIOUS" });
    expect(run.selectedBranches).toEqual(["vector", "web"]);
    expect(run.completedBranches).toEqual(["vector"]);
  });

  it("records immutable successful event snapshots after real transitions", () => {
    let run = createRun(demoGraph);
    run = transition(run, { type: "ADVANCE" });
    const initialSnapshot = run.eventSnapshots.at(-1);

    expect(initialSnapshot).toMatchObject({ eventId: "input-event", nodeId: "user-task", status: "success", output: "完成：接收用户任务", iteration: 1 });
    expect(Object.isFrozen(initialSnapshot)).toBe(true);

    let branchRun = transition(advanceToRag(), { type: "CHOOSE_BRANCH", choice: "parallel" });
    branchRun = transition(branchRun, { type: "COMPLETE_BRANCH", branch: "vector" });
    expect(branchRun.eventSnapshots.at(-1)).toMatchObject({ nodeId: "rag-route", status: "success", completedBranches: ["vector"] });
  });

  it("intentionally reruns from a real historical snapshot", () => {
    let run = transition(createRun(demoGraph), { type: "ADVANCE" });
    const initialSnapshot = latestSnapshotForNode(run, "user-task");

    run = transition(run, { type: "RERUN_SNAPSHOT", snapshotId: initialSnapshot.id, reason: "review replay" });
    expect(run.currentEventId).toBe("input-event");
    expect(run.eventSnapshots).toHaveLength(1);
    expect(run.trace).toHaveLength(0);
  });

  it.each([
    ["input-event", "user-task", "orchestrator-event", "ADVANCE", null],
    ["tool-event", "action", "action-event", "COMPLETE_PARALLEL_ITEM", "external"],
  ])("reruns a successful %s snapshot without restoring its outgoing transition", (eventId, nodeId, nextEventId, actionType, item) => {
    let run = eventId === "tool-event"
      ? completeExternalTool()
      : transition(createRun(demoGraph, eventId), { type: "ADVANCE" });
    const snapshot = latestSnapshotForNode(run, nodeId);
    const successfulTrace = structuredClone(snapshot.trace);

    run = transition(run, { type: "RERUN_SNAPSHOT", snapshotId: snapshot.id, reason: "review replay" });
    expect(run.currentEventId).toBe(eventId);
    expect(run.trace.some((entry) => entry.from === eventId)).toBe(false);
    expect(run.eventSnapshots).not.toContain(snapshot);
    expect(snapshot.trace).toEqual(successfulTrace);
    expect(Object.isFrozen(snapshot)).toBe(true);

    run = transition(run, { type: actionType, ...(item ? { item } : {}) });
    expect(run.currentEventId).toBe(nextEventId);
    expect(run.trace.filter((entry) => entry.from === eventId)).toHaveLength(1);
    expect(latestSnapshotForNode(run, nodeId)).toMatchObject({ status: "success" });
    expect(transition(run, { type: "PREVIOUS" }).currentEventId).toBe(eventId);
  });

  it("records recovery actions and makes each simulated issue recoverable", () => {
    const expected = {
      "no-results": ["retry", "replan"],
      "tool-timeout": ["retry"],
      "permission-denied": ["request", "confirm", "cancel"],
      "evaluation-failed": ["retry", "replan", "finish"],
    };

    for (const scenario of demoGraph.scenarios.filter((item) => item.id !== "normal")) {
      expect(scenario.recovery.map((item) => item.action)).toEqual(expected[scenario.id]);
    }

    const recovered = transition({ ...createRun(demoGraph, "tool-event"), simulatedIssue: demoGraph.scenarios[2] }, { type: "RECOVER", action: "retry", reason: "timeout retry" });
    expect(recovered.simulatedIssue).toBeNull();
    expect(recovered.iteration).toBe(2);
    expect(recovered.trace.at(-1)).toMatchObject({ relation: "retry", recovery: "retry", reason: "timeout retry" });
  });

  it("projects running, success, and skipped branches without treating choice as completion", () => {
    const run = transition(advanceToRag(), { type: "CHOOSE_BRANCH", choice: "vector" });
    const host = document.createElement("div");
    renderGraph(host, { graph: demoGraph, run, viewport: createViewport("rag-route", "rag"), onNodeSelect: vi.fn() });

    expect(host.querySelector('[data-node-id="vector-search"]').classList.contains("is-running")).toBe(true);
    expect(host.querySelector('[data-node-id="web-search"]').classList.contains("is-skipped")).toBe(true);
    expect(host.querySelector('[data-node-id="vector-search"]').classList.contains("is-complete")).toBe(false);
  });

  it("keeps completed parallel edges complete but not live in the graph", () => {
    let run = transition(advanceToRag(), { type: "CHOOSE_BRANCH", choice: "parallel" });
    run = transition(run, { type: "COMPLETE_BRANCH", branch: "vector" });
    const graphHost = document.createElement("div");
    const viewport = createViewport("rag-route", "rag");
    renderGraph(graphHost, { graph: demoGraph, run, viewport, onNodeSelect: vi.fn() });

    const graphEdges = [graphHost.querySelector('[data-edge-id="e7"]'), graphHost.querySelector('[data-edge-id="e8"]')];
    expect(graphEdges[0].classList.contains("is-complete")).toBe(true);
    expect(graphEdges[0].classList.contains("is-live")).toBe(false);
    expect(graphEdges[1].classList.contains("is-complete")).toBe(false);
    expect(graphEdges[1].classList.contains("is-live")).toBe(true);
  });

  it("highlights active callback endpoints before advance and keeps the target visible", () => {
    const run = createRun(demoGraph, "rag-callback");
    const host = document.createElement("div");
    renderGraph(host, { graph: demoGraph, run, viewport: createViewport("rag-context", "rag"), onNodeSelect: vi.fn() });

    expect(host.querySelector("svg").getAttribute("role")).toBe("group");
    expect(host.querySelector('[data-edge-id="e12"]').getAttribute("marker-end")).toContain("arrow");
    expect(host.querySelector('[data-edge-id="e12"]').getAttribute("aria-label")).toContain("回传");
    expect(host.querySelector('[data-node-id="rag-context"]').classList.contains("is-relation-endpoint")).toBe(true);
    expect(host.querySelector('[data-node-id="llm"]').classList.contains("is-relation-endpoint")).toBe(true);
    expect(host.querySelector('[data-node-id="llm"]').classList.contains("is-dimmed")).toBe(false);

    const css = readFileSync("src/styles.css", "utf8");
    const callback = host.querySelector('[data-edge-id="e12"]');
    expect(host.querySelector('[data-edge-pulse-for="e12"] animateMotion').getAttribute("path")).toBe(callback.getAttribute("d"));
    expect(css).toMatch(/\.edge-pulse__moving\s*\{[^}]*fill:/);
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*\.edge-pulse__moving\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*\.edge-pulse__static\s*\{[^}]*display:\s*block/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });

  it("retains historical snapshot data without exposing the removed inspector", () => {
    let run = completeExternalTool();
    const historicalSnapshot = run.eventSnapshots.at(-1);
    run = transition(run, { type: "ADVANCE" });
    const view = createAppView(document.body, { onNodeSelect: vi.fn() });
    view.render({ graph: demoGraph, run, viewport: { ...createViewport("tool-select", "tools"), viewing: { level: "node", moduleId: "tools", nodeId: "action" }, isViewingLive: false } });

    expect(historicalSnapshot.output).toBe("完成：执行工具分支");
    expect(document.querySelector(".inspector")).toBeNull();
    expect(document.querySelector('[data-action="rerun-snapshot"]')).toBeNull();
    expect(document.querySelector(".step-rail").textContent).toContain("评估执行结果");
    expect(run.currentEventId).toBe("observation-event");
  });

  it("retries no-results from retrieval with one iteration and resets branch completion", () => {
    let run = transition(advanceToRag(), { type: "CHOOSE_BRANCH", choice: "parallel" });
    run = transition(run, { type: "COMPLETE_BRANCH", branch: "vector" });
    run = transition(run, { type: "COMPLETE_BRANCH", branch: "web" });
    run = transition(run, { type: "REPORT_ISSUE", issue: demoGraph.scenarios.find((scenario) => scenario.id === "no-results") });
    const recovered = transition(run, { type: "RECOVER", action: "retry", reason: "review retry" });

    expect(recovered).toMatchObject({ currentEventId: "rag-retrieval", selectedBranches: ["vector", "web"], completedBranches: [], simulatedIssue: null, iteration: 2 });
    expect(recovered.trace.at(-1)).toMatchObject({ from: "rag-join", to: "rag-retrieval", relation: "retry", iteration: 2 });
  });

  it("hides ordinary decision choices while an evaluation issue is active", () => {
    const run = transition(createRun(demoGraph, "observation-event"), { type: "REPORT_ISSUE", issue: demoGraph.scenarios.find((scenario) => scenario.id === "evaluation-failed") });
    const view = createAppView(document.body, { onRecovery: vi.fn(), onNodeSelect: vi.fn(), onOverview: vi.fn(), onModuleFocus: vi.fn(), onToggleFollow: vi.fn(), onReturnLive: vi.fn(), onCloseInspector: vi.fn() });
    view.render({ graph: demoGraph, run, viewport: createViewport("observation", "tools"), scenarioId: "evaluation-failed" });

    expect(document.querySelectorAll("[data-branch-choice]")).toHaveLength(0);
    expect(document.querySelectorAll('[data-action="recovery"]')).toHaveLength(3);
    expect(document.querySelector(".issue-banner").textContent).toContain("评估不通过");
    expect(document.querySelector(".issue-banner").textContent).not.toContain("观察评分不足，需要重试或重新规划");
  });

  it("keeps recovery controls beside a fixed rail without spatial-navigation UI", () => {
    const blocked = { ...createRun(demoGraph, "tool-event"), simulatedIssue: demoGraph.scenarios[3], status: "blocked" };
    const view = createAppView(document.body, { onRecovery: vi.fn(), onNodeSelect: vi.fn() });
    view.render({ graph: demoGraph, run: blocked, viewport: createViewport("action", "tools"), scenarioId: "permission-denied", minimapCollapsed: true });

    expect(document.querySelector('[data-action="primary"]').disabled).toBe(true);
    expect(document.querySelectorAll('[data-action="recovery"]')).toHaveLength(3);
    expect(document.querySelector('[data-action="minimap-toggle"]')).toBeNull();
    expect(document.querySelector(".minimap")).toBeNull();
    expect(document.querySelector(".inspector")).toBeNull();
    expect(document.querySelector(".step-rail").closest(".flow-stage")).toBe(document.querySelector(".flow-stage"));

    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\.flow-stage\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 260px;/);
  });

  it("does not bind Escape to removed hierarchical navigation", async () => {
    document.body.innerHTML = '<main id="app"></main>';
    await import("../src/main.js?escape-hierarchy-review");
    const before = document.querySelector("[data-testid=breadcrumb]").textContent;
    document.querySelector('[data-action="scenario"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(document.querySelector("[data-testid=breadcrumb]").textContent).toBe(before);
    expect(document.querySelector('[data-layer="scene"]')).toBeNull();
  });
});

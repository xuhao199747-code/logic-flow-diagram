import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderGraph } from "../../src/ui/GraphView.js";
import { demoGraph } from "../../src/data/demo-graph.js";
import { createRun, transition } from "../../src/domain/execution.js";
import { createViewport } from "../../src/domain/viewport.js";
import { readFileSync } from "node:fs";

describe("GraphView", () => {
  beforeEach(() => { document.body.innerHTML = '<div id="graph"></div>'; });

  const groupIds = demoGraph.groups.map((group) => group.id).sort();
  const edgeIds = demoGraph.edges.map((edge) => edge.id).sort();

  function render(state) {
    renderGraph(document.querySelector("#graph"), { graph: demoGraph, ...state, onNodeSelect: vi.fn() });
  }

  function assertCompleteOverview() {
    expect([...document.querySelectorAll("[data-group-id]")].map((group) => group.dataset.groupId).sort()).toEqual(groupIds);
    expect(document.querySelectorAll("[data-topology-edge]")).toHaveLength(demoGraph.topologyEdges.length);
    expect([...document.querySelectorAll("[data-edge-id]")].map((edge) => edge.dataset.edgeId).sort()).toEqual(edgeIds);
    expect(document.querySelector('[data-layer="scene"]')).toBeNull();
    expect(document.querySelectorAll(".graph-module.is-dimmed, .graph-node.is-dimmed")).toHaveLength(0);
  }

  it("highlights only the hovered node and its direct upstream/downstream relationships", () => {
    render({ run: createRun(demoGraph), viewport: createViewport() });
    const query = document.querySelector('[data-detail-node-id="rag-query"]');
    query.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

    expect(query.classList.contains("is-inspected")).toBe(true);
    expect(document.querySelector('[data-topology-edge="llm->rag-query"]').classList.contains("is-related")).toBe(true);
    expect(document.querySelector('[data-topology-edge="rag-query->rag-routing"]').classList.contains("is-related")).toBe(true);
    expect(document.querySelector('[data-topology-edge="action->observation"]').classList.contains("is-context-dimmed")).toBe(true);

    query.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    expect(document.querySelectorAll(".is-related, .is-context-dimmed, .is-inspected")).toHaveLength(0);
  });

  it("supports pointer hover used by real browsers", () => {
    render({ run: createRun(demoGraph), viewport: createViewport() });
    const query = document.querySelector('[data-detail-node-id="rag-query"]');
    query.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    expect(query.classList.contains("is-inspected")).toBe(true);
    expect(document.querySelector('[data-topology-edge="llm->rag-query"]').classList.contains("is-related")).toBe(true);

    query.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    expect(document.querySelectorAll(".is-related, .is-context-dimmed, .is-inspected")).toHaveLength(0);
  });

  it("dims unrelated active module frames while preserving the hovered detail hierarchy", () => {
    render({ run: createRun(demoGraph, "tool-event"), viewport: createViewport() });
    const longTerm = document.querySelector('[data-detail-node-id="memory-long-term"]');
    const shortTerm = document.querySelector('[data-detail-node-id="memory-short-term"]');
    const memoryGroup = document.querySelector('[data-group-id="memory-group"]');
    const coreGroup = document.querySelector('[data-group-id="core-group"]');
    const toolsGroup = document.querySelector('[data-group-id="tools-group"]');

    longTerm.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    expect(longTerm.classList.contains("is-inspected")).toBe(true);
    expect(shortTerm.classList.contains("is-inspected")).toBe(false);
    expect(shortTerm.classList.contains("is-context-dimmed")).toBe(true);
    expect(memoryGroup.classList.contains("is-context-dimmed")).toBe(false);
    expect(coreGroup.classList.contains("is-context-dimmed")).toBe(false);
    expect(toolsGroup.classList.contains("is-context-dimmed")).toBe(true);

    longTerm.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    expect(document.querySelectorAll(".is-related, .is-context-dimmed, .is-inspected")).toHaveLength(0);
  });

  it("opens node detail on click or keyboard without advancing execution", () => {
    const onNodeSelect = vi.fn();
    const run = createRun(demoGraph, "rag-route");
    renderGraph(document.querySelector("#graph"), { graph: demoGraph, run, onNodeSelect });
    const route = document.querySelector('[data-detail-node-id="rag-routing"]');

    route.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onNodeSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "rag-routing", type: "detail" }));
    expect(run.currentEventId).toBe("rag-route");

    route.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onNodeSelect).toHaveBeenCalledTimes(2);
  });

  it("draws the six reference layers in their exact visual order", () => {
    renderGraph(document.querySelector("#graph"), { graph: demoGraph, run: createRun(demoGraph), viewport: createViewport(), onNodeSelect: vi.fn() });

    const root = document.querySelector("svg");
    const edgesLayer = document.querySelector('[data-layer="topology-edges"]');
    const nodesLayer = document.querySelector('[data-layer="nodes"]');
    expect(root.getAttribute("viewBox")).toBe("0 0 1400 800");
    expect([...root.children].filter((child) => child.hasAttribute("data-layer")).map((child) => child.dataset.layer)).toEqual([
      "groups",
      "topology-edges",
      "relation-labels",
      "nodes",
      "guardrails",
      "live-pulses",
    ]);
    const edges = edgesLayer.querySelectorAll("[data-topology-edge]");
    expect(edges).toHaveLength(demoGraph.topologyEdges.length);
    for (const edge of edges) expect(edge.getAttribute("marker-end")).toBeTruthy();
    expect(nodesLayer).not.toBeNull();
    expect(document.querySelectorAll("[data-module-id]")).toHaveLength(0);
  });

  it("adds canvas zoom controls and preserves zoom while execution advances", () => {
    const host = document.querySelector("#graph");
    renderGraph(host, { graph: demoGraph, run: createRun(demoGraph), onNodeSelect: vi.fn() });

    expect([...host.querySelectorAll(".canvas-controls button")].map((button) => button.dataset.canvasAction))
      .toEqual(["zoom-out", "zoom-in", "fit"]);
    expect(host.querySelector("[data-canvas-zoom]").textContent).toBe("100%");

    host.querySelector('[data-canvas-action="zoom-in"]').click();
    const zoomedViewBox = host.querySelector("svg").getAttribute("viewBox");
    expect(zoomedViewBox).not.toBe("0 0 1400 800");
    expect(host.querySelector("[data-canvas-zoom]").textContent).toBe("125%");

    renderGraph(host, { graph: demoGraph, run: createRun(demoGraph, "orchestrator-event"), onNodeSelect: vi.fn() });
    expect(host.querySelector("svg").getAttribute("viewBox")).toBe(zoomedViewBox);
    expect(host.querySelector("[data-canvas-zoom]").textContent).toBe("125%");
  });

  it("fits the full diagram again from the canvas controls", () => {
    const host = document.querySelector("#graph");
    renderGraph(host, { graph: demoGraph, run: createRun(demoGraph), onNodeSelect: vi.fn() });
    host.querySelector('[data-canvas-action="zoom-in"]').click();
    host.querySelector('[data-canvas-action="fit"]').click();

    expect(host.querySelector("svg").getAttribute("viewBox")).toBe("0 0 1400 800");
    expect(host.querySelector("[data-canvas-zoom]").textContent).toBe("100%");
  });

  it("separates macro routes from internal routes with a distinct module identity", () => {
    render({ run: createRun(demoGraph, "planning-event"), viewport: createViewport() });

    const expected = [
      ["user-task->orchestrator", "orchestration", "macro"],
      ["llm->planning", "planning", "macro"],
      ["llm->memory", "memory", "macro"],
      ["llm->rag-query", "rag", "macro"],
      ["rag-query->rag-routing", "rag", "micro"],
      ["llm->tools-group", "tools", "macro"],
      ["code-execution-sandbox->action", "tools", "micro"],
      ["action->observation", "feedback", "macro"],
      ["llm->final-response", "output", "macro"],
    ];

    for (const [key, module, level] of expected) {
      const edge = document.querySelector(`[data-topology-edge="${key}"]`);
      expect(edge.dataset.flowModule).toBe(module);
      expect(edge.dataset.flowLevel).toBe(level);
      expect(edge.classList.contains(`flow-${level}`)).toBe(true);
    }
  });

  it("carries module identity through groups, nodes, dependency routes, and live pulses", () => {
    let run = transition(createRun(demoGraph, "llm-dispatch-event"), { type: "CHOOSE_BRANCH", choice: "parallel" });
    render({ run, viewport: createViewport() });

    expect(document.querySelector('[data-group-id="planning-group"]').dataset.flowModule).toBe("planning");
    expect(document.querySelector('[data-group-id="memory-group"]').dataset.flowModule).toBe("memory");
    expect(document.querySelector('[data-group-id="rag-group"]').dataset.flowModule).toBe("rag");
    expect(document.querySelector('[data-group-id="tools-group"]').dataset.flowModule).toBe("tools");
    expect(document.querySelector('[data-node-id="observation"]').dataset.flowModule).toBe("feedback");
    expect(document.querySelector('[data-node-id="final-response"]').dataset.flowModule).toBe("output");

    const dependency = document.querySelector('[data-projection-edge="rag-context-assembly->context-dependency-gate"]');
    expect(dependency.dataset.flowModule).toBe("rag");
    expect(dependency.dataset.flowLevel).toBe("macro");
    const pulse = document.querySelector('[data-topology-edge-pulse-for="llm->rag-query"]');
    expect(pulse.dataset.flowModule).toBe("rag");
    expect(pulse.dataset.flowLevel).toBe("macro");
  });

  it("defines seven dark-theme module colors and lets completion green override live module color", () => {
    const css = readFileSync("src/styles.css", "utf8");
    for (const module of ["orchestration", "planning", "memory", "rag", "tools", "feedback", "output"]) {
      expect(css).toContain(`--flow-${module}:`);
      expect(css).toContain(`[data-flow-module="${module}"]`);
    }
    expect(css).toMatch(/\.graph-edge\.flow-macro\s*\{[^}]*stroke-width:\s*1\.9/s);
    expect(css).toMatch(/\.graph-edge\.flow-micro\s*\{[^}]*stroke-width:\s*1\.1/s);
    expect(css.indexOf(".graph-edge[data-flow-module].is-complete")).toBeGreaterThan(css.indexOf(".graph-edge[data-flow-module].is-live"));
  });

  it("anchors a straight edge to node rectangle boundaries rather than centers", () => {
    render({ run: createRun(demoGraph), viewport: createViewport() });

    const coordinates = document.querySelector('[data-edge-id="e2"]')
      .getAttribute("d")
      .match(/-?\d+(?:\.\d+)?/g)
      .map(Number);

    expect(coordinates).toEqual([510, 211, 510, 235]);
    expect(coordinates).not.toEqual([510, 188, 510, 258]);
  });

  it("marks the Chinese group and visible node names as primary labels", () => {
    render({ run: createRun(demoGraph), viewport: createViewport() });

    for (const group of demoGraph.groups) {
      const primary = document.querySelector(`[data-group-id="${group.id}"] .primary-label`);
      expect(primary).not.toBeNull();
      expect(primary.textContent).toBe(group.label.zh);
    }
    for (const node of demoGraph.nodes) {
      const rendered = document.querySelector(`[data-node-id="${node.id}"]`);
      expect(rendered).not.toBeNull();
      if (rendered.classList.contains("graph-node--proxy")) {
        expect(rendered.getAttribute("aria-hidden")).toBe("true");
      } else {
        expect(rendered.getAttribute("aria-label")).toContain(node.label.zh);
      }
    }
  });

  it.each([
    ["initial", () => ({ run: createRun(demoGraph), viewport: createViewport() })],
    ["historical node view", () => ({
      run: createRun(demoGraph, "rag-context-event"),
      viewport: { ...createViewport("rag-context-event", "rag"), viewing: { level: "node", moduleId: "rag", nodeId: "rag-context" }, isViewingLive: false },
    })],
    ["decision", () => ({ run: createRun(demoGraph, "rag-route"), viewport: createViewport("rag-route", "rag") })],
    ["one of two parallel branches complete", () => {
      const selected = transition(createRun(demoGraph, "rag-route"), { type: "CHOOSE_BRANCH", choice: "parallel" });
      return { run: transition(selected, { type: "COMPLETE_BRANCH", branch: "vector" }), viewport: createViewport("rag-retrieval", "rag") };
    }],
    ["callback", () => ({ run: createRun(demoGraph, "rag-callback"), viewport: createViewport("rag-context", "rag") })],
    ["retry", () => ({ run: transition(createRun(demoGraph, "tool-event"), { type: "RETRY" }), viewport: createViewport("action", "tools") })],
    ["replan", () => ({ run: transition(createRun(demoGraph, "observation-event"), { type: "REPLAN", reason: "low score" }), viewport: createViewport("planning", "core") })],
  ])("keeps the full architecture visible for %s", (_state, stateForCase) => {
    render(stateForCase());

    assertCompleteOverview();
  });

  it("marks callback edges and live nodes", () => {
    renderGraph(document.querySelector("#graph"), { graph: demoGraph, run: createRun(demoGraph, "rag-callback"), viewport: createViewport("rag-context", "rag"), onNodeSelect: vi.fn() });
    expect(document.querySelector('[data-node-id="rag-context"]').classList.contains("is-live")).toBe(true);
    expect(document.querySelector('[data-edge-id="e12"]').classList.contains("is-callback")).toBe(true);
  });

  it("completes only the selected RAG branch while marking unselected branches skipped", () => {
    const run = transition(createRun(demoGraph, "rag-route"), { type: "CHOOSE_BRANCH", choice: "web" });
    renderGraph(document.querySelector("#graph"), { graph: demoGraph, run, viewport: createViewport("rag-route", "rag"), onNodeSelect: vi.fn() });
    const vectorEdge = document.querySelector('[data-edge-id="e7"]');
    const webEdge = document.querySelector('[data-edge-id="e8"]');
    expect(vectorEdge.classList.contains("is-skipped")).toBe(true);
    expect(vectorEdge.classList.contains("is-complete")).toBe(false);
    expect(webEdge.classList.contains("is-live")).toBe(true);
    expect(webEdge.classList.contains("is-complete")).toBe(false);
  });

  it("keeps a web-only trace selected after its branch joins", () => {
    let run = transition(createRun(demoGraph, "rag-route"), { type: "CHOOSE_BRANCH", choice: "web" });
    run = transition(run, { type: "COMPLETE_BRANCH", branch: "web" });
    renderGraph(document.querySelector("#graph"), { graph: demoGraph, run, viewport: createViewport("rag-merge", "rag"), onNodeSelect: vi.fn() });
    const vectorEdge = document.querySelector('[data-edge-id="e7"]');
    const webEdge = document.querySelector('[data-edge-id="e8"]');
    expect(webEdge.classList.contains("is-complete")).toBe(true);
    expect(vectorEdge.classList.contains("is-complete")).toBe(false);
    expect(vectorEdge.classList.contains("is-skipped")).toBe(true);
  });

  it.each([
    ["vector", "e9", "e10"],
    ["web", "e10", "e9"],
  ])("projects only the %s branch through its join edge", (branch, selectedEdgeId, skippedEdgeId) => {
    let run = transition(createRun(demoGraph, "rag-route"), { type: "CHOOSE_BRANCH", choice: branch });
    run = transition(run, { type: "COMPLETE_BRANCH", branch });
    render({ run, viewport: createViewport("rag-merge", "rag") });

    const selected = document.querySelector(`[data-edge-id="${selectedEdgeId}"]`);
    const skipped = document.querySelector(`[data-edge-id="${skippedEdgeId}"]`);
    const merge = document.querySelector('[data-node-id="rag-merge"]');
    expect(selected.classList.contains("is-live")).toBe(true);
    expect(selected.classList.contains("is-complete")).toBe(false);
    expect(skipped.classList.contains("is-skipped")).toBe(true);
    expect(skipped.classList.contains("is-live")).toBe(false);
    expect(skipped.classList.contains("is-complete")).toBe(false);
    expect(merge.classList.contains("is-live")).toBe(true);
    expect(merge.classList.contains("is-skipped")).toBe(false);

    run = transition(run, { type: "ADVANCE" });
    render({ run, viewport: createViewport("rag-context", "rag") });
    expect(document.querySelector(`[data-edge-id="${selectedEdgeId}"]`).classList.contains("is-complete")).toBe(true);
    expect(document.querySelector(`[data-edge-id="${selectedEdgeId}"]`).classList.contains("is-live")).toBe(false);
    expect(document.querySelector(`[data-edge-id="${skippedEdgeId}"]`).classList.contains("is-skipped")).toBe(true);
    expect(document.querySelector(`[data-edge-id="${skippedEdgeId}"]`).classList.contains("is-complete")).toBe(false);
    expect(document.querySelector('[data-node-id="rag-merge"]').classList.contains("is-complete")).toBe(true);
    expect(document.querySelector('[data-node-id="rag-merge"]').classList.contains("is-skipped")).toBe(false);
  });

  it.each([
    ["sequence", "e1", () => createRun(demoGraph)],
    ["module", "e3", () => createRun(demoGraph, "planning-event")],
    ["parallel", "e7", () => transition(createRun(demoGraph, "rag-route"), { type: "CHOOSE_BRANCH", choice: "vector" })],
    ["join", "e9", () => transition(transition(createRun(demoGraph, "rag-route"), { type: "CHOOSE_BRANCH", choice: "vector" }), { type: "COMPLETE_BRANCH", branch: "vector" })],
    ["callback", "e12", () => createRun(demoGraph, "rag-callback")],
    ["retry", "e18", () => transition(createRun(demoGraph, "observation-event"), { type: "CHOOSE_BRANCH", choice: "retry" })],
    ["replan", "e16", () => transition(createRun(demoGraph, "observation-event"), { type: "CHOOSE_BRANCH", choice: "replan" })],
  ])("renders a path-derived moving pulse for an active %s edge", (_type, edgeId, runForCase) => {
    render({ run: runForCase(), viewport: createViewport() });

    const edge = document.querySelector(`[data-edge-id="${edgeId}"]`);
    const pulse = document.querySelector(`[data-edge-pulse-for="${edgeId}"]`);
    expect(edge.classList.contains("is-live")).toBe(true);
    expect(pulse).not.toBeNull();
    expect(pulse.querySelector("animateMotion").getAttribute("path")).toBe(edge.getAttribute("d"));
    for (const livePath of document.querySelectorAll(".graph-edge.is-live")) {
      const livePulse = livePath.dataset.topologyEdge
        ? document.querySelector(`[data-topology-edge-pulse-for="${livePath.dataset.topologyEdge}"]`)
        : document.querySelector(`[data-edge-pulse-for="${livePath.dataset.edgeId}"]`);
      expect(livePulse).not.toBeNull();
      expect(livePulse.querySelector("animateMotion").getAttribute("path")).toBe(livePath.getAttribute("d"));
    }
  });

  it("removes the pulse when a completed edge is no longer active", () => {
    let run = transition(createRun(demoGraph, "tool-select-event"), { type: "CHOOSE_BRANCH", choice: "external" });
    run = transition(run, { type: "COMPLETE_PARALLEL_ITEM", item: "external" });
    run = transition(run, { type: "ADVANCE" });
    run = transition(run, { type: "CHOOSE_BRANCH", choice: "retry" });
    run = transition(run, { type: "COMPLETE_PARALLEL_ITEM", item: "external" });
    render({ run, viewport: createViewport() });

    const retry = document.querySelector('[data-edge-id="e18"]');
    expect(retry.classList.contains("is-complete")).toBe(true);
    expect(retry.classList.contains("is-live")).toBe(false);
    expect(document.querySelector('[data-edge-pulse-for="e18"]')).toBeNull();
  });

  it("renders the terminal current node as complete rather than still live", () => {
    const completed = transition(createRun(demoGraph, "final-event"), { type: "ADVANCE" });
    render({ run: completed, viewport: createViewport() });

    const finalResponse = document.querySelector('[data-node-id="final-response"]');
    expect(finalResponse.classList.contains("is-complete")).toBe(true);
    expect(finalResponse.classList.contains("is-live")).toBe(false);
    expect(finalResponse.querySelector(".status-label")).toBeNull();
    expect(finalResponse.textContent).not.toContain("Completed");
    expect(finalResponse.querySelector(".completion-indicator")).not.toBeNull();
    expect(finalResponse.querySelector(".completion-indicator").getAttribute("cx")).toBe("170");
    expect(finalResponse.querySelector(".completion-indicator").getAttribute("cy")).toBe("10");
    expect(finalResponse.getAttribute("aria-label")).toContain("完成");
  });

  it("completes only the chosen observation outcome", () => {
    const run = transition(createRun(demoGraph, "observation-event"), { type: "CHOOSE_BRANCH", choice: "retry" });
    renderGraph(document.querySelector("#graph"), { graph: demoGraph, run, viewport: createViewport("action", "tools"), onNodeSelect: vi.fn() });
    expect(document.querySelector('[data-edge-id="e18"]').classList.contains("is-complete")).toBe(true);
    expect(document.querySelector('[data-edge-id="e16"]').classList.contains("is-complete")).toBe(false);
    expect(document.querySelector('[data-edge-id="e19"]').classList.contains("is-complete")).toBe(false);
  });

  it("completes only the direct replan edge from observation", () => {
    const run = transition(createRun(demoGraph, "observation-event"), { type: "REPLAN", reason: "low score" });
    renderGraph(document.querySelector("#graph"), { graph: demoGraph, run, viewport: createViewport("planning", "core"), onNodeSelect: vi.fn() });
    expect(document.querySelector('[data-edge-id="e16"]').classList.contains("is-complete")).toBe(true);
    expect(document.querySelector('[data-edge-id="e18"]').classList.contains("is-complete")).toBe(false);
    expect(document.querySelector('[data-edge-id="e19"]').classList.contains("is-complete")).toBe(false);
  });

  it("does not complete unrelated edges for a direct retry without a matching source edge", () => {
    const run = transition(createRun(demoGraph, "tool-event"), { type: "RETRY" });
    renderGraph(document.querySelector("#graph"), { graph: demoGraph, run, viewport: createViewport("action", "tools"), onNodeSelect: vi.fn() });
    expect(document.querySelector('[data-edge-id="e15"]').classList.contains("is-complete")).toBe(false);
    expect(document.querySelectorAll(".graph-edge.is-complete")).toHaveLength(0);
  });

  it("renders a direct retry from an event without edge ids without completing any edge", () => {
    const run = transition(createRun(demoGraph, "final-event"), { type: "RETRY" });
    renderGraph(document.querySelector("#graph"), { graph: demoGraph, run, viewport: createViewport("final-response", "response"), onNodeSelect: vi.fn() });
    expect(document.querySelectorAll(".graph-edge.is-complete")).toHaveLength(0);
  });

  it("renders Chinese group headers with a smaller English support label", () => {
    renderGraph(document.querySelector("#graph"), { graph: demoGraph, run: createRun(demoGraph), viewport: createViewport(), onNodeSelect: vi.fn() });
    const coreGroup = document.querySelector('[data-group-id="core-group"]');
    const support = coreGroup.querySelector(".group-en");
    expect(coreGroup.textContent).toContain("核心");
    expect(support.textContent).toBe("Core");
    expect(support.getAttribute("font-size")).toBe("9");
  });

  it("renders informative SVG nodes with accessible labels and textual status", () => {
    renderGraph(document.querySelector("#graph"), {
      graph: demoGraph,
      run: { ...createRun(demoGraph), status: "failed" },
      viewport: createViewport(),
      onNodeSelect: vi.fn(),
    });

    const live = document.querySelector('[data-node-id="user-task"]');
    expect(live.getAttribute("role")).toBe("button");
    expect(live.getAttribute("tabindex")).toBe("0");
    expect(live.getAttribute("aria-label")).toContain("用户任务");
    expect(live.classList.contains("is-failed")).toBe(true);
    expect(live.querySelector(".status-label").textContent).toContain("失败");
  });

  it("keeps invisible executable projections out of keyboard and screen-reader navigation", () => {
    renderGraph(document.querySelector("#graph"), {
      graph: demoGraph,
      run: createRun(demoGraph, "rag-route"),
      viewport: createViewport(),
      onNodeSelect: vi.fn(),
    });

    const proxy = document.querySelector('[data-node-id="rag-route"]');
    expect(proxy.classList.contains("graph-node--proxy")).toBe(true);
    expect(proxy.getAttribute("aria-hidden")).toBe("true");
    expect(proxy.hasAttribute("role")).toBe(false);
    expect(proxy.hasAttribute("tabindex")).toBe(false);
    expect(proxy.querySelector("rect")).toBeNull();
    expect(proxy.children).toHaveLength(0);
    expect(document.querySelector('[data-detail-node-id="rag-routing"]').getAttribute("role")).toBe("button");
  });

  it("does not draw a duplicate proxy outline over an active visible detail card", () => {
    renderGraph(document.querySelector("#graph"), {
      graph: demoGraph,
      run: createRun(demoGraph, "tool-select-event"),
      viewport: createViewport(),
      onNodeSelect: vi.fn(),
    });

    const detail = document.querySelector('[data-detail-node-id="external-environment-business-system"]');
    const proxy = document.querySelector('[data-node-id="tool-select"]');
    expect(detail.classList.contains("is-live")).toBe(true);
    expect(detail.querySelectorAll(":scope > rect")).toHaveLength(1);
    expect(proxy.classList.contains("is-live")).toBe(true);
    expect(proxy.querySelector("rect")).toBeNull();
  });

  it("opens SVG node detail by click, Enter, or Space", () => {
    const onNodeSelect = vi.fn();
    renderGraph(document.querySelector("#graph"), {
      graph: demoGraph,
      run: createRun(demoGraph),
      viewport: createViewport(),
      onNodeSelect,
    });

    const node = document.querySelector('[data-node-id="user-task"]');
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    node.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));

    expect(onNodeSelect).toHaveBeenCalledTimes(3);
    expect(onNodeSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "user-task", type: "executable" }));
  });

  it("uses one graph tab stop and arrow keys to move focus between nodes", () => {
    renderGraph(document.querySelector("#graph"), {
      graph: demoGraph,
      run: createRun(demoGraph),
      viewport: createViewport(),
      onNodeSelect: vi.fn(),
    });

    const userTask = document.querySelector('[data-node-id="user-task"]');
    expect(userTask.getAttribute("tabindex")).toBe("0");
    expect(document.querySelectorAll('.architecture-graph [role="button"][tabindex="0"]')).toHaveLength(1);

    userTask.focus();
    userTask.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(document.querySelector('[data-node-id="orchestrator"]'));
    expect(userTask.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement.getAttribute("tabindex")).toBe("0");
  });

  it("exposes concise keyboard instructions for the interactive graph", () => {
    renderGraph(document.querySelector("#graph"), {
      graph: demoGraph,
      run: createRun(demoGraph),
      viewport: createViewport(),
      onNodeSelect: vi.fn(),
    });

    const graph = document.querySelector(".architecture-graph");
    expect(graph.getAttribute("aria-describedby")).toBe("graph-keyboard-help");
    expect(graph.querySelector("#graph-keyboard-help").textContent).toContain("方向键");
    expect(graph.querySelector("#graph-keyboard-help").textContent).toContain("Arrow keys");
  });

  it("uses the visible detail alias as the graph tab stop for proxy execution nodes", () => {
    renderGraph(document.querySelector("#graph"), {
      graph: demoGraph,
      run: createRun(demoGraph, "rag-route"),
      viewport: createViewport(),
      onNodeSelect: vi.fn(),
    });

    expect(document.querySelector('[data-detail-node-id="rag-routing"]').getAttribute("tabindex")).toBe("0");
    expect(document.querySelector('[data-node-id="rag-route"]').getAttribute("aria-hidden")).toBe("true");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoGraph } from "../../src/data/demo-graph.js";
import { createRun, transition } from "../../src/domain/execution.js";
import { renderGraph } from "../../src/ui/GraphView.js";

const topologyKey = ({ from, to }) => `${from}->${to}`;

function translatedBounds(element) {
  const [, x, y] = element.getAttribute("transform").match(/translate\(([-\d.]+)[ ,]([-\d.]+)\)/).map(Number);
  const rect = element.querySelector(":scope > rect");
  return { x, y, w: Number(rect.getAttribute("width")), h: Number(rect.getAttribute("height")) };
}

function onBoundary({ x, y }, bounds) {
  const onVertical = (x === bounds.x || x === bounds.x + bounds.w) && y >= bounds.y && y <= bounds.y + bounds.h;
  const onHorizontal = (y === bounds.y || y === bounds.y + bounds.h) && x >= bounds.x && x <= bounds.x + bounds.w;
  return onVertical || onHorizontal;
}

describe("reference hierarchy layout", () => {
  beforeEach(() => { document.body.innerHTML = '<div id="graph"></div>'; });

  function render(run = createRun(demoGraph)) {
    renderGraph(document.querySelector("#graph"), { graph: demoGraph, run, onNodeSelect: vi.fn() });
  }

  it("renders clean nested panels without an outer frame and keeps bilingual group semantics", () => {
    render();

    const system = document.querySelector('[data-system-boundary="agent-system"]');
    expect(system).toBeNull();

    for (const group of demoGraph.groups) {
      const rendered = document.querySelector(`[data-group-id="${group.id}"]`);
      expect(rendered.classList.contains("reference-group")).toBe(true);
      expect(rendered.classList.contains(`parent-${group.parentId}`)).toBe(true);
      expect(rendered.classList.contains(`layout-${group.layout}`)).toBe(true);
      expect(rendered.getAttribute("role")).toBe("group");
      expect(rendered.getAttribute("aria-label")).toContain(group.label.en);
    }

    for (const detail of demoGraph.detailNodes) {
      const rendered = document.querySelector(`[data-detail-node-id="${detail.id}"]`);
      expect(rendered.classList.contains("detail-node")).toBe(true);
      expect(rendered.classList.contains(`in-${detail.groupId}`)).toBe(true);
      expect(rendered.getAttribute("role")).toBe("button");
      expect(["-1", "0"]).toContain(rendered.getAttribute("tabindex"));
      expect(rendered.getAttribute("aria-label")).toContain(`${detail.label.zh} ${detail.label.en}`);
      expect(rendered.textContent).toContain(detail.label.zh);
      expect(rendered.textContent).toContain(detail.label.en);
    }

    const toolDetails = demoGraph.detailNodes.filter((detail) => detail.description);
    for (const detail of toolDetails) {
      const rendered = document.querySelector(`[data-detail-node-id="${detail.id}"]`);
      expect(rendered.querySelector(".detail-label").textContent).toBe(detail.label.zh);
      expect(rendered.querySelector(".detail-en").textContent).toBe(detail.label.en);
      expect(rendered.textContent).toContain(detail.description.zh);
      expect(rendered.textContent).toContain(detail.description.en);
    }
    expect(document.querySelectorAll('[data-detail-node-id][role="button"]')).toHaveLength(demoGraph.detailNodes.length + 1);
    expect(document.querySelectorAll('.architecture-graph [role="button"][tabindex="0"]')).toHaveLength(1);
  });

  it("uses only the explicit 1400 by 800 reference positions for the required hierarchy", () => {
    render();

    const core = translatedBounds(document.querySelector('[data-group-id="core-group"]'));
    const rag = translatedBounds(document.querySelector('[data-group-id="rag-group"]'));
    const tools = translatedBounds(document.querySelector('[data-group-id="tools-group"]'));
    const user = translatedBounds(document.querySelector('[data-node-id="user-task"]'));
    const finalResponse = translatedBounds(document.querySelector('[data-node-id="final-response"]'));
    const action = translatedBounds(document.querySelector('[data-node-id="action"]'));
    const observation = translatedBounds(document.querySelector('[data-node-id="observation"]'));

    expect(user).toEqual(demoGraph.nodes.find((node) => node.id === "user-task").referencePosition);
    expect(finalResponse).toEqual(demoGraph.nodes.find((node) => node.id === "final-response").referencePosition);
    expect(user.y + user.h).toBeLessThan(core.y);
    expect(finalResponse.x + finalResponse.w).toBeLessThan(core.x);
    expect(core.x + core.w).toBeLessThan(rag.x);
    expect(rag.x - (core.x + core.w)).toBeGreaterThanOrEqual(80);
    expect(core.y - (user.y + user.h)).toBeGreaterThanOrEqual(55);
    expect(tools.y).toBeGreaterThan(core.y);
    expect(tools.y - (core.y + core.h)).toBeGreaterThanOrEqual(70);
    expect(action.x).toBeGreaterThan(tools.x);
    expect(observation.x).toBeGreaterThan(action.x);
    expect(document.querySelector('[data-layer="guardrails"] rect').getAttribute("width")).toBe("1400");
  });

  it("keeps branch titles in a dedicated header band above their first cards", () => {
    for (const groupId of ["vector-data-branch", "web-branch"]) {
      const group = demoGraph.groups.find((item) => item.id === groupId);
      const cards = demoGraph.detailNodes.filter((item) => item.groupId === groupId);
      const firstCardY = Math.min(...cards.map((card) => card.bounds.y));

      expect(firstCardY - group.bounds.y).toBeGreaterThanOrEqual(50);
    }
  });

  it("centers every multi-line node label around its card midpoint", () => {
    render();
    const assertCentered = (element, selector) => {
      const rect = element.querySelector(":scope > rect");
      const lines = [...element.querySelectorAll(selector)];
      const averageY = lines.reduce((sum, line) => sum + Number(line.getAttribute("y")), 0) / lines.length;
      expect(averageY).toBeCloseTo(Number(rect.getAttribute("height")) / 2, 5);
      for (const line of lines) expect(line.getAttribute("dominant-baseline")).toBe("middle");
    };

    assertCentered(document.querySelector('[data-node-id="final-response"]'), "text");
    assertCentered(document.querySelector('[data-detail-node-id="rag-query"]'), "text");
    assertCentered(document.querySelector('[data-detail-node-id="code-execution-sandbox"]'), "text");
  });

  it("renders every declared relationship once with arrows and shape-boundary endpoints", () => {
    render();

    const marker = document.querySelector("#arrow");
    expect(marker.getAttribute("markerUnits")).toBe("userSpaceOnUse");
    expect(marker.getAttribute("markerWidth")).toBe("7");
    expect(marker.getAttribute("markerHeight")).toBe("7");

    const paths = [...document.querySelectorAll("[data-topology-edge]")];
    expect(paths.map((path) => path.dataset.topologyEdge)).toEqual(demoGraph.topologyEdges.map(topologyKey));
    for (const path of paths) expect(path.getAttribute("marker-end")).toBe("url(#arrow)");

    const edge = document.querySelector('[data-topology-edge="orchestrator->llm"]');
    const coordinates = edge.getAttribute("d").match(/-?\d+(?:\.\d+)?/g).map(Number);
    const from = demoGraph.nodes.find((node) => node.id === "orchestrator").referencePosition;
    const to = demoGraph.nodes.find((node) => node.id === "llm").referencePosition;
    expect(onBoundary({ x: coordinates[0], y: coordinates[1] }, from)).toBe(true);
    expect(onBoundary({ x: coordinates.at(-2), y: coordinates.at(-1) }, to)).toBe(true);

    for (const key of ["rag-context-assembly->llm", "observation->llm", "observation->planning", "memory->action"]) {
      const feedback = document.querySelector(`[data-topology-edge="${key}"]`);
      expect(feedback.getAttribute("d")).toMatch(/[CLQ]/);
      expect(feedback.classList.contains("is-feedback")).toBe(true);
    }
  });

  it("shows parallel RAG and tool lanes, two callbacks, and a bilingual context dependency gate", () => {
    render();

    const ragLane = document.querySelector('[data-topology-edge="llm->rag-query"]');
    const toolLane = document.querySelector('[data-topology-edge="llm->tools-group"]');
    const orchestratorFeed = document.querySelector('[data-topology-edge="orchestrator->llm"]');
    expect(orchestratorFeed.classList.contains("feeds-parallel-fanout")).toBe(true);
    for (const [lane, id, label] of [[ragLane, "rag", "并行检索 · Parallel Retrieval"], [toolLane, "tools", "并行工具准备 · Parallel Tool Prep"]]) {
      expect(lane.dataset.fanoutOrigin).toBe("llm");
      expect(lane.dataset.lane).toBe(id);
      expect(lane.classList.contains("is-parallel-lane")).toBe(true);
      expect(lane.getAttribute("aria-label")).toContain(label);
      expect(document.querySelector(`[data-relation-label-for="${lane.dataset.topologyEdge}"]`).textContent).toContain(label);
    }

    for (const [key, label] of [["rag-context-assembly->llm", "上下文回传 · Context Callback"], ["observation->llm", "观察回传 · Observation Callback"]]) {
      const callback = document.querySelector(`[data-topology-edge="${key}"]`);
      expect(callback.classList.contains("is-callback")).toBe(true);
      expect(callback.classList.contains("is-parallel-lane")).toBe(false);
      expect(callback.getAttribute("aria-label")).toContain(label);
      expect(document.querySelector(`[data-relation-label-for="${key}"]`).textContent).toContain(label);
    }

    const gate = document.querySelector('[data-detail-node-id="context-dependency-gate"]');
    expect(gate.getAttribute("role")).toBe("button");
    expect(gate.getAttribute("tabindex")).toBe("-1");
    expect(gate.getAttribute("data-layout-source")).toBe("tools-group");
    expect(gate.textContent).toContain("上下文依赖门");
    expect(gate.textContent).toContain("Context Gate");
    expect(gate.textContent).toContain("依赖:等待");
    expect(gate.textContent).toContain("Dependent: Wait");
    expect(gate.textContent).toContain("无依赖:并发");
    expect(gate.textContent).toContain("Independent: Continue");

    const dependency = document.querySelector('[data-projection-edge="rag-context-assembly->context-dependency-gate"]');
    const releases = [
      document.querySelector('[data-projection-edge="context-dependency-gate->code-execution-sandbox"]'),
      document.querySelector('[data-projection-edge="context-dependency-gate->external-environment-business-system"]'),
    ];
    for (const edge of [dependency, ...releases]) {
      expect(edge.classList.contains("is-context-dependency")).toBe(true);
      expect(edge.getAttribute("marker-end")).toBe("url(#arrow)");
    }
    expect(dependency.getAttribute("aria-label")).toContain("需要上下文 · Context required");
    expect(releases[0].getAttribute("aria-label")).toContain("沙箱分支 · Sandbox");
    expect(releases[1].getAttribute("aria-label")).toContain("外部系统 · External");

    const retry = document.querySelector('[data-edge-id="e18"]');
    expect(retry.classList.contains("is-retry")).toBe(true);
    expect(retry.classList.contains("is-callback")).toBe(false);
    expect(retry.getAttribute("aria-label")).toContain("重试 · Retry");
    expect(document.querySelector('[data-relation-label-for="e18"]').textContent).toContain("重试 · Retry");
  });

  it("projects top-level fan-out and conditional gate state onto the architecture", () => {
    let run = transition(createRun(demoGraph, "llm-dispatch-event"), { type: "CHOOSE_BRANCH", choice: "parallel" });
    render(run);
    for (const key of ["llm->rag-query", "llm->tools-group"]) {
      expect(document.querySelector(`[data-topology-edge="${key}"]`).classList.contains("is-live")).toBe(true);
      expect(document.querySelector(`[data-topology-edge-pulse-for="${key}"]`)).not.toBeNull();
    }
    expect(document.querySelector('[data-group-id="rag-group"]').classList.contains("is-live")).toBe(true);
    expect(document.querySelector('[data-group-id="tools-group"]').classList.contains("is-live")).toBe(true);
    expect(document.querySelector('[data-detail-node-id="context-dependency-gate"]').classList.contains("is-waiting")).toBe(true);

    run = { ...run, currentEventId: "rag-callback", currentNodeId: "rag-context" };
    run = transition(run, { type: "ADVANCE" });
    render(run);
    expect(document.querySelector('[data-detail-node-id="context-dependency-gate"]').classList.contains("is-ready")).toBe(true);
    expect(document.querySelector('[data-projection-edge="rag-context-assembly->context-dependency-gate"]').classList.contains("is-complete")).toBe(true);

    const toolsOnly = transition(createRun(demoGraph, "llm-dispatch-event"), { type: "CHOOSE_BRANCH", choice: "tools" });
    render(toolsOnly);
    expect(document.querySelector('[data-detail-node-id="context-dependency-gate"]').classList.contains("is-independent")).toBe(true);
  });

  it("runs planning and memory together, then preserves independent completion", () => {
    let run = createRun(demoGraph, "planning-event");
    render(run);

    for (const groupId of ["planning-group", "memory-group"]) {
      expect(document.querySelector(`[data-group-id="${groupId}"]`).classList.contains("is-live")).toBe(true);
    }
    for (const key of ["llm->planning", "planning->llm", "llm->memory", "memory->llm"]) {
      expect(document.querySelector(`[data-topology-edge="${key}"]`).classList.contains("is-live")).toBe(true);
      expect(document.querySelector(`[data-topology-edge-pulse-for="${key}"]`)).not.toBeNull();
    }

    run = transition(run, { type: "COMPLETE_PARALLEL_ITEM", item: "planning" });
    render(run);
    expect(document.querySelector('[data-group-id="planning-group"]').classList.contains("is-complete")).toBe(true);
    expect(document.querySelector('[data-group-id="memory-group"]').classList.contains("is-live")).toBe(true);
    expect(document.querySelector('[data-topology-edge="planning->llm"]').classList.contains("is-complete")).toBe(true);
    expect(document.querySelector('[data-topology-edge="memory->llm"]').classList.contains("is-live")).toBe(true);
  });

  it("projects vector and web execution state onto every matching detail and path", () => {
    let vectorRun = transition(createRun(demoGraph, "rag-route"), { type: "CHOOSE_BRANCH", choice: "vector" });
    render(vectorRun);

    const vector = demoGraph.retrievalBranches.find((branch) => branch.id === "vector").detailNodeIds;
    const web = demoGraph.retrievalBranches.find((branch) => branch.id === "web").detailNodeIds;
    for (const id of vector) expect(document.querySelector(`[data-detail-node-id="${id}"]`).classList.contains("is-running")).toBe(true);
    for (const id of web) expect(document.querySelector(`[data-detail-node-id="${id}"]`).classList.contains("is-skipped")).toBe(true);

    const liveVectorPaths = [...document.querySelectorAll('[data-branch="vector"].is-live')];
    expect(liveVectorPaths.length).toBeGreaterThan(0);
    for (const path of liveVectorPaths) {
      expect(document.querySelector(`[data-topology-edge-pulse-for="${path.dataset.topologyEdge}"] animateMotion`).getAttribute("path")).toBe(path.getAttribute("d"));
    }
    expect(document.querySelectorAll('[data-branch="web"].is-live')).toHaveLength(0);

    vectorRun = transition(vectorRun, { type: "COMPLETE_BRANCH", branch: "vector" });
    render(vectorRun);
    for (const id of vector) expect(document.querySelector(`[data-detail-node-id="${id}"]`).classList.contains("is-complete")).toBe(true);
  });

  it.each([
    ["sandbox", ["code-execution-sandbox"], ["external-environment-business-system"]],
    ["external", ["external-environment-business-system"], ["code-execution-sandbox"]],
    ["parallel", ["code-execution-sandbox", "external-environment-business-system"], []],
  ])("projects the %s tool choice onto only its selected nodes and routes", (choice, selected, skipped) => {
    const run = transition(createRun(demoGraph, "tool-select-event"), { type: "CHOOSE_BRANCH", choice });
    render(run);

    expect(document.querySelector('[data-node-id="action"]').classList.contains("is-live")).toBe(true);
    for (const id of selected) expect(document.querySelector(`[data-detail-node-id="${id}"]`).classList.contains("is-live")).toBe(true);
    for (const id of skipped) expect(document.querySelector(`[data-detail-node-id="${id}"]`).classList.contains("is-skipped")).toBe(true);

    const routeByNode = {
      "code-execution-sandbox": "code-execution-sandbox->action",
      "external-environment-business-system": "external-environment-business-system->action",
    };
    for (const id of selected) {
      const key = routeByNode[id];
      expect(document.querySelector(`[data-topology-edge="${key}"]`).classList.contains("is-live")).toBe(true);
      expect(document.querySelector(`[data-topology-edge-pulse-for="${key}"]`)).not.toBeNull();
    }
    for (const id of skipped) {
      const key = routeByNode[id];
      expect(document.querySelector(`[data-topology-edge="${key}"]`).classList.contains("is-skipped")).toBe(true);
      expect(document.querySelector(`[data-topology-edge-pulse-for="${key}"]`)).toBeNull();
    }
  });

  it("projects merge, context callback, tool, retry, and replan states onto reference paths", () => {
    let run = transition(createRun(demoGraph, "rag-route"), { type: "CHOOSE_BRANCH", choice: "web" });
    run = transition(run, { type: "COMPLETE_BRANCH", branch: "web" });
    render(run);
    expect(document.querySelector('[data-detail-node-id="result-merge-deduplicate"]').classList.contains("is-live")).toBe(true);

    render(createRun(demoGraph, "rag-context-event"));
    for (const key of ["result-merge-deduplicate->rerank", "rerank->top-n", "top-n->rag-context-assembly"]) {
      expect(document.querySelector(`[data-topology-edge="${key}"]`).classList.contains("is-live")).toBe(true);
    }

    render(createRun(demoGraph, "rag-callback"));
    expect(document.querySelector('[data-topology-edge="rag-context-assembly->llm"]').classList.contains("is-live")).toBe(true);

    render(createRun(demoGraph, "tool-select-event"));
    expect(document.querySelector('[data-group-id="tools-group"]').classList.contains("is-live")).toBe(true);

    render(transition(createRun(demoGraph, "observation-event"), { type: "CHOOSE_BRANCH", choice: "retry" }));
    expect(document.querySelector('[data-edge-id="e18"]').classList.contains("is-live")).toBe(true);

    render(transition(createRun(demoGraph, "observation-event"), { type: "CHOOSE_BRANCH", choice: "replan" }));
    expect(document.querySelector('[data-topology-edge="observation->planning"]').classList.contains("is-live")).toBe(true);
  });
});

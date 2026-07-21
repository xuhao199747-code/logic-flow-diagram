import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppView } from "../../src/ui/AppView.js";
import { createRun, transition } from "../../src/domain/execution.js";
import { createViewport } from "../../src/domain/viewport.js";
import { demoGraph } from "../../src/data/demo-graph.js";
import { saveSession } from "../../src/domain/session.js";

const handlers = () => ({
  onNodeSelect: vi.fn(),
  onOverview: vi.fn(),
  onModuleFocus: vi.fn(),
  onToggleFollow: vi.fn(),
  onReturnLive: vi.fn(),
  onCloseInspector: vi.fn(),
});

function createInteractiveView(startRun = createRun(demoGraph)) {
  const state = { graph: demoGraph, run: startRun, scenarioId: "normal", viewport: createViewport() };
  let view;
  const render = () => view.render(state);
  const interactiveHandlers = {
    onPrimaryAction() {
      const event = demoGraph.events.find((item) => item.id === state.run.currentEventId);
      if (event.relation === "parallel") {
        const branch = state.run.activeBranches.find((item) => !state.run.completedBranches.includes(item));
        state.run = transition(state.run, { type: "COMPLETE_BRANCH", branch });
      } else if (event.relation === "parallel-work") {
        const item = state.run.parallelWork.selected.find((candidate) => !state.run.parallelWork.completed.includes(candidate));
        state.run = transition(state.run, { type: "COMPLETE_PARALLEL_ITEM", item });
      } else {
        state.run = transition(state.run, { type: "ADVANCE" });
      }
      render();
    },
    onBranchChoice(choice) {
      state.run = transition(state.run, { type: "CHOOSE_BRANCH", choice });
      render();
    },
    onPrevious() { state.run = transition(state.run, { type: "PREVIOUS" }); render(); },
    onRestart() { state.run = transition(state.run, { type: "RESET" }); render(); },
  };
  view = createAppView(document.querySelector("#app"), interactiveHandlers);
  render();
  return state;
}

function activateWithKeyboard(button) {
  button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  button.click();
}

describe("AppView", () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    sessionStorage.clear();
  });
  afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

  it("renders a fixed flow stage and step rail without spatial navigation", () => {
    const viewHandlers = handlers();
    const view = createAppView(document.querySelector("#app"), viewHandlers);
    view.render({
      graph: demoGraph,
      run: createRun(demoGraph, "rag-route"),
      viewport: { ...createViewport("rag-route", "rag"), viewing: { level: "module", moduleId: "rag", nodeId: null } },
    });

    expect(document.querySelector(".minimap")).toBeNull();
    expect(document.querySelector(".return-live")).toBeNull();
    expect(document.querySelector(".inspector")).toBeNull();
    expect(document.querySelector(".flow-stage")).toBeTruthy();
    expect(document.querySelector(".step-rail")).toBeTruthy();
    for (const action of ["overview", "follow", "return-live", "minimap-return-live", "minimap-toggle"]) {
      expect(document.querySelectorAll(`[data-action="${action}"]`)).toHaveLength(0);
    }
    expect(document.querySelector("[data-testid=breadcrumb]").textContent).toContain("RAG 检索增强");
  });

  it("removes adjacent duplicate labels from the current-step breadcrumb", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph, "final-event"), viewport: createViewport() });

    expect(document.querySelector("[data-testid=breadcrumb]").textContent).toBe("Agent 系统 > 最终响应");
  });

  it("explains the live flow in a single four-part narrative", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph, "rag-route"), viewport: createViewport() });

    const rail = document.querySelector(".step-rail");
    expect(document.querySelector(".rail-tabs")).toBeNull();
    expect(rail.textContent).toContain("运行进度");
    expect(rail.textContent).toContain("Live Step");
    expect([...rail.querySelectorAll("[data-guide-part]")].map((part) => part.dataset.guidePart))
      .toEqual(["now", "reason", "result", "next"]);
    expect(document.querySelector(".step-rail").textContent).toContain("检索路由");
    expect(document.querySelector(".step-rail").textContent).toContain("Retrieval Routing");
    expect(document.querySelector(".step-rail").textContent).toContain("检查任务需要补充的知识类型");
    expect(document.querySelector(".step-rail").textContent).toContain("实时信息");
  });

  it("announces the current step and renders a bilingual status", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph), viewport: createViewport() });

    const announcement = document.querySelector('[data-testid="run-announcement"]');
    expect(announcement.getAttribute("aria-live")).toBe("polite");
    expect(announcement.textContent).toContain("接收用户任务");
    expect(announcement.textContent).toContain("Receive Task");
    expect(document.querySelector(".status-chip").textContent).toContain("等待操作");
    expect(document.querySelector(".status-chip").textContent).toContain("Awaiting Action");
  });

  it("shows a compact four-state route legend over the graph", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph), viewport: createViewport() });

    const legend = document.querySelector(".flow-legend");
    expect(legend).not.toBeNull();
    expect([...legend.querySelectorAll("li")].map((item) => item.dataset.legendState))
      .toEqual(["live", "complete", "callback", "issue"]);
    expect(legend.textContent).toContain("运行中");
    expect(legend.textContent).toContain("异常/重试");
  });

  it("returns from a selected node explanation to the live flow", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph), viewport: createViewport() });
    document.querySelector('[data-detail-node-id="rag-query"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(".step-rail").textContent).toContain("节点说明");
    expect(document.querySelector(".step-rail").textContent).toContain("Node Guide");
    const back = document.querySelector('[data-action="back-to-live"]');
    expect(back.textContent).toContain("返回运行进度");
    back.click();

    expect(document.querySelector(".step-rail").textContent).toContain("运行进度");
    expect(document.querySelector('[data-action="back-to-live"]')).toBeNull();
  });

  it("distinguishes the running step from the node being inspected", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph, "rag-route"), viewport: createViewport() });

    document.querySelector('[data-detail-node-id="memory-long-term"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const context = document.querySelector(".inspection-context");
    expect(context.textContent).toContain("当前运行：选择检索路径");
    expect(context.textContent).toContain("正在查看：长期记忆");
    expect(context.textContent).toContain("Running");
    expect(context.textContent).toContain("Viewing");
  });

  it("opens clicked graph content in Node Detail without changing the execution cursor", () => {
    const run = createRun(demoGraph, "rag-route");
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run, viewport: createViewport() });

    document.querySelector('[data-detail-node-id="rag-query"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(run.currentEventId).toBe("rag-route");
    expect(document.querySelector(".step-rail").textContent).toContain("节点说明");
    expect(document.querySelector(".step-rail").textContent).toContain("Query处理");
    expect(document.querySelector(".step-rail").textContent).toContain("Query Processing");
    expect(document.querySelector(".node-connections").textContent).toContain("大语言模型");
    expect(document.querySelector(".node-connections").textContent).toContain("路由");
  });

  it("explains detail nodes without direct topology as internal module steps", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph), viewport: createViewport() });

    document.querySelector('[data-detail-node-id="memory-long-term"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(".node-connections").textContent).toContain("模块内部步骤");
    expect(document.querySelector(".node-connections").textContent).toContain("Internal Module Step");
    expect(document.querySelector(".node-connections").textContent).not.toContain("接收自");
    expect(document.querySelector(".node-role").textContent).toContain("跨会话");
  });

  it("returns the rail to Current Step when execution advances", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    const run = createRun(demoGraph, "input-event");
    view.render({ graph: demoGraph, run, viewport: createViewport() });
    document.querySelector('[data-node-id="llm"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".step-rail").textContent).toContain("节点说明");

    const nextRun = transition(run, { type: "ADVANCE" });
    view.render({ graph: demoGraph, run: nextRun, viewport: createViewport() });
    expect(document.querySelector(".step-rail").textContent).toContain("运行进度");
    expect(document.querySelector(".step-rail").textContent).toContain("初始化编排");
  });

  it("keeps only step navigation and contextual actions in the footer", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph, "rag-route"), viewport: createViewport("rag-route", "rag") });

    expect(document.querySelector('[data-action="play"]')).toBeNull();
    expect(document.querySelector('[data-action="speed"]')).toBeNull();
    expect([...document.querySelectorAll(".controls-host button[data-action]")].map((button) => button.dataset.action))
      .toEqual(["previous", "restart", "primary"]);
  });

  it("separates history, contextual actions, and progress in the footer", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph, "rag-route"), viewport: createViewport() });

    expect(document.querySelector(".control-history [data-action=previous]")).not.toBeNull();
    expect(document.querySelector(".control-history [data-action=restart]")).not.toBeNull();
    expect(document.querySelector(".control-actions [data-branch-choice=vector]")).not.toBeNull();
    expect(document.querySelector(".control-progress [data-testid=run-progress]")).not.toBeNull();
    expect(document.querySelector(".control-progress [data-testid=branch-progress]")).not.toBeNull();
  });

  it("replaces next with branch choices at a decision", () => {
    const onBranchChoice = vi.fn();
    const view = createAppView(document.querySelector("#app"), {
      onNodeSelect: vi.fn(),
      onOverview: vi.fn(),
      onModuleFocus: vi.fn(),
      onToggleFollow: vi.fn(),
      onReturnLive: vi.fn(),
      onBranchChoice,
      onPrimaryAction: vi.fn(),
      onPrevious: vi.fn(),
      onPlayPause: vi.fn(),
      onRestart: vi.fn(),
      onSpeedChange: vi.fn(),
    });
    view.render({ graph: demoGraph, run: createRun(demoGraph, "rag-route"), viewport: createViewport("rag-route", "rag") });

    expect(document.querySelectorAll("[data-branch-choice]")).toHaveLength(3);
    expect(document.querySelector('[data-action="primary"]').hidden).toBe(true);
  });

  it("offers sandbox, external system, and parallel tool choices", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph, "tool-select-event"), viewport: createViewport() });

    expect([...document.querySelectorAll("[data-branch-choice]")].map((button) => button.dataset.branchChoice)).toEqual(["sandbox", "external", "parallel"]);
    expect(document.querySelector('[data-branch-choice="sandbox"]').textContent).toContain("代码沙箱");
    expect(document.querySelector('[data-branch-choice="external"]').textContent).toContain("外部系统");
    expect(document.querySelector('[data-branch-choice="parallel"]').textContent).toContain("双路并行");
  });

  it("disables unavailable history navigation and labels terminal completion accurately", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph), viewport: createViewport() });
    expect(document.querySelector('[data-action="previous"]').disabled).toBe(true);

    const completed = { ...createRun(demoGraph, "final-event"), status: "completed" };
    view.render({ graph: demoGraph, run: completed, viewport: createViewport() });
    const primary = document.querySelector('[data-action="primary"]');
    expect(primary.disabled).toBe(true);
    expect(primary.hidden).toBe(false);
    expect(primary.textContent).toContain("流程已完成");
    expect(primary.textContent).toContain("Complete");
  });

  it("does not let RAG branch history resolve the observation decision", () => {
    const run = {
      ...createRun(demoGraph, "observation-event"),
      selectedBranches: ["vector"],
      activeBranches: ["vector"],
      completedBranches: ["vector"],
    };
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run, viewport: createViewport("observation", "tools") });

    expect(document.querySelectorAll("[data-branch-choice]")).toHaveLength(3);
    expect(document.querySelector('[data-action="primary"]').disabled).toBe(true);
  });

  it("restores focus to Next after mouse activation rerenders the footer", () => {
    createInteractiveView();
    const next = document.querySelector('[data-action="primary"]');
    next.focus();
    next.click();

    expect(document.activeElement).toBe(document.querySelector('[data-action="primary"]'));
    expect(document.activeElement.textContent).toContain("下一事件");
  });

  it("consumes a stale Next control only once during a rapid double activation", () => {
    const state = createInteractiveView();
    const staleNext = document.querySelector('[data-action="primary"]');

    staleNext.click();
    staleNext.click();

    expect(state.run.currentEventId).toBe("orchestrator-event");
    expect(state.run.trace).toHaveLength(1);
  });

  it("ignores the second click when a double-click lands on the newly rendered Next control", () => {
    const state = createInteractiveView();
    document.querySelector('[data-action="primary"]').dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    document.querySelector('[data-action="primary"]').dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));

    expect(state.run.currentEventId).toBe("orchestrator-event");
    expect(state.run.trace).toHaveLength(1);
  });

  it("consumes a stale decision control only once during a rapid double activation", () => {
    const state = createInteractiveView(createRun(demoGraph, "llm-dispatch-event"));
    const staleChoice = document.querySelector('[data-branch-choice="rag"]');

    staleChoice.click();
    expect(() => staleChoice.click()).not.toThrow();

    expect(state.run.currentEventId).toBe("rag-route");
    expect(state.run.trace).toHaveLength(1);
  });

  it("does not let a second click spill into the next decision's first choice", () => {
    const state = createInteractiveView(createRun(demoGraph, "llm-dispatch-event"));
    document.querySelector('[data-branch-choice="rag"]').dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    document.querySelector('[data-branch-choice="vector"]').dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));

    expect(state.run.currentEventId).toBe("rag-route");
    expect(state.run.selectedBranches).toEqual([]);
  });

  it("moves keyboard focus from Next to a decision choice and then Complete Branch", () => {
    createInteractiveView(createRun(demoGraph, "planning-event"));
    const next = document.querySelector('[data-action="primary"]');
    next.focus();
    activateWithKeyboard(next);
    activateWithKeyboard(document.activeElement);

    expect(document.activeElement).toBe(document.querySelector('[data-branch-choice="rag"]'));
    activateWithKeyboard(document.activeElement);

    expect(document.activeElement).toBe(document.querySelector('[data-branch-choice="vector"]'));
    activateWithKeyboard(document.activeElement);

    expect(document.activeElement).toBe(document.querySelector('[data-action="primary"]'));
    expect(document.activeElement.textContent).toContain("完成下一分支");
    expect(document.activeElement).not.toBe(document.body);
  });

  it("completes planning and memory independently before exposing dispatch choices", () => {
    const state = createInteractiveView(createRun(demoGraph, "planning-event"));

    expect(document.querySelector('[data-action="primary"]').textContent).toContain("完成下一模块");
    document.querySelector('[data-action="primary"]').click();
    expect(state.run.currentEventId).toBe("planning-event");
    expect(state.run.parallelWork.completed).toEqual(["planning"]);

    document.querySelector('[data-action="primary"]').click();
    expect(state.run.currentEventId).toBe("llm-dispatch-event");
    expect(document.querySelectorAll("[data-branch-choice]")).toHaveLength(3);
  });

  it("shows recovery actions only when the current scenario is blocked", () => {
    const run = {
      ...createRun(demoGraph, "rag-join"),
      simulatedIssue: demoGraph.scenarios.find((scenario) => scenario.id === "no-results").label,
    };
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run, viewport: createViewport("rag-merge", "rag"), scenarioId: "no-results" });

    expect(document.querySelector('[data-action="primary"]').hidden).toBe(true);
    expect([...document.querySelectorAll('[data-action="recovery"]')].map((button) => button.dataset.recovery))
      .toEqual(["retry", "replan"]);
  });

  it("shows permission-request acknowledgement and prevents duplicate requests", () => {
    const issue = demoGraph.scenarios.find((scenario) => scenario.id === "permission-denied");
    let run = transition(createRun(demoGraph, "tool-event"), { type: "REPORT_ISSUE", issue });
    run = transition(run, { type: "RECOVER", action: "request", reason: "request access" });
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run, viewport: createViewport(), scenarioId: issue.id });

    expect(document.querySelector(".issue-banner").textContent).toContain("确认请求已发送");
    expect(document.querySelector(".issue-banner").textContent).toContain("Confirmation requested");
    expect(document.querySelector('[data-recovery="request"]').disabled).toBe(true);
  });

  it.each([
    ["cancelled", "流程已取消", "Cancelled"],
    ["failed", "执行失败", "Failed"],
  ])("uses an accurate %s terminal action label", (status, zh, en) => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: { ...createRun(demoGraph, "final-event"), status }, viewport: createViewport() });
    const primary = document.querySelector('[data-action="primary"]');
    expect(primary.textContent).toContain(zh);
    expect(primary.textContent).toContain(en);
  });

  it("shows branch completion counts for parallel work", () => {
    const run = { ...createRun(demoGraph, "rag-retrieval"), selectedBranches: ["vector", "web"], activeBranches: ["vector", "web"], completedBranches: ["vector"] };
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run, viewport: createViewport("rag-route", "rag") });

    expect(document.querySelector("[data-testid=branch-progress]").textContent).toContain("1 / 2");
  });

  it("shows top-level RAG and Tools lane progress separately from retrieval branches", () => {
    const run = {
      ...createRun(demoGraph, "tool-select-event"),
      dispatchMode: "parallel",
      activeLanes: ["rag", "tools"],
      completedLanes: ["rag"],
    };
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run, viewport: createViewport("tool-select", "tools") });

    const progress = document.querySelector("[data-testid=branch-progress]").textContent;
    expect(progress).toContain("主泳道 1 / 2");
    expect(progress).not.toContain("检索分支 0 / 0");
  });

  it("preserves branch progress after a parallel join completes", () => {
    let run = transition(createRun(demoGraph, "rag-route"), { type: "CHOOSE_BRANCH", choice: "parallel" });
    run = transition(run, { type: "COMPLETE_BRANCH", branch: "vector" });
    run = transition(run, { type: "COMPLETE_BRANCH", branch: "web" });
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run, viewport: createViewport("rag-merge", "rag") });

    expect(document.querySelector("[data-testid=branch-progress]").textContent).toContain("2 / 2");
  });

  it("shows the current iteration and event number in playback controls", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph, "rag-route"), viewport: createViewport("rag-route", "rag") });

    expect(document.querySelector("[data-testid=run-progress]").textContent).toContain("轮次 1");
    expect(document.querySelector("[data-testid=run-progress]").textContent).toContain(`事件 5 / ${demoGraph.events.length}`);
  });

  it("offers bilingual failure simulations", () => {
    const onScenarioChange = vi.fn();
    const view = createAppView(document.querySelector("#app"), { onScenarioChange });
    view.render({ graph: demoGraph, run: createRun(demoGraph), viewport: createViewport(), scenarioId: "normal" });

    const select = document.querySelector('[data-action="scenario"]');
    expect(select.options).toHaveLength(5);
    select.value = "tool-timeout";
    select.dispatchEvent(new Event("change"));
    expect(onScenarioChange).toHaveBeenCalledWith("tool-timeout");
  });

  it("shows a concise scenario summary and simulated-state badge", () => {
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run: createRun(demoGraph), viewport: createViewport(), scenarioId: "no-results" });

    expect(document.querySelector("[data-scenario-status]").textContent).toContain("SIMULATED");
    expect(document.querySelector("[data-scenario-summary]").textContent).toContain("检索结果为空");
    expect(document.querySelector("[data-scenario-summary]").textContent).toContain("Empty retrieval results");
  });

  it("shows issue cause and impact in the right rail", () => {
    const issue = demoGraph.scenarios.find((scenario) => scenario.id === "no-results");
    const run = { ...createRun(demoGraph, "rag-join"), simulatedIssue: issue, status: issue.status };
    const view = createAppView(document.querySelector("#app"), handlers());
    view.render({ graph: demoGraph, run, viewport: createViewport(), scenarioId: issue.id });

    expect(document.querySelector(".issue-banner").textContent).toContain("检索结果为空");
    expect(document.querySelector(".issue-banner").textContent).toContain("RAG 汇合");
    expect(document.querySelector(".issue-banner").textContent).toContain("RAG Join");
  });

  it("resets the run when changing scenarios", async () => {
    vi.useFakeTimers();
    await import("../../src/main.js?scenario-reset-test");

    const select = document.querySelector('[data-action="scenario"]');
    select.value = "permission-denied";
    select.dispatchEvent(new Event("change"));

    expect(document.querySelector('[data-node-id="user-task"]').classList.contains("is-live")).toBe(true);
  });

  it("restores the last in-progress run after a reload", async () => {
    const run = transition(createRun(demoGraph), { type: "ADVANCE" });
    saveSession(sessionStorage, { scenarioId: "tool-timeout", run });

    await import("../../src/main.js?session-restore-test");

    expect(document.querySelector('[data-action="scenario"]').value).toBe("tool-timeout");
    expect(document.querySelector('[data-node-id="orchestrator"]').classList.contains("is-live")).toBe(true);
    expect(document.querySelector("[data-testid=run-progress]").textContent).toContain("事件 2");
  });

  it("ignores held-arrow key repeats while preserving deliberate keyboard stepping", async () => {
    await import("../../src/main.js?keyboard-repeat-test");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true, bubbles: true }));
    expect(document.querySelector('[data-node-id="user-task"]').classList.contains("is-live")).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", repeat: false, bubbles: true }));
    expect(document.querySelector('[data-node-id="orchestrator"]').classList.contains("is-live")).toBe(true);
  });

  it("pauses the no-results simulation at the RAG join without changing the graph", async () => {
    await import("../../src/main.js?no-results-simulation-test");
    const graphSnapshot = structuredClone(demoGraph);
    const select = document.querySelector('[data-action="scenario"]');
    select.value = "no-results";
    select.dispatchEvent(new Event("change"));

    for (let index = 0; index < 4; index += 1) document.querySelector('[data-action="primary"]').click();
    document.querySelector('[data-branch-choice="rag"]').click();
    document.querySelector('[data-branch-choice="vector"]').click();
    document.querySelector('[data-action="primary"]').click();

    const live = document.querySelector('[data-node-id="rag-merge"]');
    expect(live.classList.contains("is-live")).toBe(true);
    expect(live.classList.contains("is-partial")).toBe(true);
    expect(demoGraph).toEqual(graphSnapshot);
  });

  it("allows Previous to advance again after a simulated issue", async () => {
    await import("../../src/main.js?previous-after-simulation-test");
    const select = document.querySelector('[data-action="scenario"]');
    select.value = "no-results";
    select.dispatchEvent(new Event("change"));

    for (let index = 0; index < 4; index += 1) document.querySelector('[data-action="primary"]').click();
    document.querySelector('[data-branch-choice="rag"]').click();
    document.querySelector('[data-branch-choice="vector"]').click();
    document.querySelector('[data-action="primary"]').click();
    document.querySelector('[data-action="previous"]').click();
    document.querySelector('[data-action="primary"]').click();

    expect(document.querySelector('[data-node-id="rag-merge"]').classList.contains("is-partial")).toBe(true);
  });

});

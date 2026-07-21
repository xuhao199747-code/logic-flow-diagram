import { renderGraph } from "./GraphView.js";
import { createNodeDetail, renderContextRail } from "./Inspector.js";
import { renderPlaybackControls } from "./PlaybackControls.js";

export function createAppView(root, handlers) {
  root.innerHTML = `<section class="app-shell"><p class="sr-only" data-testid="run-announcement" aria-live="polite" aria-atomic="true"></p><header class="topbar"><div class="title-lockup"><span class="eyebrow">AGENT EXECUTION MAP</span><h1 data-lang="zh">智能代理执行流程</h1><p class="foundation-screen__support" data-lang="en">Interactive Agent Flow</p></div><div class="scenario-block"><div class="scenario-row"><label class="scenario-control">模拟场景 <small>Simulation</small><select data-action="scenario" aria-label="模拟场景 Simulation"></select></label><span class="scenario-status" data-scenario-status></span></div><p data-scenario-summary></p></div><nav data-testid="breadcrumb" aria-label="当前步骤 Current step"></nav></header><main class="flow-stage"><div class="graph-host"></div><aside class="step-rail" aria-label="当前步骤说明 Current step details"></aside></main><footer class="controls-host"></footer></section>`;

  const graphHost = root.querySelector(".graph-host");
  const stepRail = root.querySelector(".step-rail");
  const breadcrumb = root.querySelector('[data-testid="breadcrumb"]');
  const controls = root.querySelector(".controls-host");
  const scenario = root.querySelector('[data-action="scenario"]');
  const scenarioStatus = root.querySelector("[data-scenario-status]");
  const scenarioSummary = root.querySelector("[data-scenario-summary]");
  const runAnnouncement = root.querySelector('[data-testid="run-announcement"]');
  let activeRailTab = "current";
  let inspectedNode = null;
  let currentRailModel = null;
  let currentGraph = null;
  let lastCursorKey = null;

  const renderRail = () => {
    renderContextRail(stepRail, {
      current: currentRailModel,
      nodeDetail: inspectedNode,
      activeTab: activeRailTab,
      onTabChange(tab) {
        activeRailTab = tab === "node" && inspectedNode ? "node" : "current";
        renderRail();
      },
    });
  };

  const inspectNode = (selection) => {
    inspectedNode = createNodeDetail(currentGraph, selection);
    activeRailTab = "node";
    handlers.onNodeSelect?.(selection);
    renderRail();
  };

  return {
    render(state) {
      scenario.replaceChildren(...state.graph.scenarios.map((item) => new Option(`${item.label.zh} · ${item.label.en}`, item.id)));
      scenario.value = state.scenarioId ?? "normal";
      scenario.onchange = (event) => handlers.onScenarioChange?.(event.target.value);
      const selectedScenario = state.graph.scenarios.find((item) => item.id === (state.scenarioId ?? "normal")) ?? state.graph.scenarios[0];
      const simulated = selectedScenario.id !== "normal";
      scenarioStatus.textContent = simulated ? "SIMULATED" : "NORMAL";
      scenarioStatus.classList.toggle("is-simulated", simulated);
      scenarioSummary.textContent = `${selectedScenario.description.zh} · ${selectedScenario.description.en}`;

      const currentEvent = state.graph.events.find((item) => item.id === state.run.currentEventId);
      const currentNode = state.graph.nodes.find((item) => item.id === currentEvent.nodeId);
      const currentModule = state.graph.modules.find((item) => item.id === currentNode.moduleId);
      breadcrumb.textContent = ["Agent 系统", currentModule.label.zh, currentNode.label.zh]
        .filter((label, index, labels) => index === 0 || label !== labels[index - 1])
        .join(" > ");
      runAnnouncement.textContent = `${currentEvent.label.zh} · ${currentEvent.label.en}，${state.run.status}`;

      const cursorKey = `${state.run.currentEventId}:${state.run.trace.length}:${state.run.iteration}`;
      if (cursorKey !== lastCursorKey) {
        activeRailTab = "current";
        inspectedNode = null;
        lastCursorKey = cursorKey;
      }
      const nextEvent = currentEvent.next
        ? state.graph.events.find((item) => item.id === currentEvent.next)
        : currentEvent.join
          ? state.graph.events.find((item) => item.id === currentEvent.join)
          : null;
      const choiceLabels = Object.values(currentEvent.choices ?? {}).map((choice) => choice.label);
      const next = choiceLabels.length
        ? {
            zh: `等待你选择：${choiceLabels.map((label) => label.zh).join(" / ")}`,
            en: `Awaiting your choice: ${choiceLabels.map((label) => label.en).join(" / ")}`,
          }
        : nextEvent
          ? {
              zh: `进入「${nextEvent.label.zh}」`,
              en: `Continue to “${nextEvent.label.en}”`,
            }
          : {
              zh: "流程在这里完成。",
              en: "The flow completes here.",
            };
      currentGraph = state.graph;
      currentRailModel = {
        node: currentNode,
        event: currentEvent,
        snapshot: {
          status: state.run.status,
          input: currentEvent.label.zh,
          output: state.run.simulatedIssue?.label?.zh ?? state.run.simulatedIssue?.zh ?? "—",
          summary: currentEvent.label.en,
          iteration: state.run.iteration,
          issue: state.run.simulatedIssue,
          next,
          run: state.run,
        },
      };

      renderGraph(graphHost, { ...state, onNodeSelect: inspectNode });
      renderRail();
      renderPlaybackControls(controls, {
        run: state.run,
        event: currentEvent,
        scenario: state.graph.scenarios.find((item) => item.id === state.scenarioId),
        eventNumber: state.graph.events.indexOf(currentEvent) + 1,
        eventCount: state.graph.events.length,
      }, handlers);
    },
  };
}

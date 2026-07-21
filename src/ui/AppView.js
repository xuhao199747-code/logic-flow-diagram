import { renderGraph } from "./GraphView.js";
import { createNodeDetail, renderContextRail } from "./Inspector.js";
import { renderPlaybackControls } from "./PlaybackControls.js";

export function createAppView(root, handlers) {
  root.innerHTML = `<section class="app-shell"><p class="sr-only" data-testid="run-announcement" aria-live="polite" aria-atomic="true"></p><header class="topbar"><div class="title-lockup"><h1 data-lang="zh" data-diagram-title>Agent执行流程</h1></div><div class="flow-settings"><label class="diagram-control">流程图<select data-action="diagram" aria-label="选择流程图"></select></label></div><nav data-testid="breadcrumb" aria-label="当前步骤"></nav></header><main class="flow-stage"><div class="graph-host"></div><aside class="step-rail" aria-label="当前步骤说明"></aside></main></section>`;

  const graphHost = root.querySelector(".graph-host");
  const stepRail = root.querySelector(".step-rail");
  const breadcrumb = root.querySelector('[data-testid="breadcrumb"]');
  const diagramSelect = root.querySelector('[data-action="diagram"]');
  const diagramTitle = root.querySelector("[data-diagram-title]");
  const scenarioBlock = document.createElement("div");
  scenarioBlock.className = "scenario-block";
  scenarioBlock.innerHTML = `<div class="scenario-row"><label class="scenario-control">模拟场景<select data-action="scenario" aria-label="选择模拟场景"></select></label><span class="scenario-status" data-scenario-status></span></div><p data-scenario-summary></p>`;
  const scenario = scenarioBlock.querySelector('[data-action="scenario"]');
  const scenarioStatus = scenarioBlock.querySelector("[data-scenario-status]");
  const scenarioSummary = scenarioBlock.querySelector("[data-scenario-summary]");
  const controls = document.createElement("div");
  controls.className = "controls-host";
  const runAnnouncement = root.querySelector('[data-testid="run-announcement"]');
  let activeRailTab = "current";
  let inspectedNode = null;
  let currentRailModel = null;
  let currentGraph = null;
  let currentDiagram = null;
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
    inspectedNode = createNodeDetail(currentGraph, selection, currentDiagram?.guides);
    activeRailTab = "node";
    handlers.onNodeSelect?.(selection);
    renderRail();
  };

  return {
    render(state) {
      const availableDiagrams = state.diagrams?.length
        ? state.diagrams
        : [state.diagram ?? { id: state.diagramId ?? state.graph.id ?? "current-diagram", label: { zh: "Agent执行流程", en: "Interactive Agent Flow" }, graph: state.graph }];
      const activeDiagram = state.diagram ?? availableDiagrams.find((item) => item.id === state.diagramId) ?? availableDiagrams[0];
      diagramSelect.replaceChildren(...availableDiagrams.map((item) => new Option(item.label.zh, item.id)));
      diagramSelect.value = activeDiagram.id;
      diagramSelect.onchange = (event) => handlers.onDiagramChange?.(event.target.value);
      diagramTitle.textContent = activeDiagram.label.zh;
      scenario.replaceChildren(...state.graph.scenarios.map((item) => new Option(item.label.zh, item.id)));
      scenario.value = state.scenarioId ?? "normal";
      scenario.onchange = (event) => handlers.onScenarioChange?.(event.target.value);
      const selectedScenario = state.graph.scenarios.find((item) => item.id === (state.scenarioId ?? "normal")) ?? state.graph.scenarios[0];
      const simulated = selectedScenario.id !== "normal";
      scenarioStatus.textContent = simulated ? "模拟中" : "正常";
      scenarioStatus.classList.toggle("is-simulated", simulated);
      scenarioSummary.textContent = selectedScenario.description.zh;

      const currentEvent = state.graph.events.find((item) => item.id === state.run.currentEventId);
      const currentNode = state.graph.nodes.find((item) => item.id === currentEvent.nodeId);
      const currentModule = state.graph.modules.find((item) => item.id === currentNode.moduleId);
      breadcrumb.textContent = [state.graph.systemBoundary.label.zh, currentModule.label.zh, currentNode.label.zh]
        .filter((label, index, labels) => index === 0 || label !== labels[index - 1])
        .join(" > ");
      runAnnouncement.textContent = `当前步骤：${currentEvent.label.zh}`;

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
      currentDiagram = activeDiagram;
      currentRailModel = {
        node: currentNode,
        event: currentEvent,
        guide: activeDiagram.guides?.eventGuideFor?.(currentEvent.id) ?? null,
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

      renderGraph(graphHost, { ...state, onNodeSelect: inspectNode, onCanvasViewportChange: handlers.onCanvasViewportChange });
      const canvasToolbar = document.createElement("div");
      canvasToolbar.className = "canvas-toolbar";
      canvasToolbar.append(graphHost.querySelector(".flow-legend"), scenarioBlock);
      graphHost.append(canvasToolbar, controls);
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

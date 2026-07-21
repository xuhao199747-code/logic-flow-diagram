import {
  activeTransitionEdgeIds,
  completedEdgeIdsForTrace,
  isCurrentLiveEdge,
  referenceEdgeState,
  referenceVisualState,
  topologyEdgeKey,
  topologyEdgeMeta,
} from "./traceEdges.js";
import { createRoutingContext, routeRetryEdge, routeTopologyEdge } from "./edgeRouting.js";
import {
  flowModuleForDetail,
  flowModuleForGroup,
  flowModuleForNode,
  flowPresentationForConnection,
} from "./flowPresentation.js";
import {
  createCanvasViewport,
  panCanvasBy,
  viewBoxFor,
  wheelActionFor,
  zoomCanvasAt,
} from "./canvasViewport.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const canvasStates = new WeakMap();
const statusLabels = {
  waiting: "等待 · Waiting", paused: "等待操作 · Awaiting Action", running: "执行中 · Running", success: "成功 · Success",
  completed: "完成 · Completed", failed: "失败 · Failed", skipped: "跳过 · Skipped", blocked: "已阻塞 · Blocked",
  retrying: "重试中 · Retrying", cancelled: "已取消 · Cancelled", partial: "部分完成 · Partial",
};
const relationLabels = {
  callback: "回传 · Callback",
  retry: "重试 · Retry",
  replan: "重规划 · Replan",
  decision: "决策 · Decision",
};
const CONTEXT_GATE_ID = "context-dependency-gate";
const detailEndpointAliases = new Map(Object.entries({
  "rag-route": ["rag-routing"],
  "vector-search": ["vector-store-retrieval"],
  "web-search": ["rag-web-search"],
  "rag-merge": ["result-merge-deduplicate"],
  "rag-context": ["rag-context-assembly"],
}));
const focusAliases = new Map(Object.entries({
  planning: "planning-subgoals",
  memory: "memory-short-term",
  "rag-route": "rag-routing",
  "vector-search": "vector-store-retrieval",
  "web-search": "rag-web-search",
  "rag-merge": "result-merge-deduplicate",
  "rag-context": "rag-context-assembly",
}));

const svg = (tag, attributes = {}) => {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
};

function contextGateState(run) {
  if (!run.activeLanes?.includes("tools")) return {};
  if (!run.contextRequired) return { independent: true };
  if (run.completedLanes?.includes("rag")) return { ready: true, complete: true };
  return { waiting: true, live: true, status: "waiting" };
}

const edgePresentation = {
  "llm->rag-query": { lane: "rag" },
  "llm->tools-group": { lane: "tools" },
  "rag-context-assembly->llm": { callback: true },
  "observation->llm": { callback: true },
};

function appendRelationLabel(layer, key, label, x, y) {
  const width = Math.min(255, Math.max(72, label.length * 5.4));
  const group = svg("g", { class: "relation-label", "data-relation-label-for": key, transform: `translate(${x} ${y})` });
  group.append(svg("rect", { x: -width / 2, y: -11, width, height: 16, rx: 6 }));
  const text = svg("text", { x: 0, y: 1, "text-anchor": "middle" });
  text.textContent = label;
  group.append(text);
  layer.append(group);
}

function appendMarkers(root) {
  const defs = svg("defs");
  const marker = svg("marker", {
    id: "arrow",
    viewBox: "0 0 8 8",
    refX: 7,
    refY: 4,
    markerWidth: 7,
    markerHeight: 7,
    markerUnits: "userSpaceOnUse",
    orient: "auto-start-reverse",
  });
  marker.append(svg("path", { d: "M 0 0 L 8 4 L 0 8 z", class: "edge-arrow" }));
  defs.append(marker);
  root.append(defs);
}

function applyVisualState(element, state) {
  if (state.live) element.classList.add("is-live", `is-${state.status ?? "running"}`);
  if (state.complete) element.classList.add("is-complete");
  if (state.skipped) element.classList.add("is-skipped");
  if (state.status && !state.live && !state.complete && !state.skipped) element.classList.add(`is-${state.status}`);
}

function applyFlowIdentity(element, presentation) {
  element.dataset.flowModule = presentation.module;
  if (presentation.level) {
    element.dataset.flowLevel = presentation.level;
    element.classList.add(`flow-${presentation.level}`);
  }
  return element;
}

function appendCompletionIndicator(group, width) {
  group.append(svg("circle", {
    cx: width - 10,
    cy: 10,
    r: 4,
    class: "completion-indicator",
    "aria-hidden": "true",
  }));
}

function relatedEndpointIds(id) {
  const ids = new Set([id]);
  for (const [executableId, aliases] of detailEndpointAliases) {
    if (executableId === id || aliases.includes(id)) {
      ids.add(executableId);
      for (const alias of aliases) ids.add(alias);
    }
  }
  return ids;
}

function setNeighborhoodEmphasis(root, id, active) {
  for (const element of root.querySelectorAll(".is-inspected, .is-related, .is-context-dimmed")) {
    element.classList.remove("is-inspected", "is-related", "is-context-dimmed");
  }
  if (!active) return;

  const endpoints = relatedEndpointIds(id);
  const neighbors = new Set(endpoints);
  const relatedEdges = new Set();
  for (const edge of root.querySelectorAll(".graph-edge[data-from][data-to]")) {
    const related = endpoints.has(edge.dataset.from) || endpoints.has(edge.dataset.to);
    edge.classList.toggle("is-related", related);
    edge.classList.toggle("is-context-dimmed", !related);
    if (related) {
      relatedEdges.add(edge.dataset.topologyEdge ?? edge.dataset.projectionEdge ?? edge.dataset.edgeId);
      neighbors.add(edge.dataset.from);
      neighbors.add(edge.dataset.to);
    }
  }

  for (const node of root.querySelectorAll("[data-node-id], [data-detail-node-id]")) {
    const nodeId = node.dataset.nodeId ?? node.dataset.detailNodeId;
    const inspected = endpoints.has(nodeId);
    node.classList.toggle("is-inspected", inspected);
    node.classList.toggle("is-related", !inspected && neighbors.has(nodeId));
    node.classList.toggle("is-context-dimmed", !neighbors.has(nodeId));
  }

  const groups = [...root.querySelectorAll("[data-group-id]")];
  const groupsById = new Map(groups.map((group) => [group.dataset.groupId, group]));
  const emphasizedGroupIds = new Set();
  const includeGroupHierarchy = (groupId) => {
    let currentId = groupId;
    while (currentId && groupsById.has(currentId) && !emphasizedGroupIds.has(currentId)) {
      emphasizedGroupIds.add(currentId);
      currentId = groupsById.get(currentId).dataset.parentGroupId;
    }
  };
  for (const node of root.querySelectorAll("[data-parent-group-id]")) {
    if (!node.classList.contains("is-context-dimmed")) includeGroupHierarchy(node.dataset.parentGroupId);
  }
  for (const group of groups) {
    const emphasized = emphasizedGroupIds.has(group.dataset.groupId);
    group.classList.toggle("is-related", emphasized);
    group.classList.toggle("is-context-dimmed", !emphasized);
  }
  for (const label of root.querySelectorAll("[data-relation-label-for]")) {
    label.classList.toggle("is-related", relatedEdges.has(label.dataset.relationLabelFor));
    label.classList.toggle("is-context-dimmed", !relatedEdges.has(label.dataset.relationLabelFor));
  }
}

function makeInteractive(group, item, type, root, onNodeSelect) {
  group.setAttribute("role", "button");
  group.setAttribute("tabindex", "-1");
  const selection = { ...item, type };
  const inspect = () => setNeighborhoodEmphasis(root, item.id, true);
  const clear = () => setNeighborhoodEmphasis(root, item.id, false);
  group.addEventListener("mouseenter", inspect);
  group.addEventListener("mouseleave", clear);
  group.addEventListener("pointerenter", inspect);
  group.addEventListener("pointerleave", clear);
  group.addEventListener("focus", inspect);
  group.addEventListener("blur", clear);
  group.addEventListener("click", () => onNodeSelect?.(selection));
  group.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    onNodeSelect?.(selection);
  });
}

function configureRovingFocus(root, currentEvent) {
  const nodes = [...root.querySelectorAll('[role="button"]')];
  if (!nodes.length) return;
  const currentId = currentEvent?.nodeId;
  const alias = focusAliases.get(currentId);
  const initial = root.querySelector(`[data-node-id="${currentId}"][role="button"]`)
    ?? (alias ? root.querySelector(`[data-detail-node-id="${alias}"]`) : null)
    ?? nodes[0];

  const selectTabStop = (selected) => {
    for (const node of nodes) node.setAttribute("tabindex", node === selected ? "0" : "-1");
  };
  selectTabStop(initial);

  for (const [index, node] of nodes.entries()) {
    node.addEventListener("focus", () => selectTabStop(node));
    node.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const targetIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? nodes.length - 1
          : (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + nodes.length) % nodes.length;
      nodes[targetIndex].focus();
    });
  }
}

function renderPanel(item, type, state = {}) {
  const { x, y, w, h } = item.bounds;
  const attributes = {
    transform: `translate(${x} ${y})`,
    role: "group",
    "aria-label": `${item.label.zh} ${item.label.en}`,
  };
  if (type === "system") attributes["data-system-boundary"] = item.id;
  else {
    attributes["data-group-id"] = item.id;
    attributes["data-parent-group-id"] = item.parentId;
  }
  const group = svg("g", attributes);
  group.classList.add(type === "system" ? "system-boundary" : "reference-group");
  if (type === "group") group.classList.add(`parent-${item.parentId}`, `layout-${item.layout}`);
  applyVisualState(group, state);
  group.append(svg("rect", { width: w, height: h, rx: type === "system" ? 20 : 14 }));
  const title = svg("text", { x: 14, y: 20, class: "primary-label group-title" });
  title.textContent = item.label.zh;
  const support = svg("text", { x: 14, y: 33, class: "group-en", "font-size": 9 });
  support.textContent = item.label.en;
  group.append(title, support);
  return group;
}

function renderDetailNode(detail, state, isEndpoint, interaction) {
  const { x, y, w, h } = detail.bounds;
  const group = svg("g", {
    "data-detail-node-id": detail.id,
    "data-parent-group-id": detail.groupId,
    transform: `translate(${x} ${y})`,
    role: "button",
    tabindex: 0,
    "aria-label": `${detail.label.zh} ${detail.label.en}${detail.description ? ` ${detail.description.zh} ${detail.description.en}` : ""}`,
  });
  group.classList.add("detail-node", `in-${detail.groupId}`);
  applyVisualState(group, state);
  if (isEndpoint) group.classList.add("is-relation-endpoint");
  group.append(svg("rect", { width: w, height: h, rx: h > 30 ? 8 : 5 }));
  if (state.complete) appendCompletionIndicator(group, w);

  if (detail.description) {
    const lineYs = [-13.5, -4.5, 4.5, 13.5].map((offset) => h / 2 + offset);
    const label = svg("text", { x: w / 2, y: lineYs[0], "text-anchor": "middle", "dominant-baseline": "middle", class: "detail-label" });
    label.textContent = detail.label.zh;
    const support = svg("text", { x: w / 2, y: lineYs[1], "text-anchor": "middle", "dominant-baseline": "middle", class: "detail-en" });
    support.textContent = detail.label.en;
    const zh = svg("text", { x: w / 2, y: lineYs[2], "text-anchor": "middle", "dominant-baseline": "middle", class: "detail-description" });
    zh.textContent = detail.description.zh;
    const en = svg("text", { x: w / 2, y: lineYs[3], "text-anchor": "middle", "dominant-baseline": "middle", class: "detail-description detail-description--en" });
    en.textContent = detail.description.en;
    group.append(label, support, zh, en);
  } else {
    const zh = svg("text", { x: w / 2, y: h / 2 - 4, "text-anchor": "middle", "dominant-baseline": "middle", class: "detail-label" });
    zh.textContent = detail.label.zh;
    const en = svg("text", { x: w / 2, y: h / 2 + 4, "text-anchor": "middle", "dominant-baseline": "middle", class: "detail-en" });
    en.textContent = detail.label.en;
    group.append(zh, en);
  }
  makeInteractive(group, detail, "detail", interaction.root, interaction.onNodeSelect);
  return group;
}

function renderExecutableNode(node, state, isEndpoint, interaction) {
  const { x, y, w, h } = node.referencePosition;
  const status = state.status;
  const showTextStatus = status && status !== "completed";
  const suffix = status ? ` · ${statusLabels[status] ?? status}` : "";
  const proxy = interaction.proxyExecutableIds?.has(node.id) ?? false;
  const parentGroupId = node.groupId ?? (["core", "rag", "tools"].includes(node.moduleId) ? `${node.moduleId}-group` : null);
  const group = svg("g", {
    "data-node-id": node.id,
    ...(parentGroupId ? { "data-parent-group-id": parentGroupId } : {}),
    transform: `translate(${x} ${y})`,
    ...(proxy
      ? { "aria-hidden": "true" }
      : { role: "button", tabindex: 0, "aria-label": `${node.label.zh} ${node.label.en}${suffix}` }),
  });
  group.classList.add("graph-node", `node-${node.kind}`);
  applyVisualState(group, state);
  if (isEndpoint) group.classList.add("is-relation-endpoint");

  if (proxy) group.classList.add("graph-node--proxy");
  if (!proxy) {
    group.append(svg("rect", { width: w, height: h, rx: Math.min(10, h / 4) }));
    if (state.complete) appendCompletionIndicator(group, w);
    const lineYs = showTextStatus ? [h / 2 - 13, h / 2, h / 2 + 13] : [h / 2 - 7, h / 2 + 7];
    const zh = svg("text", { x: w / 2, y: lineYs[0], "text-anchor": "middle", "dominant-baseline": "middle", class: "primary-label node-label" });
    zh.textContent = node.label.zh;
    const en = svg("text", { x: w / 2, y: lineYs[1], "text-anchor": "middle", "dominant-baseline": "middle", class: "node-en" });
    en.textContent = node.label.en;
    group.append(zh, en);
    if (showTextStatus) {
      const statusText = svg("text", { x: w / 2, y: lineYs[2], "text-anchor": "middle", "dominant-baseline": "middle", class: "status-label" });
      statusText.textContent = statusLabels[status] ?? status;
      group.append(statusText);
    }
  }
  if (!proxy) makeInteractive(group, node, "executable", interaction.root, interaction.onNodeSelect);
  return group;
}

function edgePulse({ key, edgeId, pathData, start, topology = true, presentation }) {
  const attributes = { class: "edge-pulse", "aria-hidden": true };
  if (topology) attributes["data-topology-edge-pulse-for"] = key;
  if (edgeId) attributes["data-edge-pulse-for"] = edgeId;
  const pulse = svg("g", attributes);
  if (presentation) applyFlowIdentity(pulse, presentation);
  const moving = svg("circle", { class: "edge-pulse__moving", r: 3.5 });
  moving.append(svg("animateMotion", { path: pathData, dur: "1.2s", repeatCount: "indefinite" }));
  const staticPulse = svg("circle", { class: "edge-pulse__static", cx: start.x, cy: start.y, r: 3.5 });
  pulse.append(moving, staticPulse);
  return pulse;
}

function relationEndpoints(graph, run, currentEvent) {
  const endpoints = new Set();
  if (currentEvent?.relation === "callback" && currentEvent.targetNodeId) {
    endpoints.add(currentEvent.nodeId);
    endpoints.add(currentEvent.targetNodeId);
  } else {
    const entry = run.trace.at(-1);
    if (entry && entry.relation !== "complete") {
      const source = graph.events.find((event) => event.id === entry.from)?.nodeId;
      const target = graph.events.find((event) => event.id === entry.to)?.nodeId;
      if (source) endpoints.add(source);
      if (target) endpoints.add(target);
    }
  }
  for (const id of [...endpoints]) for (const alias of detailEndpointAliases.get(id) ?? []) endpoints.add(alias);
  return endpoints;
}

function canvasRecordFor(container, graph, run, initialViewport) {
  const initialEventId = graph.events[0]?.id;
  const records = canvasStates.get(container) ?? new Map();
  const diagramId = graph.id ?? "default-diagram";
  const prior = records.get(diagramId);
  const restarted = prior && run.currentEventId === initialEventId && prior.lastEventId !== initialEventId;
  const record = !prior || restarted
    ? { viewport: !prior && initialViewport ? initialViewport : createCanvasViewport(), lastEventId: run.currentEventId }
    : { ...prior, lastEventId: run.currentEventId };
  records.set(diagramId, record);
  canvasStates.set(container, records);
  return record;
}

function renderCanvasControls(container, root, record, onCanvasViewportChange) {
  const controls = document.createElement("div");
  controls.className = "canvas-controls";
  controls.setAttribute("aria-label", "画布缩放 Canvas zoom");
  controls.innerHTML = `<button type="button" data-canvas-action="zoom-out" aria-label="缩小 Zoom out">−</button><output data-canvas-zoom aria-label="当前缩放 Current zoom"></output><button type="button" data-canvas-action="zoom-in" aria-label="放大 Zoom in">+</button><button type="button" data-canvas-action="fit" aria-label="适应屏幕 Fit to screen">适应<small>Fit</small></button>`;

  const apply = (next, notify = true) => {
    record.viewport = next;
    root.setAttribute("viewBox", viewBoxFor(next));
    controls.querySelector("[data-canvas-zoom]").textContent = `${Math.round(next.zoom * 100)}%`;
    if (notify) onCanvasViewportChange?.(next);
  };
  const center = () => {
    const [x, y, width, height] = viewBoxFor(record.viewport).split(" ").map(Number);
    return { x: x + width / 2, y: y + height / 2 };
  };

  controls.querySelector('[data-canvas-action="zoom-out"]').onclick = () => apply(zoomCanvasAt(record.viewport, record.viewport.zoom / 1.25, center()));
  controls.querySelector('[data-canvas-action="zoom-in"]').onclick = () => apply(zoomCanvasAt(record.viewport, record.viewport.zoom * 1.25, center()));
  controls.querySelector('[data-canvas-action="fit"]').onclick = () => apply(createCanvasViewport());
  apply(record.viewport, false);
  container.append(controls);
  return apply;
}

function bindCanvasGestures(root, record, apply) {
  root.classList.add("is-pannable");
  const diagramPoint = (clientX, clientY) => {
    const rect = root.getBoundingClientRect();
    const [x, y, width, height] = viewBoxFor(record.viewport).split(" ").map(Number);
    const normalizedX = rect.width ? (clientX - rect.left) / rect.width : 0.5;
    const normalizedY = rect.height ? (clientY - rect.top) / rect.height : 0.5;
    return { x: x + normalizedX * width, y: y + normalizedY * height };
  };

  root.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (wheelActionFor(event) === "zoom") {
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      apply(zoomCanvasAt(record.viewport, record.viewport.zoom * factor, diagramPoint(event.clientX, event.clientY)));
      return;
    }
    const rect = root.getBoundingClientRect();
    const [, , width, height] = viewBoxFor(record.viewport).split(" ").map(Number);
    apply(panCanvasBy(record.viewport, rect.width ? event.deltaX * width / rect.width : event.deltaX, rect.height ? event.deltaY * height / rect.height : event.deltaY));
  }, { passive: false });

  let drag = null;
  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest?.('[role="button"]')) return;
    drag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    root.classList.add("is-panning");
    root.setPointerCapture?.(event.pointerId);
  });
  root.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = root.getBoundingClientRect();
    const [, , width, height] = viewBoxFor(record.viewport).split(" ").map(Number);
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    apply(panCanvasBy(record.viewport, rect.width ? -dx * width / rect.width : -dx, rect.height ? -dy * height / rect.height : -dy));
  });
  const stopDrag = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    root.releasePointerCapture?.(event.pointerId);
    root.classList.remove("is-panning");
    drag = null;
  };
  root.addEventListener("pointerup", stopDrag);
  root.addEventListener("pointercancel", stopDrag);
}

export function renderGraph(container, { graph, run, onNodeSelect, canvasViewport, onCanvasViewportChange }) {
  const canvasRecord = canvasRecordFor(container, graph, run, canvasViewport);
  const root = svg("svg", { viewBox: viewBoxFor(canvasRecord.viewport), preserveAspectRatio: "xMidYMid meet", role: "group", "aria-label": "Agent 架构与执行路径", "aria-describedby": "graph-keyboard-help" });
  root.classList.add("architecture-graph");
  const keyboardHelp = svg("desc", { id: "graph-keyboard-help" });
  keyboardHelp.textContent = "Tab 进入主图，方向键浏览节点，Enter 或空格查看详情。Tab into the graph, use Arrow keys to browse nodes, and Enter or Space to open details.";
  root.append(keyboardHelp);
  appendMarkers(root);

  const routingContext = createRoutingContext(graph);
  const contextGate = routingContext.contextGate;
  const resolve = routingContext.resolve;
  const currentEvent = graph.events.find((event) => event.id === run.currentEventId);
  const endpoints = relationEndpoints(graph, run, currentEvent);
  const groupsLayer = svg("g", { "data-layer": "groups" });
  const edgesLayer = svg("g", { "data-layer": "topology-edges" });
  const labelsLayer = svg("g", { "data-layer": "relation-labels", "aria-hidden": "true" });
  const nodesLayer = svg("g", { "data-layer": "nodes" });
  const guardrailsLayer = svg("g", { "data-layer": "guardrails" });
  const pulsesLayer = svg("g", { "data-layer": "live-pulses" });
  root.append(groupsLayer, edgesLayer, labelsLayer, nodesLayer, guardrailsLayer, pulsesLayer);

  for (const group of graph.groups) {
    const rendered = renderPanel(group, "group", referenceVisualState(graph, run, group.id));
    applyFlowIdentity(rendered, { module: flowModuleForGroup(group.id) });
    groupsLayer.append(rendered);
  }

  for (const edge of graph.topologyEdges) {
    const key = topologyEdgeKey(edge);
    const meta = topologyEdgeMeta(edge);
    const state = referenceEdgeState(graph, run, edge);
    const route = routeTopologyEdge(edge, routingContext);
    const flowPresentation = flowPresentationForConnection(edge.from, edge.to);
    const attributes = {
      d: route.d,
      "data-topology-edge": key,
      "data-from": edge.from,
      "data-to": edge.to,
      "marker-end": "url(#arrow)",
      "aria-label": route.label?.text ?? relationLabels[state.relation] ?? `流向 ${edge.from} 到 ${edge.to}`,
      "data-route-kind": route.kind,
      "data-flow-module": flowPresentation.module,
      "data-flow-level": flowPresentation.level,
    };
    if (route.corridor) attributes["data-route-corridor"] = route.corridor;
    if (meta.edgeId) attributes["data-edge-id"] = meta.edgeId;
    if (meta.branch) attributes["data-branch"] = meta.branch;
    const path = svg("path", attributes);
    path.classList.add("graph-edge", `edge-${state.relation ?? "topology"}`, `flow-${flowPresentation.level}`);
    if (state.relation) path.classList.add(`is-${state.relation}`);
    if (meta.feedback) path.classList.add("is-feedback", "is-nonlinear");
    const presentation = edgePresentation[key];
    if (presentation?.lane) {
      path.classList.add("is-parallel-lane");
      path.dataset.fanoutOrigin = "llm";
      path.dataset.lane = presentation.lane;
    }
    if (presentation?.callback) path.classList.add("is-callback");
    if (key === "orchestrator->llm") path.classList.add("feeds-parallel-fanout");
    if (state.live) path.classList.add("is-live");
    if (state.complete) path.classList.add("is-complete");
    if (state.skipped) path.classList.add("is-skipped");
    edgesLayer.append(path);
    if (route.label) appendRelationLabel(labelsLayer, key, route.label.text, route.label.x, route.label.y);
    if (state.live) pulsesLayer.append(edgePulse({ key, edgeId: meta.edgeId, pathData: route.d, start: route.start, presentation: flowPresentation }));
  }

  const retryEdge = (graph.edges ?? []).find((edge) => edge.id === "e18");
  if (retryEdge) {
    const selectedBranches = run.selectedBranches ?? run.activeBranches ?? [];
    const completedEdgeIds = completedEdgeIdsForTrace(graph, run.trace);
    const transitionEdgeIds = activeTransitionEdgeIds(graph, run.trace);
    const live = isCurrentLiveEdge(currentEvent, retryEdge, selectedBranches, run.completedBranches) || transitionEdgeIds.has(retryEdge.id);
    const route = routeRetryEdge(routingContext);
    const retryPresentation = flowPresentationForConnection("observation", "action");
    const retry = svg("path", {
      d: route.d,
      "data-edge-id": retryEdge.id,
      "data-runtime-edge": "observation->action",
      "marker-end": "url(#arrow)",
      "aria-label": relationLabels.retry,
      "data-route-kind": route.kind,
      "data-route-corridor": route.corridor,
      "data-flow-module": retryPresentation.module,
      "data-flow-level": retryPresentation.level,
    });
    retry.classList.add("graph-edge", "edge-retry", "is-retry", "is-feedback", "is-nonlinear", `flow-${retryPresentation.level}`);
    if (live) retry.classList.add("is-live");
    if (completedEdgeIds.has(retryEdge.id)) retry.classList.add("is-complete");
    edgesLayer.append(retry);
    appendRelationLabel(labelsLayer, retryEdge.id, relationLabels.retry, 1080, 730);
    if (live) pulsesLayer.append(edgePulse({ key: retryEdge.id, edgeId: retryEdge.id, pathData: route.d, start: route.start, topology: false, presentation: retryPresentation }));
  }

  const dependencyRoutes = [
    {
      key: "rag-context-assembly->context-dependency-gate",
      from: "rag-context-assembly",
      to: CONTEXT_GATE_ID,
      label: "需要上下文 · Context required",
    },
    { key: "context-dependency-gate->code-execution-sandbox", from: CONTEXT_GATE_ID, to: "code-execution-sandbox", tool: "sandbox", label: "沙箱分支 · Sandbox" },
    { key: "context-dependency-gate->external-environment-business-system", from: CONTEXT_GATE_ID, to: "external-environment-business-system", tool: "external", label: "外部系统 · External" },
  ];
  const gateState = contextGate ? contextGateState(run) : null;
  for (const dependency of contextGate ? dependencyRoutes : []) {
    const route = routeTopologyEdge(dependency, routingContext);
    const flowPresentation = flowPresentationForConnection(dependency.from, dependency.to);
    const path = svg("path", {
      d: route.d,
      "data-projection-edge": dependency.key,
      "data-from": dependency.from,
      "data-to": dependency.to,
      "marker-end": "url(#arrow)",
      "aria-label": dependency.label,
      "data-route-kind": route.kind,
      "data-route-corridor": route.corridor,
      "data-flow-module": flowPresentation.module,
      "data-flow-level": flowPresentation.level,
    });
    path.classList.add("graph-edge", "is-context-dependency", "is-feedback", `flow-${flowPresentation.level}`);
    if (dependency.tool) path.dataset.tool = dependency.tool;
    if (dependency.to === CONTEXT_GATE_ID && gateState.ready) path.classList.add("is-complete");
    if (dependency.tool && run.parallelWork?.kind === "tools") {
      const selected = run.parallelWork.selected.includes(dependency.tool);
      const complete = run.parallelWork.completed.includes(dependency.tool);
      if (selected && !complete && (gateState.ready || gateState.independent)) path.classList.add("is-live");
      if (selected && complete) path.classList.add("is-complete");
      if (!selected) path.classList.add("is-skipped");
    }
    edgesLayer.append(path);
    if (path.classList.contains("is-live")) pulsesLayer.append(edgePulse({ key: dependency.key, pathData: route.d, start: route.start, presentation: flowPresentation }));
  }

  for (const detail of graph.detailNodes) {
    const rendered = renderDetailNode(detail, referenceVisualState(graph, run, detail.id), endpoints.has(detail.id), { root, onNodeSelect });
    applyFlowIdentity(rendered, { module: flowModuleForDetail(detail) });
    nodesLayer.append(rendered);
  }
  if (contextGate) {
    const renderedGate = renderDetailNode(contextGate, gateState, false, { root, onNodeSelect });
    renderedGate.dataset.layoutSource = "tools-group";
    applyFlowIdentity(renderedGate, { module: flowModuleForDetail(contextGate) });
    renderedGate.classList.add("context-gate");
    if (gateState.waiting) renderedGate.classList.add("is-waiting");
    if (gateState.ready) renderedGate.classList.add("is-ready");
    if (gateState.independent) renderedGate.classList.add("is-independent");
    nodesLayer.append(renderedGate);
  }
  const proxyExecutableIds = new Set(graph.presentation?.proxyExecutableIds ?? []);
  for (const node of graph.nodes) {
    const rendered = renderExecutableNode(node, referenceVisualState(graph, run, node.id), endpoints.has(node.id), { root, onNodeSelect, proxyExecutableIds });
    applyFlowIdentity(rendered, { module: flowModuleForNode(node.id) });
    nodesLayer.append(rendered);
  }
  configureRovingFocus(root, currentEvent);

  const guardrails = renderPanel({ ...graph.guardrails, label: graph.guardrails.label }, "group");
  guardrails.removeAttribute("data-group-id");
  guardrails.classList.remove("reference-group", "parent-undefined", "layout-undefined");
  guardrails.classList.add("guardrails-band");
  guardrails.setAttribute("aria-label", `${graph.guardrails.label.zh} ${graph.guardrails.label.en}`);
  guardrails.querySelector(".group-title").textContent = `${graph.guardrails.label.zh} · ${graph.guardrails.label.en}`;
  guardrails.querySelector(".group-title").setAttribute("x", graph.guardrails.bounds.w / 2);
  guardrails.querySelector(".group-title").setAttribute("y", 30);
  guardrails.querySelector(".group-title").setAttribute("text-anchor", "middle");
  guardrails.querySelector(".group-en").remove();
  guardrailsLayer.append(guardrails);

  const legend = document.createElement("ul");
  legend.className = "flow-legend";
  legend.setAttribute("aria-label", "线路状态图例 Route status legend");
  for (const [state, zh, en] of [
    ["live", "运行中", "Running"],
    ["complete", "已完成", "Completed"],
    ["callback", "回传", "Callback"],
    ["issue", "异常/重试", "Issue / Retry"],
  ]) {
    const item = document.createElement("li");
    item.dataset.legendState = state;
    item.innerHTML = `<i aria-hidden="true"></i><span>${zh}<small>${en}</small></span>`;
    legend.append(item);
  }
  container.replaceChildren(root, legend);
  const applyCanvas = renderCanvasControls(container, root, canvasRecord, onCanvasViewportChange);
  bindCanvasGestures(root, canvasRecord, applyCanvas);
}

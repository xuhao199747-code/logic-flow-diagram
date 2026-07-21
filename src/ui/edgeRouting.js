const keyOf = ({ from, to }) => `${from}->${to}`;

const center = ({ x, y, w, h }) => ({ x: x + w / 2, y: y + h / 2 });

export function pointOnSide(bounds, side, fraction = .5) {
  if (side === "top") return { x: bounds.x + bounds.w * fraction, y: bounds.y };
  if (side === "bottom") return { x: bounds.x + bounds.w * fraction, y: bounds.y + bounds.h };
  if (side === "left") return { x: bounds.x, y: bounds.y + bounds.h * fraction };
  return { x: bounds.x + bounds.w, y: bounds.y + bounds.h * fraction };
}

function boundaryToward(bounds, target) {
  const origin = center(bounds);
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  if (!dx && !dy) return origin;
  const scale = 1 / Math.max(Math.abs(dx) / (bounds.w / 2), Math.abs(dy) / (bounds.h / 2));
  return { x: origin.x + dx * scale, y: origin.y + dy * scale };
}

export function contextGateProjection(graph) {
  const tools = graph.groups.find((group) => group.id === "tools-group").bounds;
  return {
    id: "context-dependency-gate",
    groupId: "tools-group",
    bounds: { x: tools.x + 330, y: tools.y + 98, w: 165, h: 42 },
    label: { zh: "上下文依赖门", en: "Context Gate" },
    description: { zh: "依赖:等待 · 无依赖:并发", en: "Dependent: Wait · Independent: Continue" },
  };
}

export function createRoutingContext(graph) {
  const endpoints = new Map();
  const register = (id, bounds) => {
    if (!id || !bounds || endpoints.has(id)) throw new Error(`Invalid or duplicate reference endpoint: ${id}`);
    endpoints.set(id, bounds);
  };

  register(graph.systemBoundary.id, graph.systemBoundary.bounds);
  for (const group of graph.groups) register(group.id, group.bounds);
  for (const detail of graph.detailNodes) register(detail.id, detail.bounds);
  for (const node of graph.nodes) register(node.id, node.referencePosition);
  const contextGate = contextGateProjection(graph);
  register(contextGate.id, contextGate.bounds);
  register(graph.guardrails.id, graph.guardrails.bounds);

  return {
    graph,
    contextGate,
    resolve(id) {
      const bounds = endpoints.get(id);
      if (!bounds) throw new Error(`Unknown reference endpoint: ${id}`);
      return bounds;
    },
  };
}

function roundedPath(points, radius = 8) {
  if (points.length < 3) return `M ${points[0].x} ${points[0].y} L ${points.at(-1).x} ${points.at(-1).y}`;
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const incoming = Math.min(radius, Math.abs(corner.x - previous.x) + Math.abs(corner.y - previous.y));
    const outgoing = Math.min(radius, Math.abs(next.x - corner.x) + Math.abs(next.y - corner.y));
    const before = {
      x: corner.x === previous.x ? corner.x : corner.x + Math.sign(previous.x - corner.x) * incoming,
      y: corner.y === previous.y ? corner.y : corner.y + Math.sign(previous.y - corner.y) * incoming,
    };
    const after = {
      x: corner.x === next.x ? corner.x : corner.x + Math.sign(next.x - corner.x) * outgoing,
      y: corner.y === next.y ? corner.y : corner.y + Math.sign(next.y - corner.y) * outgoing,
    };
    commands.push(`L ${before.x} ${before.y}`, `Q ${corner.x} ${corner.y} ${after.x} ${after.y}`);
  }
  const end = points.at(-1);
  commands.push(`L ${end.x} ${end.y}`);
  return commands.join(" ");
}

function orthogonal(points, corridor = null, label = null) {
  return {
    kind: "orthogonal",
    corridor,
    label,
    points,
    start: points[0],
    end: points.at(-1),
    d: roundedPath(points),
  };
}

function direct(from, to) {
  const start = boundaryToward(from, center(to));
  const end = boundaryToward(to, center(from));
  return { kind: "direct", corridor: null, label: null, points: [start, end], start, end, d: `M ${start.x} ${start.y} L ${end.x} ${end.y}` };
}

function curve(start, end, control1, control2, corridor = null) {
  return {
    kind: "curve",
    corridor,
    label: null,
    points: [start, end],
    start,
    end,
    d: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
  };
}

export function routeTopologyEdge(edge, context) {
  const key = keyOf(edge);
  const { resolve } = context;
  const from = resolve(edge.from);
  const to = resolve(edge.to);

  if (key === "llm->planning") {
    const start = pointOnSide(from, "bottom", .32);
    const end = pointOnSide(to, "top", .32);
    return orthogonal([start, { x: start.x, y: 290 }, { x: end.x, y: 290 }, end]);
  }
  if (key === "planning->llm") {
    const start = pointOnSide(from, "top", .22);
    const end = pointOnSide(to, "left", .62);
    return orthogonal([
      start,
      { x: start.x, y: 286 },
      { x: 326, y: 286 },
      { x: 326, y: end.y },
      end,
    ], "planning-return");
  }
  if (key === "llm->memory") {
    const start = pointOnSide(from, "bottom", .68);
    const end = pointOnSide(to, "top", .32);
    return orthogonal([start, { x: start.x, y: 290 }, { x: end.x, y: 290 }, end]);
  }
  if (key === "memory->llm") {
    const start = pointOnSide(from, "top", .82);
    const end = pointOnSide(to, "right", .62);
    return orthogonal([
      start,
      { x: start.x, y: 286 },
      { x: 704, y: 286 },
      { x: 704, y: end.y },
      end,
    ], "memory-return");
  }
  if (key === "rag-context-assembly->llm") {
    const start = pointOnSide(from, "bottom");
    const end = pointOnSide(to, "right");
    const points = [start, { x: start.x, y: 548 }, { x: 740, y: 548 }, { x: 740, y: end.y }, end];
    return orthogonal(points, "context-return", { text: "上下文回传 · Context Callback", x: 1080, y: 548 });
  }
  if (key === "observation->llm") {
    const start = pointOnSide(from, "right");
    const end = pointOnSide(to, "right");
    const points = [start, { x: 1370, y: start.y }, { x: 1370, y: 86 }, { x: 740, y: 86 }, { x: 740, y: end.y }, end];
    return orthogonal(points, "observation-return", { text: "观察回传 · Observation Callback", x: 1120, y: 86 });
  }
  if (key === "observation->planning") {
    const start = pointOnSide(from, "bottom");
    const end = pointOnSide(to, "bottom");
    const points = [start, { x: start.x, y: 738 }, { x: end.x, y: 738 }, end];
    return orthogonal(points, "replan-return", { text: "评估失败：重规划 · Replan on Failure", x: 865, y: 738 });
  }
  if (key === "memory->action") {
    const start = pointOnSide(from, "bottom");
    const end = pointOnSide(to, "top");
    return orthogonal([start, { x: start.x, y: 548 }, { x: end.x, y: 548 }, end], "state-feed");
  }
  if (key === "llm->final-response") {
    const start = pointOnSide(from, "left");
    const end = pointOnSide(to, "right");
    return orthogonal([start, { x: 270, y: start.y }, { x: 270, y: end.y }, end], "final-output");
  }
  if (key === "llm->rag-query") {
    const start = pointOnSide(from, "right");
    const end = pointOnSide(to, "left");
    return orthogonal([start, { x: 740, y: start.y }, { x: 740, y: end.y }, end], "dispatch-rag", { text: "并行检索 · Parallel Retrieval", x: 740, y: 205 });
  }
  if (key === "llm->tools-group") {
    const start = pointOnSide(from, "right");
    const end = pointOnSide(to, "top");
    return orthogonal([start, { x: 720, y: start.y }, { x: 720, y: 548 }, { x: end.x, y: 548 }, end], "dispatch-tools", { text: "并行工具准备 · Parallel Tool Prep", x: 610, y: 548 });
  }
  if (key === "code-execution-sandbox->action") {
    const start = pointOnSide(from, "top", .72);
    const end = pointOnSide(to, "top", .45);
    return orthogonal([start, { x: start.x, y: 586 }, { x: end.x, y: 586 }, end], "tool-sandbox-merge");
  }
  if (key === "external-environment-business-system->action") {
    const start = pointOnSide(from, "right");
    const end = pointOnSide(to, "left");
    return orthogonal([start, { x: 990, y: start.y }, { x: 990, y: end.y }, end], "tool-external-merge");
  }
  if (key === "rag-context-assembly->context-dependency-gate") {
    const start = pointOnSide(from, "bottom", .72);
    const end = pointOnSide(to, "right");
    return orthogonal([start, { x: start.x, y: 548 }, { x: 1348, y: 548 }, { x: 1348, y: end.y }, end], "context-gate-feed");
  }
  if (key === "context-dependency-gate->code-execution-sandbox") {
    const start = pointOnSide(from, "left", .45);
    const end = pointOnSide(to, "bottom", .76);
    return orthogonal([start, { x: 780, y: start.y }, { x: 780, y: 660 }, { x: end.x, y: 660 }, end], "tool-sandbox-dispatch");
  }
  if (key === "context-dependency-gate->external-environment-business-system") {
    const start = pointOnSide(from, "top", .5);
    const end = pointOnSide(to, "bottom", .58);
    return orthogonal([start, { x: start.x, y: 660 }, { x: end.x, y: 660 }, end], "tool-external-dispatch");
  }
  if (edge.from === "rag-routing" && ["embedding-vectorization", "keyword-search", "rag-web-search"].includes(edge.to)) {
    if (edge.to === "embedding-vectorization") {
      const start = pointOnSide(from, "bottom", .2);
      const end = pointOnSide(to, "right");
      return orthogonal([
        start,
        { x: start.x, y: 208 },
        { x: 950, y: 208 },
        { x: 950, y: end.y },
        end,
      ], "rag-fanout");
    }
    const fractions = { "embedding-vectorization": .2, "keyword-search": .5, "rag-web-search": .8 };
    const start = pointOnSide(from, "bottom", fractions[edge.to]);
    const end = pointOnSide(to, "top");
    const corridorY = (from.y + from.h + to.y) / 2;
    return orthogonal([start, { x: start.x, y: corridorY }, { x: end.x, y: corridorY }, end], "rag-fanout");
  }
  if (["vector-top-k", "database-top-k", "web-top-k"].includes(edge.from) && edge.to === "result-merge-deduplicate") {
    const fractions = { "vector-top-k": .2, "database-top-k": .5, "web-top-k": .8 };
    const start = pointOnSide(from, "bottom");
    const end = pointOnSide(to, "top", fractions[edge.from]);
    const corridorY = 430;
    return orthogonal([start, { x: start.x, y: corridorY }, { x: end.x, y: corridorY }, end], "rag-fanin");
  }
  return direct(from, to);
}

export function routeRetryEdge(context) {
  const from = context.resolve("observation");
  const to = context.resolve("action");
  const start = pointOnSide(from, "bottom", .72);
  const end = pointOnSide(to, "bottom", .28);
  const bendY = 710;
  return curve(start, end, { x: start.x, y: bendY }, { x: end.x, y: bendY }, "retry-loop");
}

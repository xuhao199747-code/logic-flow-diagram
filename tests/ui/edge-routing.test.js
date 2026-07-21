import { describe, expect, it } from "vitest";
import { demoGraph } from "../../src/data/demo-graph.js";
import { createRoutingContext, routeTopologyEdge } from "../../src/ui/edgeRouting.js";

const keyOf = ({ from, to }) => `${from}->${to}`;

function onBoundary(point, bounds) {
  const vertical = (point.x === bounds.x || point.x === bounds.x + bounds.w)
    && point.y >= bounds.y && point.y <= bounds.y + bounds.h;
  const horizontal = (point.y === bounds.y || point.y === bounds.y + bounds.h)
    && point.x >= bounds.x && point.x <= bounds.x + bounds.w;
  return vertical || horizontal;
}

function inside(point, bounds, padding = 0) {
  return point.x > bounds.x - padding && point.x < bounds.x + bounds.w + padding
    && point.y > bounds.y - padding && point.y < bounds.y + bounds.h + padding;
}

describe("edge routing corridors", () => {
  const context = createRoutingContext(demoGraph);
  const routes = new Map(demoGraph.topologyEdges.map((edge) => [keyOf(edge), routeTopologyEdge(edge, context)]));

  it("anchors every topology route on the exact endpoint boundaries", () => {
    for (const edge of demoGraph.topologyEdges) {
      const route = routes.get(keyOf(edge));
      expect(onBoundary(route.start, context.resolve(edge.from))).toBe(true);
      expect(onBoundary(route.end, context.resolve(edge.to))).toBe(true);
    }
  });

  it("assigns cross-module feedback paths to distinct named corridors", () => {
    expect(routes.get("llm->rag-query")).toMatchObject({ kind: "orthogonal", corridor: "dispatch-rag" });
    expect(routes.get("llm->tools-group")).toMatchObject({ kind: "orthogonal", corridor: "dispatch-tools" });
    expect(routes.get("rag-context-assembly->llm")).toMatchObject({ kind: "orthogonal", corridor: "context-return" });
    expect(routes.get("observation->llm")).toMatchObject({ kind: "orthogonal", corridor: "observation-return" });
    expect(routes.get("observation->planning")).toMatchObject({ kind: "orthogonal", corridor: "replan-return" });
    expect(routes.get("memory->action")).toMatchObject({ kind: "orthogonal", corridor: "state-feed" });

    const corridorIds = [
      "dispatch-rag", "dispatch-tools", "context-return",
      "observation-return", "replan-return", "state-feed",
    ];
    expect(new Set(corridorIds).size).toBe(corridorIds.length);
  });

  it("gives planning and memory callbacks a visible orthogonal return corridor", () => {
    for (const key of ["planning->llm", "memory->llm"]) {
      const route = routes.get(key);
      expect(route.kind).toBe("orthogonal");
      expect(route.points.length).toBeGreaterThanOrEqual(5);
      expect(Math.max(...route.points.map((point) => point.y)) - Math.min(...route.points.map((point) => point.y))).toBeGreaterThanOrEqual(35);
    }
  });

  it("enters the first vector card from its open right side instead of crossing the branch title", () => {
    const route = routes.get("rag-routing->embedding-vectorization");
    const card = context.resolve("embedding-vectorization");

    expect(route.end).toEqual({ x: card.x + card.w, y: card.y + card.h / 2 });
    expect(route.points.at(-2).y).toBe(route.end.y);
    expect(route.points.at(-2).x).toBeGreaterThan(route.end.x);
  });

  it("keeps orthogonal routes axis-aligned", () => {
    for (const route of routes.values()) {
      if (route.kind !== "orthogonal") continue;
      for (let index = 1; index < route.points.length; index += 1) {
        const previous = route.points[index - 1];
        const current = route.points[index];
        expect(previous.x === current.x || previous.y === current.y).toBe(true);
      }
    }
  });

  it("places every visible route label outside node and detail-card bounds", () => {
    const occupied = [
      ...demoGraph.nodes.map((node) => node.referencePosition),
      ...demoGraph.detailNodes.map((node) => node.bounds),
    ];
    for (const route of routes.values()) {
      if (!route.label) continue;
      expect(occupied.some((bounds) => inside(route.label, bounds, 6))).toBe(false);
    }
  });

  it("routes observation feedback outside the crowded RAG-to-Tools gap", () => {
    const observationReturn = routes.get("observation->llm");
    const replanReturn = routes.get("observation->planning");
    expect(observationReturn.points.some((point) => point.y < demoGraph.groups.find((group) => group.id === "rag-group").bounds.y)).toBe(true);
    expect(replanReturn.points.some((point) => point.y > demoGraph.groups.find((group) => group.id === "tools-group").bounds.y + demoGraph.groups.find((group) => group.id === "tools-group").bounds.h)).toBe(true);
  });
});

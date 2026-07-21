import { describe, expect, it } from "vitest";
import {
  getEdgesForNode,
  getModule,
  getNode,
  validateArchitecture,
} from "../../src/domain/architecture.js";
import { demoGraph } from "../../src/data/demo-graph.js";

describe("architecture graph", () => {
  it("accepts the bilingual five-module demo graph", () => {
    expect(validateArchitecture(demoGraph)).toEqual({ valid: true });
    expect(demoGraph.modules).toHaveLength(5);
    expect(demoGraph.guardrails.scope).toBe("global");
  });

  it("rejects dangling edges", () => {
    const broken = structuredClone(demoGraph);
    broken.edges.push({ id: "broken", from: "missing", to: "llm", type: "sequence" });
    expect(() => validateArchitecture(broken)).toThrow("Unknown edge source: missing");
  });

  it("queries modules, nodes, and callback edges", () => {
    expect(getModule(demoGraph, "rag").label.zh).toBe("RAG 检索增强");
    expect(getNode(demoGraph, "rag-context").label.en).toBe("Context Assembly");
    expect(getEdgesForNode(demoGraph, "rag-context").some((edge) => edge.type === "callback")).toBe(true);
  });
});

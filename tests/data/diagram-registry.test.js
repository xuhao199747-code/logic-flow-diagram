import { describe, expect, it } from "vitest";
import { demoGraph } from "../../src/data/demo-graph.js";
import {
  diagramRegistry,
  getDiagram,
  validateDiagram,
} from "../../src/diagrams/registry.js";

describe("diagram registry", () => {
  it("registers the current Agent flow as an independent bilingual diagram package", () => {
    const diagram = getDiagram("agent-execution");
    expect(diagramRegistry).toHaveLength(1);
    expect(diagram).toMatchObject({
      id: "agent-execution",
      label: { zh: "智能代理执行流程", en: "Interactive Agent Flow" },
      graph: demoGraph,
    });
    expect(diagram.guides.eventGuideFor("rag-route").reason.zh).toContain("实时信息");
    expect(validateDiagram(diagram)).toBe(true);
  });

  it("rejects duplicate node identities before a diagram reaches the renderer", () => {
    const diagram = getDiagram("agent-execution");
    const invalid = {
      ...diagram,
      id: "duplicate-test",
      graph: { ...diagram.graph, nodes: [...diagram.graph.nodes, diagram.graph.nodes[0]] },
    };
    expect(() => validateDiagram(invalid)).toThrow(/duplicate node id/i);
  });

  it("rejects topology edges that point to a missing item", () => {
    const diagram = getDiagram("agent-execution");
    const invalid = {
      ...diagram,
      id: "edge-test",
      graph: { ...diagram.graph, topologyEdges: [...diagram.graph.topologyEdges, { from: "llm", to: "missing-node" }] },
    };
    expect(() => validateDiagram(invalid)).toThrow(/missing topology endpoint/i);
  });
});

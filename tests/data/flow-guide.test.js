import { describe, expect, it } from "vitest";
import { demoGraph } from "../../src/data/demo-graph.js";
import { eventGuideFor, nodeGuideFor } from "../../src/data/flow-guide.js";

function expectBilingual(value) {
  expect(value).toEqual({ zh: expect.any(String), en: expect.any(String) });
  expect(value.zh.length).toBeGreaterThan(8);
  expect(value.en.length).toBeGreaterThan(12);
}

describe("flow guide content", () => {
  it("provides a concrete bilingual explanation for every execution event", () => {
    for (const event of demoGraph.events) {
      const guide = eventGuideFor(event.id);
      expect(guide, event.id).toBeTruthy();
      expectBilingual(guide.now);
      expectBilingual(guide.reason);
      expectBilingual(guide.result);
      expect(`${guide.now.zh}${guide.reason.zh}${guide.result.zh}`).not.toContain("处理这一环节");
    }
  });

  it("provides a concrete bilingual purpose for every clickable node", () => {
    for (const node of [...demoGraph.nodes, ...demoGraph.detailNodes]) {
      const guide = nodeGuideFor(node.id);
      expect(guide, node.id).toBeTruthy();
      expectBilingual(guide.purpose);
      expect(`${guide.purpose.zh}${guide.purpose.en}`).not.toContain("负责完成");
    }
  });

  it("explains retrieval routing with its actual decision criteria", () => {
    const guide = eventGuideFor("rag-route");
    expect(guide.now.zh).toContain("知识类型");
    expect(guide.reason.zh).toContain("实时信息");
    expect(guide.result.zh).toContain("双路并行");
  });

  it("explains long-term memory as durable cross-session knowledge", () => {
    const guide = nodeGuideFor("memory-long-term");
    expect(guide.purpose.zh).toContain("跨会话");
    expect(guide.purpose.en).toContain("future sessions");
  });
});

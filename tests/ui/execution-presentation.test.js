import { describe, expect, it } from "vitest";
import { demoGraph } from "../../src/data/demo-graph.js";
import { createRun } from "../../src/domain/execution.js";
import {
  liveResultFor,
  progressSummaryFor,
  statusLabelFor,
} from "../../src/ui/executionPresentation.js";

const eventById = (id) => demoGraph.events.find((event) => event.id === id);

describe("execution presentation", () => {
  it("describes an interactive pause as awaiting user action", () => {
    expect(statusLabelFor("paused")).toEqual({ zh: "等待操作", en: "Awaiting Action" });
  });

  it("reports selected and completed retrieval branches as the live result", () => {
    const run = {
      ...createRun(demoGraph, "rag-retrieval"),
      selectedBranches: ["vector", "web"],
      completedBranches: ["vector"],
    };

    const result = liveResultFor(eventById("rag-retrieval"), run);
    expect(result.zh).toContain("向量检索、联网搜索");
    expect(result.zh).toContain("1/2");
    expect(result.en).toContain("Vector Retrieval and Web Search");
  });

  it("reports planning and tool work with the correct contextual unit", () => {
    const planningRun = {
      ...createRun(demoGraph, "planning-event"),
      parallelWork: { kind: "cognition", selected: ["planning", "memory"], completed: ["planning"] },
    };
    const toolRun = {
      ...createRun(demoGraph, "tool-event"),
      parallelWork: { kind: "tools", selected: ["sandbox", "external"], completed: ["sandbox"] },
    };

    expect(progressSummaryFor(eventById("planning-event"), planningRun).zh).toBe("协同模块 1 / 2");
    expect(progressSummaryFor(eventById("tool-event"), toolRun).zh).toBe("工具分支 1 / 2");
  });

  it("does not show irrelevant zero retrieval progress outside retrieval", () => {
    const summary = progressSummaryFor(eventById("input-event"), createRun(demoGraph, "input-event"));
    expect(summary.zh).toBe("顺序执行");
    expect(summary.zh).not.toContain("检索");
    expect(summary.zh).not.toContain("0 / 0");
  });
});

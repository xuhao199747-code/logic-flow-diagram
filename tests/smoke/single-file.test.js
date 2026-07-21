// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("single-file build", () => {
  it("inlines all runtime assets", () => {
    const html = readFileSync(new URL("../../dist/index.html", import.meta.url), "utf8");

    expect(html).toContain("Agent 动态执行流程");
    for (const label of ["输入与编排", "Agent 核心", "RAG 检索增强", "工具与反馈", "最终响应"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("用户任务");
    expect(html).toContain("最终响应");
    expect(html).toContain("运行进度");
    expect(html).toContain("Live Step");
    expect(html).toContain("下一事件");
    expect(html).not.toContain("下一事件 · Next Event");
    expect(html).toContain("重新开始");
    expect(html).not.toContain("轮次 1 · 事件");
    expect(html).toContain("data-edge-pulse-for");
    expect(html).toContain("edge-pulse__moving");
    for (const removedControl of ["全局定位", "全局视图", "跟随执行", "回到当前节点", "自动播放"]) {
      expect(html).not.toContain(removedControl);
    }
    expect(html).toContain("<style");
    expect(html).toContain("<script");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet/);
    expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//);
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toMatch(/\bXMLHttpRequest\b/);
  });
});

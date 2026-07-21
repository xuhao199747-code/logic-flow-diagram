import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoGraph } from "../src/data/demo-graph.js";

const approvedPalette = new Set([
  "#0C0C0C", "#111111", "#151515", "#1B1B1B", "#242424",
  "#2A2A2A", "#3A3A3A", "#4A4A4A", "#666666", "#9B9B9B", "#EDEDED",
  "#6E8BFF", "#6FCF97", "#467A5D", "#9B8AFB", "#D6A85F", "#E06C75",
  "#6F95E8", "#9B83E7", "#55B6C2", "#D5A34F", "#E58A62", "#C27ADC", "#D5D9E2",
]);

describe("foundation shell", () => {
  it("uses only approved palette colors", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const colors = [...styles.matchAll(/#[0-9A-Fa-f]{6}/g)].map(([color]) => color.toUpperCase());

    expect(colors.length).toBeGreaterThan(0);
    expect(colors.every((color) => approvedPalette.has(color))).toBe(true);
  });

  it("renders Chinese as primary copy with English support", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    await import("../src/main.js?foundation-shell-test");
    const styles = readFileSync("src/styles.css", "utf8");

    const primary = document.querySelector('[data-lang="zh"]');
    const support = document.querySelector('[data-lang="en"]');

    expect(primary).not.toBeNull();
    expect(primary.textContent).toContain("智能代理执行流程");
    expect(support).not.toBeNull();
    expect(support.textContent).toContain("Interactive Agent Flow");
    expect(support.classList.contains("foundation-screen__support")).toBe(true);
    expect(styles).toMatch(/\.foundation-screen__support\s*{[^}]*color:\s*var\(--muted\);/);
  });

  it("declares the pinned tooling Node support range", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.engines).toEqual({ node: "^22.13.0 || >=24.0.0" });
  });

  it("builds the standalone artifact before running its smoke test", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts.check).toBe("npm run build && npm run test");
  });

  it("keeps the reference topology as presentation data beside executable graph data", () => {
    expect(demoGraph).toMatchObject({
      systemBoundary: expect.any(Object),
      groups: expect.any(Array),
      detailNodes: expect.any(Array),
      topologyEdges: expect.any(Array),
      retrievalBranches: expect.any(Array),
    });
  });
});

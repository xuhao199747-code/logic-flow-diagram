import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

describe("Cursor-style neutral interface", () => {
  it("uses neutral surfaces with blue reserved for the active accent", () => {
    expect(styles).toMatch(/--bg:\s*#0C0C0C/);
    expect(styles).toMatch(/--panel:\s*#151515/);
    expect(styles).toMatch(/--line:\s*#2A2A2A/);
    expect(styles).toMatch(/--text:\s*#EDEDED/);
    expect(styles).toMatch(/--live:\s*#6E8BFF/);
    expect(styles).not.toContain("#38D1FF");
    expect(styles).not.toContain("#081423");
  });

  it("separates fixed shell regions with neutral borders instead of blue panels", () => {
    expect(styles).toMatch(/\.topbar\s*\{[^}]*background:\s*var\(--surface\);/s);
    expect(styles).toMatch(/\.step-rail\s*\{[^}]*background:\s*var\(--panel\);/s);
    expect(styles).toMatch(/\.controls-host\s*\{[^}]*background:\s*var\(--surface\);/s);
  });

  it("uses restrained current-state treatment without cyan glow", () => {
    expect(styles).toMatch(/\.graph-node\.is-live\s*>\s*rect\s*\{[^}]*stroke:\s*var\(--live\);/s);
    expect(styles).not.toMatch(/\.graph-node\.is-live[^}]*drop-shadow/s);
    expect(styles).not.toMatch(/\.reference-group\.is-live[^}]*drop-shadow/s);
  });

  it("highlights active and related routes by color without changing their width", () => {
    const liveRule = styles.match(/\.graph-edge\.is-live\s*\{([^}]*)\}/s)?.[1] ?? "";
    const relatedRule = styles.match(/\.graph-edge\.is-related\s*\{([^}]*)\}/s)?.[1] ?? "";

    expect(liveRule).toMatch(/stroke:\s*var\(--live\);/);
    expect(relatedRule).toMatch(/stroke:\s*var\(--live\);/);
    expect(liveRule).not.toMatch(/stroke-width\s*:/);
    expect(relatedRule).not.toMatch(/stroke-width\s*:/);
  });

  it("keeps active group, detail, and running-node outlines at their base width", () => {
    const activeSelectors = [
      ".reference-group.is-live > rect",
      ".detail-node.is-live > rect",
      ".graph-node.is-running > rect",
      ".graph-node.is-relation-endpoint > rect",
    ];

    for (const selector of activeSelectors) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rule = styles.match(new RegExp(`${escaped}[^\\{]*\\{([^}]*)\\}`, "s"))?.[1] ?? "";
      expect(rule, selector).not.toMatch(/stroke-width\s*:/);
    }
  });

  it("lets completed state color override callback type color", () => {
    expect(styles.lastIndexOf(".graph-edge.is-complete")).toBeGreaterThan(styles.lastIndexOf(".graph-edge.is-callback"));
  });

  it("keeps inactive callbacks and dependency routes neutral until state colors apply", () => {
    expect(styles).toMatch(/--route:\s*#[0-9A-F]{6}/i);
    expect(styles).toMatch(/\.graph-edge\.is-callback\s*\{[^}]*stroke:\s*var\(--route\);/s);
    expect(styles).toMatch(/\.graph-edge\.is-context-dependency\s*\{[^}]*stroke:\s*var\(--route\);/s);
    expect(styles.lastIndexOf(".graph-edge.is-live")).toBeGreaterThan(styles.lastIndexOf(".graph-edge.is-context-dependency"));
    expect(styles.lastIndexOf(".graph-edge.is-complete")).toBeGreaterThan(styles.lastIndexOf(".graph-edge.is-context-dependency"));
  });

  it("uses one blue accent for every live relation instead of relation-specific warning colors", () => {
    expect(styles).not.toMatch(/\.edge-join\.is-live\s*\{[^}]*var\(--done\)/s);
    expect(styles).not.toMatch(/\.edge-(?:callback|retry|replan)\.is-live[^}]*var\(--error\)/s);
    expect(styles).toMatch(/\.edge-callback\.is-live,[\s\S]*\.edge-replan\.is-live\s*\{[^}]*stroke:\s*var\(--live\)/s);
  });

  it("uses a muted completion color for nested groups and detail cards", () => {
    expect(styles).toMatch(/--done-muted:\s*#[0-9A-F]{6}/i);
    expect(styles).toMatch(/\.reference-group\.is-complete\s*>\s*rect\s*\{[^}]*var\(--done-muted\)/s);
    expect(styles).toMatch(/\.detail-node\.is-complete\s*>\s*rect\s*\{[^}]*var\(--done-muted\)/s);
  });

  it("keeps an independent context gate neutral instead of adding a third accent color", () => {
    expect(styles).toMatch(/\.context-gate\.is-independent\s*>\s*rect\s*\{[^}]*stroke:\s*var\(--route\)/s);
  });

  it("presents the right rail as a guided narrative instead of competing tabs", () => {
    expect(styles).not.toMatch(/\.rail-tabs\s*\{/);
    expect(styles).toMatch(/\.guide-header\s*\{[^}]*position:\s*relative/s);
    expect(styles).toMatch(/\.flow-explanation\s*\{[^}]*display:\s*grid/s);
    expect(styles).toMatch(/\.back-to-live\s*\{[^}]*cursor:\s*pointer/s);
  });

  it("compacts the fixed shell and bilingual rail for short desktop screens", () => {
    expect(styles).toMatch(/@media\s*\(max-height:\s*800px\)/);
    expect(styles).toMatch(/@media\s*\(max-height:\s*800px\)[\s\S]*\.app-shell\s*\{[^}]*grid-template-rows:\s*54px\s+minmax\(0,\s*1fr\)\s+56px/s);
    expect(styles).toMatch(/@media\s*\(max-height:\s*800px\)[\s\S]*\.flow-explanation li\s*\{[^}]*padding:\s*6px\s+0/s);
  });

  it("shows canvas controls over only the graph area and exposes grab feedback", () => {
    expect(styles).toMatch(/\.canvas-controls\s*\{[^}]*position:\s*absolute/s);
    expect(styles).toMatch(/\.canvas-controls\s*\{[^}]*right:\s*12px/s);
    expect(styles).toMatch(/\.architecture-graph\.is-pannable\s*\{[^}]*cursor:\s*grab/s);
    expect(styles).toMatch(/\.architecture-graph\.is-panning\s*\{[^}]*cursor:\s*grabbing/s);
  });

  it("lays out diagram and scenario selectors as one compact settings group", () => {
    expect(styles).toMatch(/\.flow-settings\s*\{[^}]*display:\s*flex/s);
    expect(styles).toMatch(/\.diagram-control\s*\{[^}]*display:\s*flex/s);
    expect(styles).toMatch(/\.diagram-control select\s*\{[^}]*background:\s*var\(--panel\)/s);
  });
});

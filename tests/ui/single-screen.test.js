import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

function declarationsFor(selectors) {
  const expectedSelectors = new Set(selectors);
  const rule = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, selectorText]) => {
    const ruleSelectors = new Set(selectorText.split(",").map((selector) => selector.trim()));
    return [...expectedSelectors].every((selector) => ruleSelectors.has(selector));
  });

  return rule?.[2];
}

function declarationValue(declarations, property) {
  return declarations.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+);`))?.[1].trim();
}

describe("single-screen style contract", () => {
  it("locks the application to a fixed viewport without page overflow", () => {
    const declarations = declarationsFor(["html", "body", "#app"]);

    expect(declarations).toBeDefined();
    expect(declarationValue(declarations, "width")).toBe("100vw");
    expect(declarationValue(declarations, "height")).toBe("100vh");
    expect(declarationValue(declarations, "overflow")).toBe("hidden");
  });

  it("gives primary SVG labels an explicit light fill", () => {
    expect(styles).toMatch(/\.primary-label\s*\{(?=[^}]*fill:\s*var\(--text\);)[^}]*\}/i);
  });

  it("keeps skipped edges and nodes visibly legible", () => {
    const edgeDeclarations = declarationsFor([".graph-edge.is-skipped"]);
    const nodeDeclarations = declarationsFor([".graph-node.is-skipped"]);

    expect(Number(declarationValue(edgeDeclarations, "opacity"))).toBeGreaterThanOrEqual(0.5);
    expect(declarationValue(edgeDeclarations, "stroke-dasharray")).toBeDefined();
    expect(Number(declarationValue(nodeDeclarations, "opacity"))).toBeGreaterThanOrEqual(0.5);
  });

});

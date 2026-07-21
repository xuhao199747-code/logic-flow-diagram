import { describe, expect, it } from "vitest";
import {
  createCanvasViewport,
  panCanvasBy,
  viewBoxFor,
  wheelActionFor,
  zoomCanvasAt,
} from "../../src/ui/canvasViewport.js";

describe("canvas viewport", () => {
  it("starts fitted and clamps zoom between 40% and 220%", () => {
    const initial = createCanvasViewport();
    expect(viewBoxFor(initial)).toBe("0 0 1400 800");
    expect(zoomCanvasAt(initial, 9, { x: 700, y: 400 }).zoom).toBe(2.2);
    expect(zoomCanvasAt(initial, 0.1, { x: 700, y: 400 }).zoom).toBe(0.4);
  });

  it("keeps the pointed diagram position fixed while zooming", () => {
    const zoomed = zoomCanvasAt(createCanvasViewport(), 2, { x: 350, y: 200 });
    expect(zoomed).toMatchObject({ zoom: 2, x: 175, y: 100 });
    expect(viewBoxFor(zoomed)).toBe("175 100 700 400");
  });

  it("pans in both axes while keeping part of the diagram reachable", () => {
    const zoomed = zoomCanvasAt(createCanvasViewport(), 2, { x: 700, y: 400 });
    const panned = panCanvasBy(zoomed, 120, -80);
    expect(panned.x).not.toBe(zoomed.x);
    expect(panned.y).not.toBe(zoomed.y);
    expect(panCanvasBy(zoomed, 99999, 99999).x).toBeLessThan(1400);
  });

  it("uses mouse-wheel steps for zoom and fine two-axis gestures for pan", () => {
    expect(wheelActionFor({ ctrlKey: true, deltaX: 0, deltaY: -4, deltaMode: 0 })).toBe("zoom");
    expect(wheelActionFor({ ctrlKey: false, deltaX: 0, deltaY: 120, deltaMode: 0 })).toBe("zoom");
    expect(wheelActionFor({ ctrlKey: false, deltaX: 18, deltaY: 8, deltaMode: 0 })).toBe("pan");
    expect(wheelActionFor({ ctrlKey: false, deltaX: 0, deltaY: 12, deltaMode: 0 })).toBe("pan");
  });
});

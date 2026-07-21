import { describe, expect, it } from "vitest";
import { createViewport, reduceViewport } from "../../src/domain/viewport.js";

describe("viewport state", () => {
  it("changes viewing focus without moving live execution", () => {
    let state = createViewport("llm", "core");
    state = reduceViewport(state, { type: "FOCUS_MODULE", moduleId: "rag" });
    expect(state.viewing).toEqual({ level: "module", moduleId: "rag", nodeId: null });
    expect(state.liveNodeId).toBe("llm");
    expect(state.isViewingLive).toBe(false);
  });

  it("returns to live and restores follow mode", () => {
    let state = reduceViewport(createViewport("llm", "core"), { type: "FOCUS_NODE", moduleId: "rag", nodeId: "rag-route" });
    state = reduceViewport(state, { type: "RETURN_TO_LIVE", moduleId: "core" });
    expect(state.viewing.nodeId).toBe("llm");
    expect(state.followRun).toBe(true);
  });

  it("does not steal a locked view when live node changes", () => {
    let state = reduceViewport(createViewport("llm", "core"), { type: "LOCK_VIEW" });
    state = reduceViewport(state, { type: "SET_LIVE_NODE", moduleId: "rag", nodeId: "rag-route" });
    expect(state.viewing.nodeId).toBe("llm");
    expect(state.liveNodeId).toBe("rag-route");
  });

  it("follows live execution until viewing focus is changed", () => {
    const initial = createViewport("llm", "core");
    const state = reduceViewport(initial, { type: "SET_LIVE_NODE", moduleId: "rag", nodeId: "rag-route" });

    expect(state.viewing).toEqual({ level: "node", moduleId: "rag", nodeId: "rag-route" });
    expect(state.isViewingLive).toBe(true);
    expect(initial.viewing.nodeId).toBe("llm");
  });

  it("marks a focused live node as live without enabling follow mode", () => {
    let state = createViewport("llm", "core");
    state = reduceViewport(state, { type: "FOCUS_NODE", moduleId: "rag", nodeId: "rag-route" });
    expect(state.followRun).toBe(false);
    expect(state.isViewingLive).toBe(false);

    state = reduceViewport(state, { type: "FOCUS_NODE", moduleId: "core", nodeId: "llm" });
    expect(state.followRun).toBe(false);
    expect(state.isViewingLive).toBe(true);
  });

  it("shows the overview without claiming a live node", () => {
    const overview = reduceViewport(createViewport("llm", "core"), { type: "SHOW_OVERVIEW" });

    expect(overview.viewing).toEqual({ level: "overview", moduleId: null, nodeId: null });
    expect(overview.followRun).toBe(false);
    expect(overview.isViewingLive).toBe(false);
    expect(overview.liveNodeId).toBe("llm");
  });

  it("toggles follow and lock state together", () => {
    let state = createViewport();
    state = reduceViewport(state, { type: "TOGGLE_FOLLOW" });
    expect(state).toMatchObject({ followRun: false, locked: true });

    state = reduceViewport(state, { type: "TOGGLE_FOLLOW" });
    expect(state).toMatchObject({ followRun: true, locked: false });
  });

  it("returns to live by clearing the lock", () => {
    let state = reduceViewport(createViewport("llm", "core"), { type: "LOCK_VIEW" });
    state = reduceViewport(state, { type: "RETURN_TO_LIVE", moduleId: "core" });

    expect(state).toMatchObject({ followRun: true, locked: false, isViewingLive: true });
    expect(state.viewing).toEqual({ level: "node", moduleId: "core", nodeId: "llm" });
  });

  it("rejects unknown viewport actions", () => {
    expect(() => reduceViewport(createViewport(), { type: "NOPE" })).toThrow("Unknown viewport action: NOPE");
  });
});

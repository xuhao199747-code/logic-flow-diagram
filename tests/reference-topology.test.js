import { describe, expect, it } from "vitest";
import { demoGraph } from "../src/data/demo-graph.js";

const edgePairs = (edges) => edges.map(({ from, to }) => `${from}->${to}`);
const byId = (items) => Object.fromEntries(items.map((item) => [item.id, item]));
const transitionProjection = (event) => ({
  id: event.id,
  nodeId: event.nodeId,
  relation: event.relation,
  edgeIds: event.edgeIds ?? null,
  next: event.next ?? null,
  join: event.join ?? null,
  targetNodeId: event.targetNodeId ?? null,
  choices: Object.fromEntries(Object.entries(event.choices ?? {}).map(([id, choice]) => [id, {
    branches: choice.branches ?? null,
    next: choice.next ?? null,
    relation: choice.relation ?? null,
  }])),
});

describe("reference topology", () => {
  it("keeps every system, presentation, module, and executable ID globally unique", () => {
    const identifiedItems = [
      demoGraph.systemBoundary,
      demoGraph.guardrails,
      ...demoGraph.groups,
      ...demoGraph.detailNodes,
      ...demoGraph.modules,
      ...demoGraph.nodes,
    ];
    const ids = identifiedItems.map((item) => item.id);

    expect(ids).toHaveLength(new Set(ids).size);

    const resolvableEndpoints = [
      demoGraph.systemBoundary,
      ...demoGraph.groups,
      ...demoGraph.detailNodes,
      ...demoGraph.nodes,
    ];
    for (const edge of demoGraph.topologyEdges) {
      for (const endpoint of [edge.from, edge.to]) {
        expect(resolvableEndpoints.filter((item) => item.id === endpoint)).toHaveLength(1);
      }
    }
  });

  it("declares the complete bilingual reference inventory and descriptions", () => {
    expect(demoGraph.systemBoundary).toMatchObject({
      id: "agent-system",
      label: { zh: "Agent 系统", en: "Agent System" },
      outsideNodes: [
        { nodeId: "user-task", position: "top" },
        { nodeId: "final-response", position: "left" },
      ],
    });

    expect(demoGraph.groups.map(({ id, parentId, layout, label }) => ({ id, parentId, layout, label }))).toEqual([
      { id: "core-group", parentId: "agent-system", layout: "contained", label: { zh: "核心", en: "Core" } },
      { id: "planning-group", parentId: "core-group", layout: "contained", label: { zh: "规划", en: "Planning" } },
      { id: "memory-group", parentId: "core-group", layout: "contained", label: { zh: "记忆", en: "Memory" } },
      { id: "rag-group", parentId: "agent-system", layout: "contained", label: { zh: "RAG 检索增强", en: "RAG Augmentation" } },
      { id: "vector-data-branch", parentId: "rag-group", layout: "branch", label: { zh: "向量/数据分支", en: "Vector & Data Branch" } },
      { id: "web-branch", parentId: "rag-group", layout: "branch", label: { zh: "联网分支", en: "Web Branch" } },
      { id: "tools-group", parentId: "agent-system", layout: "horizontal", label: { zh: "工具", en: "Tools" } },
    ]);

    expect(demoGraph.detailNodes.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "planning-subgoals", label: { zh: "子目标拆解", en: "Subgoal Decomposition" } },
      { id: "planning-cot", label: { zh: "CoT思维链", en: "Chain of Thought" } },
      { id: "planning-reflection", label: { zh: "观察反思", en: "Observation & Reflection" } },
      { id: "planning-self-critique", label: { zh: "自我批判", en: "Self-Critique" } },
      { id: "memory-short-term", label: { zh: "短期记忆", en: "Short-term Memory" } },
      { id: "memory-long-term", label: { zh: "长期记忆", en: "Long-term Memory" } },
      { id: "memory-context", label: { zh: "上下文", en: "Context" } },
      { id: "memory-cross-conversation", label: { zh: "跨对话记忆", en: "Cross-conversation Memory" } },
      { id: "rag-query", label: { zh: "Query处理", en: "Query Processing" } },
      { id: "rag-routing", label: { zh: "路由", en: "Routing" } },
      { id: "embedding-vectorization", label: { zh: "embedding向量化", en: "Embedding Vectorization" } },
      { id: "vector-store-retrieval", label: { zh: "向量库检索", en: "Vector Store Retrieval" } },
      { id: "vector-top-k", label: { zh: "返回TOPK", en: "Return TOP K" } },
      { id: "keyword-search", label: { zh: "关键词搜索", en: "Keyword Search" } },
      { id: "database-retrieval", label: { zh: "数据库检索", en: "Database Retrieval" } },
      { id: "database-top-k", label: { zh: "返回TOPK", en: "Return TOP K" } },
      { id: "rag-web-search", label: { zh: "联网搜索", en: "Web Search" } },
      { id: "web-top-k", label: { zh: "返回TOPK", en: "Return TOP K" } },
      { id: "result-merge-deduplicate", label: { zh: "结果合并去重", en: "Merge & Deduplicate" } },
      { id: "rerank", label: { zh: "Rerank", en: "Rerank" } },
      { id: "top-n", label: { zh: "返回TOP N", en: "Return TOP N" } },
      { id: "rag-context-assembly", label: { zh: "上下文组装", en: "Context Assembly" } },
      { id: "code-execution-sandbox", label: { zh: "代码执行/沙箱", en: "Code Execution / Sandbox" } },
      { id: "external-environment-business-system", label: { zh: "外部环境/业务系统", en: "External Environment / Business System" } },
    ]);

    expect(demoGraph.detailNodes.filter((item) => item.description).map(({ id, description }) => ({ id, description }))).toEqual([
      { id: "code-execution-sandbox", description: { zh: "在隔离沙箱中执行代码与工具调用", en: "Execute code and tool calls in an isolated sandbox" } },
      { id: "external-environment-business-system", description: { zh: "连接外部环境与业务系统", en: "Connect external environments and business systems" } },
    ]);

    const modules = byId(demoGraph.modules);
    const nodes = byId(demoGraph.nodes);
    expect({
      core: modules.core.label,
      userTask: nodes["user-task"].label,
      finalResponse: nodes["final-response"].label,
      orchestrator: nodes.orchestrator.label,
      llm: nodes.llm.label,
      action: nodes.action.label,
      observation: nodes.observation.label,
    }).toEqual({
      core: { zh: "Agent 核心", en: "Agent Core" },
      userTask: { zh: "用户任务", en: "User Task" },
      finalResponse: { zh: "最终响应", en: "Final Response" },
      orchestrator: { zh: "智能编排器", en: "Agent Orchestrator" },
      llm: { zh: "大语言模型", en: "LLM" },
      action: { zh: "动作执行", en: "Action" },
      observation: { zh: "观察与评估", en: "Observation" },
    });
  });

  it("uses one bounded 1400 by 800 reference layout with the required relative placement", () => {
    expect(demoGraph.systemBoundary.bounds).toEqual({ x: 0, y: 0, w: 1400, h: 800 });
    expect(demoGraph.groups.every((group) => Number.isFinite(group.bounds?.x) && Number.isFinite(group.bounds?.y) && Number.isFinite(group.bounds?.w) && Number.isFinite(group.bounds?.h))).toBe(true);
    expect(demoGraph.detailNodes.every((node) => Number.isFinite(node.bounds?.x) && Number.isFinite(node.bounds?.y) && Number.isFinite(node.bounds?.w) && Number.isFinite(node.bounds?.h))).toBe(true);
    expect(demoGraph.nodes.every((node) => Number.isFinite(node.referencePosition?.x) && Number.isFinite(node.referencePosition?.y) && Number.isFinite(node.referencePosition?.w) && Number.isFinite(node.referencePosition?.h))).toBe(true);

    const groups = byId(demoGraph.groups);
    const nodes = byId(demoGraph.nodes);
    expect(nodes["user-task"].referencePosition.y).toBeLessThan(groups["core-group"].bounds.y);
    expect(nodes["final-response"].referencePosition.x).toBeLessThan(groups["core-group"].bounds.x);
    expect(groups["core-group"].bounds.x).toBeLessThan(700);
    expect(groups["rag-group"].bounds.x).toBeGreaterThan(groups["core-group"].bounds.x);
    expect(groups["rag-group"].bounds.y).toBeLessThan(groups["tools-group"].bounds.y);
    expect(groups["tools-group"].bounds.y).toBeGreaterThan(400);
    expect(nodes.action.referencePosition.x).toBeGreaterThan(groups["tools-group"].bounds.x + (groups["tools-group"].bounds.w / 2));
    expect(nodes.observation.referencePosition.x).toBeGreaterThan(groups["tools-group"].bounds.x + (groups["tools-group"].bounds.w / 2));
    expect(demoGraph.guardrails.bounds).toEqual({ x: 0, y: 750, w: 1400, h: 50 });
  });

  it("records the reference relationships while preserving exact reducer edges and event transitions", () => {
    expect(edgePairs(demoGraph.topologyEdges)).toEqual([
      "user-task->orchestrator", "orchestrator->llm", "llm->final-response",
      "llm->planning", "planning->llm", "llm->memory", "memory->llm",
      "llm->rag-query", "rag-query->rag-routing",
      "rag-routing->embedding-vectorization", "embedding-vectorization->vector-store-retrieval", "vector-store-retrieval->vector-top-k", "vector-top-k->result-merge-deduplicate",
      "rag-routing->keyword-search", "keyword-search->database-retrieval", "database-retrieval->database-top-k", "database-top-k->result-merge-deduplicate",
      "rag-routing->rag-web-search", "rag-web-search->web-top-k", "web-top-k->result-merge-deduplicate",
      "result-merge-deduplicate->rerank", "rerank->top-n", "top-n->rag-context-assembly", "rag-context-assembly->llm",
      "llm->tools-group", "code-execution-sandbox->action", "external-environment-business-system->action", "action->observation", "observation->llm", "observation->planning", "memory->action",
    ]);
    expect(demoGraph.edges).toEqual([
      { id: "e1", from: "user-task", to: "orchestrator", type: "sequence" },
      { id: "e2", from: "orchestrator", to: "llm", type: "sequence" },
      { id: "e3", from: "llm", to: "planning", type: "module" },
      { id: "e4", from: "planning", to: "llm", type: "callback" },
      { id: "e5-request", from: "llm", to: "memory", type: "module" },
      { id: "e5", from: "memory", to: "llm", type: "callback" },
      { id: "e6", from: "llm", to: "rag-route", type: "decision" },
      { id: "e7", from: "rag-route", to: "vector-search", type: "parallel", branch: "vector" },
      { id: "e8", from: "rag-route", to: "web-search", type: "parallel", branch: "web" },
      { id: "e9", from: "vector-search", to: "rag-merge", type: "join", branch: "vector" },
      { id: "e10", from: "web-search", to: "rag-merge", type: "join", branch: "web" },
      { id: "e11", from: "rag-merge", to: "rag-context", type: "sequence" },
      { id: "e12", from: "rag-context", to: "llm", type: "callback" },
      { id: "e13", from: "llm", to: "tool-select", type: "decision" },
      { id: "e14-sandbox", from: "tool-select", to: "action", type: "parallel", tool: "sandbox" },
      { id: "e14-external", from: "tool-select", to: "action", type: "parallel", tool: "external" },
      { id: "e15", from: "action", to: "observation", type: "sequence" },
      { id: "e16", from: "observation", to: "planning", type: "replan" },
      { id: "e17", from: "llm", to: "final-response", type: "sequence" },
      { id: "e18", from: "observation", to: "action", type: "retry" },
      { id: "e19", from: "observation", to: "llm", type: "callback" },
    ]);
    expect(demoGraph.events.map(transitionProjection)).toEqual([
      { id: "input-event", nodeId: "user-task", relation: "sequence", edgeIds: ["e1"], next: "orchestrator-event", join: null, targetNodeId: null, choices: {} },
      { id: "orchestrator-event", nodeId: "orchestrator", relation: "sequence", edgeIds: ["e2"], next: "planning-event", join: null, targetNodeId: null, choices: {} },
      { id: "planning-event", nodeId: "planning", relation: "parallel-work", edgeIds: ["e3", "e4", "e5-request", "e5"], next: null, join: "llm-dispatch-event", targetNodeId: null, choices: {} },
      { id: "llm-dispatch-event", nodeId: "llm", relation: "decision", edgeIds: ["e6", "e13"], next: null, join: null, targetNodeId: null, choices: { rag: { branches: null, next: "rag-route", relation: null }, tools: { branches: null, next: "tool-select-event", relation: null }, parallel: { branches: null, next: "rag-route", relation: null } } },
      { id: "rag-route", nodeId: "rag-route", relation: "decision", edgeIds: ["e7", "e8"], next: null, join: null, targetNodeId: null, choices: { vector: { branches: ["vector"], next: "rag-retrieval", relation: null }, web: { branches: ["web"], next: "rag-retrieval", relation: null }, parallel: { branches: ["vector", "web"], next: "rag-retrieval", relation: null } } },
      { id: "rag-retrieval", nodeId: "rag-route", relation: "parallel", edgeIds: ["e7", "e8"], next: null, join: "rag-join", targetNodeId: null, choices: {} },
      { id: "rag-join", nodeId: "rag-merge", relation: "join", edgeIds: ["e9", "e10"], next: "rag-context-event", join: null, targetNodeId: null, choices: {} },
      { id: "rag-context-event", nodeId: "rag-context", relation: "module", edgeIds: ["e11"], next: "rag-callback", join: null, targetNodeId: null, choices: {} },
      { id: "rag-callback", nodeId: "rag-context", relation: "callback", edgeIds: ["e12"], next: "llm-join-event", join: null, targetNodeId: "llm", choices: {} },
      { id: "tool-select-event", nodeId: "tool-select", relation: "decision", edgeIds: null, next: null, join: null, targetNodeId: null, choices: { sandbox: { branches: null, next: "tool-event", relation: null }, external: { branches: null, next: "tool-event", relation: null }, parallel: { branches: null, next: "tool-event", relation: null } } },
      { id: "tool-event", nodeId: "action", relation: "parallel-work", edgeIds: ["e14-sandbox", "e14-external"], next: null, join: "action-event", targetNodeId: null, choices: {} },
      { id: "action-event", nodeId: "action", relation: "module", edgeIds: ["e15"], next: "observation-event", join: null, targetNodeId: null, choices: {} },
      { id: "observation-event", nodeId: "observation", relation: "decision", edgeIds: ["e16", "e18", "e19"], next: null, join: null, targetNodeId: null, choices: { finish: { branches: null, next: "llm-join-event", relation: "callback" }, retry: { branches: null, next: "tool-event", relation: "retry" }, replan: { branches: null, next: "planning-event", relation: "replan" } } },
      { id: "llm-join-event", nodeId: "llm", relation: "sequence", edgeIds: ["e17"], next: "final-event", join: null, targetNodeId: null, choices: {} },
      { id: "final-event", nodeId: "final-response", relation: "sequence", edgeIds: null, next: null, join: null, targetNodeId: null, choices: {} },
    ]);
  });

  it("defines vector, web, and parallel retrieval as the required branch compositions", () => {
    expect(demoGraph.retrievalBranches).toEqual([
      { id: "vector", detailNodeIds: ["embedding-vectorization", "vector-store-retrieval", "vector-top-k", "keyword-search", "database-retrieval", "database-top-k"] },
      { id: "web", detailNodeIds: ["rag-web-search", "web-top-k"] },
      { id: "parallel", branchIds: ["vector", "web"] },
    ]);
  });
});

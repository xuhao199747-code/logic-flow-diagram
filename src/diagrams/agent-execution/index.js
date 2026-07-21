import { demoGraph } from "../../data/demo-graph.js";
import { eventGuideFor, nodeGuideFor } from "../../data/flow-guide.js";

export const agentExecutionDiagram = Object.freeze({
  id: "agent-execution",
  version: 1,
  label: Object.freeze({ zh: "Agent执行流程", en: "Interactive Agent Flow" }),
  description: Object.freeze({
    zh: "展示 Agent 从接收任务到检索、工具执行和最终响应的完整运行过程。",
    en: "Shows the complete Agent run from task intake through retrieval, tool execution, and final response.",
  }),
  graph: demoGraph,
  guides: Object.freeze({ eventGuideFor, nodeGuideFor }),
});

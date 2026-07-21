import { eventGuideFor, nodeGuideFor } from "../data/flow-guide.js";
import { liveResultFor, statusLabelFor } from "./executionPresentation.js";

function endpointLabel(graph, id) {
  const item = [
    ...graph.nodes,
    ...graph.detailNodes,
    ...graph.groups,
  ].find((candidate) => candidate.id === id);
  return item?.label ?? { zh: id, en: id };
}

const relationReasons = {
  sequence: {
    zh: "承接上一环节的结果，继续推进主流程。",
    en: "Carries the previous result forward through the main flow.",
  },
  decision: {
    zh: "这里存在多条可行路径，需要结合当前上下文作出选择。",
    en: "Several paths are available, so the current context must guide the choice.",
  },
  "parallel-work": {
    zh: "多个能力彼此独立，可以同时处理并在完成后汇合。",
    en: "Independent capabilities can work together and rejoin when complete.",
  },
  parallel: {
    zh: "已选择的分支正在并行工作，完成后会统一汇合。",
    en: "Selected branches run in parallel and rejoin after completion.",
  },
  join: {
    zh: "前面的分支已经返回，需要在这里合并为一个结果。",
    en: "Returned branch results must be merged into one result here.",
  },
  module: {
    zh: "当前任务需要在这个模块内完成处理，才能继续向后传递。",
    en: "This module must finish its work before the flow can continue.",
  },
  callback: {
    zh: "当前分支已经得到结果，需要将它送回核心流程。",
    en: "This branch has produced a result that must return to the core flow.",
  },
};

function supportText(zh) {
  return `<span>${zh}</span>`;
}

export function createNodeDetail(graph, selection, guides = null) {
  const item = selection.type === "executable"
    ? graph.nodes.find((node) => node.id === selection.id) ?? selection
    : graph.detailNodes.find((node) => node.id === selection.id) ?? selection;
  const parent = selection.type === "executable"
    ? graph.modules.find((module) => module.id === item.moduleId)
    : graph.groups.find((group) => group.id === item.groupId);
  const incoming = graph.topologyEdges
    .filter((edge) => edge.to === item.id)
    .map((edge) => endpointLabel(graph, edge.from));
  const outgoing = graph.topologyEdges
    .filter((edge) => edge.from === item.id)
    .map((edge) => endpointLabel(graph, edge.to));

  return {
    id: item.id,
    type: selection.type,
    label: item.label,
    parentLabel: parent?.label ?? { zh: "Agent 系统", en: "Agent System" },
    description: guides?.nodeGuideFor?.(item.id)?.purpose ?? nodeGuideFor(item.id)?.purpose ?? item.description ?? null,
    detailSteps: item.detailSteps ?? [],
    incoming,
    outgoing,
  };
}

function chineseList(items) {
  if (!items.length) return '<span class="empty-value">—</span>';
  return `<ul>${items.map((item) => `<li>${item.zh}</li>`).join("")}</ul>`;
}

function renderCurrentContent(container, { node, event, snapshot, guide: providedGuide }) {
  const issue = snapshot.issue;
  const issueLabel = issue?.label ?? issue;
  const requestAcknowledgement = issue?.requested ? `<p class="issue-ack">确认请求已发送</p>` : "";
  const issueBanner = issue ? `<section class="issue-banner" role="status"><span>模拟异常</span><strong>${issueLabel.zh ?? issue.id}</strong>${requestAcknowledgement}${issue.description?.zh ? `<p>${issue.description.zh}</p>` : ""}${issue.impact ? `<p>影响：${issue.impact.zh}</p>` : ""}</section>` : "";
  const guide = providedGuide ?? eventGuideFor(event.id);
  const now = guide?.now ?? {
    zh: `${node.label.zh}正在处理这一环节。`,
    en: `${node.label.en} is handling this stage.`,
  };
  const reason = guide?.reason ?? relationReasons[event.relation] ?? relationReasons.sequence;
  const liveResult = liveResultFor(event, snapshot.run);
  const result = issue
    ? {
        zh: `流程在这里遇到「${issueLabel.zh ?? issue.id}」，需要先处理异常。`,
        en: `The flow encountered “${issueLabel.en ?? issue.id}” and needs attention here.`,
      }
    : liveResult ?? guide?.result ?? (event.choices
      ? { zh: "确定一条合适的执行路径。", en: "Select the most suitable execution path." }
      : { zh: `完成「${event.label.zh}」并形成可继续传递的结果。`, en: `Complete “${event.label.en}” and produce a result for the next stage.` });
  const next = snapshot.next;
  const status = statusLabelFor(snapshot.status);
  container.innerHTML = `<header class="guide-header"><div class="guide-title"><span class="guide-live-dot" aria-hidden="true"></span><strong>运行进度</strong></div><span class="status-chip">${status.zh}</span><h2>${event.label.zh}</h2><p class="guide-context">所属环节：${node.label.zh}</p></header>${issueBanner}<ol class="flow-explanation" aria-label="流程讲解"><li data-guide-part="now"><span class="guide-index">01</span><div><strong>现在</strong><p>${supportText(now.zh)}</p></div></li><li data-guide-part="reason"><span class="guide-index">02</span><div><strong>原因</strong><p>${supportText(reason.zh)}</p></div></li><li data-guide-part="result"><span class="guide-index">03</span><div><strong>结果</strong><p>${supportText(result.zh)}</p></div></li><li data-guide-part="next"><span class="guide-index">04</span><div><strong>下一步</strong><p>${supportText(next.zh)}</p></div></li></ol>`;
}

function renderNodeContent(container, detail, current) {
  const role = detail.description ?? {
    zh: `这是「${detail.parentLabel.zh}」中的处理环节，负责完成「${detail.label.zh}」并继续传递结果。`,
    en: `A stage in “${detail.parentLabel.en}” that completes “${detail.label.en}” and passes its result onward.`,
  };
  const connections = detail.incoming.length || detail.outgoing.length
    ? `<h3>信息流向</h3><div><span>接收自</span>${chineseList(detail.incoming)}</div><div><span>发送至</span>${chineseList(detail.outgoing)}</div>`
    : `<h3>模块内部步骤</h3><p class="internal-flow-note">它在当前模块内部参与处理，不单独占用主流程线路。</p>`;
  container.innerHTML = `<header class="guide-header node-guide-header"><button type="button" class="back-to-live" data-action="back-to-live">← 返回运行进度</button><div class="guide-title"><strong>节点说明</strong></div><h2>${detail.label.zh}</h2><div class="inspection-context"><p>当前运行：${current.event.label.zh}</p><p>正在查看：${detail.label.zh}</p></div></header><section class="node-role" data-guide-part="role"><span>作用</span><p>${supportText(role.zh)}</p></section><section class="node-module" data-guide-part="module"><span>所属模块</span><p>${supportText(detail.parentLabel.zh)}</p></section><section class="node-connections" aria-label="节点连接">${connections}</section>`;
}

export function renderContextRail(container, { current, nodeDetail, activeTab = "current", onTabChange }) {
  const showNode = activeTab === "node" && nodeDetail;
  container.innerHTML = `<div id="rail-panel" class="rail-content" aria-live="polite"></div>`;
  const content = container.querySelector(".rail-content");
  if (showNode) renderNodeContent(content, nodeDetail, current);
  else renderCurrentContent(content, current);
  container.querySelector('[data-action="back-to-live"]')?.addEventListener("click", () => onTabChange?.("current"));
}

export function renderStepRail(container, current) {
  renderContextRail(container, { current, activeTab: "current" });
}

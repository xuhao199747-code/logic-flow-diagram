const b = (zh, en) => ({ zh, en });

const statusLabels = {
  paused: b("等待操作", "Awaiting Action"),
  running: b("执行中", "Running"),
  success: b("成功", "Success"),
  completed: b("已完成", "Completed"),
  failed: b("失败", "Failed"),
  blocked: b("已阻塞", "Blocked"),
  retrying: b("重试中", "Retrying"),
  cancelled: b("已取消", "Cancelled"),
  partial: b("部分完成", "Partial"),
};

const retrievalLabels = {
  vector: b("向量检索", "Vector Retrieval"),
  web: b("联网搜索", "Web Search"),
};

const workLabels = {
  planning: b("任务规划", "Planning"),
  memory: b("记忆读取", "Memory Retrieval"),
  sandbox: b("代码沙箱", "Code Sandbox"),
  external: b("外部系统", "External System"),
};

const joinNames = (ids, labels, language) => ids.map((id) => labels[id]?.[language] ?? id).join(language === "zh" ? "、" : " and ");

export function statusLabelFor(status) {
  return statusLabels[status] ?? b(status, status);
}

export function liveResultFor(event, run) {
  if (event.id === "rag-retrieval" && run.selectedBranches?.length) {
    const selected = run.selectedBranches;
    const complete = run.completedBranches?.length ?? 0;
    return b(
      `已启动${joinNames(selected, retrievalLabels, "zh")}，当前完成 ${complete}/${selected.length} 条分支。`,
      `${joinNames(selected, retrievalLabels, "en")} selected; ${complete}/${selected.length} branches complete.`,
    );
  }

  if (event.relation === "parallel-work" && run.parallelWork?.selected?.length) {
    const { selected, completed, kind } = run.parallelWork;
    const unit = kind === "cognition" ? b("协同模块", "modules") : b("工具分支", "tool branches");
    return b(
      `已启动${joinNames(selected, workLabels, "zh")}，${unit.zh}完成 ${completed.length}/${selected.length}。`,
      `${joinNames(selected, workLabels, "en")} selected; ${completed.length}/${selected.length} ${unit.en} complete.`,
    );
  }

  if (event.choices && Object.keys(event.choices).length) {
    return b(
      `等待从 ${Object.values(event.choices).map((choice) => choice.label.zh).join(" / ")} 中确认执行方向。`,
      `Awaiting a decision: ${Object.values(event.choices).map((choice) => choice.label.en).join(" / ")}.`,
    );
  }

  return null;
}

export function progressSummaryFor(event, run) {
  const parts = [];
  if (run.activeLanes?.length) {
    const complete = run.completedLanes?.length ?? 0;
    parts.push(b(`主泳道 ${complete} / ${run.activeLanes.length}`, `Lanes ${complete} / ${run.activeLanes.length}`));
  }

  if (event.id === "planning-event" && run.parallelWork?.kind === "cognition") {
    parts.push(b(`协同模块 ${run.parallelWork.completed.length} / ${run.parallelWork.selected.length}`, `Modules ${run.parallelWork.completed.length} / ${run.parallelWork.selected.length}`));
  } else if (event.id === "tool-event" && run.parallelWork?.kind === "tools") {
    parts.push(b(`工具分支 ${run.parallelWork.completed.length} / ${run.parallelWork.selected.length}`, `Tools ${run.parallelWork.completed.length} / ${run.parallelWork.selected.length}`));
  } else if (run.selectedBranches?.length && ["rag-retrieval", "rag-join", "rag-context-event", "rag-callback"].includes(event.id)) {
    parts.push(b(`检索分支 ${run.completedBranches.length} / ${run.selectedBranches.length}`, `Retrieval ${run.completedBranches.length} / ${run.selectedBranches.length}`));
  } else if (!parts.length && event.choices && Object.keys(event.choices).length) {
    parts.push(b("等待选择", "Awaiting Choice"));
  } else if (!parts.length) {
    parts.push(b("顺序执行", "Sequential"));
  }

  return b(parts.map((part) => part.zh).join("　"), parts.map((part) => part.en).join(" · "));
}

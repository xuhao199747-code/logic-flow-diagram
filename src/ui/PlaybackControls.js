import { progressSummaryFor } from "./executionPresentation.js";

function focusTarget(container, identity) {
  const identitySelector = identity.kind === "action"
    ? `[data-action="${identity.value}"]`
    : `[data-${identity.kind}="${identity.value}"]`;
  const candidates = [
    identitySelector,
    '[data-action="primary"]',
    "[data-branch-choice]",
    '[data-action="recovery"]',
    '[data-action="restart"]',
  ];
  const target = candidates
    .map((selector) => container.querySelector(selector))
    .find((element) => element && !element.disabled && !element.hidden);
  target?.focus();
}

function preserveFocus(container, identity, handler) {
  let consumed = false;
  return (event) => {
    if (consumed || event.detail > 1) return;
    consumed = true;
    const restore = document.activeElement === event.currentTarget;
    handler?.();
    if (restore) focusTarget(container, identity);
  };
}

export function renderPlaybackControls(container, model, handlers) {
  const { run, event, scenario, eventNumber = 1, eventCount = 1 } = model;
  const needsChoice = event.relation === "decision" && Object.keys(event.choices ?? {}).length > 0;
  const progress = progressSummaryFor(event, run);
  const terminal = ["completed", "failed", "cancelled"].includes(run.status);
  const terminalLabels = {
    completed: "流程已完成 · Complete",
    cancelled: "流程已取消 · Cancelled",
    failed: "执行失败 · Failed",
  };
  const primaryLabel = terminal
    ? terminalLabels[run.status]
    : event.relation === "parallel"
    ? "完成下一分支 · Complete Branch"
    : event.relation === "parallel-work"
      ? run.parallelWork?.kind === "cognition"
        ? "完成下一模块 · Complete Module"
        : "完成下一工具 · Complete Tool"
      : event.relation === "callback"
        ? "执行回传 · Callback"
        : "下一事件 · Next Event";

  const blocked = Boolean(run.simulatedIssue);
  const hidePrimary = needsChoice || blocked;
  container.innerHTML = `<div class="playback"><div class="control-history"><button type="button" data-action="previous" title="上一步 / Previous (←)" ${run.history.length === 0 ? "disabled" : ""}>← 上一步 <small>Previous</small></button><button type="button" data-action="restart" title="重新开始 / Restart">重新开始 <small>Restart</small></button></div><div class="control-actions"><div class="decision-options"></div><button type="button" class="primary-action" data-action="primary" title="下一事件 / Next event (→)" ${hidePrimary ? "hidden" : ""} ${hidePrimary || terminal ? "disabled" : ""}>${primaryLabel}</button><div class="recovery-options"></div></div><div class="control-progress"><span class="run-progress" data-testid="run-progress" aria-label="当前轮次和事件 Current iteration and event">轮次 ${run.iteration} · 事件 ${eventNumber} / ${eventCount}<small>Iteration ${run.iteration} · Event ${eventNumber} / ${eventCount}</small></span><span data-testid="branch-progress" aria-label="当前模块进度 Current module progress">${progress.zh}<small>${progress.en}</small></span></div></div>`;

  const options = container.querySelector(".decision-options");
  for (const [choiceId, choice] of blocked ? [] : Object.entries(event.choices ?? {})) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.branchChoice = choiceId;
    button.innerHTML = `${choice.label.zh}<small>${choice.label.en}</small>`;
    button.onclick = preserveFocus(container, { kind: "branch-choice", value: choiceId }, () => handlers.onBranchChoice(choiceId));
    options.append(button);
  }

  const recovery = container.querySelector(".recovery-options");
  for (const option of blocked ? scenario?.recovery ?? [] : []) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "recovery";
    button.dataset.recovery = option.action;
    button.disabled = option.action === "request" && Boolean(run.simulatedIssue?.requested);
    button.innerHTML = `${option.label.zh}<small>${option.label.en}</small>`;
    button.onclick = preserveFocus(container, { kind: "recovery", value: option.action }, () => handlers.onRecovery(option.action));
    recovery.append(button);
  }

  container.querySelector('[data-action="previous"]').onclick = preserveFocus(container, { kind: "action", value: "previous" }, handlers.onPrevious);
  container.querySelector('[data-action="primary"]').onclick = preserveFocus(container, { kind: "action", value: "primary" }, handlers.onPrimaryAction);
  container.querySelector('[data-action="restart"]').onclick = preserveFocus(container, { kind: "action", value: "restart" }, handlers.onRestart);
}

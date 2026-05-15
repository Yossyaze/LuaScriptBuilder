import { state, normalizeStep, findStepById } from "./state.js";
import { hotkeys, hotkeyLabels, hotkeyDisplayIds, APP_PRESETS } from "./constants.js";
import { num, txt, escapeHtml } from "./utils.js";
import { isFirebaseConfigured } from "./firebase.js";

export function hotkeyToDisplay(hk) {
  if (!hk || !hk.key) return "未設定";
  const m = (hk.mods || [])
    .map((mod) => mod.charAt(0).toUpperCase() + mod.slice(1))
    .join("+");
  return (m ? m + "+" : "") + keyToDisplay(hk.key);
}

export function keyToDisplay(key) {
  if (!key) return "未設定";
  if (key === " " || key === "space") return "SPACE";
  return key.toUpperCase();
}

export function defaultWaitSecondsForIndex(index) {
  return index % 2 === 0 ? 0.3 : 0.4;
}

let stepInfoMap = new Map();
let globalStepOptionsHtml = "";

export function getAllStepsFlat(steps) {
  let res = [];
  steps.forEach((s) => {
    res.push(s);
    if (s.kind === "check") {
      res = res.concat(getAllStepsFlat(s.okBranch || []));
      res = res.concat(getAllStepsFlat(s.ngBranch || []));
    }
  });
  return res;
}

function prepareStepMetadata() {
  const flat = getAllStepsFlat(state.flowSteps);
  stepInfoMap.clear();
  const options = [];
  flat.forEach((s, i) => {
    const num = i + 1;
    const label = `Step ${num}`;
    stepInfoMap.set(s.id, { num, label, title: s.title || s.kind });
    options.push(`<option value="${s.id}">Step ${num}: ${escapeHtml(s.title || s.kind)}</option>`);
  });
  globalStepOptionsHtml = options.join("");
}

export function getStepLabelById(id) {
  const info = stepInfoMap.get(id);
  return info ? info.label : "不明";
}

export const icons = {
  ipad: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><line x1="12" x2="12" y1="18" y2="18"/></svg>`,
  iphone: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="10" height="18" x="7" y="3" rx="2" ry="2"/><line x1="12" x2="12" y1="17" y2="17"/></svg>`,
  key: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/><path d="M7 16h10"/></svg>`,
  click: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  focus: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-3-3-3 3"/><path d="m15 18-3-3-3 3"/><path d="M12 3v6"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  jump: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>`,
  stop: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M9 9h6v6H9z"/></svg>`,
  google: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.14-4.53z" fill="#EA4335"/></svg>`,
};

export function setupAddStepButtons() {
  const mapping = {
    btnFlowAddIPad: icons.ipad,
    btnFlowAddIPhone: icons.iphone,
    btnFlowAddKey: icons.key,
    btnFlowAddClick: icons.click,
    btnFlowAddFocus: icons.focus,
    btnFlowAddCheck: icons.check,
    btnFlowAddJump: icons.jump,
    btnFlowAddStop: icons.stop,
  };

  Object.entries(mapping).forEach(([id, icon]) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.innerHTML = `${icon} <span>${btn.innerText.trim()}</span>`;
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.gap = "8px";
      btn.style.justifyContent = "center";
    }
  });
}

function renderStepCard(step, stepNum, isLast = false) {
  let icon = icons.key;
  if (step.kind === "move") {
    icon = step.moveHotkey === "ipadMove" ? icons.ipad : icons.iphone;
  } else if (step.kind === "click") {
    icon = icons.click;
  } else if (step.kind === "focus") {
    icon = icons.focus;
  } else if (step.kind === "check") {
    icon = icons.check;
  } else if (step.kind === "jump") {
    icon = icons.jump;
  } else if (step.kind === "stop") {
    icon = icons.stop;
  }

  let displayContent = "";
  let editorContent = "";

  if (step.kind === "move") {
    displayContent = `<p class="flow-value flow-value-hotkey">${hotkeyToDisplay(state.globalSettings[step.moveHotkey] || hotkeys[step.moveHotkey])}</p>`;
    editorContent = `<span class="step-key-label" style="font-size:0.7rem; color:#94a3b8;">固定ステップ</span>`;
  } else if (step.kind === "click") {
    displayContent = `
      <div style="display: flex; flex-direction: column; gap: 5px;">
        <div class="step-key-label-group">
          <input type="text" class="step-input" style="flex:1;" data-field="appName" data-step-id="${step.id}" value="${escapeHtml(step.appName || "")}" placeholder="アプリ名 (クリック対象)" />
          <div class="preset-dropdown-container">
            <button type="button" class="btn-ghost btn-small preset-btn" data-action="toggle-presets" data-step-id="${step.id}" title="プリセットから選択">★</button>
            <div class="preset-menu hidden" id="preset-menu-${step.id}">
              ${APP_PRESETS.map(p => `<div class="preset-item" data-name="${p.name}" data-id="${p.id}" data-step-id="${step.id}">${p.name}</div>`).join('')}
            </div>
          </div>
          <button type="button" class="btn-ghost btn-small" data-action="select-app" data-step-id="${step.id}" style="padding: 4px 8px!important; font-size: 0.7rem!important;">選択</button>
          <input type="file" id="file-app-${step.id}" webkitdirectory directory style="display:none;" />
        </div>
        <div class="step-key-label-group" style="gap: 8px;">
          <div style="display:flex; align-items:center; gap:3px;">
            <span class="step-key-label">X</span>
            <input type="number" class="step-input" style="width: 55px;" data-field="x" data-step-id="${step.id}" value="${step.x}" />
          </div>
          <div style="display:flex; align-items:center; gap:3px;">
            <span class="step-key-label">Y</span>
            <input type="number" class="step-input" style="width: 55px;" data-field="y" data-step-id="${step.id}" value="${step.y}" />
          </div>
          <div style="display:flex; align-items:center; gap:3px; margin-left:auto;">
            <span class="step-key-label" title="前面に出るのを待つ時間">待機</span>
            <input type="number" class="step-input" style="width: 48px;" data-field="settleBefore" data-step-id="${step.id}" value="${step.settleBefore}" step="0.1" min="0" />
            <span class="step-key-label">s</span>
          </div>
        </div>
      </div>
    `;
    editorContent = "";
  } else if (step.kind === "focus") {
    displayContent = `
      <div class="step-key-label-group">
        <input type="text" class="step-input" style="flex:1;" data-field="appName" data-step-id="${step.id}" value="${escapeHtml(step.appName || "")}" placeholder="アプリ名 (前面に出す)" />
        <div class="preset-dropdown-container">
          <button type="button" class="btn-ghost btn-small preset-btn" data-action="toggle-presets" data-step-id="${step.id}" title="プリセットから選択">★</button>
          <div class="preset-menu hidden" id="preset-menu-${step.id}">
            ${APP_PRESETS.map(p => `<div class="preset-item" data-name="${p.name}" data-id="${p.id}" data-step-id="${step.id}">${p.name}</div>`).join('')}
          </div>
        </div>
        <button type="button" class="btn-ghost btn-small" data-action="select-app" data-step-id="${step.id}" style="padding: 4px 8px!important; font-size: 0.7rem!important;">選択</button>
        <input type="file" id="file-app-${step.id}" webkitdirectory directory style="display:none;" />
      </div>
    `;
    editorContent = "";
  } else if (step.kind === "check") {
    displayContent = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div class="step-key-label-group" style="align-items: center; gap: 8px;">
          <input type="text" class="step-input" style="flex:1;" data-field="text" data-step-id="${step.id}" value="${escapeHtml(step.text || "")}" placeholder="検知するテキストを入力..." />
          <label style="display:flex; align-items:center; gap:4px; font-size:0.75rem; color:#64748b; cursor:pointer; white-space:nowrap;">
            <input type="checkbox" data-field="useRegex" data-step-id="${step.id}" ${step.useRegex ? "checked" : ""} style="width:14px; height:14px; margin:0;" />
            正規表現
          </label>
        </div>
        <div class="step-key-label-group" style="align-items: center; gap: 8px;">
          <input type="text" class="step-input" style="flex:1;" data-field="bundleId" data-step-id="${step.id}" value="${escapeHtml(step.bundleId || step.appName || "")}" placeholder="バンドル識別子 (例: com.apple.Safari)" />
          <div class="preset-dropdown-container">
            <button type="button" class="btn-ghost btn-small preset-btn" data-action="toggle-presets" data-step-id="${step.id}" title="プリセットから選択">★</button>
            <div class="preset-menu hidden" id="preset-menu-${step.id}">
              ${APP_PRESETS.map(p => `<div class="preset-item" data-name="${p.name}" data-id="${p.id}" data-step-id="${step.id}">${p.name}</div>`).join('')}
            </div>
          </div>
          <button type="button" class="btn-ghost btn-small" data-action="select-app" data-step-id="${step.id}" style="padding: 4px 8px!important; font-size: 0.7rem!important;">選択</button>
          <input type="file" id="file-app-${step.id}" webkitdirectory directory style="display:none;" />
        </div>
      </div>
    `;
    editorContent = "";
  } else if (step.kind === "jump") {
    // 選択されたターゲットを selected 属性付きで反映させるための正規表現置換、または動的生成
    const optionsWithSelected = globalStepOptionsHtml.replace(
      `value="${step.targetId}"`,
      `value="${step.targetId}" selected`
    );

    displayContent = `
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div class="step-key-label-group" style="flex-wrap: wrap;">
          <span class="step-key-label" style="min-width: 60px;">移動先:</span>
          <select class="step-input" data-field="targetId" data-step-id="${step.id}" style="width: auto;">
            <option value="">-- ステップ選択 --</option>
            ${optionsWithSelected}
          </select>
        </div>
      </div>
    `;
    editorContent = "";
  } else if (step.kind === "stop") {
    displayContent = `
      <div class="step-key-label-group">
        <span class="step-key-label">このステップで実行を停止します</span>
      </div>
    `;
    editorContent = "";
  } else {
    displayContent = `
      <div class="step-key-label-group">
        <span class="step-key-label">入力キー:</span>
        <span class="step-key-badge">${hotkeyToDisplay(step)}</span>
      </div>
    `;
    editorContent = `<button type="button" class="record-btn btn-small${state.recordingStepId === step.id ? " recording" : ""}" data-action="record-step" data-step-id="${step.id}">
         ${state.recordingStepId === step.id ? "入力待ち..." : "記録"}
       </button>`;
  }

  const badgeLabel =
    step.kind === "move"
      ? step.moveHotkey === "ipadMove"
        ? "iPad"
        : "iPhone"
      : step.kind === "click"
        ? "CLICK"
        : step.kind === "focus"
          ? "FOCUS"
          : step.kind === "check"
            ? "CHECK"
            : step.kind === "jump"
              ? "JUMP"
              : step.kind === "stop"
                ? "STOP"
                : "KEY";

  const kindClass =
    step.kind === "move"
      ? step.moveHotkey === "ipadMove"
        ? "move"
        : "iphone"
      : step.kind === "click"
        ? "click"
        : step.kind === "focus"
          ? "focus"
          : step.kind === "check"
            ? "check"
            : step.kind === "jump"
              ? "jump"
              : step.kind === "stop"
                ? "stop"
                : "key";

  return `
    <article class="flow-step ${kindClass}${state.selectedStepId === step.id ? " selected" : ""}${isLast ? " is-last" : ""}" draggable="true" data-step-id="${step.id}">
      <div class="flow-step-header">
        <div class="flow-step-title">
          <span class="flow-index">${stepNum}</span>
          ${icon}
          <span class="flow-kind flow-kind-${kindClass}">${badgeLabel}</span>
          <input type="text" class="step-title-input" data-field="title" data-step-id="${step.id}" value="${escapeHtml(step.title || "")}" placeholder="アクション名" />
        </div>
        <button type="button" class="icon-btn" data-action="delete" data-step-id="${step.id}" title="削除">
          <svg pointer-events="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="flow-step-body">
        <div class="flow-value-container">
          ${displayContent}
        </div>
        <div class="flow-edit-inline">
          ${editorContent}
        </div>
      </div>
    </article>
  `;
}

function renderFlowStepsRecursive(
  steps,
  isTopLevel = false,
  branchWaitInfo = null,
  startIndex = 1,
) {
  const nodes = [];
  let currentIdx = startIndex;

  steps.forEach((raw, index) => {
    const step = normalizeStep(raw);
    const stepNum = currentIdx++;
    const hasNext = index < steps.length - 1;

    const okEndsStop =
      step.kind === "check" &&
      step.okBranch &&
      step.okBranch.length > 0 &&
      (step.okBranch[step.okBranch.length - 1].kind === "stop" ||
        step.okBranch[step.okBranch.length - 1].kind === "jump");
    const ngEndsStop =
      step.kind === "check" &&
      step.ngBranch &&
      step.ngBranch.length > 0 &&
      (step.ngBranch[step.ngBranch.length - 1].kind === "stop" ||
        step.ngBranch[step.ngBranch.length - 1].kind === "jump");
    const isStopStep =
      step.kind === "stop" ||
      step.kind === "jump" ||
      (step.kind === "check" && okEndsStop && ngEndsStop);

    const isLoopEnabled = document.getElementById("enableLoop")?.checked;
    const isEffectivelyLast = !hasNext && (!isTopLevel || !isLoopEnabled);
    const stepCardHtml = renderStepCard(step, stepNum, isEffectivelyLast);

    if (step.kind !== "check") {
      nodes.push(stepCardHtml);
    }

    // JUMPステップの場合、ここで待機コネクタとジャンプ先ラベルを追加して終了
    if (step.kind === "jump") {
      const waitSeconds = step.waitAfter ?? defaultWaitSecondsForIndex(index);
      const targetDesc = getStepLabelById(step.targetId) || "未設定";
      nodes.push(`
        <div class="flow-jump-group">
          <div class="flow-connector" data-insert-after="${step.id}">
            <div class="flow-connector-pill">
              <span class="flow-connector-dot"></span>
              待機
              <input data-field="waitAfter" data-step-id="${step.id}" type="number" min="0" step="0.05" value="${waitSeconds.toFixed(2)}" />
              s
            </div>
          </div>
          <div class="flow-jump-label">
            <div class="flow-jump-pill">
              ${icons.jump}
              <span>${targetDesc} へジャンプ</span>
            </div>
          </div>
        </div>
      `);
      return; // このステップの処理はここまで
    }

    if (step.kind === "check") {
      const { html: okHtml, nextIdx: nextIdxAfterOk } =
        renderFlowStepsRecursive(
          step.okBranch || [],
          false,
          null,
          currentIdx,
        );
      currentIdx = nextIdxAfterOk;

      const { html: ngHtml, nextIdx: nextIdxAfterNg } =
        renderFlowStepsRecursive(
          step.ngBranch || [],
          false,
          null,
          currentIdx,
        );
      currentIdx = nextIdxAfterNg;

      let mergeClass = "";
      if (okEndsStop && ngEndsStop) mergeClass = " both-ends";
      else if (okEndsStop) mergeClass = " ok-ends";
      else if (ngEndsStop) mergeClass = " ng-ends";

      const okBeforeConnector = `
        <div class="flow-connector is-branch" data-branch-parent-id="${step.id}" data-branch-type="ok" data-is-start="true">
          <div class="flow-connector-pill">
            <span class="flow-connector-dot"></span>
            待機
            <input data-field="okWaitBefore" data-step-id="${step.id}" type="number" min="0" step="0.05" value="${(step.okWaitBefore ?? 0.5).toFixed(2)}" />
            s
          </div>
        </div>
      `;
      const ngBeforeConnector = `
        <div class="flow-connector is-branch" data-branch-parent-id="${step.id}" data-branch-type="ng" data-is-start="true">
          <div class="flow-connector-pill">
            <span class="flow-connector-dot"></span>
            待機
            <input data-field="ngWaitBefore" data-step-id="${step.id}" type="number" min="0" step="0.05" value="${(step.ngWaitBefore ?? 0.5).toFixed(2)}" />
            s
          </div>
        </div>
      `;

      const okSelected =
        state.selectedBranch &&
        state.selectedBranch.checkId === step.id &&
        state.selectedBranch.branchType === "ok";
      const ngSelected =
        state.selectedBranch &&
        state.selectedBranch.checkId === step.id &&
        state.selectedBranch.branchType === "ng";

      const isMergeSelected = state.selectedMergeId === step.id;
      nodes.push(`
        <div class="flow-check-block${mergeClass}">
          <div class="flow-check-card">
            ${stepCardHtml}
          </div>
          <div class="flow-split" data-parent-check-id="${step.id}">
            <div class="flow-split-col ok${okSelected ? " selected" : ""}${okEndsStop ? " ends-stop" : ""}" data-branch-type="ok" data-parent-id="${step.id}">
              <div class="flow-split-header${okSelected && state.selectedBranch.selectionType === "header" ? " selected" : ""}" data-branch-type="ok" data-parent-id="${step.id}">✅ OK (見つかった時)</div>
              ${okBeforeConnector}
              ${okHtml || `<div class="flow-split-empty${okSelected && state.selectedBranch.selectionType === "empty" ? " selected" : ""}" data-branch-type="ok" data-parent-id="${step.id}">
                <span class="flow-merge-indicator">↓</span>
                <span class="empty-label">何もしないで合流</span>
                <div class="empty-hint">クリックしてアクションを追加</div>
              </div>`}
              ${okEndsStop ? "" : `<div class="flow-branch-filler"></div>`}
            </div>
            <div class="flow-split-col ng${ngSelected ? " selected" : ""}${ngEndsStop ? " ends-stop" : ""}" data-branch-type="ng" data-parent-id="${step.id}">
              <div class="flow-split-header${ngSelected && state.selectedBranch.selectionType === "header" ? " selected" : ""}" data-branch-type="ng" data-parent-id="${step.id}">❌ NG (見つからない時)</div>
              ${ngBeforeConnector}
              ${ngHtml || `<div class="flow-split-empty${ngSelected && state.selectedBranch.selectionType === "empty" ? " selected" : ""}" data-branch-type="ng" data-parent-id="${step.id}">
                <span class="flow-merge-indicator">↓</span>
                <span class="empty-label">何もしないで合流</span>
                <div class="empty-hint">クリックしてアクションを追加</div>
              </div>`}
              ${ngEndsStop ? "" : `<div class="flow-branch-filler"></div>`}
            </div>
          </div>
          <div class="flow-merge${mergeClass}${isMergeSelected ? " selected" : ""}">
            <span class="flow-merge-pill${isMergeSelected ? " selected" : ""}" data-rendered-from="merge" data-action="select-merge" data-parent-id="${step.id}" data-insert-at="end" data-branch-type="ok_ng_merge">↓ メインフローに合流</span>
          </div>
        </div>
      `);
    }

    if (isStopStep) {
      // No connector
    } else if (!hasNext) {
      const isLoopEnabled = document.getElementById("enableLoop")?.checked;
      if (isTopLevel && isLoopEnabled) {
        // 末尾の合流ラベル（check）の場合は、直後の待機ピルを表示しない
        if (step.kind !== "check") {
          const waitSeconds = step.waitAfter ?? defaultWaitSecondsForIndex(index);
          nodes.push(`
            <div class="flow-connector" data-insert-after="${step.id}">
              <div class="flow-connector-pill">
                <span class="flow-connector-dot"></span>
                待機
                <input data-field="waitAfter" data-step-id="${step.id}" type="number" min="0" step="0.05" value="${waitSeconds.toFixed(2)}" />
                s
              </div>
            </div>
          `);
        }
        
        nodes.push(`
          <div class="flow-loop-connector" data-insert-at="end" data-is-top="true">
            <div class="flow-connector-pill" style="background: #f0f9ff; border-color: #bae6fd; color: #0369a1; padding: 6px 16px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              最初に戻ってループ
            </div>
          </div>
        `);
      } else if (isTopLevel && !isLoopEnabled) {
        nodes.push(`
          <div class="flow-connector"></div>
          <div class="flow-end-connector" data-insert-at="end" data-is-top="true">
            <div class="flow-connector-pill" style="background: #fef2f2; border-color: #fecaca; color: #991b1b; padding: 6px 16px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M9 9h6v6H9z"/></svg>
              実行終了
            </div>
          </div>
        `);
      }
    }

    if (!isStopStep && (hasNext || !isTopLevel) && step.kind !== "check") {
      const waitSeconds = step.waitAfter ?? defaultWaitSecondsForIndex(index);
      nodes.push(`
        <div class="flow-connector" data-insert-after="${step.id}">
          <div class="flow-connector-pill">
            <span class="flow-connector-dot"></span>
            待機
            <input data-field="waitAfter" data-step-id="${step.id}" type="number" min="0" step="0.05" value="${waitSeconds.toFixed(2)}" />
            s
          </div>
        </div>
      `);
    }

    // branchWaitInfo (終了時待機用) は廃止。ステップ自身の waitAfter に一本化。
  });

  return { html: nodes.join(""), nextIdx: currentIdx };
}

export function updateFlowPreview() {
  const track = document.getElementById("flowTrack");
  if (!track) return;
  prepareStepMetadata();
  const { html } = renderFlowStepsRecursive(state.flowSteps, true);
  track.innerHTML = html;
  
  if (typeof window.setupStepDragAndDrop === "function") {
    window.setupStepDragAndDrop();
  }
}



export function renderHotkeys() {
  Object.keys(hotkeys).forEach((id) => {
    const displayId = hotkeyDisplayIds[id];
    const el = document.getElementById(displayId);
    if (el) {
      if (state.recordingTarget === id) {
        el.value = "入力待ち...";
        el.classList.add("recording");
      } else {
        let hk = null;
        if (id === "start" || id === "stop") {
          const p = state.projects[state.activeProjectId];
          if (p && p.hotkeys && p.hotkeys[id]) {
            hk = p.hotkeys[id];
          }
        }
        
        if (!hk) {
          hk = state.globalSettings[id] || hotkeys[id];
        }
        
        el.value = hotkeyToDisplay(hk);
        el.classList.remove("recording");
      }

    }

    const btn = document.querySelector(`.record-btn[data-hotkey="${id}"]`);
    if (btn) {
      if (state.recordingTarget === id) {
        btn.textContent = "停止";
        btn.classList.add("recording");
      } else {
        btn.textContent = "記録";
        btn.classList.remove("recording");
      }
    }
  });
}

export function updateProjectTabs(
  projects = state.projects,
  activeProjectId = state.activeProjectId,
  onSelect,
  onAdd,
) {
  const container = document.getElementById("projectTabs");
  if (!container || !projects) return;
  container.innerHTML = "";

  const selectCb =
    onSelect ||
    ((id) => {
      if (id === state.activeProjectId) return;
      window.loadProjectState(id);
    });
  const addCb =
    onAdd ||
    (() => {
      const name = prompt("新しいプロジェクト名", "New Project");
      if (name) window.createNewProject(name);
    });

  // プロジェクトの順序が未設定の場合は、現在のキーから作成
  if (state.projectOrder.length === 0 && Object.keys(projects).length > 0) {
    state.projectOrder = Object.keys(projects);
  }

  state.projectOrder.forEach((id) => {
    const p = projects[id];
    if (!p) return;

    const tab = document.createElement("div");
    tab.className = `tab${id === activeProjectId ? " active" : ""}`;
    tab.dataset.id = id;
    tab.draggable = true;

    const nameSpan = document.createElement("span");
    nameSpan.className = "tab-name";
    nameSpan.textContent = p.name;
    nameSpan.title = "ダブルクリックで名前変更";
    nameSpan.addEventListener("click", () => selectCb(id));
    nameSpan.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (typeof window.renameProject === "function") {
        window.renameProject(id);
      }
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close";
    closeBtn.innerHTML = "&times;";
    closeBtn.title = "削除";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof window.deleteProject === "function") {
        window.deleteProject(id);
      }
    });

    tab.appendChild(nameSpan);
    tab.appendChild(closeBtn);

    // ドラッグ＆ドロップのイベント
    tab.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", id);
      tab.classList.add("dragging");
    });
    tab.addEventListener("dragover", (e) => {
      e.preventDefault();
      tab.classList.add("drag-over");
    });
    tab.addEventListener("dragleave", () => {
      tab.classList.remove("drag-over");
    });
    tab.addEventListener("dragend", () => {
      tab.classList.remove("dragging");
      container
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("drag-over"));
    });
    tab.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData("text/plain");
      if (draggedId !== id && typeof window.reorderProjects === "function") {
        window.reorderProjects(draggedId, id);
      }
    });

    container.appendChild(tab);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "tab tab-add";
  addBtn.innerHTML = "+";
  addBtn.title = "新規プロジェクト";
  addBtn.addEventListener("click", addCb);
  container.appendChild(addBtn);
}

/**
 * 認証状態に応じてUIを更新
 */
export function updateAuthUI(user, syncStatus = 'synced') {
  const container = document.getElementById('authSection');
  if (!container) return;

  // Firebaseが設定されていない場合
  if (!isFirebaseConfigured()) {
    container.innerHTML = `
      <div style="font-size: 0.75rem; color: var(--warn); background: #fffbeb; padding: 4px 10px; border: 1px solid #fef3c7; border-radius: 8px; max-width: 200px; line-height: 1.2;">
        ⚠️ Firebase未設定<br>
        <span style="font-size: 0.7rem; opacity: 0.8;">デプロイ環境の設定を確認してください</span>
      </div>
    `;
    return;
  }

  if (user) {
    // ログイン済み
    const statusText = syncStatus === 'syncing' ? '同期中...' : '同期済み';
    const statusClass = syncStatus === 'syncing' ? 'syncing' : 'synced';

    container.innerHTML = `
      <div class="user-profile">
        <img src="${user.photoURL || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" class="user-avatar" alt="Avatar">
        <div style="display: flex; flex-direction: column;">
          <span class="user-name">${escapeHtml(user.displayName || 'User')}</span>
          <div class="sync-status ${statusClass}">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
            ${statusText}
          </div>
        </div>
      </div>
      <button class="btn-ghost btn-small" id="btnLogout">ログアウト</button>
    `;

    document.getElementById('btnLogout').onclick = () => {
      if (confirm('ログアウトしますか？')) {
        window.handleLogout();
      }
    };
  } else {
    // 未ログイン
    container.innerHTML = `
      <button class="btn-google btn-small" id="btnLogin">
        ${icons.google}
        Googleでログイン
      </button>
    `;

    document.getElementById('btnLogin').onclick = () => {
      window.handleLogin();
    };
  }
}

export function setStatus(msg, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.className = isError ? "error" : "ok";
}


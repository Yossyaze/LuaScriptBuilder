import { state, nextStepId, findStepById, normalizeStep } from './state.js';

/**
 * フローの中に新しいステップ（アクション）を追加します。
 * 
 * @param {string} kind ステップの種類 ("move", "key", "click", "focus", "check", "jump", "stop", "btt", "shortcut", "device_switch")
 * @param {string} [moveHotkey="ipadMove"] デバイス移動の場合のホットキー識別子
 * @param {Object} options 外部コールバックオブジェクト
 * @param {Function} options.saveHistory 履歴保存関数
 * @param {Function} options.refreshFlowViews フロー再描画関数
 */
export function addStep(kind, moveHotkey = "ipadMove", { saveHistory, refreshFlowViews }) {
  if (saveHistory) saveHistory();
  const step = normalizeStep({
    id: nextStepId(),
    kind,
    moveHotkey,
    waitAfter: (() => {
      if (kind === "move") {
        return Number(state.globalSettings[moveHotkey === "ipadMove" ? "settleIPad" : "settleIPhone"] || 1.0);
      }
      if (kind === "device_switch") return 1.0;
      if (kind === "key") return Number(state.globalSettings.waitKey || 0.25);
      if (kind === "click") return Number(state.globalSettings.waitClick || 0.25);
      if (kind === "focus") return Number(state.globalSettings.waitFocus || 0.25);
      if (kind === "check") return Number(state.globalSettings.waitCheck || 0.25);
      if (kind === "btt") return Number(state.globalSettings.waitBtt || 0.25);
      if (kind === "shortcut") return Number(state.globalSettings.waitShortcut || 0.25);
      return 0.25;
    })()
  });

  if (state.selectedBranch) {
    const parent = findStepById(state.selectedBranch.checkId);
    if (parent) {
      if (state.selectedBranch.branchType === "ok") {
        parent.okBranch = parent.okBranch || [];
        if (state.selectedBranch.selectionType === 'header') {
          parent.okBranch.unshift(step);
        } else {
          parent.okBranch.push(step);
        }
      } else {
        parent.ngBranch = parent.ngBranch || [];
        if (state.selectedBranch.selectionType === 'header') {
          parent.ngBranch.unshift(step);
        } else {
          parent.ngBranch.push(step);
        }
      }
    }
  } else if (state.selectedMergeId) {
    const loc = findStepArrayAndIndex(state.selectedMergeId, state.flowSteps);
    if (loc) loc.array.splice(loc.index + 1, 0, step);
    else state.flowSteps.push(step);
  } else if (state.selectedStepId) {
    const loc = findStepArrayAndIndex(state.selectedStepId, state.flowSteps);
    if (loc) loc.array.splice(loc.index + 1, 0, step);
    else state.flowSteps.push(step);
  } else {
    state.flowSteps.push(step);
  }
  state.selectedStepId = step.id;
  state.selectedBranch = null;
  state.selectedMergeId = null;

  if (refreshFlowViews) {
    refreshFlowViews();
  } else if (window.refreshFlowViews) {
    window.refreshFlowViews();
  }
}

/**
 * 再帰的にフローを探索し、指定されたIDのステップが含まれる配列とそのインデックスを返します。
 * 
 * @param {number} stepId 対象ステップのID
 * @param {Array} steps 探索対象のステップ配列
 * @returns {Object|null} 配列とインデックスを含むオブジェクト。見つからない場合は null
 */
export function findStepArrayAndIndex(stepId, steps) {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].id === stepId) return { array: steps, index: i };
    if (steps[i].kind === "check") {
      const ok = findStepArrayAndIndex(stepId, steps[i].okBranch || []);
      if (ok) return ok;
      const ng = findStepArrayAndIndex(stepId, steps[i].ngBranch || []);
      if (ng) return ng;
    }
  }
  return null;
}

/**
 * ステップ内の特定のフィールド値を更新します。
 * 
 * @param {number} stepId 対象ステップのID
 * @param {string} field 更新対象フィールド名
 * @param {*} value 新しい値
 * @param {Object} options 外部コールバックオブジェクト
 * @param {Function} options.saveHistory 履歴保存関数
 * @param {Function} options.refreshFlowViews フロー再描画関数
 */
export function updateStepField(stepId, field, value, { saveHistory, refreshFlowViews }) {
  if (saveHistory) saveHistory();
  const step = findStepById(stepId);
  if (!step) return;
  if (["waitAfter", "x", "y", "settleBefore", "okWaitBefore", "ngWaitBefore"].includes(field)) {
    step[field] = Number(value);
  } else if (field === "targetId") {
    step[field] = value ? Number(value) : null;
  } else {
    step[field] = value;
  }

  if (refreshFlowViews) {
    refreshFlowViews();
  } else if (window.refreshFlowViews) {
    window.refreshFlowViews();
  }
}

/**
 * フロー内のステップの順序を入れ替えます。
 * 
 * @param {number} draggedId ドラッグされたステップのID
 * @param {number} targetId ドロップ先のターゲットステップのID
 * @param {string} position 挿入位置 ("before" または "after")
 * @param {Object} options 外部コールバックオブジェクト
 * @param {Function} options.saveHistory 履歴保存関数
 * @param {Function} options.refreshFlowViews フロー再描画関数
 */
export function reorderSteps(draggedId, targetId, position, { saveHistory, refreshFlowViews }) {
  if (draggedId === targetId) return;
  
  if (saveHistory) saveHistory();
  const draggedLoc = findStepArrayAndIndex(draggedId, state.flowSteps);
  if (!draggedLoc) return;
  
  const stepToMove = draggedLoc.array[draggedLoc.index];
  draggedLoc.array.splice(draggedLoc.index, 1);
  
  const targetLoc = findStepArrayAndIndex(targetId, state.flowSteps);
  if (targetLoc) {
    let insertIndex = targetLoc.index;
    if (position === 'after') insertIndex++;
    targetLoc.array.splice(insertIndex, 0, stepToMove);
  } else {
    // 構造が変わって見つからない場合は末尾へ（安全策）
    state.flowSteps.push(stepToMove);
  }

  if (refreshFlowViews) {
    refreshFlowViews();
  } else if (window.refreshFlowViews) {
    window.refreshFlowViews();
  }
}

/**
 * ステップを特定のCHECK分岐（OK / NG）の先頭へ移動させます。
 * 
 * @param {number} draggedId ドラッグされたステップのID
 * @param {number} parentId CHECKステップのID
 * @param {string} branchType 分岐種別 ("ok" または "ng")
 * @param {Object} options 外部コールバックオブジェクト
 * @param {Function} options.saveHistory 履歴保存関数
 * @param {Function} options.refreshFlowViews フロー再描画関数
 */
export function moveToBranch(draggedId, parentId, branchType, { saveHistory, refreshFlowViews }) {
  if (saveHistory) saveHistory();
  const draggedLoc = findStepArrayAndIndex(draggedId, state.flowSteps);
  if (!draggedLoc) return;
  
  const stepToMove = draggedLoc.array[draggedLoc.index];
  const parentStep = findStepById(parentId);
  if (!parentStep || parentStep.kind !== 'check') return;
  
  draggedLoc.array.splice(draggedLoc.index, 1);
  
  if (branchType === 'ok') {
    parentStep.okBranch = parentStep.okBranch || [];
    parentStep.okBranch.unshift(stepToMove);
  } else {
    parentStep.ngBranch = parentStep.ngBranch || [];
    parentStep.ngBranch.unshift(stepToMove);
  }

  if (refreshFlowViews) {
    refreshFlowViews();
  } else if (window.refreshFlowViews) {
    window.refreshFlowViews();
  }
}

/**
 * ステップをフローの先頭（トップレベルの最初）に移動させます。
 * 
 * @param {number} draggedId ドラッグされたステップのID
 * @param {Object} options 外部コールバックオブジェクト
 * @param {Function} options.saveHistory 履歴保存関数
 * @param {Function} options.refreshFlowViews フロー再描画関数
 */
export function moveToStart(draggedId, { saveHistory, refreshFlowViews }) {
  if (saveHistory) saveHistory();
  const draggedLoc = findStepArrayAndIndex(draggedId, state.flowSteps);
  if (!draggedLoc) return;
  
  const stepToMove = draggedLoc.array[draggedLoc.index];
  draggedLoc.array.splice(draggedLoc.index, 1);
  state.flowSteps.unshift(stepToMove);

  if (refreshFlowViews) {
    refreshFlowViews();
  } else if (window.refreshFlowViews) {
    window.refreshFlowViews();
  }
}

/**
 * ステップをフローの末尾（合流地点やブランチの最後）に移動させます。
 * 
 * @param {number} draggedId ドラッグされたステップのID
 * @param {number} parentId 合流元または親となるチェックステップのID
 * @param {string} branchType 分岐種別 ("ok", "ng" または合流 "ok_ng_merge")
 * @param {Object} options 外部コールバックオブジェクト
 * @param {Function} options.saveHistory 履歴保存関数
 * @param {Function} options.refreshFlowViews フロー再描画関数
 */
export function moveToEnd(draggedId, parentId, branchType, { saveHistory, refreshFlowViews }) {
  if (saveHistory) saveHistory();
  const draggedLoc = findStepArrayAndIndex(draggedId, state.flowSteps);
  if (!draggedLoc) return;
  
  const stepToMove = draggedLoc.array[draggedLoc.index];
  draggedLoc.array.splice(draggedLoc.index, 1);
  
  if (branchType === 'ok_ng_merge') {
    const targetLoc = findStepArrayAndIndex(parentId, state.flowSteps);
    if (targetLoc) {
      targetLoc.array.splice(targetLoc.index + 1, 0, stepToMove);
    } else {
      state.flowSteps.push(stepToMove);
    }
  } else if (parentId && branchType) {
    const parentStep = findStepById(parentId);
    if (parentStep && parentStep.kind === 'check') {
      if (branchType === 'ok') {
        parentStep.okBranch = parentStep.okBranch || [];
        parentStep.okBranch.push(stepToMove);
      } else {
        parentStep.ngBranch = parentStep.ngBranch || [];
        parentStep.ngBranch.push(stepToMove);
      }
    }
  } else {
    state.flowSteps.push(stepToMove);
  }

  if (refreshFlowViews) {
    refreshFlowViews();
  } else if (window.refreshFlowViews) {
    window.refreshFlowViews();
  }
}

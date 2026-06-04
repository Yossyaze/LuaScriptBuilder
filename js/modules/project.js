import { state, flushActiveProject } from './state.js';
import { saveToStorage } from './storage.js';
import { setStatus, updateProjectTabs } from './ui.js';

/**
 * 新しいプロジェクトを作成します。
 * 
 * @param {string} name プロジェクト名
 * @param {string} [platform="lua"] ターゲットプラットフォーム
 * @param {Object} options 外部コールバック用オブジェクト
 * @param {Function} options.loadProjectState プロジェクトロード関数
 */
export function createNewProject(name, platform = "lua", { loadProjectState }) {
  const id = "proj-" + Date.now();
  state.projects[id] = {
    id,
    name,
    platform,
    hotkeys: {
      start: { key: "s", mods: ["ctrl", "shift"] },
      stop: { key: "x", mods: ["ctrl", "shift"] },
    },
    flowSteps: [],
    config: {
      settleIPad: "0.3",
      waitIPad: "2.0",
      settleIPhone: "0.4",
      waitIPhone: "1.5",
      enableTimelineLog: "true",
      enableAutoStopLog: "true",
      enableLoop: "true",
    },
    stepIdSeq: 1,
    templateStepIds: {},
  };
  state.projectOrder.push(id);
  
  if (loadProjectState) {
    loadProjectState(id);
  } else if (window.loadProjectState) {
    window.loadProjectState(id);
  }
}

/**
 * 特定のステップ種別の数をカウントします (プラットフォーム切替の警告表示用)
 */
function countStepsByKind(steps, kind) {
  let count = 0;
  (steps || []).forEach((step) => {
    if (step.kind === kind) count += 1;
    if (step.kind === "check") {
      count += countStepsByKind(step.okBranch || [], kind);
      count += countStepsByKind(step.ngBranch || [], kind);
    }
  });
  return count;
}

/**
 * プロジェクトのターゲットプラットフォームを切り替えます。
 * Lua <-> JS の切替に伴うデバイス切替ステップの非互換性警告を含みます。
 * 
 * @param {string} nextPlatform 切り替え先プラットフォーム ("lua" または "js")
 * @param {string} projectId 対象プロジェクトの ID
 * @param {Object} options 外部コールバック用オブジェクト
 * @param {Function} options.saveHistory 履歴保存関数
 * @param {Function} options.syncPlatformUI UI同期関数
 * @param {Function} options.refreshFlowViews フロー再描画関数
 */
export function switchProjectPlatform(nextPlatform, projectId, { saveHistory, syncPlatformUI, refreshFlowViews }) {
  const p = state.projects[projectId];
  if (!p) return;

  if (p.platform === nextPlatform) return;

  flushActiveProject();
  
  // Luaに切り替える時だけ、デバイス切替 (device_switch) が非サポートになる
  const unsupportedCount = nextPlatform === "lua"
    ? countStepsByKind(p.flowSteps, "device_switch")
    : 0;

  if (unsupportedCount > 0) {
    const ok = confirm(
      `デバイス切替ステップが${unsupportedCount}個あります。\n` +
      `切り替えても削除はしませんが、Lua (Hammerspoon) では非サポートとなり警告表示されます。\n\n` +
      "切り替えますか？"
    );
    if (!ok) {
      // キャンセルされた場合、セレクトボックスの選択を元のプラットフォーム値に戻す
      const select = document.getElementById("projectPlatformSelect");
      if (select) select.value = p.platform;
      return;
    }
  }

  if (saveHistory) saveHistory();
  p.platform = nextPlatform;
  
  if (syncPlatformUI) {
    syncPlatformUI(nextPlatform);
  } else if (window.syncPlatformUI) {
    window.syncPlatformUI(nextPlatform);
  }
  
  updateProjectTabs();
  
  if (refreshFlowViews) {
    refreshFlowViews();
  } else if (window.refreshFlowViews) {
    window.refreshFlowViews();
  }

  const output = document.getElementById("output");
  if (output) output.value = "";

  saveToStorage();
  setStatus(`${p.name} を ${nextPlatform === "js" ? "JS" : "Lua"} 用に切り替えました`);
}

/**
 * プロジェクト名を変更します。
 * 
 * @param {string} projectId 対象プロジェクトの ID
 * @param {Object} options 外部コールバック用オブジェクト
 * @param {Function} options.saveHistory 履歴保存関数
 */
export function renameProject(projectId, { saveHistory }) {
  const p = state.projects[projectId];
  if (!p) return;
  const name = prompt("名前を変更", p.name);
  if (name) {
    if (saveHistory) saveHistory();
    p.name = name;
    
    if (projectId === state.activeProjectId) {
      const activeNameDisp = document.getElementById("activeProjectNameDisplay");
      if (activeNameDisp) {
        activeNameDisp.textContent = name;
      }
    }
    
    updateProjectTabs();
    saveToStorage();
  }
}

/**
 * プロジェクトを削除します。
 * 
 * @param {string} projectId 対象プロジェクトの ID
 * @param {Object} options 外部コールバック用オブジェクト
 * @param {Function} options.saveHistory 履歴保存関数
 * @param {Function} options.loadProjectState プロジェクトロード関数
 */
export function deleteProject(projectId, { saveHistory, loadProjectState }) {
  if (Object.keys(state.projects).length <= 1) {
    alert("最後のプロジェクトは削除できません");
    return;
  }
  const p = state.projects[projectId];
  if (confirm(`プロジェクト「${p.name}」を削除しますか？`)) {
    if (saveHistory) saveHistory();
    delete state.projects[projectId];
    state.projectOrder = state.projectOrder.filter(id => id !== projectId);
    
    if (state.activeProjectId === projectId) {
      const nextActiveId = state.projectOrder[0];
      if (loadProjectState) {
        loadProjectState(nextActiveId);
      } else if (window.loadProjectState) {
        window.loadProjectState(nextActiveId);
      }
    } else {
      updateProjectTabs();
    }
    saveToStorage();
  }
}

/**
 * プロジェクトを複製します。
 * 
 * @param {string} projectId コピー元プロジェクトの ID
 * @param {Object} options 外部コールバック用オブジェクト
 * @param {Function} options.saveHistory 履歴保存関数
 * @param {Function} options.loadProjectState プロジェクトロード関数
 */
export function duplicateProject(projectId, { saveHistory, loadProjectState }) {
  const sourceProj = state.projects[projectId];
  if (!sourceProj) return;

  if (saveHistory) saveHistory();

  const id = "proj-" + Date.now();
  // ディープコピー
  const duplicated = JSON.parse(JSON.stringify(sourceProj));
  duplicated.id = id;
  duplicated.name = duplicated.name + " - コピー";

  state.projects[id] = duplicated;

  // 複製元のプロジェクトの直後に新しいプロジェクトを挿入
  const index = state.projectOrder.indexOf(projectId);
  if (index !== -1) {
    state.projectOrder.splice(index + 1, 0, id);
  } else {
    state.projectOrder.push(id);
  }

  if (loadProjectState) {
    loadProjectState(id);
  } else if (window.loadProjectState) {
    window.loadProjectState(id);
  }
  
  saveToStorage();
  setStatus(`プロジェクト「${sourceProj.name}」を複製しました`);
}

/**
 * プロジェクトの表示順序を入れ替えます。
 * 
 * @param {string} draggedId ドラッグされたプロジェクトの ID
 * @param {string} targetId ドロップ先のプロジェクトの ID
 * @param {Object} options 外部コールバック用オブジェクト
 * @param {Function} options.saveHistory 履歴保存関数
 */
export function reorderProjects(draggedId, targetId, { saveHistory }) {
  const oldIndex = state.projectOrder.indexOf(draggedId);
  const newIndex = state.projectOrder.indexOf(targetId);
  if (oldIndex === -1 || newIndex === -1) return;
  
  if (saveHistory) saveHistory();
  state.projectOrder.splice(oldIndex, 1);
  state.projectOrder.splice(newIndex, 0, draggedId);
  
  updateProjectTabs();
  saveToStorage();
}

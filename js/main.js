import { state, nextStepId, findStepById, flushActiveProject, normalizeStep, defaultTitleByKind } from './modules/state.js';
import { hotkeyLabels, NEW_STORAGE_KEY } from './modules/constants.js';

import { num, txt, escapeHtml } from './modules/utils.js';
import { saveToStorage, loadFromStorage } from './modules/storage.js';
import { generateLua } from './modules/lua.js';
import { 
  updateFlowPreview, 
  renderHotkeys, 
  updateProjectTabs, 
  setStatus,
  hotkeyToDisplay,
  keyToDisplay,
  setupAddStepButtons
} from './modules/ui.js';
import { updateMermaidGraph } from './modules/flowchart.js';
import { HistoryManager } from './modules/history.js';
import { onAuthChange, loginWithGoogle, logout, loadUserData, subscribeUserData } from './modules/firebase.js';
import { applyDataToState } from './modules/storage.js';
import { updateAuthUI } from './modules/ui.js';

const history = new HistoryManager();
let unsubscribeCloud = null;
let lastPromptedCloudTime = 0; // すでに確認ダイアログを出したクラウドのタイムスタンプ

/**
 * ログイン処理
 */
window.handleLogin = async () => {
  try {
    state.sync.isManualLogin = true; // ログインボタン経由であることを示す
    const user = await loginWithGoogle();
    if (user) {
      setStatus("ログインしました");
    } else {
      state.sync.isManualLogin = false;
    }
  } catch (error) {
    state.sync.isManualLogin = false;
    setStatus("ログインに失敗しました", true);
  }
};

/**
 * ログアウト処理
 */
window.handleLogout = async () => {
  try {
    await logout();
    state.user = null;
    updateAuthUI(null);
    setStatus("ログアウトしました");
  } catch (error) {
    setStatus("ログアウトに失敗しました", true);
  }
};

function saveHistory() {
  flushActiveProject();
  history.push(state);
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById("btnUndo");
  const redoBtn = document.getElementById("btnRedo");
  if (undoBtn) undoBtn.disabled = !history.canUndo();
  if (redoBtn) redoBtn.disabled = !history.canRedo();
}

window.undo = function() {
  flushActiveProject();
  const prevState = history.undo(state);
  if (prevState) {
    applyState(prevState);
    setStatus("元に戻しました (Undo)");
  }
};

window.redo = function() {
  flushActiveProject();
  const nextState = history.redo(state);
  if (nextState) {
    applyState(nextState);
    setStatus("やり直しました (Redo)");
  }
};

function applyState(newState) {
  // state オブジェクトのプロパティを更新
  Object.keys(newState).forEach(key => {
    state[key] = newState[key];
  });
  
  // アクティブなプロジェクトがある場合、グローバルなホットキー設定等も同期
  if (state.activeProjectId && state.projects[state.activeProjectId]) {
    const p = state.projects[state.activeProjectId];
    // プロジェクト切り替え時に共有オブジェクト hotkeys を上書きしないように変更

    
    // UIコンポーネント（input/checkbox）の値も同期
    if (p.config) {
      const fields = ["enableTimelineLog", "enableAutoStopLog", "enableExecutionAlert", "enableLoop"];
      fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) {
          if (el.type === "checkbox") {
            el.checked = p.config[f] === "true";
          } else {
            el.value = p.config[f] || (f.startsWith("enable") ? "true" : "0.5");
          }
        }
      });
    }
    syncGlobalSettingsToUI();
  }
  
  updateProjectTabs();
  renderHotkeys();
  refreshFlowViews();
  updateUndoRedoButtons();
}


// --- Global Functions (needed for inline HTML event handlers or external access) ---

window.loadProjectState = function(projectId) {
  if (state.activeProjectId && state.activeProjectId !== projectId && state.projects[state.activeProjectId]) {
    flushActiveProject();
  }
  const p = state.projects[projectId];
  if (!p) return;
  state.activeProjectId = projectId;
  state.flowSteps = p.flowSteps || [];
  state.stepIdSeq = p.stepIdSeq || 1;
  state.templateStepIds = p.templateStepIds || {};
  
  // プロジェクト切り替え時に共有オブジェクト hotkeys を上書きしないように変更

  
  if (p.config) {
    const fields = ["enableTimelineLog", "enableAutoStopLog", "enableExecutionAlert", "enableLoop"];
    fields.forEach(f => {
      const el = document.getElementById(f);
      if (el) {
        if (el.type === "checkbox") {
          el.checked = p.config[f] === "true";
        } else {
          el.value = p.config[f] || (f.startsWith("enable") ? "true" : "0.5");
        }
      }
    });
  }
  syncGlobalSettingsToUI();
  
  updateProjectTabs();
  renderHotkeys();
  refreshFlowViews();
  setStatus(`プロジェクト「${p.name}」を読み込みました`);
};

let refreshTimeout = null;
window.refreshFlowViews = function() {
  if (refreshTimeout) clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(() => {
    updateFlowPreview();
    // クラウドデータ適用中（同期中）は保存を走らせない
    if (!state.sync.isApplyingCloudData) {
      saveToStorage();
    }
    refreshTimeout = null;
  }, 10);
};

window.handleAppSelect = async function(event, stepId) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  setStatus("Info.plist を解析中...");
  let infoPlistFile = null;
  let shortestPathLength = Infinity;
  for (let i = 0; i < files.length; i++) {
    const path = files[i].webkitRelativePath;
    if (path.endsWith("Contents/Info.plist")) {
      const depth = path.split("/").length;
      if (depth < shortestPathLength) {
        shortestPathLength = depth;
        infoPlistFile = files[i];
      }
    }
  }

  let appName = "";
  let bundleId = "";
  if (infoPlistFile) {
    try {
      const text = await infoPlistFile.text();
      const getPlistValue = (xml, key) => {
        const regex = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`);
        const match = xml.match(regex);
        return match ? match[1] : null;
      };
      appName = getPlistValue(text, "CFBundleName");
      bundleId = getPlistValue(text, "CFBundleIdentifier");
    } catch (e) { console.error(e); }
  }

  if (!appName) {
    const rootDir = files[0].webkitRelativePath.split("/")[0];
    appName = rootDir.toLowerCase().endsWith(".app") ? rootDir.slice(0, -4) : rootDir;
  }

  const step = findStepById(stepId);
  if (step) {
    if (step.kind === "check") {
      step.appName = appName || "";
      step.bundleId = bundleId || "";
      refreshFlowViews();
      setStatus(`アプリ設定を更新しました: ${appName} (${bundleId || "ID取得不可"})`);
    } else if (appName) {
      step.appName = appName;
      refreshFlowViews();
      setStatus("アプリ名を自動設定しました: " + appName);
    }
  } else {
    setStatus("ステップが見つかりませんでした");
  }
  event.target.value = "";
};

// --- Core Logic ---

window.createNewProject = function(name) {
  const id = "proj-" + Date.now();
  state.projects[id] = {
    id,
    name,
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
  window.loadProjectState(id);
};

window.renameProject = function(projectId) {
  const p = state.projects[projectId];
  if (!p) return;
  const name = prompt("名前を変更", p.name);
  if (name) {
    saveHistory();
    p.name = name;
    updateProjectTabs();
    saveToStorage();
  }
};

window.deleteProject = function(projectId) {
  if (Object.keys(state.projects).length <= 1) {
    alert("最後のプロジェクトは削除できません");
    return;
  }
  const p = state.projects[projectId];
  if (confirm(`プロジェクト「${p.name}」を削除しますか？`)) {
    saveHistory();
    delete state.projects[projectId];
    state.projectOrder = state.projectOrder.filter(id => id !== projectId);
    if (state.activeProjectId === projectId) {
      window.loadProjectState(state.projectOrder[0]);
    } else {
      updateProjectTabs();
    }
    saveToStorage();
  }
};

window.exportAllData = function() {
  flushActiveProject();
  const data = {
    activeProjectId: state.activeProjectId,
    projects: state.projects,
    globalSettings: state.globalSettings,
    projectOrder: state.projectOrder,
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const a = document.createElement("a");
  a.href = url;
  a.download = `luascriptbuilder-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("データをエクスポートしました");
};

window.importAllData = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.projects || !data.globalSettings) {
        throw new Error("無効なデータ形式です");
      }

      if (!confirm("現在のすべてのデータが上書きされます。よろしいですか？")) {
        event.target.value = "";
        return;
      }

      saveHistory(); // インポート前を履歴に保存
      
      // ステートの更新
      state.projects = data.projects;
      state.globalSettings = data.globalSettings;
      state.activeProjectId = data.activeProjectId;
      state.projectOrder = data.projectOrder || Object.keys(data.projects);

      // 初期プロジェクトの読み込み
      if (state.activeProjectId && state.projects[state.activeProjectId]) {
        window.loadProjectState(state.activeProjectId);
      } else {
        const firstId = state.projectOrder[0] || Object.keys(state.projects)[0];
        if (firstId) window.loadProjectState(firstId);
      }

      saveToStorage();
      setStatus("データをインポートしました");
    } catch (err) {
      console.error(err);
      alert("インポートに失敗しました: " + err.message);
    }
    event.target.value = "";
  };
  reader.readAsText(file);
};

window.reorderProjects = function(draggedId, targetId) {
  const oldIndex = state.projectOrder.indexOf(draggedId);
  const newIndex = state.projectOrder.indexOf(targetId);
  if (oldIndex === -1 || newIndex === -1) return;
  
  saveHistory();
  state.projectOrder.splice(oldIndex, 1);
  state.projectOrder.splice(newIndex, 0, draggedId);
  
  updateProjectTabs();
  saveToStorage();
};

function addStep(kind, moveHotkey = "ipadMove") {
  saveHistory();
  const step = normalizeStep({
    id: nextStepId(),
    kind,
    moveHotkey,
    waitAfter: (() => {
      if (kind === "move") {
        return Number(state.globalSettings[moveHotkey === "ipadMove" ? "settleIPad" : "settleIPhone"] || 1.0);
      }
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
  refreshFlowViews();
}

function findStepArrayAndIndex(stepId, steps) {
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

function updateStepField(stepId, field, value) {
  saveHistory();
  const step = findStepById(stepId);
  if (!step) return;
  if (["waitAfter", "x", "y", "settleBefore", "okWaitBefore", "ngWaitBefore"].includes(field)) {
    step[field] = Number(value);
  } else if (field === "targetId") {
    step[field] = value ? Number(value) : null;
  } else {
    step[field] = value;
  }
  refreshFlowViews();
}

let draggedStepId = null;

window.reorderSteps = function(draggedId, targetId, position) {
  if (draggedId === targetId) return;
  
  saveHistory();
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
  refreshFlowViews();
};

window.moveToBranch = function(draggedId, parentId, branchType) {
  saveHistory();
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
  refreshFlowViews();
};

window.moveToStart = function(draggedId) {
  saveHistory();
  const draggedLoc = findStepArrayAndIndex(draggedId, state.flowSteps);
  if (!draggedLoc) return;
  
  const stepToMove = draggedLoc.array[draggedLoc.index];
  draggedLoc.array.splice(draggedLoc.index, 1);
  state.flowSteps.unshift(stepToMove);
  refreshFlowViews();
};

window.moveToEnd = function(draggedId, parentId, branchType) {
  saveHistory();
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
  refreshFlowViews();
};

window.setupStepDragAndDrop = function() {
  const steps = document.querySelectorAll('.flow-step');
  steps.forEach(step => {
    step.addEventListener('dragstart', (e) => {
      draggedStepId = Number(step.dataset.stepId);
      step.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    
    step.addEventListener('dragend', () => {
      step.classList.remove('dragging');
      document.querySelectorAll('.drag-over-top, .drag-over').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over');
      });
    });

    step.addEventListener('dragover', (e) => {
      e.preventDefault();
      const sid = Number(step.dataset.stepId);
      if (sid === draggedStepId || isStepInside(draggedStepId, sid)) return;
      step.classList.add('drag-over-top');
    });

    step.addEventListener('dragleave', () => {
      step.classList.remove('drag-over-top');
    });

    step.addEventListener('drop', (e) => {
      e.preventDefault();
      step.classList.remove('drag-over-top');
      const targetId = Number(step.dataset.stepId);
      if (targetId === draggedStepId || isStepInside(draggedStepId, targetId)) return;
      
      window.reorderSteps(draggedStepId, targetId, 'before');
    });
  });
  
  // 特別なドロップターゲット（先頭、末尾、ブランチヘッダー）
  const specialTargets = document.querySelectorAll('.flow-split-header, .flow-split-empty, .flow-loop-connector, .flow-end-connector, .flow-merge-pill');
  specialTargets.forEach(target => {
    target.addEventListener('dragover', (e) => {
      e.preventDefault();
      const sid = Number(target.dataset.branchParentId || target.dataset.parentId);
      if (sid === draggedStepId || isStepInside(draggedStepId, sid)) return;
      target.classList.add('drag-over');
    });
    
    target.addEventListener('dragleave', () => {
      target.classList.remove('drag-over');
    });
    
    target.addEventListener('drop', (e) => {
      e.preventDefault();
      target.classList.remove('drag-over');
      
      const insertAt = target.dataset.insertAt;
      const branchParentId = target.dataset.branchParentId || target.dataset.parentId;
      const branchType = target.dataset.branchType;
      
      if (insertAt === 'end') {
        window.moveToEnd(draggedStepId, Number(branchParentId), branchType);
      } else if (branchParentId && branchType) {
        window.moveToBranch(draggedStepId, Number(branchParentId), branchType);
      }
    });
  });
};

function isStepInside(parentStepId, targetStepId) {
  const parentStep = findStepById(parentStepId);
  if (!parentStep || parentStep.kind !== 'check') return false;
  
  const foundInOk = findStepById(targetStepId, parentStep.okBranch);
  if (foundInOk) return true;
  
  const foundInNg = findStepById(targetStepId, parentStep.ngBranch);
  if (foundInNg) return true;
  
  return false;
}

function captureHotkey(e) {
  if (!state.recordingTarget && !state.recordingStepId) return;
  e.preventDefault();
  e.stopPropagation();

  const key = e.key.toLowerCase();
  if (["control", "shift", "alt", "meta"].includes(key)) return;

  const mods = [];
  if (e.ctrlKey) mods.push("ctrl");
  if (e.shiftKey) mods.push("shift");
  if (e.altKey) mods.push("alt");
  if (e.metaKey) mods.push("cmd");

  if (state.recordingTarget) {
    saveHistory();
    const target = state.recordingTarget;
    const hkValue = { key, mods };
    
    if (target === "start" || target === "stop") {
      const p = state.projects[state.activeProjectId];
      if (p) {
        if (!p.hotkeys) p.hotkeys = {};
        p.hotkeys[target] = hkValue;
      }
    } else {
      state.globalSettings[target] = hkValue;
    }
    
    state.recordingTarget = null;
    renderHotkeys();
  } else if (state.recordingStepId) {
    saveHistory();
    const step = findStepById(state.recordingStepId);
    if (step) {
      step.key = key;
      step.mods = mods;
    }
    state.recordingStepId = null;
  }
  refreshFlowViews();
  saveToStorage();
}

// --- Initialization ---

// グローバル設定のUI同期関数
window.syncGlobalSettingsToUI = function() {
  const globalWaitFields = ["settleIPad", "settleIPhone", "waitKey", "settleBeforeKey", "waitClick", "waitFocus", "waitCheck", "waitBtt", "waitShortcut"];
  globalWaitFields.forEach(id => {
    const el = document.getElementById(id);
    if (el && state.globalSettings[id] !== undefined) {
      el.value = state.globalSettings[id];
    }
  });
};

document.addEventListener("DOMContentLoaded", () => {
  // アプリ起動時のグローバル設定同期
  syncGlobalSettingsToUI();

  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
    });
  } catch (e) {
    console.warn("Mermaid.js is not loaded yet.", e);
  }

  if (!loadFromStorage({ loadProjectState: window.loadProjectState })) {
    createNewProject("Default Project");
  }

  // 初期UIレンダリング（ログインボタン等）
  updateAuthUI(null);

  // Firebase認証状態の監視
  onAuthChange((user) => {
    state.user = user;
    updateAuthUI(user);

    // 以前の購読を解除
    if (unsubscribeCloud) {
      unsubscribeCloud();
      unsubscribeCloud = null;
    }

    if (user) {
      console.log("Logged in as:", user.displayName);
      
      // クラウド上のデータ変更を購読
      unsubscribeCloud = subscribeUserData(user.uid, (cloudData, firestoreUpdatedAt) => {
        // 適用中（自分が保存した結果の通知など）は無視して無限ループを防ぐ
        if (state.sync.isApplyingCloudData) return;

        if (!cloudData) {
          console.log("No cloud data found for this user.");
          return;
        }

        // ローカルデータの取得
        const localJson = localStorage.getItem(NEW_STORAGE_KEY);
        const localData = localJson ? JSON.parse(localJson) : null;

        // タイムスタンプの比較
        const cloudTime = cloudData.lastUpdatedAt ? new Date(cloudData.lastUpdatedAt).getTime() : 
                          (firestoreUpdatedAt ? new Date(firestoreUpdatedAt).getTime() : 0);
        const localTime = (localData && localData.lastUpdatedAt) ? new Date(localData.lastUpdatedAt).getTime() : 0;

        console.log(`Cloud data received. CloudTime: ${cloudTime}, LocalTime: ${localTime}, ManualLogin: ${state.sync.isManualLogin}`);

        // ローカルが実質空、またはデフォルトプロジェクトしかないかどうかの判定
        const isLocalEmpty = !localData || 
                             !localData.projects || 
                             Object.keys(localData.projects).length === 0 ||
                             (Object.keys(localData.projects).length === 1 && 
                              localData.projects[Object.keys(localData.projects)[0]]?.name === "Default Project" &&
                              (localData.projects[Object.keys(localData.projects)[0]]?.flowSteps || []).length === 0);

        if (isLocalEmpty) {
          // A. ローカルが空なら、常に自動反映（復元）
          console.log("Local is empty. Applying cloud data automatically.");
          applyCloud(false);
          state.sync.isManualLogin = false;
        } else if (state.sync.isManualLogin) {
          // B. ログインボタン経由の場合：末尾に追加（マージ）
          state.sync.isManualLogin = false; // フラグを消費
          if (cloudTime > 0 && cloudTime <= lastPromptedCloudTime) return;

          console.log("Manual login detected. Asking for merge.");
          if (confirm("クラウド上のプロジェクトを現在のリストの後ろに追加しますか？\n（現在のプロジェクトは上書きされません）")) {
            applyCloud(true);
          } else {
            lastPromptedCloudTime = cloudTime;
          }
        } else if (cloudTime > localTime) {
          // C. リロードや他端末での更新（自動復元）：上書き（同期）
          if (cloudTime > 0 && cloudTime <= lastPromptedCloudTime) return;

          console.log("Newer cloud data detected during reload/sync. Asking for override.");
          if (confirm("クラウド上に新しいデータがあります。現在の内容を上書きして同期しますか？")) {
            applyCloud(false);
          } else {
            lastPromptedCloudTime = cloudTime;
          }
        } else {
          console.log("No significant cloud data or already handled. Skipping update.");
        }

        function applyCloud(appendMode) {
          console.log(`Applying data from cloud (appendMode: ${appendMode})...`);
          state.sync.isApplyingCloudData = true;
          state.sync.status = 'syncing';
          updateAuthUI(state.user, state.sync.status);
          
          lastPromptedCloudTime = cloudTime;
          try {
            applyDataToState(cloudData, { loadProjectState: window.loadProjectState }, appendMode);
            
            // 追加モード（マージ）の場合は、マージ結果をクラウドにも即座に保存する
            saveToStorage(); 

            state.sync.lastSyncedAt = new Date().toISOString();
            state.sync.status = 'synced';
            updateAuthUI(state.user, state.sync.status);

            setStatus(appendMode ? "クラウド上のプロジェクトを追加しました" : "クラウドからデータを同期しました");
            
            // サーバーへの保存が完了して snapshot が戻ってくるまでの時間を十分に稼ぐ
            setTimeout(() => {
              state.sync.isApplyingCloudData = false;
              console.log("Cloud sync flag cleared.");
            }, 2000);
          } catch (e) {
            console.error("Failed to apply cloud data:", e);
            state.sync.status = 'error';
            updateAuthUI(state.user, state.sync.status);
            setStatus("データの同期に失敗しました", true);
            state.sync.isApplyingCloudData = false;
          }
        }
      });
    }
  });

  setupAddStepButtons();

  // Event Listeners for Static Elements
  document.getElementById("btnGenerate").onclick = () => {
    try {
      document.getElementById("output").value = generateLua();
      setStatus("Luaを生成しました");
    } catch (e) { setStatus(e.message); }
  };

  document.getElementById("btnCopy").onclick = async () => {
    const out = document.getElementById("output").value;
    if (!out) return setStatus("先に生成してください");
    await navigator.clipboard.writeText(out);
    setStatus("コピーしました");
  };

  document.getElementById("btnDownload").onclick = () => {
    const out = document.getElementById("output").value;
    if (!out) return setStatus("先に生成してください");
    const blob = new Blob([out], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "init.lua"; a.click();
    URL.revokeObjectURL(url);
  };

  document.getElementById("btnSendToHammerspoon").onclick = async () => {
    let out = document.getElementById("output").value;
    
    // まだLuaコードが生成されていない場合は、その場で自動生成する
    if (!out) {
      try {
        out = generateLua();
        document.getElementById("output").value = out;
        setStatus("Luaを自動生成しました");
      } catch (e) {
        setStatus(e.message, true);
        return;
      }
    }

    const btn = document.getElementById("btnSendToHammerspoon");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "送信中...";
    setStatus("Hammerspoonへ設定を送信中...");

    try {
      // ローカルのHammerspoonサーバー（ポート27312）にPOSTリクエストを送信
      const response = await fetch("http://localhost:27312/update", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain"
        },
        body: out
      });

      if (response.ok) {
        setStatus("Hammerspoonの設定を直接更新し、リロードしました！");
      } else {
        const errText = await response.text();
        throw new Error(errText || "サーバーエラーが発生しました");
      }
    } catch (e) {
      console.error(e);
      setStatus("送信失敗: Hammerspoonが起動しているか、または受信設定がされているか確認してください", true);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  document.getElementById("btnToggleOutput").onclick = () => {
    const card = document.getElementById("outputCard");
    card.classList.toggle("hidden");
    document.getElementById("btnToggleOutput").textContent = card.classList.contains("hidden") ? "生成Luaを表示" : "生成Luaを隠す";
  };

  document.getElementById("btnRenameProject").onclick = () => {
    window.renameProject(state.activeProjectId);
  };

  document.getElementById("btnDuplicateProject").onclick = () => {
    if (!state.activeProjectId || !state.projects[state.activeProjectId]) return;
    flushActiveProject();
    const p = state.projects[state.activeProjectId];
    const newId = "proj-" + Date.now();
    state.projects[newId] = JSON.parse(JSON.stringify(p));
    state.projects[newId].id = newId;
    state.projects[newId].name += " (コピー)";
    
    // 表示順序リストにも追加
    state.projectOrder.push(newId);
    
    saveHistory();
    window.loadProjectState(newId);
    saveToStorage();
  };

  document.getElementById("btnDeleteProject").onclick = () => {
    window.deleteProject(state.activeProjectId);
  };

  document.getElementById("btnExport").onclick = () => {
    window.exportAllData();
  };

  document.getElementById("btnImport").onclick = () => {
    document.getElementById("importFile").click();
  };

  document.getElementById("importFile").onchange = (e) => {
    window.importAllData(e);
  };

  document.getElementById("btnFlowAddIPad").onclick = () => addStep("move", "ipadMove");
  document.getElementById("btnFlowAddIPhone").onclick = () => addStep("move", "iphoneMove");
  document.getElementById("btnFlowAddKey").onclick = () => addStep("key");
  document.getElementById("btnFlowAddClick").onclick = () => addStep("click");
  document.getElementById("btnFlowAddFocus").onclick = () => addStep("focus");
  document.getElementById("btnFlowAddCheck").onclick = () => addStep("check");
  document.getElementById("btnFlowAddJump").onclick = () => addStep("jump");
  document.getElementById("btnFlowAddStop").onclick = () => addStep("stop");
  document.getElementById("btnFlowAddBTT").onclick = () => addStep("btt");
  document.getElementById("btnFlowAddShortcut").onclick = () => addStep("shortcut");

  document.getElementById("btnApplyAllWait").onclick = () => {
    if (!confirm("現在の全ステップの待機時間を、上記の設定値で一斉に上書きしますか？\n（画面確認内のブランチ処理も含みます）")) return;

    saveHistory();

    const applyWaitToSteps = (steps) => {
      steps.forEach((step) => {
        const kind = step.kind;
        if (kind === "move") {
          step.waitAfter = Number(state.globalSettings[step.moveHotkey === "ipadMove" ? "settleIPad" : "settleIPhone"] || 1.0);
        } else if (kind === "key") {
          step.waitAfter = Number(state.globalSettings.waitKey || 0.25);
          // キー入力ステップ内にアプリ前面化（フォーカス）が指定されている場合、その待機時間も上書き適用する
          if (step.appName && step.appName !== "") {
            step.settleBefore = Number(state.globalSettings.settleBeforeKey || 0.20);
          }
        } else if (kind === "click") {
          step.waitAfter = Number(state.globalSettings.waitClick || 0.25);
        } else if (kind === "focus") {
          step.waitAfter = Number(state.globalSettings.waitFocus || 0.25);
        } else if (kind === "check") {
          step.waitAfter = Number(state.globalSettings.waitCheck || 0.25);
          if (step.okBranch) applyWaitToSteps(step.okBranch);
          if (step.ngBranch) applyWaitToSteps(step.ngBranch);
        } else if (kind === "btt") {
          step.waitAfter = Number(state.globalSettings.waitBtt || 0.25);
        } else if (kind === "shortcut") {
          step.waitAfter = Number(state.globalSettings.waitShortcut || 0.25);
        } else {
          step.waitAfter = 0.25;
        }
      });
    };

    applyWaitToSteps(state.flowSteps);
    refreshFlowViews();
  };

  // 個別の共通待機秒数の一斉適用ボタンのイベントハンドラー
  document.querySelectorAll(".apply-single-wait-btn").forEach((btn) => {
    btn.onclick = () => {
      const target = btn.dataset.target;
      let label = "";
      if (target === "settleIPad") label = "iPad切り替え後待機秒";
      else if (target === "settleIPhone") label = "iPhone切り替え後待機秒";
      else if (target === "waitKey") label = "キー入力後待機秒";
      else if (target === "settleBeforeKey") label = "キー送信内フォーカス後待機秒";
      else if (target === "waitClick") label = "座標クリック後待機秒";
      else if (target === "waitFocus") label = "アプリ前面フォーカス後待機秒";
      else if (target === "waitCheck") label = "画面テキスト確認後待機秒";
      else if (target === "waitBtt") label = "BTTトリガー実行後待機秒";
      else if (target === "waitShortcut") label = "ショートカット実行後待機秒";

      if (!confirm(`現在の全ステップのうち、対象アクションの待機時間を「${label}」の値で一斉に上書きしますか？\n（画面確認内のブランチ処理も含みます）`)) return;

      saveHistory();

      const applyWaitToSteps = (steps) => {
        steps.forEach((step) => {
          const kind = step.kind;
          if (target === "settleIPad" && kind === "move" && step.moveHotkey === "ipadMove") {
            step.waitAfter = Number(state.globalSettings.settleIPad || 1.0);
          } else if (target === "settleIPhone" && kind === "move" && step.moveHotkey === "iphoneMove") {
            step.waitAfter = Number(state.globalSettings.settleIPhone || 1.0);
          } else if (target === "waitKey" && kind === "key") {
            step.waitAfter = Number(state.globalSettings.waitKey || 0.25);
          } else if (target === "settleBeforeKey" && kind === "key" && step.appName && step.appName !== "") {
            step.settleBefore = Number(state.globalSettings.settleBeforeKey || 0.20);
          } else if (target === "waitClick" && kind === "click") {
            step.waitAfter = Number(state.globalSettings.waitClick || 0.25);
          } else if (target === "waitFocus" && kind === "focus") {
            step.waitAfter = Number(state.globalSettings.waitFocus || 0.25);
          } else if (target === "waitCheck" && kind === "check") {
            step.waitAfter = Number(state.globalSettings.waitCheck || 0.25);
          } else if (target === "waitBtt" && kind === "btt") {
            step.waitAfter = Number(state.globalSettings.waitBtt || 0.25);
          } else if (target === "waitShortcut" && kind === "shortcut") {
            step.waitAfter = Number(state.globalSettings.waitShortcut || 0.25);
          }

          // 再帰的に画面確認（check）の okBranch, ngBranch も処理する
          if (kind === "check") {
            if (step.okBranch) applyWaitToSteps(step.okBranch);
            if (step.ngBranch) applyWaitToSteps(step.ngBranch);
          }
        });
      };

      applyWaitToSteps(state.flowSteps);
      refreshFlowViews();
    };
  });

  // Tab switching
  document.getElementById("tabList").onclick = () => {
    document.getElementById("tabList").classList.add("active");
    document.getElementById("tabGraph").classList.remove("active");
    document.getElementById("viewList").style.display = "block";
    document.getElementById("viewGraph").style.display = "none";
  };
  document.getElementById("tabGraph").onclick = () => {
    document.getElementById("tabGraph").classList.add("active");
    document.getElementById("tabList").classList.remove("active");
    document.getElementById("viewList").style.display = "none";
    document.getElementById("viewGraph").style.display = "block";
    updateMermaidGraph();
  };

  // Delegate events for dynamic elements
  document.getElementById("flowTrack").onchange = (e) => {
    const t = e.target;
    if (t.dataset.field && t.dataset.stepId) {
      const val = t.type === "checkbox" ? t.checked : t.value;
      updateStepField(Number(t.dataset.stepId), t.dataset.field, val);
    }
  };

  // Undo/Redo button listeners
  document.getElementById("btnUndo").onclick = () => window.undo();
  document.getElementById("btnRedo").onclick = () => window.redo();

  document.getElementById("flowTrack").onclick = (e) => {
    const t = e.target;
    if (t.dataset.action === "delete") {
      saveHistory();
      const id = Number(t.dataset.stepId);
      const loc = findStepArrayAndIndex(id, state.flowSteps);
      if (loc) {
        loc.array.splice(loc.index, 1);
        if (state.selectedStepId === id) state.selectedStepId = null;
        refreshFlowViews();
      }
    } else if (t.dataset.action === "record-step") {
      const id = Number(t.dataset.stepId);
      state.recordingStepId = state.recordingStepId === id ? null : id;
      refreshFlowViews();
    } else if (t.dataset.action === "select-app") {
      document.getElementById(`file-app-${t.dataset.stepId}`).click();
    } else if (t.dataset.action === "toggle-presets") {
      const menu = document.getElementById(`preset-menu-${t.dataset.stepId}`);
      if (menu) {
        menu.classList.toggle("hidden");
        // メニュー以外をクリックした時に閉じるための処理
        const closeMenu = (e) => {
          if (!menu.contains(e.target) && e.target !== t) {
            menu.classList.add("hidden");
            document.removeEventListener("click", closeMenu);
          }
        };
        if (!menu.classList.contains("hidden")) {
          setTimeout(() => document.addEventListener("click", closeMenu), 0);
        }
      }
    } else {
      const presetItem = t.closest(".preset-item");
      if (presetItem) {
        e.preventDefault();
        e.stopPropagation();
        const { name, id, stepId } = presetItem.dataset;
        const step = findStepById(Number(stepId));
        if (step) {
          saveHistory();
          if (step.kind === "check") {
            step.appName = name;
            step.bundleId = id;
            // DOMを直接更新して即時反映を見せる
            const input = document.querySelector(`input[data-field="bundleId"][data-step-id="${stepId}"]`);
            if (input) input.value = id;
          } else {
            step.appName = name;
            // DOMを直接更新して即時反映を見せる
            const input = document.querySelector(`input[data-field="appName"][data-step-id="${stepId}"]`);
            if (input) input.value = name;
          }
          setStatus(`プリセット「${name}」を適用しました`);
          // メニューを閉じる
          const menu = presetItem.closest(".preset-menu");
          if (menu) menu.classList.add("hidden");
          
          // 全体の整合性をとるために再描画
          refreshFlowViews();
        }
      }
    }
  };

  document.getElementById("flowTrack").addEventListener("change", (e) => {
    if (e.target.type === "file" && e.target.id.startsWith("file-app-")) {
      const stepId = Number(e.target.id.replace("file-app-", ""));
      window.handleAppSelect(e, stepId);
    }
  });

  // Selection logic
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("select") || e.target.closest(".preset-item") || e.target.closest(".preset-btn")) return;
    const stepEl = e.target.closest(".flow-step");
    const splitColEl = e.target.closest(".flow-split-col");
    if (stepEl) {
      const id = Number(stepEl.dataset.stepId);
      state.selectedStepId = state.selectedStepId === id ? null : id;
      state.selectedMergeId = null;
      state.selectedBranch = null;
      refreshFlowViews();
    } else if (e.target.closest("[data-action='select-merge']")) {
      const el = e.target.closest("[data-action='select-merge']");
      const id = Number(el.dataset.parentId);
      state.selectedMergeId = state.selectedMergeId === id ? null : id;
      state.selectedStepId = null;
      state.selectedBranch = null;
      refreshFlowViews();
    } else if (e.target.closest(".flow-split-header") || e.target.closest(".flow-split-empty")) {
      const target = e.target.closest(".flow-split-header") || e.target.closest(".flow-split-empty");
      const col = e.target.closest(".flow-split-col");
      const checkId = Number(col.dataset.parentId);
      const type = col.dataset.branchType;
      const isHeader = target.classList.contains("flow-split-header");
      const selectionType = isHeader ? "header" : "empty";

      state.selectedBranch =
        state.selectedBranch?.checkId === checkId &&
        state.selectedBranch?.branchType === type &&
        state.selectedBranch?.selectionType === selectionType
          ? null
          : { checkId, branchType: type, selectionType };
      state.selectedStepId = null;
      state.selectedMergeId = null;
      refreshFlowViews();
    } else {
      if (state.selectedStepId !== null || state.selectedBranch !== null || state.selectedMergeId !== null) {
        state.selectedStepId = null;
        state.selectedBranch = null;
        state.selectedMergeId = null;
        refreshFlowViews();
      }
    }
  });

  window.addEventListener("keydown", captureHotkey, true);
  
  // Shortcuts
  window.addEventListener("keydown", (e) => {
    const isMod = e.metaKey || e.ctrlKey;
    if (isMod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        window.redo();
      } else {
        window.undo();
      }
    }
  });

  // Backspace to delete
  window.addEventListener("keydown", (e) => {
    if ((e.key === "Backspace" || e.key === "Delete") && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      if (state.selectedStepId) {
        const loc = findStepArrayAndIndex(state.selectedStepId, state.flowSteps);
        if (loc) { 
          saveHistory();
          loc.array.splice(loc.index, 1); 
          state.selectedStepId = null; 
          refreshFlowViews(); 
        }
      }
    }
  });

  // Settings recording buttons
  document.querySelectorAll(".record-btn[data-hotkey]").forEach(btn => {
    btn.onclick = () => {
      const h = btn.dataset.hotkey;
      state.recordingTarget = state.recordingTarget === h ? null : h;
      renderHotkeys();
    };
  });

  document.querySelectorAll(".clear-btn[data-hotkey]").forEach(btn => {
    btn.onclick = () => {
      saveHistory();
      const target = btn.dataset.hotkey;
      const emptyHk = { key: "", mods: [] };
      
      if (target === "start" || target === "stop") {
        const p = state.projects[state.activeProjectId];
        if (p) {
          if (!p.hotkeys) p.hotkeys = {};
          p.hotkeys[target] = emptyHk;
        }
      } else {
        state.globalSettings[target] = emptyHk;
      }
      
      renderHotkeys();
      saveToStorage();
    };

  });

  // グローバル待機設定変更時の自動更新リスナー
  const globalWaitFields = ["settleIPad", "settleIPhone", "waitKey", "settleBeforeKey", "waitClick", "waitFocus", "waitCheck", "waitBtt", "waitShortcut"];
  globalWaitFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.onchange = () => {
        saveHistory();
        state.globalSettings[id] = el.value;
        refreshFlowViews();
      };
    }
  });

  // プロジェクト固有設定変更時の自動更新リスナー
  ["enableTimelineLog", "enableAutoStopLog", "enableExecutionAlert", "enableLoop"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.onchange = () => {
        saveHistory();
        refreshFlowViews();
      };
    }
  });

  refreshFlowViews();
});

import { state, nextStepId, findStepById, flushActiveProject, normalizeStep, defaultTitleByKind } from './modules/state.js';
import { hotkeyLabels, NEW_STORAGE_KEY } from './modules/constants.js';
import { getAllPresets, addCustomPreset, deleteCustomPreset } from './modules/presets.js';

import { num, txt, escapeHtml } from './modules/utils.js';
import { saveToStorage, loadFromStorage } from './modules/storage.js';
import { generateLua } from './modules/lua.js';
import { generateJavascript } from './modules/javascript.js';
import { 
  updateFlowPreview, 
  renderHotkeys, 
  updateProjectTabs, 
  setStatus,
  hotkeyToDisplay,
  keyToDisplay,
  setupAddStepButtons,
  updateGenProjectList
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

window.syncPlatformUI = function(platform) {
  const isJs = platform === "js";
  
  // 生成対象言語のラジオボタンの選択状態を同期
  const radio = document.querySelector(`input[name="genLanguage"][value="${platform}"]`);
  if (radio) radio.checked = true;
  updateGenProjectList();
  
  // 表示・非表示にするアクション追加ボタンの制御
  const jsOnlyButtons = ["btnFlowAddDeviceSwitch"];
  const luaOnlyButtons = ["btnFlowAddBTT"];
  
  jsOnlyButtons.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isJs ? "flex" : "none";
  });
  
  luaOnlyButtons.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isJs ? "none" : "flex";
  });
  
  // 設定項目の制御 (Luaの再読込・一括停止、開始・停止ホットキーはJSモード時は隠す)
  const recordBtns = document.querySelectorAll(".hotkey-controls");
  recordBtns.forEach(btn => {
    const row = btn.closest(".row");
    if (row) {
      const label = row.querySelector("label")?.getAttribute("for") || "";
      const isLsbHotkey = label.includes("start") || label.includes("stop") || label.includes("reload") || label.includes("stopAll") || label.includes("Move");
      if (isLsbHotkey) {
        row.style.display = isJs ? "none" : "flex";
      }
    }
  });
  
  // 待機時間設定のうち、JS非対応のアクション待機時間を隠す
  const luaOnlyWaitSettings = ["waitBtt"];
  luaOnlyWaitSettings.forEach(id => {
    const el = document.getElementById(id);
    const row = el?.closest(".row");
    if (row) {
      row.style.display = isJs ? "none" : "flex";
    }
  });

  // 現在のプラットフォームバッジの更新
  const badge = document.getElementById("projectPlatformBadge");
  if (badge) {
    badge.textContent = isJs ? "TARGET: MultiKeyBoard (JS)" : "TARGET: Hammerspoon (Lua)";
    badge.style.backgroundColor = isJs ? "var(--clr-device-switch-bg)" : "var(--clr-key-bg)";
    badge.style.color = isJs ? "var(--clr-device-switch-ink)" : "var(--clr-key-ink)";
    badge.style.border = isJs ? "1px solid var(--clr-device-switch-line)" : "1px solid var(--clr-key-line)";
  }

  const switchBtn = document.getElementById("btnSwitchProjectPlatform");
  if (switchBtn) {
    switchBtn.textContent = isJs ? "Luaへ切替" : "JSへ切替";
    switchBtn.title = isJs
      ? "このプロジェクトをHammerspoon向けに切り替えます"
      : "このプロジェクトをMultiKeyBoard向けに切り替えます";
  }
  
  // 出力系のラベル・アクションボタンのテキストと表示切り替え
  const toggleBtn = document.getElementById("btnToggleOutput");
  const downloadBtn = document.getElementById("btnDownload");
  const sendBtn = document.getElementById("btnSendToHammerspoon");
  const card = document.getElementById("outputCard");
  const outputLabel = card?.querySelector("label[for='output']");
  
  if (toggleBtn) {
    toggleBtn.textContent = card.classList.contains("hidden") 
      ? (isJs ? "生成JSを表示" : "生成Luaを表示") 
      : (isJs ? "生成JSを隠す" : "生成Luaを隠す");
  }
  
  if (downloadBtn) {
    downloadBtn.textContent = isJs ? "保存 (script.js)" : "保存 (init.lua)";
  }
  
  if (sendBtn) {
    sendBtn.textContent = isJs ? "MultiKeyBoardに送信" : "Hammerspoonに送信";
    sendBtn.style.backgroundColor = isJs ? "#0284c7" : "#10b981";
  }
  
  if (outputLabel) {
    outputLabel.textContent = isJs ? "生成されたJS" : "生成されたLua";
  }
};

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
  
  // プラットフォーム設定の移行とUIの同期
  if (!p.platform) p.platform = "lua";
  window.syncPlatformUI(p.platform);
  
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
      appName = getPlistValue(text, "CFBundleDisplayName") || getPlistValue(text, "CFBundleName");
      bundleId = getPlistValue(text, "CFBundleIdentifier");
    } catch (e) { console.error(e); }
  }

  if (!appName) {
    const rootDir = files[0].webkitRelativePath.split("/")[0];
    appName = rootDir.toLowerCase().endsWith(".app") ? rootDir.slice(0, -4) : rootDir;
  }

  const step = findStepById(stepId);
  if (step) {
    step.appName = appName || "";
    step.bundleId = bundleId || "";
    refreshFlowViews();
    setStatus(`アプリ設定を更新しました: ${appName} (${bundleId || "ID取得不可"})`);
  } else {
    setStatus("ステップが見つかりませんでした");
  }
  event.target.value = "";
};

// ==========================================
// プリセットUI描画処理
// ==========================================
function renderPresetsList(stepId) {
  const listContainer = document.getElementById(`preset-apps-list-${stepId}`);
  if (!listContainer) return;
  
  const presets = getAllPresets();
  if (presets.length === 0) {
    listContainer.innerHTML = '<div class="preset-loading">登録済みのアプリなし</div>';
  } else {
    listContainer.innerHTML = presets.map(p => {
      const deleteBtn = `<button type="button" class="preset-delete-btn" data-action="delete-preset" data-id="${p.id}" data-step-id="${stepId}" title="プリセットから削除">×</button>`;
      return `
        <div class="preset-item-row">
          <div class="preset-item" data-name="${p.name}" data-id="${p.id}" data-step-id="${stepId}" style="flex: 1; display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; min-width: 0;">
            <img src="/api/app-icon?bundleId=${p.id}" style="width: 20px; height: 20px; object-fit: contain; flex-shrink: 0;" onerror="this.style.display='none';" />
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</span>
          </div>
          ${deleteBtn}
        </div>
      `;
    }).join('');
  }

  // 現在ステップに適用されているアプリ名をボタンに動的反映し、未設定時は非表示にする
  const addButton = document.querySelector(`.preset-add-item[data-step-id="${stepId}"]`);
  const divider = document.getElementById(`preset-menu-divider-${stepId}`);
  const step = findStepById(Number(stepId));
  const appName = step ? (step.appName || "").trim() : "";
  
  console.log("[LSB Debug] renderPresetsList called. stepId:", stepId, "stepObj:", step, "appName:", appName, "addButton:", addButton);
  
  if (addButton) {
    if (appName) {
      addButton.textContent = `＋ 「${appName}」をプリセットに登録`;
      addButton.style.display = "block";
      if (divider) divider.style.display = "block";
      console.log("[LSB Debug] Preset add button SHOWN. Text:", addButton.textContent);
    } else {
      addButton.style.display = "none";
      if (divider) divider.style.display = "none";
      console.log("[LSB Debug] Preset add button HIDDEN (appName is empty)");
    }
  }
}

// --- Core Logic ---

window.createNewProject = function(name, platform = "lua") {
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
  window.loadProjectState(id);
};

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

window.switchProjectPlatform = function(projectId = state.activeProjectId) {
  const p = state.projects[projectId];
  if (!p) return;

  flushActiveProject();
  const currentPlatform = p.platform === "js" ? "js" : "lua";
  const nextPlatform = currentPlatform === "js" ? "lua" : "js";
  const unsupportedCount = nextPlatform === "js"
    ? countStepsByKind(p.flowSteps, "btt")
    : countStepsByKind(p.flowSteps, "device_switch");

  if (unsupportedCount > 0) {
    const unsupportedName = nextPlatform === "js" ? "BTT" : "デバイス切替";
    const ok = confirm(
      `${unsupportedName}ステップが${unsupportedCount}個あります。\n` +
      `切り替えても削除はしませんが、${nextPlatform === "js" ? "JS" : "Lua"}では未対応として扱われます。\n\n` +
      "切り替えますか？"
    );
    if (!ok) return;
  }

  saveHistory();
  p.platform = nextPlatform;
  window.syncPlatformUI(nextPlatform);
  updateProjectTabs();
  refreshFlowViews();

  const output = document.getElementById("output");
  if (output) output.value = "";

  saveToStorage();
  setStatus(`${p.name} を ${nextPlatform === "js" ? "JS" : "Lua"} 用に切り替えました`);
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

  // 言語選択（Lua/JS）ラジオボタン変更時のハンドラー
  document.querySelectorAll('input[name="genLanguage"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const isJs = e.target.value === 'js';
      
      const outputLabel = document.getElementById("outputLabel");
      if (outputLabel) {
        outputLabel.textContent = isJs ? "生成されたJS" : "生成されたLua";
      }
      
      const downloadBtn = document.getElementById("btnDownload");
      if (downloadBtn) {
        downloadBtn.textContent = isJs ? "保存 (script.js)" : "保存 (init.lua)";
      }
      
      const sendBtn = document.getElementById("btnSendToHammerspoon");
      if (sendBtn) {
        sendBtn.textContent = isJs ? "MultiKeyBoardに送信" : "Hammerspoonに送信";
        sendBtn.style.backgroundColor = isJs ? "#0284c7" : "#10b981";
      }
      
      const toggleBtn = document.getElementById("btnToggleOutput");
      const card = document.getElementById("outputCard");
      if (toggleBtn && card) {
        const isHidden = card.classList.contains("hidden");
        toggleBtn.textContent = isHidden
          ? (isJs ? "生成JSを表示" : "生成Luaを表示")
          : (isJs ? "生成JSを隠す" : "生成Luaを隠す");
      }
      
      // 出力エリアをリセット
      const output = document.getElementById("output");
      if (output) output.value = "";
      
      // プロジェクト一覧を再描画
      updateGenProjectList();
    });
  });

  document.getElementById("btnGenerate").onclick = () => {
    try {
      const lang = document.querySelector('input[name="genLanguage"]:checked').value;
      const isJs = lang === "js";
      
      // 選択されているプロジェクトIDの取得
      const selectedEls = document.querySelectorAll('input[name="genProjects"]:checked');
      const selectedIds = Array.from(selectedEls).map(el => el.value);
      
      if (selectedIds.length === 0) {
        throw new Error("生成対象のプロジェクトを選択してください。");
      }
      
      let generatedCode = "";
      if (isJs) {
        // JSは単一選択なので最初のものを対象とする
        generatedCode = generateJavascript(selectedIds[0]);
      } else {
        // Luaは複数選択を結合する
        generatedCode = generateLua(selectedIds);
      }
      
      document.getElementById("output").value = generatedCode;
      setStatus(isJs ? "JSを生成しました" : "Luaを生成しました");
    } catch (e) { setStatus(e.message, true); }
  };

  document.getElementById("btnCopy").onclick = async () => {
    const out = document.getElementById("output").value;
    if (!out) return setStatus("先に生成してください", true);
    await navigator.clipboard.writeText(out);
    setStatus("コピーしました");
  };

  document.getElementById("btnDownload").onclick = () => {
    const out = document.getElementById("output").value;
    if (!out) return setStatus("先に生成してください", true);
    
    const lang = document.querySelector('input[name="genLanguage"]:checked').value;
    const isJs = lang === "js";
    
    let filename = "init.lua";
    if (isJs) {
      const selectedEl = document.querySelector('input[name="genProjects"]:checked');
      const projId = selectedEl ? selectedEl.value : state.activeProjectId;
      const p = state.projects[projId];
      filename = p && p.name ? p.name.replace(/[\s/\\?%*:|"<>\s]/g, "_") + ".js" : "script.js";
    }
    
    const blob = new Blob([out], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  document.getElementById("btnSendToHammerspoon").onclick = async () => {
    let out = document.getElementById("output").value;
    const lang = document.querySelector('input[name="genLanguage"]:checked').value;
    const isJs = lang === "js";
    
    // 選択されているプロジェクトIDの取得
    const selectedEls = document.querySelectorAll('input[name="genProjects"]:checked');
    const selectedIds = Array.from(selectedEls).map(el => el.value);
    
    if (selectedIds.length === 0) {
      return setStatus("対象のプロジェクトを選択してください", true);
    }
    
    if (!out) {
      try {
        if (isJs) {
          out = generateJavascript(selectedIds[0]);
        } else {
          out = generateLua(selectedIds);
        }
        document.getElementById("output").value = out;
        setStatus(isJs ? "JSを自動生成しました" : "Luaを自動生成しました");
      } catch (e) {
        setStatus(e.message, true);
        return;
      }
    }

    const btn = document.getElementById("btnSendToHammerspoon");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "送信中...";
    setStatus(isJs ? "MultiKeyBoardへ設定を送信中..." : "Hammerspoonへ設定を送信中...");

    try {
      // 送信先をVite開発サーバーのローカルAPIに変更
      const endpoint = isJs ? "/api/update-js" : "/api/update";
      const headers = {
        "Content-Type": "text/plain"
      };
      if (isJs) {
        const p = state.projects[selectedIds[0]];
        headers["X-Project-Name"] = encodeURIComponent(p ? p.name : "lsb_macro");
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: out
      });

      if (response.ok) {
        setStatus(isJs ? "MultiKeyBoardのJSスクリプトを保存しました！" : "Hammerspoonの設定を保存し、リロードしました！");
      } else {
        const errText = await response.text();
        throw new Error(errText || "サーバー保存エラーが発生しました");
      }
    } catch (e) {
      console.error(e);
      setStatus(isJs 
        ? "送信失敗: 保存先フォルダが存在するか、またはViteサーバーの接続を確認してください" 
        : "送信失敗: .hammerspoonフォルダが存在するか、またはViteサーバーの接続を確認してください", true);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  document.getElementById("btnToggleOutput").onclick = () => {
    const card = document.getElementById("outputCard");
    card.classList.toggle("hidden");
    const lang = document.querySelector('input[name="genLanguage"]:checked').value;
    const isJs = lang === "js";
    if (card.classList.contains("hidden")) {
      document.getElementById("btnToggleOutput").textContent = isJs ? "生成JSを表示" : "生成Luaを表示";
    } else {
      document.getElementById("btnToggleOutput").textContent = isJs ? "生成JSを隠す" : "生成Luaを隠す";
    }
  };

  document.getElementById("btnRenameProject").onclick = () => {
    window.renameProject(state.activeProjectId);
  };

  document.getElementById("btnSwitchProjectPlatform").onclick = () => {
    window.switchProjectPlatform(state.activeProjectId);
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
  document.getElementById("btnFlowAddDeviceSwitch").onclick = () => addStep("device_switch");
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
    console.log("[LSB Debug] Raw click event. target:", e.target, "currentTarget:", e.currentTarget);
    const t = e.target.closest("[data-action]") || e.target;
    console.log("[LSB Debug] Click action detected:", t.dataset.action, "stepId:", t.dataset.stepId, "el:", t);
    if (t.dataset.action === "delete") {
      saveHistory();
      const id = Number(t.dataset.stepId);
      const loc = findStepArrayAndIndex(id, state.flowSteps);
      if (loc) {
        loc.array.splice(loc.index, 1);
        if (state.selectedStepId === id) state.selectedStepId = null;
        refreshFlowViews();
      }
    } else if (t.dataset.action === "toggle-favorite-device") {
      const stepId = Number(t.dataset.stepId);
      const step = findStepById(stepId);
      if (step) {
        const name = (step.deviceName || "").trim();
        if (name) {
          window.toggleFavoriteDevice(name);
          refreshFlowViews();
        } else {
          setStatus("切替先名を入力してからお気に入りに登録してください", true);
        }
      }
    } else if (t.dataset.action === "record-step") {
      const id = Number(t.dataset.stepId);
      state.recordingStepId = state.recordingStepId === id ? null : id;
      refreshFlowViews();
    } else if (t.dataset.action === "select-app") {
      document.getElementById(`file-app-${t.dataset.stepId}`).click();
    } else if (t.dataset.action === "toggle-presets") {
      const stepId = t.dataset.stepId;
      const menu = document.getElementById(`preset-menu-${stepId}`);
      if (menu) {
        menu.classList.toggle("hidden");
        
        if (!menu.classList.contains("hidden")) {
          renderPresetsList(stepId);
        }
        
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
    } else if (t.dataset.action === "add-to-presets") {
      e.preventDefault();
      e.stopPropagation();
      const stepId = Number(t.dataset.stepId);
      const step = findStepById(stepId);
      console.log("[LSB Debug] Add to presets clicked. StepId:", stepId, "StepObject:", step);
      if (step) {
        let appName = (step.appName || "").trim();
        let bundleId = (step.bundleId || "").trim();
        console.log("[LSB Debug] Initial state - appName:", appName, "bundleId:", bundleId);
        
        // bundleId が空の場合、既存のプリセット定義から逆引きして補完を試みる
        if (!bundleId && appName) {
          const matched = getAllPresets().find(p => p.name.toLowerCase() === appName.toLowerCase());
          if (matched) {
            bundleId = matched.id;
            step.bundleId = bundleId; // ステップにも格納
            console.log("[LSB Debug] Bundle ID completed via search:", bundleId);
          }
        }
        
        try {
          console.log("[LSB Debug] Calling addCustomPreset with:", appName, bundleId);
          addCustomPreset(appName, bundleId);
          setStatus(`「${appName}」をプリセットに登録しました`);
          renderPresetsList(stepId);
          console.log("[LSB Debug] Add custom preset succeeded!");
        } catch (err) {
          console.error("[LSB Debug] Add custom preset failed with error:", err);
          alert(err.message);
        }
      } else {
        console.warn("[LSB Debug] Step not found for stepId:", stepId);
      }
    } else if (t.dataset.action === "delete-preset") {
      e.preventDefault();
      e.stopPropagation();
      const id = t.dataset.id;
      const stepId = t.dataset.stepId;
      
      if (confirm("このアプリをプリセットから削除しますか？")) {
        const success = deleteCustomPreset(id);
        if (success) {
          setStatus("プリセットから削除しました");
        } else {
          setStatus("プリセットの削除に失敗しました", true);
        }
        renderPresetsList(stepId);
      }
    } else if (t.dataset.action === "toggle-running") {
      const stepId = t.dataset.stepId;
      const menu = document.getElementById(`running-menu-${stepId}`);
      if (menu) {
        menu.classList.toggle("hidden");
        
        // メニューが表示されたときに動作中のアプリを取得する
        if (!menu.classList.contains("hidden")) {
          const listContainer = document.getElementById(`running-apps-list-${stepId}`);
          if (listContainer) {
            listContainer.innerHTML = '<div class="preset-loading">読み込み中...</div>';
            
            fetch('/api/running-apps')
              .then(res => {
                if (!res.ok) throw new Error("HTTP error " + res.status);
                return res.json();
              })
              .then(data => {
                if (data.apps && data.apps.length > 0) {
                  listContainer.innerHTML = data.apps.map(app => {
                    const iconHtml = app.id ? `<img src="/api/app-icon?bundleId=${app.id}" style="width: 20px; height: 20px; object-fit: contain; flex-shrink: 0;" onerror="this.style.display='none';" />` : '';
                    return `<div class="preset-item" data-name="${app.name}" data-id="${app.id}" data-step-id="${stepId}">${iconHtml}${app.name}</div>`;
                  }).join('');
                } else {
                  listContainer.innerHTML = '<div class="preset-loading">動作中のアプリなし</div>';
                }
              })
              .catch(err => {
                console.error("Failed to load running apps:", err);
                listContainer.innerHTML = '<div class="preset-loading" style="color: #ef4444;">取得失敗</div>';
              });
          }
        }
        
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
          step.appName = name;
          step.bundleId = id; // すべてのステップで bundleId を保存するように修正
          
          // DOMを直接更新して即時反映を見せる
          const input = document.querySelector(`input[data-field="appName"][data-step-id="${stepId}"]`);
          if (input) input.value = name;
          
          // アイコンの即時表示更新
          const iconDisplay = document.getElementById(`app-icon-display-${stepId}`);
          if (iconDisplay) {
            iconDisplay.src = id ? `/api/app-icon?bundleId=${id}` : '';
            iconDisplay.style.display = id ? 'block' : 'none';
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
    const t = e.target;
    if (t.type === "file" && t.id.startsWith("file-app-")) {
      const stepId = Number(t.id.replace("file-app-", ""));
      window.handleAppSelect(e, stepId);
    } else if (t.classList.contains("step-input-preset")) {
      const stepId = Number(t.dataset.stepId);
      const val = t.value;
      if (val) {
        saveHistory();
        updateStepField(stepId, "deviceName", val);
        // コピー完了後にドロップダウンの選択をプレースホルダーに戻す
        t.value = "";
      }
    }
  });

  // Selection logic
  document.addEventListener("mousedown", (e) => {
    if (
      e.target.closest("button") || 
      e.target.closest("input") || 
      e.target.closest("select") || 
      e.target.closest(".preset-item") || 
      e.target.closest(".preset-btn") ||
      e.target.closest(".preset-add-item") ||
      e.target.closest(".preset-delete-btn") ||
      e.target.closest(".preset-menu")
    ) return;
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

  // --- 新規プロジェクトモーダルのイベント処理 ---
  window.openNewProjectModal = function() {
    const modal = document.getElementById("newProjectModal");
    const input = document.getElementById("newProjectName");
    if (modal && input) {
      input.value = "";
      // プラットフォーム選択をデフォルト(Lua)に戻す
      const luaRadio = document.querySelector('input[name="newProjectPlatform"][value="lua"]');
      if (luaRadio) {
        luaRadio.checked = true;
        
        // 視覚的カードのアクティブ化状態の初期化
        const luaCard = document.getElementById("cardPlatformLua");
        const jsCard = document.getElementById("cardPlatformJs");
        if (luaCard && jsCard) {
          luaCard.classList.add("active");
          luaCard.style.borderColor = "#10b981";
          luaCard.style.background = "#f0fdf4";
          
          jsCard.classList.remove("active");
          jsCard.style.borderColor = "#e2e8f0";
          jsCard.style.background = "var(--surface, #fff)";
        }
      }
      modal.classList.remove("hidden");
      input.focus();
    }
  };

  // プラットフォームカードのクリック連動
  const setupPlatformCard = (value, cardId, activeBorder, activeBg) => {
    const card = document.getElementById(cardId);
    if (card) {
      card.onclick = () => {
        const radio = document.querySelector(`input[name="newProjectPlatform"][value="${value}"]`);
        if (radio) radio.checked = true;
        
        // すべてのカードを非アクティブ化
        document.querySelectorAll(".platform-card").forEach(c => {
          c.classList.remove("active");
          c.style.borderColor = "#e2e8f0";
          c.style.background = "var(--surface, #fff)";
        });
        
        // クリックしたカードをアクティブ化
        card.classList.add("active");
        card.style.borderColor = activeBorder;
        card.style.background = activeBg;
      };
    }
  };
  setupPlatformCard("lua", "cardPlatformLua", "#10b981", "#f0fdf4");
  setupPlatformCard("js", "cardPlatformJs", "#0284c7", "#f0f9ff");

  const closeNewProjectModal = () => {
    const modal = document.getElementById("newProjectModal");
    if (modal) modal.classList.add("hidden");
  };

  const btnCancel = document.getElementById("btnCancelNewProject");
  const btnCancelX = document.getElementById("btnCancelNewProjectX");
  if (btnCancel) btnCancel.onclick = closeNewProjectModal;
  if (btnCancelX) btnCancelX.onclick = closeNewProjectModal;
  
  const btnConfirm = document.getElementById("btnConfirmNewProject");
  if (btnConfirm) {
    btnConfirm.onclick = () => {
      const input = document.getElementById("newProjectName");
      const name = input ? input.value.trim() : "";
      if (!name) {
        alert("プロジェクト名を入力してください。");
        if (input) input.focus();
        return;
      }
      
      const checkedPlatform = document.querySelector('input[name="newProjectPlatform"]:checked');
      const platform = checkedPlatform ? checkedPlatform.value : "lua";
      
      saveHistory();
      window.createNewProject(name, platform);
      closeNewProjectModal();
    };
  }

  // --- 設定サイドパネルのイベント処理 ---
  const btnOpenSettings = document.getElementById("btnOpenSettings");
  if (btnOpenSettings) {
    btnOpenSettings.onclick = () => {
      const panel = document.getElementById("settingsPanel");
      if (panel) panel.classList.remove("hidden");
    };
  }

  const btnCloseSettings = document.getElementById("btnCloseSettings");
  if (btnCloseSettings) {
    btnCloseSettings.onclick = () => {
      const panel = document.getElementById("settingsPanel");
      if (panel) panel.classList.add("hidden");
    };
  }
});

// ==========================================
// お気に入りデバイス管理機能 (プリセット)
// ==========================================
window.toggleFavoriteDevice = function(deviceName) {
  if (!state.globalSettings.favoriteDevices) {
    state.globalSettings.favoriteDevices = [];
  }
  const list = state.globalSettings.favoriteDevices;
  const idx = list.indexOf(deviceName);
  if (idx !== -1) {
    list.splice(idx, 1);
    setStatus(`お気に入りから「${deviceName}」を削除しました`);
  } else {
    list.push(deviceName);
    setStatus(`お気に入りに「${deviceName}」を登録しました`);
  }
  saveToStorage();
};

window.isFavoriteDevice = function(deviceName) {
  if (!state.globalSettings.favoriteDevices) return false;
  return state.globalSettings.favoriteDevices.includes(deviceName);
};

window.getFavoriteDevices = function() {
  return state.globalSettings.favoriteDevices || [];
};
